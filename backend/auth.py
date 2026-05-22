from __future__ import annotations

import hashlib
import os
import time
import uuid
from functools import wraps
from datetime import datetime, timedelta, timezone

from flask import current_app, g, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    verify_jwt_in_request,
)
from sqlalchemy import select, update, delete, func

import db
from models import User, Session as UserSession, AuditLog
from utils.crypto import verify_password, hash_password, verify_totp

from security_middleware import CSRF_COOKIE, CSRF_HEADER, generate_csrf_token

# Cookie names
REFRESH_COOKIE = "refresh_token"


def cookie_samesite() -> str:
    app_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    return "Strict" if app_env == "production" else "Lax"

# Role hierarchy
ROLE_RANK = {
    "guest": 0,
    "customer": 1,
    "staff": 2,
    "manager": 3,
    "owner": 4,
    "admin": 4
}


def request_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.remote_addr or "0.0.0.0"


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
    g.current_user = {
        "id": identity,
        "role": claims.get("role", "customer"),
        "email": claims.get("email"),
        "phone": claims.get("phone")
    }
    return g.current_user


def require_min_role(min_role: str, missing_status: int = 401, allow_query_token: bool = False):
    required_rank = ROLE_RANK.get(min_role, 0)

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                if allow_query_token and request.args.get("access_token"):
                    decoded = decode_token(request.args["access_token"])
                    identity = decoded["sub"]
                    claims = decoded
                else:
                    verify_jwt_in_request()
                    identity = get_jwt_identity()
                    claims = get_jwt()
            except Exception:
                return jsonify({"success": False, "message": "Unauthorized"}), missing_status
            
            user_role = claims.get("role", "customer")
            
            if ROLE_RANK.get(user_role, 0) < required_rank:
                return jsonify({"success": False, "message": "Forbidden: Insufficient permissions"}), 403
            
            g.current_user = {
                "id": identity,
                "role": user_role,
                "email": claims.get("email"),
                "phone": claims.get("phone")
            }
            return func(*args, **kwargs)

        wrapper._requires_auth = True
        return wrapper

    return decorator


require_role = require_min_role


def issue_tokens(session_db, user: User):
    identity = str(user.id)
    claims = {"role": user.role, "email": user.email, "phone": user.phone}
    
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

    secure_flag = current_app.config.get("COOKIE_SECURE", True)
    secure_cookie = secure_flag and request.is_secure
    host = request.host.split(":")[0]
    if host in {"localhost", "127.0.0.1"}:
        secure_cookie = False

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
