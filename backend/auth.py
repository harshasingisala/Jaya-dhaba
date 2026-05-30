from __future__ import annotations

import hashlib
import os
import secrets
import time
import threading
import uuid
from functools import wraps
from datetime import datetime, timedelta, timezone

from flask import current_app, g, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    verify_jwt_in_request,
)
from sqlalchemy import select, update, delete, func

import db
from models import User, Session as UserSession, AuditLog
from utils.crypto import verify_password, hash_password, verify_totp

from security_middleware import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token
from request_context import get_real_ip

# Cookie names
REFRESH_COOKIE = "refresh_token"
BLACKLISTED_JTIS: set[str] = set()
_REDIS_CLIENT = None
_REDIS_DISABLED = False
_STREAM_TICKET_TTL_SECONDS = 45
_STREAM_TICKETS: dict[str, tuple[str, float]] = {}
_STREAM_TICKETS_LOCK = threading.Lock()


def redis_client():
    global _REDIS_CLIENT, _REDIS_DISABLED
    if _REDIS_DISABLED:
        return None
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return None
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    try:
        import redis

        _REDIS_CLIENT = redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        _REDIS_CLIENT.ping()
        return _REDIS_CLIENT
    except Exception:
        _REDIS_DISABLED = True
        return None


def is_jti_blacklisted(jti: str | None) -> bool:
    if not jti:
        return False
    client = redis_client()
    if client is not None:
        try:
            return bool(client.exists(f"jwt:blacklist:{jti}"))
        except Exception:
            pass
    return jti in BLACKLISTED_JTIS


def blacklist_jti(jti: str | None, ttl_seconds: int | None = None) -> None:
    if not jti:
        return
    BLACKLISTED_JTIS.add(jti)
    client = redis_client()
    if client is not None:
        try:
            client.setex(f"jwt:blacklist:{jti}", max(1, int(ttl_seconds or 15 * 60)), "1")
        except Exception:
            pass


def cookie_samesite() -> str:
    app_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    return "None" if app_env == "production" else "Lax"

# Role hierarchy
ROLE_RANK = {
    "guest": 0,
    "customer": 1,
    "staff": 2,
    "manager": 3,
    "owner": 4,
    "admin": 4
}
DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$RzV03OqeQBeh8Vac3iQ1sA$1dDYkGwMniyRCrsHO43GVjUAckkgWtenBinaThoYMcE"


def request_ip() -> str:
    return get_real_ip()


def _production_requires_redis() -> bool:
    runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    return runtime_env == "production"


def create_stream_ticket(user_id: str, ttl_seconds: int = _STREAM_TICKET_TTL_SECONDS) -> str:
    ticket = secrets.token_urlsafe(32)
    client = redis_client()
    if client is not None:
        client.setex(f"stream_ticket:{ticket}", max(1, int(ttl_seconds)), str(user_id))
        return ticket
    if _production_requires_redis():
        raise AuthError("Stream ticket service unavailable", 503)

    expires_at = time.time() + max(1, int(ttl_seconds))
    with _STREAM_TICKETS_LOCK:
        now = time.time()
        for key, (_, expiry) in list(_STREAM_TICKETS.items()):
            if expiry <= now:
                _STREAM_TICKETS.pop(key, None)
        _STREAM_TICKETS[ticket] = (str(user_id), expires_at)
    return ticket


def consume_stream_ticket(ticket: str | None) -> str | None:
    if not ticket:
        return None
    client = redis_client()
    if client is not None:
        value = client.execute_command("GETDEL", f"stream_ticket:{ticket}")
        if isinstance(value, bytes):
            return value.decode("utf-8")
        return str(value) if value else None
    if _production_requires_redis():
        return None

    with _STREAM_TICKETS_LOCK:
        value = _STREAM_TICKETS.pop(ticket, None)
    if not value:
        return None
    user_id, expires_at = value
    if expires_at <= time.time():
        return None
    return user_id


def get_fingerprint() -> str:
    # Basic fingerprinting using User-Agent and IP
    ua = request.headers.get("User-Agent", "unknown")
    ip = request_ip()
    return hashlib.sha256(f"{ua}:{ip}".encode()).hexdigest()


def token_hash(token: str) -> str:
    secret = current_app.config["JWT_SECRET_KEY"]
    return hashlib.sha256(f"{secret}:{token}".encode("utf-8")).hexdigest()


def optional_user():
    try:
        verify_jwt_in_request(optional=True)
    except Exception:
        g.current_user = None
        return None
    
    identity = get_jwt_identity()
    if identity is None:
        g.current_user = None
        return None
    
    claims = get_jwt()
    if is_jti_blacklisted(claims.get("jti")):
        g.current_user = None
        return None
    user = _active_user(identity)
    if not user:
        g.current_user = None
        return None
    g.current_user = {
        "id": identity,
        "role": user.role,
        "email": user.email,
        "phone": user.phone
    }
    return g.current_user


def active_user(identity: str):
    try:
        user_id = uuid.UUID(str(identity))
    except (TypeError, ValueError):
        return None
    with db.get_db() as session:
        user = session.execute(select(User).filter_by(id=user_id)).scalar_one_or_none()
        if not user or user.deleted_at:
            return None
        return user


_active_user = active_user


def require_min_role(min_role: str, missing_status: int = 401):
    required_rank = ROLE_RANK.get(min_role, 0)

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                verify_jwt_in_request()
                identity = get_jwt_identity()
                claims = get_jwt()
                if is_jti_blacklisted(claims.get("jti")):
                    return jsonify({"success": False, "message": "Unauthorized"}), missing_status
            except Exception:
                return jsonify({"success": False, "message": "Unauthorized"}), missing_status
            
            user = _active_user(identity)
            if not user:
                return jsonify({"success": False, "message": "Unauthorized"}), missing_status
            user_role = user.role
            
            if ROLE_RANK.get(user_role, 0) < required_rank:
                return jsonify({"success": False, "message": "Forbidden: Insufficient permissions"}), 403
            
            g.current_user = {
                "id": identity,
                "role": user_role,
                "email": user.email,
                "phone": user.phone
            }
            return func(*args, **kwargs)

        wrapper._requires_auth = True
        return wrapper

    return decorator


