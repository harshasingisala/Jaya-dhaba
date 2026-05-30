from __future__ import annotations

import io
import re
import secrets
import uuid
import zipfile
from datetime import datetime, time, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request, send_file

import db
from audit import audit
from auth import require_role
from qr_sessions import create_table_session, generate_qr_token, verify_qr_token
from rate_limits import enforce_limit
from realtime import broadcast
from validators import ValidationError, body, boolean, integer, raw_text, reject_unknown


bp = Blueprint("tables", __name__, url_prefix="/api")
IST = timezone(timedelta(hours=5, minutes=30))


def _table_number_from_label(label: str) -> int | None:
    match = re.search(r"(\d+)", str(label or ""))
    return int(match.group(1)) if match else None


def _table_url(table) -> str:
    base_url = current_app.config.get("QR_BASE_URL") or "https://jayadhaba.online"
    base_url = str(base_url).rstrip("/")
    token = generate_qr_token(str(table["id"]), table_version=str(table["qr_token"]))
    return f"{base_url}/menu?t={token}"


def _table_id_variants(table_id: str) -> tuple[str, str]:
    try:
        parsed = uuid.UUID(str(table_id))
    except ValueError:
        raise ValidationError("Invalid table ID") from None
    return str(parsed), parsed.hex


def _new_db_uuid() -> str:
    value = uuid.uuid4()
    return str(value) if db.engine.dialect.name == "postgresql" else value.hex


def _table_dict(row) -> dict:
    payload = dict(row)
    payload["id"] = str(payload["id"])
    payload["active"] = bool(payload.get("active"))
    payload["table_number"] = _table_number_from_label(payload.get("label")) or payload.get("label")
    payload["qr_url"] = _table_url(payload)
    payload["active_order"] = None
    if payload.get("active_order_id"):
        payload["active_order"] = {
            "id": str(payload["active_order_id"]),
            "order_number": payload.get("active_order_number"),
            "status": payload.get("active_order_status"),
            "total": int(payload.get("active_order_total") or 0),
            "guest_name": payload.get("active_order_guest_name") or "Guest",
            "item_count": int(payload.get("active_order_item_count") or 0),
            "created_at": payload.get("active_order_created_at"),
        }
    payload["is_free"] = payload["active_order"] is None
    for key in (
        "active_order_id",
        "active_order_number",
        "active_order_status",
        "active_order_total",
        "active_order_guest_name",
        "active_order_item_count",
        "active_order_created_at",
    ):
        payload.pop(key, None)
    return payload


def _table_select_sql(where_clause: str = "") -> str:
    return f"""
        SELECT
            t.*,
            (
                SELECT o.id
                FROM orders o
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                ORDER BY o.created_at DESC
                LIMIT 1
            ) AS active_order_id,
            (
                SELECT o.status
                FROM orders o
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                ORDER BY o.created_at DESC
                LIMIT 1
            ) AS active_order_status,
            (
                SELECT o.order_number
                FROM orders o
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                ORDER BY o.created_at DESC
                LIMIT 1
            ) AS active_order_number,
            (
                SELECT o.total
                FROM orders o
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                ORDER BY o.created_at DESC
                LIMIT 1
            ) AS active_order_total,
            (
                SELECT o.guest_name
                FROM orders o
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                ORDER BY o.created_at DESC
                LIMIT 1
            ) AS active_order_guest_name,
            (
                SELECT COALESCE(SUM(oi.qty), 0)
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                  AND o.id = (
                    SELECT latest.id
                    FROM orders latest
                    WHERE latest.table_id = t.id
                      AND COALESCE(latest.is_archived, false) = false
                      AND latest.status NOT IN ('served', 'cancelled')
                    ORDER BY latest.created_at DESC
                    LIMIT 1
                  )
            ) AS active_order_item_count,
            (
                SELECT o.created_at
                FROM orders o
                WHERE o.table_id = t.id
                  AND COALESCE(o.is_archived, false) = false
                  AND o.status NOT IN ('served', 'cancelled')
                ORDER BY o.created_at DESC
                LIMIT 1
            ) AS active_order_created_at
        FROM tables t
        {where_clause}
    """


