from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import List

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import select, func, update

import db
from models import Order, OrderItem, MenuItem, MenuCategory, RestaurantTable, User
from auth import require_role, log_audit
from validators import validate_schema
from schemas import OrderCreate, OrderStatusUpdate
from services.billing import calculate_order_totals
from services.inventory import deduct_stock_for_order
from events import broker, order_topic_id

bp = Blueprint("orders", __name__, url_prefix="/api")
audit = log_audit

def allocate_order_number(session):
    highest = session.execute(select(func.max(Order.order_number))).scalar_one_or_none()
    return (int(highest) if highest else 0) + 1


STAFF_ROLES = {"staff", "manager", "owner", "admin"}


def serialize_order(order: Order, *, include_public_token: bool = False) -> dict:
    payload = {
        "id": str(order.id),
        "order_number": order.order_number,
        "status": order.status,
        "subtotal": int(order.subtotal or 0),
        "tax": int(order.tax or 0),
        "total": int(order.total or 0),
        "guest_name": order.guest_name,
        "guest_phone": order.guest_phone,
        "order_type": order.order_type,
        "table_id": str(order.table_id) if order.table_id else None,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "name": item.menu_item.name,
                "qty": item.qty,
                "unit_price": item.unit_price,
                "special_note": item.special_note
            } for item in order.items
        ]
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


@bp.post("/orders")
def create_order():
    # Read raw JSON and defensively normalize menu_item_id values that may include UI suffixes
    # -- LOG RAW INPUT BEFORE ANY VALIDATION OR NORMALIZATION --
    try:
        raw_bytes = request.get_data(cache=True)
        current_app.logger.debug("[orders.create_order] RAW request bytes: %s", raw_bytes[:1000])
    except Exception:
        current_app.logger.debug("[orders.create_order] Failed to read raw request bytes")

    raw = request.get_json(silent=True) or {}
    current_app.logger.debug("[orders.create_order] Parsed JSON before normalization: %s", raw)
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
    current_app.logger.debug("[orders.create_order] Parsed JSON after normalization: %s", raw)
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

    with db.get_db() as session:
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
            return jsonify({"success": False, "message": "Order not found"}), 404
        serialized = serialize_order(order)
        return jsonify({"success": True, "data": serialized, **serialized})


@bp.get("/admin/orders")
@require_role("staff")
def list_admin_orders():
    with db.get_db() as session:
        rows = session.execute(select(Order).order_by(Order.created_at.desc()).limit(250)).scalars().all()
        return jsonify({"success": True, "data": [serialize_order(order) for order in rows]})


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
        
        return jsonify({
            "success": True,
            "message": f"Order status updated to {new_status}",
            "data": serialized,
            **serialized,
        })


@bp.post("/orders/<uuid:order_id>/addons")
def add_order_items(order_id: uuid.UUID):
    data = request.json
    items_req = data.get("items", [])
    if not items_req:
        return jsonify({"success": False, "message": "No items provided"}), 400

    with db.get_db() as session:
        order = session.execute(select(Order).filter_by(id=order_id)).scalar_one_or_none()
        if not order:
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
