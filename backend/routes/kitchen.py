from __future__ import annotations

import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import joinedload

import db
from auth import require_role
from events import broker, order_topic_id
from models import Order, OrderItem
from realtime import broadcast
from routes.orders import serialize_order


bp = Blueprint("kitchen", __name__, url_prefix="/api")
VALID_ITEM_STATUSES = {"pending", "preparing", "ready"}


def _uuid_variants(value: str) -> tuple[str, str]:
    parsed = uuid.UUID(str(value))
    return str(parsed), parsed.hex


@bp.patch("/kitchen/orders/<uuid:order_id>/items/<item_id>/status")
@require_role("staff")
def update_order_item_status(order_id: uuid.UUID, item_id: str):
    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status") or "").strip().lower()
    if new_status not in VALID_ITEM_STATUSES:
        return jsonify({"success": False, "message": "Invalid item status"}), 400

    try:
        item_variants = _uuid_variants(item_id)
    except ValueError:
        return jsonify({"success": False, "message": "Invalid item ID"}), 400

    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        order = session.execute(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.menu_item))
            .where(Order.id == order_id)
        ).unique().scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404

        order_item = next((line for line in order.items if str(line.id) in item_variants or line.id.hex in item_variants), None)
        if not order_item:
            return jsonify({"success": False, "message": "Order item not found"}), 404

        order_item.status = new_status
        if new_status == "preparing":
            order_item.started_at = now
        if new_status == "ready":
            order_item.ready_at = now

        all_ready = bool(order.items) and all((line.status or "pending") == "ready" for line in order.items)
        if all_ready and order.status != "ready":
            order.status = "ready"

        session.commit()
        session.refresh(order)
        session.refresh(order_item)
        serialized = serialize_order(order)
        payload = {
            "type": "item_status_update",
            "order_id": str(order.id),
            "item_id": str(order_item.id),
            "menu_item_id": str(order_item.menu_item_id),
            "item_name": order_item.menu_item.name if order_item.menu_item else "",
            "status": new_status,
            "table_id": str(order.table_id) if order.table_id else None,
            "all_ready": all_ready,
        }

    broker.publish("kitchen", "item_status_update", payload)
    broker.publish(f"order:{order_topic_id(payload['order_id'])}", "item_status_update", payload)
    if all_ready:
        broker.publish("kitchen", "order.updated", serialized)
        broker.publish(f"order:{order_topic_id(payload['order_id'])}", "order.updated", serialized)
        broadcast("order_updated", {"order": serialized})
        broadcast("orders_update", {"action": "status_changed", "order_ids": [payload["order_id"]], "status": "ready", "orders": [serialized]})

    return jsonify({"success": True, "item_id": payload["item_id"], "status": new_status, "all_ready": all_ready})


@bp.post("/kitchen/orders/<uuid:order_id>/items/bulk-status")
@require_role("staff")
def bulk_update_order_item_status(order_id: uuid.UUID):
    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status") or "").strip().lower()
    if new_status not in {"preparing", "ready"}:
        return jsonify({"success": False, "message": "Invalid item status"}), 400
    raw_item_ids = data.get("item_ids") or []
    if not isinstance(raw_item_ids, list) or not raw_item_ids:
        return jsonify({"success": False, "message": "item_ids are required"}), 400
    try:
        requested = {variant for item_id in raw_item_ids for variant in _uuid_variants(str(item_id))}
    except ValueError:
        return jsonify({"success": False, "message": "Invalid item ID"}), 400

    now = datetime.now(timezone.utc)
    with db.get_db() as session:
        order = session.execute(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.menu_item))
            .where(Order.id == order_id)
        ).unique().scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404

        updated_items = []
        for line in order.items:
            if str(line.id) in requested or line.id.hex in requested:
                line.status = new_status
                if new_status == "preparing":
                    line.started_at = now
                if new_status == "ready":
                    line.ready_at = now
                updated_items.append(line)
        if len(updated_items) != len(raw_item_ids):
            return jsonify({"success": False, "message": "One or more order items were not found"}), 404

        all_ready = bool(order.items) and all((line.status or "pending") == "ready" for line in order.items)
        if all_ready and order.status != "ready":
            order.status = "ready"
        session.commit()
        session.refresh(order)
        serialized = serialize_order(order)
        updated_payload = [
            {
                "item_id": str(line.id),
                "menu_item_id": str(line.menu_item_id),
                "item_name": line.menu_item.name if line.menu_item else "",
                "status": line.status,
            }
            for line in updated_items
        ]
        payload = {
            "type": "bulk_item_status_update",
            "order_id": str(order.id),
            "updated_item_ids": [item["item_id"] for item in updated_payload],
            "items": updated_payload,
            "status": new_status,
            "all_ready": all_ready,
        }

    broker.publish("kitchen", "bulk_item_status_update", payload)
    broker.publish(f"order:{order_topic_id(payload['order_id'])}", "bulk_item_status_update", payload)
    if all_ready:
        broker.publish("kitchen", "order.updated", serialized)
        broker.publish(f"order:{order_topic_id(payload['order_id'])}", "order.updated", serialized)
        broadcast("order_updated", {"order": serialized})
        broadcast("orders_update", {"action": "status_changed", "order_ids": [payload["order_id"]], "status": "ready", "orders": [serialized]})

    return jsonify({"success": True, "updated": len(updated_payload), "items": updated_payload, "all_ready": all_ready})
