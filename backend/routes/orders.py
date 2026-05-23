from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import List

from flask import Blueprint, after_this_request, current_app, g, jsonify, request
from sqlalchemy import func, select, text

import db
from models import Order, OrderItem, MenuItem, MenuCategory, RestaurantTable, User
from auth import require_role, log_audit
from auth import request_ip
from rate_limits import enforce_limit
from validators import validate_schema
from schemas import OrderCreate, OrderStatusUpdate
from services.billing import calculate_order_totals
from services.inventory import deduct_stock_for_order
from events import broker, order_topic_id
from realtime import broadcast
from security_log import log_security_event
from utils.validation import extract_fields
from order_queue import enqueue_order, finish_order

bp = Blueprint("orders", __name__, url_prefix="/api")
audit = log_audit

def allocate_order_number(session):
    row = session.execute(
        text(
            """
            UPDATE order_number_counter
            SET next_value = next_value + 1
            WHERE name = 'orders'
            RETURNING next_value - 1 AS order_number
            """
        )
    ).mappings().one_or_none()
    if row is None:
        session.execute(text("INSERT INTO order_number_counter (name, next_value) VALUES ('orders', 2)"))
        return 1
    return int(row["order_number"])


STAFF_ROLES = {"staff", "manager", "owner", "admin"}
IST = timezone(timedelta(hours=5, minutes=30))