def _sort_tables(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda row: (_table_number_from_label(row.get("label")) or 9999, str(row.get("label") or "")))


def _resolve_table(conn, table_number: str):
    number = integer(table_number, "table", 1, 500)
    row = conn.execute(
        _table_select_sql("WHERE t.active = true AND (t.label = ? OR t.label = ?)"),
        (f"Table {number}", str(number)),
    ).fetchone()
    return row


def _make_qr_png(url: str) -> bytes:
    import qrcode

    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=3)
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@bp.get("/tables/resolve")
def resolve_table():
    table_number = request.args.get("table", "").strip()
    if not table_number:
        return jsonify({"success": False, "message": "table is required"}), 400
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = _resolve_table(conn, table_number)
    if not row:
        return jsonify({"success": False, "message": "Table not found"}), 404
    table = _table_dict(row)
    return jsonify({"success": True, "table": table, "data": table})


@bp.post("/qr/verify")
def verify_qr():
    data = request.get_json(silent=True) or {}
    token = raw_text(data.get("token") or data.get("t"), "token", 2048)
    payload = verify_qr_token(token)
    if not payload:
        return jsonify({"success": False, "message": "Invalid or expired QR code"}), 403

    table_id = str(payload["table"])
    rate_limited = enforce_limit(f"qr_scan:{table_id}", 20, 60)
    if rate_limited is not None:
        return rate_limited

    id_variants = _table_id_variants(table_id)
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute(
            _table_select_sql("WHERE t.id IN (?, ?) AND t.active = true"),
            id_variants,
        ).fetchone()
        if not row:
            return jsonify({"success": False, "message": "Table not found"}), 404
        table = _table_dict(row)
        if not secrets.compare_digest(str(table.get("qr_token") or ""), str(payload.get("v") or "")):
            audit(conn, "qr.scan_rejected", "table", table["id"], {"reason": "version_mismatch"})
            return jsonify({"success": False, "message": "This QR code has been replaced. Please ask staff for a fresh QR."}), 403
        session_id = create_table_session(table["id"], restaurant_id=str(payload["restaurant"]))
        audit(conn, "qr.scan", "table", table["id"], {"restaurant_id": payload["restaurant"]})

    return jsonify({
        "success": True,
        "session_id": session_id,
        "table_session": session_id,
        "table": table,
        "data": {"session_id": session_id, "table_session": session_id, "table": table},
    })


@bp.get("/admin/tables")
@require_role("staff")
def list_tables():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute(_table_select_sql()).fetchall()
    tables = _sort_tables([_table_dict(row) for row in rows])
    return jsonify({"success": True, "tables": tables, "data": tables})


@bp.post("/admin/tables/bulk")
@require_role("admin")
def bulk_create_tables():
    data = body()
    reject_unknown(data, {"count", "capacity"})
    count = integer(data.get("count"), "count", 1, 50)
    capacity = integer(data.get("capacity", 4), "capacity", 1, 50)
    created = []

    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        for number in range(1, count + 1):
            label = f"Table {number}"
            existing = conn.execute("SELECT * FROM tables WHERE label = ?", (label,)).fetchone()
            if not existing:
                table_id = _new_db_uuid()
                conn.execute(
                    "INSERT INTO tables (id, qr_token, label, capacity, active) VALUES (?, ?, ?, ?, true)",
                    (table_id, str(uuid.uuid4()), label, capacity),
                )
                created.append(table_id)
                audit(conn, "table.bulk_create", "table", table_id, {"label": label})

        rows = conn.execute(_table_select_sql()).fetchall()

    tables = [
        table for table in _sort_tables([_table_dict(row) for row in rows])
        if isinstance(table.get("table_number"), int) and table["table_number"] <= count
    ]
    return jsonify({"success": True, "created": len(created), "tables": tables, "data": tables}), 201


