from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

from flask import current_app, request

from auth import redis_client


QR_TTL_SECONDS = 30 * 24 * 60 * 60
TABLE_SESSION_TTL_SECONDS = 2 * 60 * 60
DEFAULT_RESTAURANT_ID = "jaya-dhaba"
_SIGNATURE_LENGTH = 32
_SESSIONS: dict[str, tuple[dict, float]] = {}
_SESSIONS_LOCK = threading.Lock()


def _runtime_env() -> str:
    return (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()


def _qr_secret() -> str:
    secret = (
        current_app.config.get("QR_SESSION_SECRET")
        or os.getenv("QR_SESSION_SECRET")
        or current_app.config.get("JWT_SECRET_KEY")
    )
    if not secret:
        if _runtime_env() == "production":
            raise RuntimeError("QR_SESSION_SECRET is required in production")
        secret = "development-qr-session-secret"
    return str(secret)


def _b64encode(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(data: str) -> dict:
    padded = data + ("=" * (-len(data) % 4))
    return json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))


def _sign(data: str) -> str:
    return hmac.new(_qr_secret().encode("utf-8"), data.encode("ascii"), hashlib.sha256).hexdigest()[:_SIGNATURE_LENGTH]


def generate_qr_token(
    table_id: str,
    *,
    table_version: str,
    restaurant_id: str = DEFAULT_RESTAURANT_ID,
    ttl_seconds: int = QR_TTL_SECONDS,
) -> str:
    now = int(time.time())
    payload = {
        "table": str(table_id),
        "restaurant": restaurant_id,
        "v": str(table_version),
        "iat": now,
        "exp": now + max(60, int(ttl_seconds)),
    }
    data = _b64encode(payload)
    return f"{data}.{_sign(data)}"


def verify_qr_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        data, signature = str(token).rsplit(".", 1)
        expected = _sign(data)
        if not hmac.compare_digest(signature, expected):
            return None
        payload = _b64decode(data)
        if int(payload.get("exp") or 0) < int(time.time()):
            return None
        if not payload.get("table") or not payload.get("restaurant") or not payload.get("v"):
            return None
        return payload
    except Exception:
        return None


def create_table_session(
    table_id: str,
    *,
    restaurant_id: str = DEFAULT_RESTAURANT_ID,
    ttl_seconds: int = TABLE_SESSION_TTL_SECONDS,
) -> str:
    session_id = secrets.token_urlsafe(32)
    payload = {
        "table_id": str(table_id),
        "restaurant_id": restaurant_id,
        "created_at": int(time.time()),
        "orders": [],
        "ip": request.headers.get("CF-Connecting-IP") or request.remote_addr,
    }
    client = redis_client()
    if client is not None:
        client.setex(f"table_session:{session_id}", max(60, int(ttl_seconds)), json.dumps(payload))
        return session_id
    if _runtime_env() == "production":
        raise RuntimeError("Table session service unavailable")

    expires_at = time.time() + max(60, int(ttl_seconds))
    with _SESSIONS_LOCK:
        _prune_expired_sessions()
        _SESSIONS[session_id] = (payload, expires_at)
    return session_id


def get_table_session(session_id: str | None) -> dict | None:
    if not session_id:
        return None
    client = redis_client()
    if client is not None:
        raw = client.get(f"table_session:{session_id}")
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return None
    if _runtime_env() == "production":
        return None

    with _SESSIONS_LOCK:
        value = _SESSIONS.get(str(session_id))
        if not value:
            return None
        payload, expires_at = value
        if expires_at <= time.time():
            _SESSIONS.pop(str(session_id), None)
            return None
        return dict(payload)


def remember_table_order(session_id: str | None, order_id: str) -> None:
    if not session_id or not order_id:
        return
    client = redis_client()
    if client is not None:
        key = f"table_session:{session_id}"
        raw = client.get(key)
        if not raw:
            return
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            payload = json.loads(raw)
            payload.setdefault("orders", []).append(str(order_id))
            client.setex(key, TABLE_SESSION_TTL_SECONDS, json.dumps(payload))
        except Exception:
            return
        return

    with _SESSIONS_LOCK:
        value = _SESSIONS.get(str(session_id))
        if not value:
            return
        payload, expires_at = value
        if expires_at <= time.time():
            _SESSIONS.pop(str(session_id), None)
            return
        payload.setdefault("orders", []).append(str(order_id))


def _prune_expired_sessions() -> None:
    now = time.time()
    for key, (_, expires_at) in list(_SESSIONS.items()):
        if expires_at <= now:
            _SESSIONS.pop(key, None)