def _sign_pending_intent(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True, default=str).encode("utf-8")
    signature = hmac.new(current_app.config["SECRET_KEY"].encode("utf-8"), body, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(body).decode("ascii") + "." + signature


def serialize_order(order: Order, *, include_public_token: bool = False) -> dict:
    items = []
    for item in order.items:
        items.append({
            "name": item.menu_item.name,
            "qty": item.qty,
            "quantity": item.qty,
            "unit_price": item.unit_price,
            "special_note": item.special_note,
        })
    payload = {
        "id": str(order.id),
        "order_ref": f"JD-{str(order.id).replace('-', '')[:8].upper()}",
        "order_number": order.order_number,
        "status": order.status,
        "is_archived": bool(getattr(order, "is_archived", False)),
        "subtotal": int(order.subtotal or 0),
        "tax": int(order.tax or 0),
        "total": int(order.total or 0),
        "customer_name": order.guest_name,
        "customer_phone": order.guest_phone,
        "guest_name": order.guest_name,
        "guest_phone": order.guest_phone,
        "order_type": order.order_type,
        "source": getattr(order, "source", "customer"),
        "payment_method": getattr(order, "payment_method", "") or "",
        "table_id": str(order.table_id) if order.table_id else None,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "preparing_at": order.preparing_at.isoformat() if getattr(order, "preparing_at", None) else None,
        "served_at": order.served_at.isoformat() if getattr(order, "served_at", None) else None,
        "archived_at": order.archived_at.isoformat() if getattr(order, "archived_at", None) else None,
        "items": items,
    }
    if include_public_token:
        payload["public_token"] = order.public_token_hash
    return payload


def _same_uuid(left, right) -> bool:
    return str(left).replace("-", "") == str(right).replace("-", "")


def _has_order_access(order, public_token: str | None = None) -> bool:
    user = getattr(g, "current_user", None)
    if user and user.get("role") in STAFF_ROLES:
        return True
    if user and order.user_id and _same_uuid(order.user_id, user.get("id")):
        return True
    if public_token and secrets.compare_digest(str(order.public_token_hash), str(public_token)):
        return True
    return False


def order_access(conn, order_ref, public_token: str | None = None):
    order = None
    ref = str(order_ref)
    try:
        parsed = uuid.UUID(ref)
        order = conn.execute("SELECT * FROM orders WHERE id IN (?, ?)", (str(parsed), parsed.hex)).fetchone()
    except (TypeError, ValueError):
        if ref.isdigit():
            order = conn.execute("SELECT * FROM orders WHERE order_number = ?", (int(ref),)).fetchone()
        else:
            order = conn.execute("SELECT * FROM orders WHERE id = ?", (ref,)).fetchone()
    if not order:
        return None
    user = getattr(g, "current_user", None)
    if user and user.get("role") in STAFF_ROLES:
        return dict(order)
    if user and order["user_id"] and _same_uuid(order["user_id"], user["id"]):
        return dict(order)
    if public_token and secrets.compare_digest(str(order["public_token_hash"]), str(public_token)):
        return dict(order)
    return None


def _parse_order_ids(raw_ids) -> tuple[list[uuid.UUID], str | None]:
    if not isinstance(raw_ids, list) or not raw_ids:
        return [], "order_ids must be a non-empty list"
    parsed: list[uuid.UUID] = []
    for raw_id in raw_ids:
        try:
            parsed.append(uuid.UUID(str(raw_id)))
        except (TypeError, ValueError):
            return [], f"Invalid order id: {raw_id}"
    return parsed, None


def _apply_lifecycle_status(order: Order, status: str, now: datetime) -> None:
    order.status = status
    order.version += 1
    if status == "preparing":
        order.preparing_at = now
    elif status == "served":
        if not order.preparing_at:
            order.preparing_at = now
        order.served_at = now
    elif status == "pending":
        order.preparing_at = None
        order.served_at = None


def _orders_paused() -> bool:
    from cache import status_cache

    cached = status_cache.get("orders:paused")
    if cached is not None:
        return cached
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT value FROM site_settings WHERE key = 'orders_paused'").fetchone()
    paused = bool(row and row["value"] == "true")
    status_cache.set("orders:paused", paused)
    return paused


@bp.get("/orders/status")
def public_order_status():
    return jsonify({"success": True, "paused": _orders_paused()})


@bp.get("/orders/pause")
@require_role("staff")
def get_orders_pause_alias():
    return jsonify({"success": True, "paused": _orders_paused()})


@bp.post("/orders")
def create_order():
    user = getattr(g, "current_user", None)
    rate_user = user["id"] if user else "guest"
    rate = enforce_limit(f"orders:create:{rate_user}:{request_ip()}", 60, 60)
    if rate is not None:
        return rate

    # Defensively normalize menu_item_id values that may include UI suffixes.
    raw = request.get_json(silent=True) or {}
    raw = extract_fields(raw, {
        "table_id",
        "table_token",
        "guest_name",
        "guest_phone",
        "customer_name",
        "customer_phone",
        "items",
        "payment_method",
        "special_instructions",
        "notes",
        "order_type",
        "source",
        "pickup_time",
        "loyalty_points_to_redeem",
        "idempotency_key",
    })
    if "customer_name" in raw and "guest_name" not in raw:
        raw["guest_name"] = raw.pop("customer_name")
    if "customer_phone" in raw and "guest_phone" not in raw:
        raw["guest_phone"] = raw.pop("customer_phone")
    current_user = getattr(g, "current_user", None)
    if raw.get("source") == "manual":
        if not current_user or current_user.get("role") not in STAFF_ROLES:
            return jsonify({"success": False, "message": "Manual orders require staff access"}), 403
    elif not current_user or current_user.get("role") not in STAFF_ROLES:
        raw["source"] = "customer"
    if raw.get("source") != "manual":
        with db.connect(current_app.config["DATABASE_URL"]) as conn:
            paused_row = conn.execute("SELECT value FROM site_settings WHERE key = 'orders_paused'").fetchone()
        if paused_row and paused_row["value"] == "true":
            return jsonify({"success": False, "message": "Orders are paused right now"}), 409
    current_app.logger.debug("[orders.create_order] accepted fields before normalization: %s", sorted(raw.keys()))
    items_raw = raw.get("items", [])
    for it in items_raw:
        mid = it.get("menu_item_id")
        if isinstance(mid, str) and (mid.endswith("-half") or mid.endswith("-full")):
            try:
                candidate = mid[: mid.rfind("-")]
                uuid.UUID(candidate)
                it["menu_item_id"] = candidate
            except Exception:
                pass
    # LOG after normalization and before Pydantic validation
    current_app.logger.debug("[orders.create_order] accepted fields after normalization: %s", sorted(raw.keys()))
    if raw.get("table_token") and not raw.get("table_id"):
        with db.get_db() as session:
            table = session.execute(
                select(RestaurantTable).filter_by(qr_token=raw["table_token"], active=True)
            ).scalar_one_or_none()
            if not table:
                return jsonify({"success": False, "message": "Table not found"}), 404
            raw["table_id"] = str(table.id)
    # Validate using the possibly-normalized payload (Pydantic happens here)
    current_app.logger.debug("[orders.create_order] Calling validate_schema(OrderCreate)")
    schema = validate_schema(OrderCreate, data=raw)
    user_id = uuid.UUID(g.current_user["id"]) if hasattr(g, "current_user") and g.current_user else None
    
    # Layer 6: Idempotency (Handled by unique constraint on idempotency_key in DB)
    idempotency_key = request.headers.get("Idempotency-Key") or raw.get("idempotency_key")
    if not idempotency_key:
        return jsonify({"success": False, "message": "Idempotency-Key header is required"}), 400
    gate = enqueue_order(raw, idempotency_key)
    if gate.get("duplicate"):
        return jsonify({"success": True, "queued": True, "message": "Order is already processing"}), 202
    if gate.get("error"):
        return jsonify({"success": False, **gate}), 503

    @after_this_request
    def _release_order_gate(response):
        finish_order(idempotency_key)
        return response

    with db.get_db() as session:
        if schema.payment_method == "razorpay":
            items_req = [item.model_dump() for item in schema.items]
            totals = calculate_order_totals(session, items_req)
            for item_req in schema.items:
                menu_item = session.execute(select(MenuItem).filter_by(id=item_req.menu_item_id, available=True)).scalar_one_or_none()
                if not menu_item:
                    return jsonify({"success": False, "message": f"Item {item_req.menu_item_id} is unavailable"}), 409
            intent_payload = {
                "user_id": str(user_id) if user_id else None,
                "table_id": str(schema.table_id) if schema.table_id else None,
                "guest_name": schema.guest_name or "",
                "guest_phone": schema.guest_phone or "",
                "order_type": schema.order_type,
                "source": schema.source,
                "payment_method": "razorpay",
                "pickup_time": schema.pickup_time.isoformat() if schema.pickup_time else None,
                "idempotency_key": idempotency_key,
                "items": [
                    {
                        "menu_item_id": str(item.menu_item_id),
                        "qty": item.qty,
                        "special_note": item.special_note,
                    }
                    for item in schema.items
                ],
                "totals": totals,
            }
            return jsonify({
                "success": True,
                "pending": True,
                "pending_intent": _sign_pending_intent(intent_payload),
                "total": totals["total"],
                "subtotal": totals["subtotal"],
                "tax": totals["tax"],
                "idempotency_key": idempotency_key,
            }), 200

        # Check for existing order
        existing = session.execute(select(Order).filter_by(idempotency_key=idempotency_key)).scalar_one_or_none()
        if existing:
            serialized = serialize_order(existing, include_public_token=True)
            return jsonify({"success": True, "data": serialized, **serialized}), 200

        # Calculate totals
        items_req = [item.model_dump() for item in schema.items]
        totals = calculate_order_totals(session, items_req)
        loyalty_discount = 0
        if schema.loyalty_points_to_redeem:
            if not user_id:
                return jsonify({"success": False, "message": "Login required to redeem loyalty points"}), 409
            user_row = session.execute(select(User).filter_by(id=user_id)).scalar_one_or_none()
            if not user_row or user_row.loyalty_points < schema.loyalty_points_to_redeem:
                return jsonify({"success": False, "message": "Insufficient loyalty points"}), 409
            loyalty_discount = min(schema.loyalty_points_to_redeem, totals["total"])
            user_row.loyalty_points -= loyalty_discount
            totals["total"] -= loyalty_discount
        
        # Create order
        new_order = Order(
            user_id=user_id,
            table_id=schema.table_id,
            status="pending",
            idempotency_key=idempotency_key,
            subtotal=totals["subtotal"],
            tax=totals["tax"],
            total=totals["total"],
            loyalty_discount=loyalty_discount,
            guest_name=schema.guest_name,
            guest_phone=schema.guest_phone,
            public_token_hash=secrets.token_urlsafe(32), # Simplified for now
            order_type=schema.order_type,
            source=schema.source,
            payment_method=schema.payment_method or "",
            pickup_time=schema.pickup_time
        )
        if new_order.order_number is None:
            new_order.order_number = allocate_order_number(session)
        session.add(new_order)
        session.flush() # Get order.id
        
        # Add items
        for item_req in schema.items:
            # Verify item exists and available
            menu_item = session.execute(select(MenuItem).filter_by(id=item_req.menu_item_id, available=True)).scalar_one_or_none()
            if not menu_item:
                return jsonify({"success": False, "message": f"Item {item_req.menu_item_id} is unavailable"}), 409
            
            order_item = OrderItem(
                order_id=new_order.id,
                menu_item_id=menu_item.id,
                qty=item_req.qty,
                unit_price=menu_item.price,
                special_note=item_req.special_note
            )
            session.add(order_item)
        
        audit(session, "order.create", "order", new_order.id, {"total": totals["total"]})
        session.commit()
        session.refresh(new_order)
        serialized = serialize_order(new_order, include_public_token=True)

        broker.publish("kitchen", "order.created", serialized)
        broker.publish(f"order:{order_topic_id(new_order.id)}", "order.created", serialized)
        broadcast("orders_update", {"action": "new_order", "order": serialized})
        broadcast("analytics_update", {"action": "orders_changed"})
        
        return jsonify({
            "success": True,
            "message": "Order placed successfully",
            "data": serialized,
            **serialized,
        }), 201


@bp.get("/orders/<uuid:order_id>")
def get_order(order_id: uuid.UUID):
    with db.get_db() as session:
        order = session.execute(select(Order).filter_by(id=order_id)).scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        if not _has_order_access(order, request.args.get("token")):
            log_security_event("idor_attempt", request_ip(), str(order_id))
            return jsonify({"success": False, "message": "Order not found"}), 404
        serialized = serialize_order(order)
        return jsonify({"success": True, "data": serialized, **serialized})


@bp.get("/orders/by-number/<int:order_number>")
def get_order_by_number(order_number: int):
    with db.get_db() as session:
        order = session.execute(select(Order).filter_by(order_number=order_number)).scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        if not _has_order_access(order, request.args.get("token")):
            log_security_event("idor_attempt", request_ip(), str(order_number))
            return jsonify({"success": False, "message": "Order not found"}), 404
        serialized = serialize_order(order)
        return jsonify({"success": True, "data": serialized, **serialized})


@bp.get("/admin/orders")
@require_role("staff")
def list_admin_orders():
    status = request.args.get("status", "all")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(max(1, int(request.args.get("per_page", 50))), 100)
    offset = (page - 1) * per_page
    allowed_statuses = {"pending", "preparing", "served", "all"}
    if status not in allowed_statuses:
        return jsonify({"success": False, "message": "Invalid status"}), 400
    with db.get_db() as session:
        query = select(Order).where(Order.is_archived.is_(False))
        if status != "all":
            query = query.where(Order.status == status)
        total = session.execute(select(func.count()).select_from(query.subquery())).scalar_one()
        rows = session.execute(query.order_by(Order.created_at.desc()).limit(per_page).offset(offset)).scalars().all()
        return jsonify({
            "success": True,
            "data": [serialize_order(order) for order in rows],
            "page": page,
            "per_page": per_page,
            "total": int(total or 0),
            "pages": ((int(total or 0) + per_page - 1) // per_page),
        })


@bp.patch("/admin/orders/bulk-status")
@require_role("staff")
def bulk_order_status():
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in {"pending", "preparing", "served"}:
        return jsonify({"success": False, "message": "Invalid status"}), 400
    order_ids, error = _parse_order_ids(data.get("order_ids"))
    if error:
        return jsonify({"success": False, "message": error}), 400

    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        orders = session.execute(
            select(Order).where(Order.id.in_(order_ids), Order.is_archived.is_(False))
        ).scalars().all()
        for order in orders:
            old_status = order.status
            _apply_lifecycle_status(order, status, now)
            history = list(order.status_history or [])
            history.append({"status": status, "ts": now.isoformat(), "reason": "bulk"})
            order.status_history = history
            audit(session, "order.bulk_status", "order", order.id, {"from": old_status, "to": status})
        session.commit()

    id_payload = [str(order_id) for order_id in order_ids]
    broadcast("orders_update", {
        "action": "status_changed",
        "order_ids": id_payload,
        "status": status,
        "timestamp": now.isoformat(),
    })
    broadcast("analytics_update", {"action": "orders_changed"})
    return jsonify({"success": True, "updated": len(orders), "status": status})


@bp.patch("/admin/orders/bulk-archive")
@require_role("staff")
def bulk_archive_orders():
    data = request.get_json(silent=True) or {}
    order_ids, error = _parse_order_ids(data.get("order_ids"))
    if error:
        return jsonify({"success": False, "message": error}), 400

    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        orders = session.execute(
            select(Order).where(Order.id.in_(order_ids), Order.is_archived.is_(False))
        ).scalars().all()
        for order in orders:
            order.is_archived = True
            order.archived_at = now
            audit(session, "order.archive", "order", order.id)
        session.commit()

    id_payload = [str(order_id) for order_id in order_ids]
    broadcast("orders_update", {"action": "archived", "order_ids": id_payload})
    broadcast("analytics_update", {"action": "orders_changed"})
    return jsonify({"success": True, "archived": len(orders)})


@bp.patch("/admin/orders/clear-served")
@require_role("staff")
def clear_served_orders():
    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        orders = session.execute(
            select(Order).where(Order.status == "served", Order.is_archived.is_(False))
        ).scalars().all()
        for order in orders:
            order.is_archived = True
            order.archived_at = now
            audit(session, "order.clear_served", "order", order.id)
        order_ids = [str(order.id) for order in orders]
        cleared_count = len(orders)
        session.commit()

    broadcast("orders_update", {"action": "cleared", "count": cleared_count, "order_ids": order_ids})
    broadcast("analytics_update", {"action": "orders_changed"})
    return jsonify({"success": True, "cleared": cleared_count})


@bp.patch("/admin/orders/archive-all")
@require_role("staff")
def archive_all_orders():
    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        orders = session.execute(
            select(Order).where(Order.is_archived.is_(False))
        ).scalars().all()
        for order in orders:
            order.is_archived = True
            order.archived_at = now
            audit(session, "order.archive_all", "order", order.id)
        order_ids = [str(order.id) for order in orders]
        archived_count = len(orders)
        session.commit()

    broadcast("orders_update", {"action": "cleared", "count": archived_count, "order_ids": order_ids})
    broadcast("analytics_update", {"action": "orders_changed"})
    return jsonify({"success": True, "archived": archived_count})


@bp.get("/admin/orders/archive")
@require_role("staff")
def archived_orders():
    archived_date = request.args.get("date")
    with db.get_db() as session:
        query = select(Order).where(Order.is_archived.is_(True))
        if archived_date:
            day = datetime.strptime(archived_date, "%Y-%m-%d").date()
            start_utc = datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc)
            end_utc = start_utc + timedelta(days=1)
            query = query.where(Order.archived_at >= start_utc, Order.archived_at < end_utc)
        rows = session.execute(
            query.order_by(Order.archived_at.desc()).limit(200)
        ).scalars().all()
        return jsonify({"success": True, "data": [serialize_order(order) for order in rows]})


@bp.get("/admin/orders/stats")
@require_role("staff")
def order_stats():
    today_ist = datetime.now(IST).date()
    start_utc = datetime.combine(today_ist, time.min, tzinfo=IST).astimezone(timezone.utc)
    end_utc = start_utc + timedelta(days=1)
    with db.get_db() as session:
        active_orders = session.execute(
            select(Order).where(Order.is_archived.is_(False))
        ).scalars().all()
        today_orders = session.execute(
            select(Order).where(Order.created_at >= start_utc, Order.created_at < end_utc)
        ).scalars().all()

    counts = {"pending": 0, "preparing": 0, "served": 0}
    for order in active_orders:
        if order.status in counts:
            counts[order.status] += 1
    today_revenue = sum(int(order.total or 0) for order in today_orders)
    return jsonify({
        "success": True,
        **counts,
        "total_active": len(active_orders),
        "today_revenue": today_revenue,
        "today_orders": len(today_orders),
    })


@bp.patch("/admin/orders/<uuid:order_id>/status")
@require_role("staff")
def update_order_status(order_id: uuid.UUID):
    schema = validate_schema(OrderStatusUpdate)
    user_id = uuid.UUID(g.current_user["id"])
    
    with db.get_db() as session:
        order = session.execute(select(Order).filter_by(id=order_id)).scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
            
        old_status = order.status
        new_status = schema.status
        
        # Business Logic: Inventory Auto-Deduct
        if old_status != "preparing" and new_status == "preparing":
            deduct_stock_for_order(session, order.id, actor_id=user_id)
            
        # Update order
        order.status = new_status
        order.version += 1 # Layer 6: Optimistic Locking
        
        # Record history
        history = list(order.status_history)
        history.append({"status": new_status, "ts": datetime.now(timezone.utc).isoformat(), "reason": schema.reason})
        order.status_history = history
        
        if new_status == "confirmed" and not order.confirmed_at:
            order.confirmed_at = datetime.now(timezone.utc)
        if new_status == "served" and not order.served_at:
            order.served_at = datetime.now(timezone.utc)
            
        audit(session, "order.status_change", "order", order.id, {"from": old_status, "to": new_status})
        session.commit()
        session.refresh(order)
        serialized = serialize_order(order)
        broker.publish("kitchen", "order.updated", serialized)
        broker.publish(f"order:{order_topic_id(order.id)}", "order.updated", serialized)
        broadcast("orders_update", {
            "action": "status_changed",
            "order_ids": [str(order.id)],
            "status": new_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        broadcast("analytics_update", {"action": "orders_changed"})
        
        return jsonify({
            "success": True,
            "message": f"Order status updated to {new_status}",
            "data": serialized,
            **serialized,
        })


@bp.post("/orders/<uuid:order_id>/addons")
def add_order_items(order_id: uuid.UUID):
    data = request.get_json(silent=True) or {}
    items_req = data.get("items", [])
    if not items_req:
        return jsonify({"success": False, "message": "No items provided"}), 400

    with db.get_db() as session:
        order = session.execute(select(Order).filter_by(id=order_id)).scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        public_token = request.args.get("token") or data.get("token") or data.get("public_token")
        if not _has_order_access(order, public_token):
            log_security_event("idor_attempt", request_ip(), str(order_id))
            return jsonify({"success": False, "message": "Order not found"}), 404
        
        if order.status in ("served", "cancelled"):
            return jsonify({"success": False, "message": "Cannot add items to a finalized order"}), 400

        # Calculate totals for new items
        new_totals = calculate_order_totals(session, items_req)
        
        # Update order financials
        order.subtotal += new_totals["subtotal"]
        order.tax += new_totals["tax"]
        order.total += new_totals["total"]
        order.version += 1

        # Add new items
        for item_req in items_req:
            # Normalize addon menu_item_id if UI-suffixed (strip last suffix only)
            mid_raw = item_req.get("menu_item_id")
            if isinstance(mid_raw, str) and (mid_raw.endswith("-half") or mid_raw.endswith("-full")):
                try:
                    candidate = mid_raw[: mid_raw.rfind("-")]
                    uuid.UUID(candidate)
                    mid_raw = candidate
                except Exception:
                    pass
            mid = uuid.UUID(mid_raw)
            menu_item = session.execute(select(MenuItem).filter_by(id=mid, available=True)).scalar_one_or_none()
            if not menu_item:
                 return jsonify({"success": False, "message": f"Item {mid} is unavailable"}), 409
            
            addon = OrderItem(
                order_id=order.id,
                menu_item_id=menu_item.id,
                qty=item_req["qty"],
                unit_price=menu_item.price,
                special_note=item_req.get("special_note", ""),
                is_addon=True,
                addon_added_at=db.utc_now()
            )
            session.add(addon)

        audit(session, "order.addon", "order", order.id, {"added_total": new_totals["total"]})
        session.commit()
        session.refresh(order)
        serialized = serialize_order(order)
        broker.publish("kitchen", "order.updated", serialized)
        broker.publish(f"order:{order_topic_id(order.id)}", "order.updated", serialized)
        
        return jsonify({
            "success": True,
            "data": serialized
        }), 200