@bp.route("/admin/tables/<table_id>/qr-code", methods=["GET", "POST"])
@require_role("admin")
def table_qr_code(table_id: str):
    id_variants = _table_id_variants(table_id)
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        table = conn.execute("SELECT * FROM tables WHERE id IN (?, ?)", id_variants).fetchone()
    if not table:
        return jsonify({"success": False, "message": "Table not found"}), 404
    png = _make_qr_png(_table_url(table))
    return send_file(
        io.BytesIO(png),
        mimetype="image/png",
        as_attachment=False,
        download_name=f"jaya-dhaba-{str(table['label']).lower().replace(' ', '-')}-qr.png",
    )


@bp.post("/admin/tables/qr-codes")
@require_role("admin")
def bulk_qr_codes():
    memory = io.BytesIO()
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute("SELECT * FROM tables ORDER BY label").fetchall()
    tables = _sort_tables([dict(row) for row in rows])
    with zipfile.ZipFile(memory, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for table in tables:
            filename = f"jaya-dhaba-{str(table['label']).lower().replace(' ', '-')}-qr.png"
            archive.writestr(filename, _make_qr_png(_table_url(table)))
    memory.seek(0)
    return send_file(memory, mimetype="application/zip", as_attachment=True, download_name="jaya-dhaba-table-qrs.zip")


@bp.patch("/admin/tables/<table_id>/clear")
@require_role("admin")
def clear_table(table_id: str):
    id_variants = _table_id_variants(table_id)
    now = datetime.now(timezone.utc)
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        table = conn.execute("SELECT * FROM tables WHERE id IN (?, ?)", id_variants).fetchone()
        if not table:
            return jsonify({"success": False, "message": "Table not found"}), 404
        rows = conn.execute(
            """
            SELECT id FROM orders
            WHERE table_id = ?
              AND COALESCE(is_archived, false) = false
              AND status NOT IN ('cancelled')
            ORDER BY created_at DESC
            """,
            (table["id"],),
        ).fetchall()
        for row in rows:
            conn.execute(
                """
                UPDATE orders
                SET status = 'served', served_at = COALESCE(served_at, ?), is_archived = true, archived_at = ?
                WHERE id = ?
                """,
                (now, now, row["id"]),
            )
            audit(conn, "table.clear", "order", row["id"], {"table_id": str(table["id"])})

    order_ids = [str(row["id"]) for row in rows]
    if order_ids:
        broadcast("orders_update", {"action": "cleared", "order_ids": order_ids, "count": len(order_ids)})
        broadcast("order_updated", {"order_ids": order_ids, "status": "served", "archived": True})
        broadcast("analytics_update", {"action": "orders_changed"})
    broadcast("tables_update", {"action": "table_cleared", "table_id": str(table["id"])})
    return jsonify({"success": True, "cleared": len(order_ids), "order_ids": order_ids})


@bp.patch("/admin/tables/<table_id>")
@require_role("admin")
def update_table(table_id: str):
    id_variants = _table_id_variants(table_id)
    data = body()
    reject_unknown(data, {"label", "capacity", "active"})
    if not data:
        raise ValidationError("At least one field is required")
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        existing = conn.execute("SELECT * FROM tables WHERE id IN (?, ?)", id_variants).fetchone()
        if not existing:
            return jsonify({"success": False, "message": "Table not found"}), 404
        label = raw_text(data.get("label"), "label", 80) if "label" in data else existing["label"]
        capacity = integer(data.get("capacity"), "capacity", 1, 50) if "capacity" in data else existing["capacity"]
        active = boolean(data.get("active"), "active") if "active" in data else bool(existing["active"])
        conn.execute(
            "UPDATE tables SET label = ?, capacity = ?, active = ? WHERE id = ?",
            (label, capacity, active, existing["id"]),
        )
        audit(conn, "table.update", "table", existing["id"], {"fields": sorted(data.keys())})
        row = conn.execute(_table_select_sql("WHERE t.id = ?"), (existing["id"],)).fetchone()
    table = _table_dict(row)
    broadcast("tables_update", {"action": "table_updated", "table": table})
    return jsonify({"success": True, "table": table, "data": table})
