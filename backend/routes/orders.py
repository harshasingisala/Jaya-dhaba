from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time as time_module
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import List

from flask import Blueprint, after_this_request, current_app, g, jsonify, request
from sqlalchemy import func, select, text
from sqlalchemy.orm import joinedload, object_session

import db
from cache import orders_cache, stats_cache
from models import Order, OrderItem, MenuItem, MenuCategory, RestaurantTable, User
from auth import require_role, log_audit
from auth import request_ip
from rate_limits import enforce_limit
from validators import validate_schema
from schemas import OrderCreate, OrderStatusUpdate
from services.billing import calculate_order_totals
from services.inventory import deduct_stock_for_order
from events import broker, order_topic_id
from realtime import broadcast, notify_order_update
from security_log import log_security_event
from utils.validation import extract_fields
from order_queue import enqueue_order, finish_order
from qr_sessions import get_table_session, remember_table_order

bp = Blueprint("orders", __name__, url_prefix="/api")
audit = log_audit
_ADVANCE_LOCK = threading.Lock()
_LAST_ADVANCE_AT = 0.0
_ADVANCE_INTERVAL_SECONDS = 5.0


def _invalidate_admin_order_caches() -> None:
    orders_cache.invalidate("admin_orders:")
    stats_cache.invalidate("orders:")

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
PREPARING_TO_READY_AFTER = timedelta(minutes=7)
READY_TO_SERVED_AFTER = timedelta(minutes=7)
SERVED_TO_ARCHIVE_AFTER = timedelta(minutes=10)


