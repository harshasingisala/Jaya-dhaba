from __future__ import annotations

import uuid

from flask import Blueprint, current_app, g, jsonify, request

import db
from auth import (
    AuthError,
    REFRESH_COOKIE,
    authenticate_login,
    clear_refresh_cookie,
    issue_csrf_response,
    issue_tokens,
    require_role,
    rotate_refresh_token,
    set_refresh_cookie,
    log_audit
)
from models import User
from validators import validate_schema, RegisterSchema, LoginSchema
from sqlalchemy import or_, select

bp = Blueprint("auth", __name__, url_prefix="/api")


def serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "loyalty_points": user.loyalty_points,
        "mfa_enabled": user.mfa_enabled
    }


@bp.get("/csrf-token")
def csrf_token():
    return issue_csrf_response()


@bp.post("/auth/register")
def register():
    schema = validate_schema(RegisterSchema)
    
    with db.get_db() as session:
        # Check existing
        identity_checks = []
        if schema.email:
            identity_checks.append(User.email == schema.email)
        if schema.phone:
            identity_checks.append(User.phone == schema.phone)
        existing = session.execute(select(User).filter(or_(*identity_checks))).scalar_one_or_none()
        
        if existing:
            return jsonify({"success": False, "message": "User with this email or phone already exists"}), 409
        
        from utils.crypto import hash_password
        new_user = User(
            email=schema.email,
            phone=schema.phone,
            password_hash=hash_password(schema.password),
            role="customer"
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        
        access_token, refresh_token = issue_tokens(session, new_user)
        log_audit(session, "auth.register", "user", new_user.id)
        session.commit()
        
        user_data = serialize_user(new_user)

    response = jsonify({
        "success": True,
        "message": "Registration successful",
        "data": {"user": user_data, "access_token": access_token},
        "user": user_data,
        "access_token": access_token,
    })
    set_refresh_cookie(response, refresh_token)
    return response, 201


@bp.post("/auth/login")
def login():
    incoming = request.get_json(silent=True) or {}
    if "login" not in incoming and "email" in incoming:
        incoming["login"] = incoming["email"]
    schema = validate_schema(LoginSchema, incoming)
    
    with db.get_db() as session:
        try:
            result = authenticate_login(session, schema.login, schema.password, schema.mfa_code)
            
            if isinstance(result, dict) and result.get("mfa_required"):
                return jsonify({
                    "success": True,
                    "message": "MFA code required",
                    "data": {"mfa_required": True}
                }), 200
            
            user = result
            access_token, refresh_token = issue_tokens(session, user)
            user_data = serialize_user(user)
            
        except AuthError as error:
            return jsonify({"success": False, "message": error.message}), error.status

    response = jsonify({
        "success": True,
        "message": "Login successful",
        "data": {"user": user_data, "access_token": access_token},
        "user": user_data,
        "access_token": access_token,
    })
    set_refresh_cookie(response, refresh_token)
    return response


@bp.post("/auth/refresh")
def refresh():
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        return jsonify({"success": False, "message": "Refresh token is missing"}), 401
        
    with db.get_db() as session:
        try:
            access_token, rotated_refresh, user = rotate_refresh_token(session, refresh_token)
            user_data = serialize_user(user)
        except AuthError as error:
            return jsonify({"success": False, "message": error.message}), error.status

    response = jsonify({
        "success": True,
        "message": "Token refreshed",
        "data": {"user": user_data, "access_token": access_token}
    })
    set_refresh_cookie(response, rotated_refresh)
    return response


@bp.post("/auth/logout")
@require_role("customer")
def logout():
    user_id = uuid.UUID(g.current_user["id"])
    with db.get_db() as session:
        from models import Session as UserSession
        from sqlalchemy import update
        session.execute(
            update(UserSession).filter_by(user_id=user_id).values(revoked=True)
        )
        log_audit(session, "auth.logout", "session", user_id, {"revoked_all": True})
        session.commit()
        
    response = jsonify({"success": True, "message": "Logged out successfully"})
    clear_refresh_cookie(response)
    return response


@bp.get("/auth/me")
@require_role("customer")
def me():
    user_id = g.current_user["id"]
    with db.get_db() as session:
        user = session.execute(select(User).filter_by(id=user_id)).scalar_one_or_none()
        if not user or user.deleted_at:
            return jsonify({"success": False, "message": "User not found"}), 404
        user_data = serialize_user(user)
        
    return jsonify({
        "success": True,
        "message": "User profile fetched",
        "data": {"user": user_data}
    })
