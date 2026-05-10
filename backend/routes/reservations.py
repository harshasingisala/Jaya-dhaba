from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request

import db
from audit import audit
from auth import require_role
from validators import ValidationError, body, idempotency_key, integer, iso_datetime, raw_text, reject_unknown, request_hash


bp = Blueprint("reservations", __name__, url_prefix="/api")

STATUS_ALIASES = {
    "New": "pending",
    "Pending": "pending",
    "Confirmed": "confirmed",
    "Completed": "confirmed",
    "Cancelled": "cancelled",
}

CELEBRATION_KEYWORDS = [
    "birthday", "anniversary", "wedding", "engagement", "promotion",
    "పుట్టిన రోజు", "జన్మదిన", "వివాహం",
    "जन्मदिन", "सालगिरह", "शादी",
]


def detect_celebration(notes: str) -> str | None:
    text = (notes or "").lower()
    if any(k in text for k in ["birthday", "పుట్టిన రోజు", "జన్మదిన", "जन्मदिन"]):
        return "birthday"
    if any(k in text for k in ["anniversary", "సాలగిరహ", "saalgirah", "सालगिरह"]):
        return "anniversary"
    if any(k in text for k in ["wedding", "వివాహం", "शादी"]):
        return "wedding"
    return None


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def serialize(row) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "table_id": row["table_id"],
        "party_size": row["party_size"],
        "reserved_at": row["reserved_at"],
        "duration_minutes": row["duration_minutes"],
        "status": row["status"],
        "guest_name": row["guest_name"],
        "guest_phone": row["guest_phone"],
        "created_at": row["created_at"],
        "celebration_type": row["celebration_type"] if "celebration_type" in row.keys() else None,
    }


def find_available_table(conn, party_size: int, reserved_at: str, duration: int, preferred_table_id: str | None):
    table_filter = "AND t.id = ?" if preferred_table_id else ""
    params = [party_size, reserved_at, str(duration), reserved_at]
    if preferred_table_id:
        params.append(preferred_table_id)
    table = conn.execute(
        f"""
        SELECT t.*
        FROM tables t
        WHERE t.active = true
          AND t.capacity >= ?
          {table_filter}
          AND NOT EXISTS (
              SELECT 1
              FROM reservations r
              WHERE r.table_id = t.id
                AND r.status = 'confirmed'
                AND datetime(r.reserved_at) < datetime(?, '+' || ? || ' minutes')
                AND datetime(?) < datetime(r.reserved_at, '+' || r.duration_minutes || ' minutes')
          )
        ORDER BY t.capacity ASC, t.id ASC
        LIMIT 1
        """,
        tuple(params),
    ).fetchone()
    if table:
        return table, None

    conflict_params = [party_size, reserved_at, str(duration), reserved_at]
    if preferred_table_id:
        conflict_params.append(preferred_table_id)
    conflict = conn.execute(
        f"""
        SELECT r.reserved_at
        FROM reservations r
        JOIN tables t ON t.id = r.table_id
        WHERE t.active = true
          AND t.capacity >= ?
          {table_filter}
          AND r.status = 'confirmed'
          AND datetime(r.reserved_at) < datetime(?, '+' || ? || ' minutes')
          AND datetime(?) < datetime(r.reserved_at, '+' || r.duration_minutes || ' minutes')
        ORDER BY r.reserved_at ASC
        LIMIT 1
        """,
        tuple(conflict_params),
    ).fetchone()
    return None, conflict["reserved_at"] if conflict else None


@bp.post("/reservations")
def create_reservation():
    data = body()
    reject_unknown(data, {"table_id", "party_size", "reserved_at", "duration_minutes", "guest_name", "guest_phone", "notes"})
    key = idempotency_key(request.headers.get("Idempotency-Key"))
    fingerprint = request_hash(data)
    party_size = integer(data.get("party_size"), "party_size", 1, 50)
    reserved_at = iso_datetime(data.get("reserved_at"), "reserved_at")
    duration = integer(data.get("duration_minutes", 90), "duration_minutes", 15, 480)
    preferred_table_id = raw_text(data.get("table_id"), "table_id", 80, required=False, allow_empty=True) or None
    user = getattr(g, "current_user", None)
    celebration_type = detect_celebration(data.get("notes", ""))

    def operation():
        with db.transaction(current_app.config["DATABASE_URL"]) as conn:
            existing = conn.execute("SELECT * FROM reservations WHERE idempotency_key = ?", (key,)).fetchone()
            if existing:
                if existing["request_hash"] != fingerprint:
                    raise ValidationError("Idempotency-Key was reused with a different payload", "Idempotency-Key", 409)
                return serialize(existing), 200
            table, conflict_at = find_available_table(conn, party_size, reserved_at, duration, preferred_table_id)
            if not table:
                message = "No table is available for that time"
                if conflict_at:
                    message = f"No table is available for that time. Conflicting slot: {conflict_at}"
                raise ValidationError(message, "reserved_at", 409)
            cursor = conn.execute(
                """
                INSERT INTO reservations
                (user_id, table_id, party_size, reserved_at, duration_minutes, status,
                 idempotency_key, request_hash, guest_name, guest_phone, celebration_type, created_at)
                VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"] if user else None,
                    table["id"],
                    party_size,
                    reserved_at,
                    duration,
                    key,
                    fingerprint,
                    raw_text(data.get("guest_name", ""), "guest_name", 120, required=False, allow_empty=True),
                    raw_text(data.get("guest_phone", ""), "guest_phone", 40, required=False, allow_empty=True),
                    celebration_type,
                    db.utc_now(),
                ),
            )
            row = conn.execute("SELECT * FROM reservations WHERE id = ?", (cursor.lastrowid,)).fetchone()
            audit(conn, "reservation.create", "reservation", cursor.lastrowid)
            return serialize(row), 201

    payload, status = db.run_write(operation)
    return jsonify(payload), status


@bp.get("/admin/reservations")
@require_role("staff")
def list_reservations():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute("SELECT * FROM reservations ORDER BY reserved_at ASC LIMIT 250").fetchall()
    return jsonify({"reservations": [serialize(row) for row in rows]})


@bp.patch("/admin/reservations/<int:reservation_id>")
@require_role("staff")
def update_reservation(reservation_id: int):
    data = body()
    reject_unknown(data, {"status", "notes"})
    status = None
    if "status" in data:
        status = STATUS_ALIASES.get(raw_text(data.get("status"), "status", 20), raw_text(data.get("status"), "status", 20))
        if status not in db.RESERVATION_STATUSES:
            raise ValidationError("Invalid status", "status")
    celebration_type = detect_celebration(data.get("notes", "")) if "notes" in data else None
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)).fetchone()
        if not row:
            raise ValidationError("Reservation not found", "reservation_id", 404)
        next_status = status or row["status"]
        next_celebration = celebration_type if "notes" in data else row["celebration_type"]
        conn.execute("UPDATE reservations SET status = ?, celebration_type = ? WHERE id = ?", (next_status, next_celebration, reservation_id))
        updated = conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)).fetchone()
        audit(conn, "reservation.status", "reservation", reservation_id, {"from": row["status"], "to": next_status})
    return jsonify(serialize(updated))
