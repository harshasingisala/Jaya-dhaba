from __future__ import annotations

import os
from collections import deque

from flask_jwt_extended import decode_token
from flask_socketio import SocketIO, disconnect, emit, join_room

from auth import ROLE_RANK, active_user


def _cors_allowed_origins() -> list[str]:
    origins = [
        "https://www.jayadhaba.online",
        "https://jayadhaba.online",
    ]
    runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    if runtime_env != "production":
        origins.extend([
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ])
    return origins


def _async_mode() -> str:
    configured = os.getenv("SOCKETIO_ASYNC_MODE")
    if configured:
        return configured
    runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    return "eventlet" if runtime_env == "production" else "threading"


socketio = SocketIO(
    cors_allowed_origins=_cors_allowed_origins(),
    async_mode=_async_mode(),
    manage_session=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1_000_000,
    logger=False,
    engineio_logger=False,
)

_pending_emissions = deque()
_batch_started = False


def init_realtime(app):
    global _batch_started
    socketio.init_app(app)
    if not _batch_started:
        socketio.start_background_task(_batch_emit)
        _batch_started = True


def verify_admin_token(token: str) -> bool:
    if not token:
        return False
    decoded = decode_token(token)
    user = active_user(decoded.get("sub"))
    if not user:
        return False
    return ROLE_RANK.get(user.role, 0) >= ROLE_RANK["staff"]


def _queue_emit(event: str, payload: dict, *, room: str, namespace: str = "/") -> None:
    _pending_emissions.append((event, payload, room, namespace))


def _batch_emit():
    while True:
        socketio.sleep(0.5)
        if not _pending_emissions:
            continue
        batch = []
        while _pending_emissions:
            batch.append(_pending_emissions.popleft())
        for event, payload, room, namespace in batch:
            socketio.emit(event, payload, room=room, namespace=namespace)


def broadcast(event: str, payload: dict) -> None:
    _queue_emit(event, payload, room="admin")
    _queue_emit(event, payload, room="admin_room", namespace="/admin")


def notify_order_update(order_id, status):
    payload = {"order_id": str(order_id), "status": status}
    _queue_emit("order_updated", payload, room=f"order_{order_id}", namespace="/customer")
    _queue_emit("order_updated", payload, room="admin_room", namespace="/admin")


@socketio.on("connect")
def on_connect():
    pass


@socketio.on("disconnect")
def on_disconnect():
    pass


@socketio.on("join_admin")
def on_join_admin(data):
    token = (data or {}).get("token", "")
    try:
        if not verify_admin_token(token):
            emit("admin_join_failed", {"message": "Invalid token"})
            emit("auth_error", {"message": "Invalid token"})
            disconnect()
            return
    except Exception:
        emit("admin_join_failed", {"message": "Token verification failed"})
        emit("auth_error", {"message": "Token verification failed"})
        disconnect()
        return

    join_room("admin")
    emit("admin_joined", {"status": "connected", "room": "admin"})
    emit("joined", {"status": "connected", "room": "admin"})


@socketio.on("join", namespace="/admin")
@socketio.on("join_admin", namespace="/admin")
def on_admin_join_namespace(data):
    token = (data or {}).get("token", "")
    try:
        if not verify_admin_token(token):
            emit("admin_join_failed", {"message": "Invalid token"}, namespace="/admin")
            disconnect(namespace="/admin")
            return
    except Exception:
        emit("admin_join_failed", {"message": "Token verification failed"}, namespace="/admin")
        disconnect(namespace="/admin")
        return
    join_room("admin_room", namespace="/admin")
    emit("admin_joined", {"status": "connected", "room": "admin_room"}, namespace="/admin")


@socketio.on("track_order", namespace="/customer")
def on_track_order(data):
    order_id = (data or {}).get("order_id")
    if order_id:
        join_room(f"order_{order_id}", namespace="/customer")
        emit("tracking_joined", {"order_id": order_id}, namespace="/customer")
