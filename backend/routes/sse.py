from __future__ import annotations

from flask import Blueprint, Response, current_app, g, jsonify, request, stream_with_context
from flask_jwt_extended import decode_token

import db
from auth import BLACKLISTED_JTIS, active_user, require_min_role
from events import order_topic_id, stream_topic
from routes.orders import order_access
from routes.orders import serialize_order
from models import Order
from sqlalchemy import select


bp = Blueprint("sse", __name__, url_prefix="/api")


def user_from_query_token():
    token = request.args.get("access_token")
    if not token:
        return None
    try:
        decoded = decode_token(token)
    except Exception:
        return None
    if decoded.get("jti") in BLACKLISTED_JTIS:
        return None
    user_record = active_user(decoded.get("sub"))
    if not user_record:
        return None
    user = {
        "id": str(user_record.id),
        "role": user_record.role,
        "email": user_record.email,
        "phone": user_record.phone,
    }
    g.current_user = user
    return user


@bp.get("/orders/<int:order_id>/stream")
def order_stream(order_id: int):
    user_from_query_token()
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = order_access(conn, order_id, request.args.get("token"))
    if not row:
        return jsonify({"message": "Order not found"}), 404
    return Response(stream_with_context(stream_topic(f"order:{order_topic_id(row['id'])}")), mimetype="text/event-stream")


@bp.get("/orders/<uuid:order_id>/stream")
def order_uuid_stream(order_id):
    user_from_query_token()
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = order_access(conn, str(order_id), request.args.get("token"))
    if not row:
        return jsonify({"message": "Order not found"}), 404
    return Response(stream_with_context(stream_topic(f"order:{order_topic_id(row['id'])}")), mimetype="text/event-stream")


@bp.get("/kitchen/stream")
@require_min_role("staff", allow_query_token=True, missing_status=403)
def kitchen_stream():
    return Response(
        stream_with_context(stream_topic("kitchen")),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@bp.get("/kitchen/orders")
@require_min_role("staff", allow_query_token=True, missing_status=403)
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
@require_min_role("staff", allow_query_token=True, missing_status=403)
def reservations_stream():
    return Response(
        stream_with_context(stream_topic("reservations")),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
