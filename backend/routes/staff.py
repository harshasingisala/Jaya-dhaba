from __future__ import annotations

import uuid
from datetime import datetime, timezone
from flask import Blueprint, g, jsonify
from sqlalchemy import select

import db
from models import User, AuditLog
from auth import require_role, log_audit
from validators import validate_schema
from schemas import StaffCreate, ShiftRecord

bp = Blueprint("staff", __name__, url_prefix="/api/admin")


@bp.get("/staff")
@require_role("manager")
def list_staff():
    with db.get_db() as session:
        staff_list = session.execute(
            select(User).filter(User.role.in_(["staff", "manager"]))
        ).scalars().all()
        
        return jsonify({
            "success": True,
            "data": [
                {
                    "id": str(s.id),
                    "email": s.email,
                    "phone": s.phone,
                    "role": s.role,
                    "created_at": s.created_at.isoformat()
                } for s in staff_list
            ]
        })


@bp.post("/staff")
@require_role("owner")
def create_staff():
    schema = validate_schema(StaffCreate)
    
    with db.get_db() as session:
        from utils.crypto import hash_password
        new_staff = User(
            email=schema.email,
            phone=schema.phone,
            password_hash=hash_password(schema.password),
            role=schema.role
        )
        session.add(new_staff)
        log_audit(session, "staff.create", "user", new_staff.email, {"role": schema.role})
        session.commit()
        
        return jsonify({"success": True, "message": "Staff member created successfully"}), 201


@bp.post("/staff/shift")
@require_role("staff")
def record_shift():
    schema = validate_schema(ShiftRecord)
    staff_id = uuid.UUID(g.current_user["id"])
    
    with db.get_db() as session:
        log_audit(session, f"shift.{schema.action}", "user", staff_id)
        session.commit()
        
        return jsonify({
            "success": True, 
            "message": f"Shift {schema.action.replace('_', ' ')} recorded"
        })
