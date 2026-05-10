from __future__ import annotations

import os
import secrets
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, g, jsonify, send_from_directory, request

import db
from audit import audit
from auth import require_role
from cache import stats_cache
from validators import ValidationError, body, boolean, email, idempotency_key, integer, phone, raw_text, reject_unknown, request_hash


bp = Blueprint("admin", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# Dialect-safe SQL expression helpers
# SQLite uses strftime(); Postgres uses to_char() with timezone
# ---------------------------------------------------------------------------
def _week_expr() -> str:
    if db.engine.dialect.name == "sqlite":
        return "strftime('%Y-W%W', created_at)"
    return "to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'IYYY-IW')"


def _month_expr() -> str:
    if db.engine.dialect.name == "sqlite":
        return "strftime('%Y-%m', created_at)"
    return "to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')"


def latest_closure(conn) -> str:
    row = conn.execute("SELECT COALESCE(MAX(closed_at), '0000-01-01T00:00:00Z') AS closed_at FROM daily_closures").fetchone()
    return row["closed_at"]


def live_stats(conn) -> dict:
    closed_at = latest_closure(conn)
    row = conn.execute(
        """
        SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
        FROM orders
        WHERE status NOT IN ('cancelled') AND created_at > ?
        """,
        (closed_at,),
    ).fetchone()

    # Top-selling item since last flush
    top_row = conn.execute(
        """
        SELECT mi.name, SUM(oi.qty) AS total_qty
        FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('cancelled') AND o.created_at > ?
        GROUP BY oi.menu_item_id
        ORDER BY total_qty DESC
        LIMIT 1
        """,
        (closed_at,),
    ).fetchone()

    return {
        "revenue": int(row["revenue"] or 0),
        "total_orders": int(row["orders"] or 0),
        "orders": int(row["orders"] or 0),
        "top_item": top_row["name"] if top_row else None,
        "top_item_qty": int(top_row["total_qty"]) if top_row else 0,
    }


@bp.get("/admin/dashboard")
@require_role("staff")
def dashboard():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        stats = live_stats(conn)
        counts = {
            "pending_orders": conn.execute("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending','confirmed','preparing')").fetchone()["c"],
            "ready_orders": conn.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'ready'").fetchone()["c"],
            "today_revenue": stats["revenue"],
            "top_item": stats["top_item"],
            "top_item_qty": stats["top_item_qty"],
            "reservations": conn.execute("SELECT COUNT(*) AS c FROM reservations WHERE status = 'confirmed'").fetchone()["c"],
        }
    return jsonify(counts)


@bp.get("/admin/stats")
@require_role("staff")
def stats():
    cached = stats_cache.get("stats:dashboard")
    if cached is not None:
        return jsonify(cached)
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        payload = live_stats(conn)
    stats_cache.set("stats:dashboard", payload)
    return jsonify(payload)


@bp.post("/admin/flush")
@require_role("admin")
def flush_stats():
    user = getattr(g, "current_user", None)
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        payload = live_stats(conn)
        now = db.utc_now()
        cursor = conn.execute(
            "INSERT INTO daily_closures (closed_at, revenue, orders, created_by) VALUES (?, ?, ?, ?)",
            (now, payload["revenue"], payload["orders"], user["id"] if user else None),
        )
        audit(conn, "analytics.flush", "daily_closure", cursor.lastrowid, payload)
    stats_cache.invalidate("stats:")
    return jsonify({"status": "success", **payload})


@bp.get("/admin/settings")
@require_role("staff")
def get_settings():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    if not row:
        return jsonify({"message": "Settings not found"}), 404
    return jsonify(
        {
            "name": row["name"],
            "tagline": row["tagline"],
            "hours": row["hours"],
            "contact": row["contact"],
            "status": row["status"],
            "address": row["address"],
            "taxRate": row["tax_rate"],
            "currency": row["currency"],
        }
    )


@bp.put("/admin/settings")
@require_role("admin")
def update_settings():
    data = body()
    reject_unknown(data, {"name", "tagline", "hours", "contact", "status", "address", "taxRate", "currency"})
    payload = {
        "name": raw_text(data.get("name"), "name", 120),
        "tagline": raw_text(data.get("tagline", ""), "tagline", 160, required=False, allow_empty=True),
        "hours": raw_text(data.get("hours"), "hours", 120),
        "contact": phone(data.get("contact"), "contact"),
        "status": raw_text(data.get("status"), "status", 40),
        "address": raw_text(data.get("address"), "address", 240),
        "tax_rate": integer(data.get("taxRate"), "taxRate", 0, 100),
        "currency": raw_text(data.get("currency"), "currency", 10).upper(),
    }
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        conn.execute(
            """
            UPDATE settings
            SET name = ?, tagline = ?, hours = ?, contact = ?, status = ?, address = ?,
                tax_rate = ?, currency = ?, updated_at = ?
            WHERE id = 1
            """,
            (
                payload["name"],
                payload["tagline"],
                payload["hours"],
                payload["contact"],
                payload["status"],
                payload["address"],
                payload["tax_rate"],
                payload["currency"],
                db.utc_now(),
            ),
        )
        audit(conn, "settings.update", "settings", 1, {"fields": sorted(data.keys())})
    return jsonify({"status": "success"})


@bp.post("/contact")
def contact_message():
    data = body()
    reject_unknown(data, {"name", "email", "message"})
    key = idempotency_key(request.headers.get("Idempotency-Key"))
    fingerprint = request_hash(data)
    payload = {
        "name": raw_text(data.get("name"), "name", 120),
        "email": email(data.get("email"), "email"),
        "message": raw_text(data.get("message"), "message", 2000),
    }

    def operation():
        with db.transaction(current_app.config["DATABASE_URL"]) as conn:
            existing = conn.execute("SELECT * FROM contact_messages WHERE idempotency_key = ?", (key,)).fetchone()
            if existing:
                if existing["request_hash"] != fingerprint:
                    raise ValidationError("Idempotency-Key was reused with a different payload", "Idempotency-Key", 409)
                return {"id": existing["id"], "status": existing["status"]}, 200
            cursor = conn.execute(
                """
                INSERT INTO contact_messages (name, email, message, status, idempotency_key, request_hash, created_at)
                VALUES (?, ?, ?, 'new', ?, ?, ?)
                """,
                (payload["name"], payload["email"], payload["message"], key, fingerprint, db.utc_now()),
            )
            audit(conn, "contact.create", "contact_message", cursor.lastrowid, {"email": payload["email"]})
            return {"id": cursor.lastrowid, "status": "new"}, 201

    result, status = db.run_write(operation)
    return jsonify(result), status


@bp.get("/admin/contact-messages")
@require_role("staff")
def list_contact_messages():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute("SELECT * FROM contact_messages ORDER BY created_at DESC").fetchall()
    return jsonify({"messages": [dict(row) for row in rows]})


@bp.get("/admin/revenue")
@require_role("staff")
def revenue():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        daily = conn.execute(
            """
            SELECT date(created_at) AS label, COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE status NOT IN ('cancelled')
            GROUP BY date(created_at)
            ORDER BY label DESC
            LIMIT 30
            """
        ).fetchall()
        weekly = conn.execute(
            """
            SELECT strftime('%Y-W%W', created_at) AS label, COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE status NOT IN ('cancelled')
            GROUP BY strftime('%Y-W%W', created_at)
            ORDER BY label DESC
            LIMIT 12
            """
        ).fetchall()
        monthly = conn.execute(
            """
            SELECT strftime('%Y-%m', created_at) AS label, COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE status NOT IN ('cancelled')
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY label DESC
            LIMIT 12
            """
        ).fetchall()
    return jsonify({"daily": [dict(row) for row in daily], "weekly": [dict(row) for row in weekly], "monthly": [dict(row) for row in monthly]})


@bp.get("/admin/audit-log")
@require_role("admin")
def audit_log():
    limit = min(integer(request.args.get("limit", 50), "limit", 1, 200), 200)
    offset = integer(request.args.get("offset", 0), "offset", 0, 100000)
    entity_type = request.args.get("entity_type")
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        if entity_type:
            rows = conn.execute(
                "SELECT * FROM audit_log WHERE entity_type = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                (raw_text(entity_type, "entity_type", 80), limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
    return jsonify({"audit_log": [dict(row) for row in rows]})


@bp.get("/admin/analytics/export")
@require_role("admin")
def analytics_export():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        closures = conn.execute("SELECT * FROM daily_closures ORDER BY closed_at DESC LIMIT 365").fetchall()
        current = live_stats(conn)
    return jsonify({"current": current, "closures": [dict(row) for row in closures]})


@bp.get("/admin/tables")
@require_role("staff")
def list_tables():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute("SELECT * FROM tables ORDER BY id").fetchall()
    return jsonify({"tables": [dict(row) for row in rows]})


@bp.post("/admin/tables")
@require_role("admin")
def create_table():
    data = body()
    reject_unknown(data, {"label", "capacity"})
    token = secrets.token_urlsafe(18)
    table_id = str(uuid4())
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        conn.execute(
            "INSERT INTO tables (id, qr_token, label, capacity, active) VALUES (?, ?, ?, ?, 1)",
            (table_id, token, raw_text(data.get("label"), "label", 80), integer(data.get("capacity"), "capacity", 1, 50)),
        )
        audit(conn, "table.create", "table", table_id)
        row = conn.execute("SELECT * FROM tables WHERE id = ?", (table_id,)).fetchone()
    return jsonify({"table": dict(row)}), 201


@bp.patch("/admin/tables/<int:table_id>")
@require_role("admin")
def update_table(table_id: int):
    data = body()
    reject_unknown(data, {"label", "capacity", "active"})
    if not data:
        raise ValidationError("At least one field is required")
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        existing = conn.execute("SELECT * FROM tables WHERE id = ?", (table_id,)).fetchone()
        if not existing:
            raise ValidationError("Table not found", "table_id", 404)
        conn.execute(
            "UPDATE tables SET label = ?, capacity = ?, active = ? WHERE id = ?",
            (
                raw_text(data.get("label"), "label", 80) if "label" in data else existing["label"],
                integer(data.get("capacity"), "capacity", 1, 50) if "capacity" in data else existing["capacity"],
                1 if boolean(data.get("active"), "active") else 0 if "active" in data else existing["active"],
                table_id,
            ),
        )
        audit(conn, "table.update", "table", table_id, {"fields": sorted(data.keys())})
        row = conn.execute("SELECT * FROM tables WHERE id = ?", (table_id,)).fetchone()
    return jsonify({"table": dict(row)})


@bp.post("/admin/tables/<int:table_id>/qr-code")
@require_role("admin")
def generate_qr(table_id: int):
    import qrcode

    domain = current_app.config["DOMAIN"]
    upload_root = Path(current_app.config["UPLOAD_FOLDER"]) / "qr"
    upload_root.mkdir(parents=True, exist_ok=True)
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        table = conn.execute("SELECT * FROM tables WHERE id = ?", (table_id,)).fetchone()
        if not table:
            raise ValidationError("Table not found", "table_id", 404)
        url = f"https://{domain}/table/{table['qr_token']}"
        image = qrcode.make(url)
        filename = f"table_{table_id}.png"
        image.save(upload_root / filename)
        audit(conn, "table.qr_generate", "table", table_id, {"url": url})
    return jsonify({"image_url": f"/uploads/qr/{filename}", "qr_url": url})


@bp.get("/uploads/<path:filename>")
def uploads(filename: str):
    root = os.path.abspath(current_app.config["UPLOAD_FOLDER"])
    return send_from_directory(root, filename)