def _sign_pending_intent(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True, default=str).encode("utf-8")
    signature = hmac.new(current_app.config["SECRET_KEY"].encode("utf-8"), body, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(body).decode("ascii") + "." + signature


def _order_table_label(order: Order) -> str | None:
    table = getattr(order, "table", None)
    if table and getattr(table, "label", None):
        return table.label
    table_id = getattr(order, "table_id", None)
    if not table_id:
        return None
    session = object_session(order)
    if not session:
        return None
    table = session.execute(
        select(RestaurantTable).where(RestaurantTable.id == table_id)
    ).scalar_one_or_none()
    return table.label if table else None


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
    table_label = _order_table_label(order)
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
        "table_label": table_label,
        "table": table_label,
        "table_number": table_label,
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
    elif status == "ready":
        if not order.preparing_at:
            order.preparing_at = now
    elif status == "served":
        if not order.preparing_at:
            order.preparing_at = now
        order.served_at = now
    elif status == "pending":
        order.preparing_at = None
        order.served_at = None


def _as_utc(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _publish_order_lifecycle(payloads: list[dict], *, action: str, status: str | None = None, timestamp: str | None = None) -> None:
    if not payloads:
        return
    _invalidate_admin_order_caches()
    for payload in payloads:
        broker.publish("kitchen", "order.updated", payload)
        broker.publish(f"order:{order_topic_id(payload['id'])}", "order.updated", payload)
        if status:
            notify_order_update(payload["id"], status)
    broadcast("orders_update", {
        "action": action,
        "order_ids": [payload["id"] for payload in payloads],
        "status": status,
        "timestamp": timestamp,
    })
    broadcast("analytics_update", {"action": "orders_changed"})


def advance_order_timers() -> None:
    global _LAST_ADVANCE_AT
    monotonic_now = time_module.monotonic()
    if monotonic_now - _LAST_ADVANCE_AT < _ADVANCE_INTERVAL_SECONDS:
        return
    if not _ADVANCE_LOCK.acquire(blocking=False):
        return
    try:
        monotonic_now = time_module.monotonic()
        if monotonic_now - _LAST_ADVANCE_AT < _ADVANCE_INTERVAL_SECONDS:
            return
        _LAST_ADVANCE_AT = monotonic_now
        _advance_order_timers_now()
    finally:
        _ADVANCE_LOCK.release()


def _advance_order_timers_now() -> None:
    now = datetime.now(timezone.utc)
    ready_payloads: list[dict] = []
    served_payloads: list[dict] = []
    archived_payloads: list[dict] = []

    with db.get_db() as session:
        active_orders = session.execute(
            select(Order).where(
                Order.is_archived.is_(False),
                Order.status.in_(["preparing", "ready", "served"]),
            )
        ).scalars().all()
        for order in active_orders:
            if (
                order.status == "preparing"
                and _as_utc(order.preparing_at)
                and now - _as_utc(order.preparing_at) >= PREPARING_TO_READY_AFTER
            ):
                _apply_lifecycle_status(order, "ready", now)
                history = list(order.status_history or [])
                history.append({"status": "ready", "ts": now.isoformat(), "reason": "auto_timer"})
                order.status_history = history
                ready_payloads.append(order)
            elif (
                order.status == "ready"
                and _as_utc(order.updated_at)
                and now - _as_utc(order.updated_at) >= READY_TO_SERVED_AFTER
            ):
                _apply_lifecycle_status(order, "served", now)
                history = list(order.status_history or [])
                history.append({"status": "served", "ts": now.isoformat(), "reason": "auto_timer"})
                order.status_history = history
                served_payloads.append(order)
            elif (
                order.status == "served"
                and _as_utc(order.served_at)
                and now - _as_utc(order.served_at) >= SERVED_TO_ARCHIVE_AFTER
            ):
                order.is_archived = True
                order.archived_at = now
                history = list(order.status_history or [])
                history.append({"status": "archived", "ts": now.isoformat(), "reason": "auto_timer"})
                order.status_history = history
                archived_payloads.append(order)

        if not (ready_payloads or served_payloads or archived_payloads):
            return

        session.commit()
        ready_serialized = []
        served_serialized = []
        archived_serialized = []
        for order in ready_payloads:
            session.refresh(order)
            ready_serialized.append(serialize_order(order))
        for order in served_payloads:
            session.refresh(order)
            served_serialized.append(serialize_order(order))
        for order in archived_payloads:
            session.refresh(order)
            archived_serialized.append(serialize_order(order))

    _publish_order_lifecycle(ready_serialized, action="status_changed", status="ready", timestamp=now.isoformat())
    _publish_order_lifecycle(served_serialized, action="status_changed", status="served", timestamp=now.isoformat())
    if archived_serialized:
        _publish_order_lifecycle(archived_serialized, action="archived", timestamp=now.isoformat())


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
        "table_session",
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
    table_session_id = raw.get("table_session")
    if table_session_id and not raw.get("table_id"):
        session_payload = get_table_session(table_session_id)
        if not session_payload:
            return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403
        raw["table_id"] = str(session_payload.get("table_id") or "")
    if raw.get("table_token") and not raw.get("table_id"):
        with db.get_db() as session:
            table = session.execute(
                select(RestaurantTable).filter_by(qr_token=raw["table_token"], active=True)
            ).scalar_one_or_none()
            if not table:
                return jsonify({"success": False, "message": "Table not found"}), 404
            raw["table_id"] = str(table.id)
    raw.pop("table_session", None)
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
        existing = session.execute(select(Order).filter_by(idempotency_key=idempotency_key)).scalar_one_or_none()
        if existing:
            serialized = serialize_order(existing, include_public_token=True)
            remember_table_order(table_session_id, str(existing.id))
            return jsonify({"success": True, "data": serialized, **serialized}), 200

        resolved_table = None
        if schema.table_id:
            table = session.execute(
                select(RestaurantTable).filter_by(id=schema.table_id, active=True)
            ).scalar_one_or_none()
            if not table:
                return jsonify({"success": False, "message": "Table not found"}), 404
            resolved_table = table
            active_order = session.execute(
                select(Order).where(
                    Order.table_id == schema.table_id,
                    Order.is_archived.is_(False),
                    Order.status.notin_(["served", "cancelled"]),
                )
            ).scalar_one_or_none()
            if active_order:
                return jsonify({"success": False, "message": "Table already has an active order"}), 409

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
        if resolved_table is not None:
            new_order.table = resolved_table
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
        remember_table_order(table_session_id, str(new_order.id))

        broker.publish("kitchen", "order.created", serialized)
        broker.publish(f"order:{order_topic_id(new_order.id)}", "order.created", serialized)
        broadcast("new_order", {"order": serialized})
        broadcast("orders_update", {"action": "new_order", "order": serialized})
        broadcast("analytics_update", {"action": "orders_changed"})
        _invalidate_admin_order_caches()
        
        return jsonify({
            "success": True,
            "message": "Order placed successfully",
            "data": serialized,
            **serialized,
        }), 201


@bp.get("/orders/<uuid:order_id>")
def get_order(order_id: uuid.UUID):
    advance_order_timers()
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
    advance_order_timers()
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
    advance_order_timers()
    status = request.args.get("status", "all")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(max(1, int(request.args.get("per_page", 50))), 100)
    offset = (page - 1) * per_page
    allowed_statuses = {"pending", "preparing", "ready", "served", "all"}
    if status not in allowed_statuses:
        return jsonify({"success": False, "message": "Invalid status"}), 400
    cache_key = f"admin_orders:list:{status}:{page}:{per_page}"
    cached = orders_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)
    with db.get_db() as session:
        query = (
            select(Order)
            .options(joinedload(Order.table), joinedload(Order.items).joinedload(OrderItem.menu_item))
            .where(Order.is_archived.is_(False))
        )
        if status != "all":
            query = query.where(Order.status == status)
        total = session.execute(select(func.count()).select_from(query.subquery())).scalar_one()
        rows = session.execute(
            query.order_by(Order.created_at.desc()).limit(per_page).offset(offset)
        ).unique().scalars().all()
        orders = [serialize_order(order) for order in rows]
        payload = {
            "success": True,
            "orders": orders,
            "data": orders,
            "page": page,
            "per_page": per_page,
            "total": int(total or 0),
            "pages": ((int(total or 0) + per_page - 1) // per_page),
        }
        orders_cache.set(cache_key, payload)
        return jsonify(payload)


@bp.patch("/admin/orders/bulk-status")
@require_role("staff")
def bulk_order_status():
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in {"pending", "preparing", "ready", "served"}:
        return jsonify({"success": False, "message": "Invalid status"}), 400
    order_ids, error = _parse_order_ids(data.get("order_ids"))
    if error:
        return jsonify({"success": False, "message": error}), 400

    now = datetime.now(timezone.utc)
    updated_payloads = []
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
        for order in orders:
            session.refresh(order)
            updated_payloads.append(serialize_order(order))

    id_payload = [str(order_id) for order_id in order_ids]
    for payload in updated_payloads:
        broker.publish("kitchen", "order.updated", payload)
        broker.publish(f"order:{order_topic_id(payload['id'])}", "order.updated", payload)
        notify_order_update(payload["id"], status)
    broadcast("orders_update", {
        "action": "status_changed",
        "order_ids": id_payload,
        "status": status,
        "timestamp": now.isoformat(),
    })
    broadcast("analytics_update", {"action": "orders_changed"})
    _invalidate_admin_order_caches()
    return jsonify({"success": True, "updated": len(orders), "status": status})


@bp.patch("/admin/orders/bulk-archive")
@require_role("staff")
def bulk_archive_orders():
    data = request.get_json(silent=True) or {}

    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        if data.get("order_ids"):
            order_ids, error = _parse_order_ids(data.get("order_ids"))
            if error:
                return jsonify({"success": False, "message": error}), 400
            orders = session.execute(
                select(Order).where(Order.id.in_(order_ids), Order.is_archived.is_(False))
            ).scalars().all()
        else:
            today_ist = datetime.now(IST).date()
            start_utc = datetime.combine(today_ist, time.min, tzinfo=IST).astimezone(timezone.utc)
            orders = session.execute(
                select(Order).where(
                    Order.status == "served",
                    Order.is_archived.is_(False),
                    Order.created_at < start_utc,
                )
            ).scalars().all()
            order_ids = [order.id for order in orders]
        for order in orders:
            order.is_archived = True
            order.archived_at = now
            audit(session, "order.archive", "order", order.id)
        session.commit()

    id_payload = [str(order_id) for order_id in order_ids]
    broadcast("orders_update", {"action": "archived", "order_ids": id_payload})
    broadcast("analytics_update", {"action": "orders_changed"})
    _invalidate_admin_order_caches()
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
    _invalidate_admin_order_caches()
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
    _invalidate_admin_order_caches()
    return jsonify({"success": True, "archived": archived_count})


@bp.get("/admin/orders/archive")
@require_role("staff")
def archived_orders():
    archived_date = request.args.get("date")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(max(1, int(request.args.get("per_page", 50))), 200)
    offset = (page - 1) * per_page
    cache_key = f"admin_orders:archive:{archived_date or 'all'}:{page}:{per_page}"
    cached = orders_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)
    with db.get_db() as session:
        query = (
            select(Order)
            .options(joinedload(Order.table), joinedload(Order.items).joinedload(OrderItem.menu_item))
            .where(Order.is_archived.is_(True))
        )
        if archived_date:
            day = datetime.strptime(archived_date, "%Y-%m-%d").date()
            start_utc = datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc)
            end_utc = start_utc + timedelta(days=1)
            query = query.where(Order.archived_at >= start_utc, Order.archived_at < end_utc)
        total = session.execute(select(func.count()).select_from(query.subquery())).scalar_one()
        rows = session.execute(
            query.order_by(Order.archived_at.desc()).limit(per_page).offset(offset)
        ).unique().scalars().all()
        payload = {
            "success": True,
            "data": [serialize_order(order) for order in rows],
            "page": page,
            "per_page": per_page,
            "total": int(total or 0),
            "pages": ((int(total or 0) + per_page - 1) // per_page),
        }
        orders_cache.set(cache_key, payload)
        return jsonify(payload)


@bp.get("/admin/orders/stats")
@require_role("staff")
def order_stats():
    advance_order_timers()
    cached = stats_cache.get("orders:stats")
    if cached is not None:
        return jsonify(cached)
    today_ist = datetime.now(IST).date()
    start_utc = datetime.combine(today_ist, time.min, tzinfo=IST).astimezone(timezone.utc)
    end_utc = start_utc + timedelta(days=1)
    with db.get_db() as session:
        status_rows = session.execute(
            select(Order.status, func.count(Order.id))
            .where(Order.is_archived.is_(False), Order.status.in_(["pending", "preparing", "ready", "served"]))
            .group_by(Order.status)
        ).all()
        today_row = session.execute(
            select(func.coalesce(func.sum(Order.total), 0), func.count(Order.id))
            .where(Order.created_at >= start_utc, Order.created_at < end_utc)
        ).one()

    counts = {"pending": 0, "preparing": 0, "ready": 0, "served": 0}
    for status, count in status_rows:
        if status in counts:
            counts[status] = int(count or 0)
    total_active = sum(counts.values())
    today_revenue = int(today_row[0] or 0)
    today_orders = int(today_row[1] or 0)
    payload = {
        "success": True,
        **counts,
        "total_active": total_active,
        "today_revenue": today_revenue,
        "today_orders": today_orders,
        "revenue_today": today_revenue,
        "total_orders_today": today_orders,
        "pending_count": counts["pending"],
        "preparing_count": counts["preparing"],
    }
    stats_cache.set("orders:stats", payload)
    return jsonify(payload)


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
        now = datetime.now(timezone.utc)
        _apply_lifecycle_status(order, new_status, now)
        
        # Record history
        history = list(order.status_history or [])
        history.append({"status": new_status, "ts": now.isoformat(), "reason": schema.reason})
        order.status_history = history
        
        if new_status == "confirmed" and not order.confirmed_at:
            order.confirmed_at = now
            
        audit(session, "order.status_change", "order", order.id, {"from": old_status, "to": new_status})
        session.commit()
        session.refresh(order)
        serialized = serialize_order(order)
        broker.publish("kitchen", "order.updated", serialized)
        broker.publish(f"order:{order_topic_id(order.id)}", "order.updated", serialized)
        broadcast("order_updated", {"order": serialized})
        broadcast("orders_update", {
            "action": "status_changed",
            "order_ids": [str(order.id)],
            "status": new_status,
            "timestamp": now.isoformat(),
            "orders": [serialized],
        })
        broadcast("analytics_update", {"action": "orders_changed"})
        _invalidate_admin_order_caches()
        
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
        _invalidate_admin_order_caches()
        
        return jsonify({
            "success": True,
            "data": serialized
        }), 200
