from __future__ import annotations

from flask import Blueprint, Response, current_app, g, jsonify, request, stream_with_context
import db
from auth import AuthError, ROLE_RANK, active_user, consume_stream_ticket, create_stream_ticket, require_min_role, require_role
from events import order_topic_id, stream_topic
from routes.orders import order_access
from routes.orders import serialize_order
from models import Order
from sqlalchemy import select


bp = Blueprint("sse", __name__, url_prefix="/api")


def user_from_stream_ticket(min_role: str):
    user_id = consume_stream_ticket(request.args.get("ticket"))
    if not user_id:
        return None, 401
    user_record = active_user(user_id)
    if not user_record:
        return None, 401
    if ROLE_RANK.get(user_record.role, 0) < ROLE_RANK.get(min_role, 0):
        return None, 403
    user = {
        "id": str(user_record.id),
        "role": user_record.role,
        "email": user_record.email,
        "phone": user_record.phone,
    }
    g.current_user = user
    return user, None


@bp.post("/stream/ticket")
@require_role("customer")
def stream_ticket():
    try:
        ticket = create_stream_ticket(g.current_user["id"])
    except AuthError as error:
        return jsonify({"success": False, "message": error.message}), error.status
    return jsonify({"success": True, "data": {"ticket": ticket}, "ticket": ticket})


@bp.get("/orders/<int:order_id>/stream")
def order_stream(order_id: int):
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = order_access(conn, order_id, request.args.get("token"))
    if not row:
        return jsonify({"message": "Order not found"}), 404
    return Response(stream_with_context(stream_topic(f"order:{order_topic_id(row['id'])}")), mimetype="text/event-stream")


@bp.get("/orders/<uuid:order_id>/stream")
def order_uuid_stream(order_id):
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = order_access(conn, str(order_id), request.args.get("token"))
    if not row:
        return jsonify({"message": "Order not found"}), 404
    return Response(stream_with_context(stream_topic(f"order:{order_topic_id(row['id'])}")), mimetype="text/event-stream")


@bp.get("/kitchen/stream")
def kitchen_stream():
    _, status = user_from_stream_ticket("staff")
    if status:
        return jsonify({"success": False, "message": "Unauthorized"}), status
    return Response(
        stream_with_context(stream_topic("kitchen")),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@bp.get("/kitchen/orders")
@require_min_role("staff", missing_status=403)
def kitchen_orders():
    with db.get_db() as session:
        rows = session.execute(
            select(Order)
            .where(Order.status.in_(["pending", "confirmed", "preparing", "ready"]))
            .order_by(Order.created_at.desc())
            .limit(250)
        ).scalars().all()
        return jsonify({"success": True, "data": [serialize_order(order) for order in rows]})


@bp.get("/reservations/stream")
def reservations_stream():
    _, status = user_from_stream_ticket("staff")
    if status:
        return jsonify({"success": False, "message": "Unauthorized"}), status
    return Response(
        stream_with_context(stream_topic("reservations")),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