require_role = require_min_role


def issue_tokens(session_db, user: User):
    identity = str(user.id)
    claims = {"role": user.role}
    
    access_token = create_access_token(identity=identity, additional_claims=claims)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)
    
    # Layer 5: Concurrent Session Limit (max 3)
    active_sessions = session_db.execute(
        select(UserSession).filter_by(user_id=user.id, revoked=False).order_by(UserSession.created_at.desc())
    ).scalars().all()
    
    if len(active_sessions) >= 3:
        # Revoke oldest session
        oldest = active_sessions[-1]
        oldest.revoked = True
    
    # Create new session record
    new_session = UserSession(
        user_id=user.id,
        refresh_token_hash=token_hash(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        ip_address=request_ip(),
        user_agent=request.headers.get("User-Agent"),
        device_fingerprint=get_fingerprint()
    )
    session_db.add(new_session)
    session_db.commit()
    
    return access_token, refresh_token


def authenticate_login(session_db, login: str, password: str, mfa_code: str | None = None):
    normalized = login.strip().lower()
    user = session_db.execute(
        select(User).filter((func.lower(User.email) == normalized) | (User.phone == normalized))
    ).scalar_one_or_none()
    
    if not user or user.deleted_at:
        verify_password(password, DUMMY_PASSWORD_HASH)
        raise AuthError("Invalid credentials", 401)
    
    # Check lockout
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise AuthError("Account temporarily locked due to multiple failed attempts", 429)
    
    # Verify password
    if not verify_password(password, user.password_hash):
        # Update attempts
        user.login_attempts += 1
        if user.login_attempts >= 5:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        
        # Log failure
        log_audit(session_db, "auth.login_failed", "user", user.id, {"attempts": user.login_attempts})
        session_db.commit()
        
        status = 429 if user.locked_until else 401
        raise AuthError("Invalid credentials", status)
    
    # Verify MFA if enabled
    if user.mfa_enabled:
        if not mfa_code:
            return {"mfa_required": True}
        if not verify_totp(user.mfa_secret, mfa_code):
            log_audit(session_db, "auth.mfa_failed", "user", user.id)
            session_db.commit()
            raise AuthError("Invalid MFA code", 401)
    
    # Success: Reset attempts
    user.login_attempts = 0
    user.locked_until = None
    
    log_audit(session_db, "auth.login", "user", user.id, {"role": user.role}, user_id=user.id)
    session_db.commit()
    
    return user


def rotate_refresh_token(session_db, refresh_token: str):
    hashed = token_hash(refresh_token)
    session_record = session_db.execute(
        select(UserSession).filter_by(refresh_token_hash=hashed, revoked=False)
    ).scalar_one_or_none()
    
    if not session_record or session_record.expires_at < datetime.now(timezone.utc):
        raise AuthError("Invalid or expired refresh token", 401)
    
    # Revoke old one
    session_record.revoked = True
    
    user = session_db.execute(select(User).filter_by(id=session_record.user_id)).scalar_one()
    access_token, new_refresh_token = issue_tokens(session_db, user)
    
    log_audit(session_db, "auth.refresh", "session", session_record.id, {"rotated": True}, user_id=user.id)
    session_db.commit()
    
    return access_token, new_refresh_token, user


def log_audit(session_db, action: str, entity_type: str, entity_id, payload: dict | None = None, user_id: uuid.UUID | None = None):
    """Standardized audit logging (Layer 7) with error handling."""
    try:
        actor_id = user_id or (g.current_user["id"] if hasattr(g, "current_user") and g.current_user else None)
        if isinstance(actor_id, str):
            actor_id = uuid.UUID(actor_id)
        
        log = AuditLog(
            user_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            payload=payload or {},
            ip_address=request_ip(),
            user_agent=request.headers.get("User-Agent")
        )
        session_db.add(log)
        # Note: Caller is responsible for session.commit()
    except Exception as e:
        # Log audit failure but don't crash the request
        # The audit table is non-critical for request processing
        import logging
        logging.getLogger(__name__).warning(
            f"Audit log failed: {action} {entity_type} {entity_id}",
            extra={"error": str(e)}
        )


def issue_csrf_response():
    token = generate_csrf_token()
    response = jsonify({
        "success": True,
        "message": "CSRF token issued",
        "data": {"csrfToken": token}
    })

    host = request.host.split(":")[0]
    secure_flag = current_app.config.get("COOKIE_SECURE", True)
    is_local_host = host in {"localhost", "127.0.0.1"}
    secure_cookie = secure_flag and not is_local_host

    response.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=2 * 60 * 60,
        secure=secure_cookie,
        httponly=False,  # Frontend needs to read this for the header
        samesite=cookie_samesite(),
        path="/"
    )
    return response


def set_refresh_cookie(response, refresh_token: str):
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=7 * 24 * 60 * 60,
        secure=current_app.config.get("COOKIE_SECURE", True),
        httponly=True,
        samesite=cookie_samesite(),
        path="/api/auth/refresh"
    )


def clear_refresh_cookie(response):
    response.set_cookie(
        REFRESH_COOKIE,
        "",
        max_age=0,
        secure=current_app.config.get("COOKIE_SECURE", True),
        httponly=True,
        samesite=cookie_samesite(),
        path="/api/auth/refresh"
    )


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.message = message
        self.status = status
