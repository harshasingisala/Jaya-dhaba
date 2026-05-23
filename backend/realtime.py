from __future__ import annotations

import os

from flask_jwt_extended import decode_token
from flask_socketio import SocketIO, disconnect, emit, join_room

from auth import ROLE_RANK, active_user


def _cors_allowed_origins() -> list[str]:
    origins = [
        "https://www.jayadhaba.online",
        "https://jayadhaba.online",
    ]
    if os.getenv("FLASK_ENV") == "development":
        origins.append("http://localhost:5173")
        origins.append("http://localhost:5174")
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
    logger=False,
    engineio_logger=False,
)


def init_realtime(app):
    socketio.init_app(app)


def verify_admin_token(token: str) -> bool:
    if not token:
        return False
    decoded = decode_token(token)
    user = active_user(decoded.get("sub"))
    if not user:
        return False
    return ROLE_RANK.get(user.role, 0) >= ROLE_RANK["staff"]


def broadcast(event: str, payload: dict) -> None:
    socketio.emit(event, payload, room="admin")


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
