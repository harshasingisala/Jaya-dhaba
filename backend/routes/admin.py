from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from uuid import uuid4

from flask import Blueprint, abort, current_app, g, jsonify, send_from_directory, request
import db
from audit import audit
from auth import require_role
from cache import stats_cache, status_cache
from circuit_breaker import gemini_breaker, query_with_timeout
from realtime import broadcast
from utils.validation import looks_like_sql_injection
from validators import ValidationError, body, boolean, email, integer, phone, raw_text, reject_unknown


bp = Blueprint("admin", __name__, url_prefix="/api")
ALLOWED_UPLOAD_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".glb", ".usdz"}


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


def _date_filter_sql() -> tuple[str, list[str]]:
    if db.engine.dialect.name == "sqlite":
        date_expr = "date(datetime(created_at, '+5 hours', '+30 minutes'))"
    else:
        date_expr = "date(created_at AT TIME ZONE 'Asia/Kolkata')"
    filters = ["status NOT IN ('cancelled')"]
    params: list[str] = []
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    if from_date:
        filters.append(f"{date_expr} >= date(?)")
        params.append(raw_text(from_date, "from_date", 20))
    if to_date:
        filters.append(f"{date_expr} <= date(?)")
        params.append(raw_text(to_date, "to_date", 20))
    return " AND ".join(filters), params


IST = timezone(timedelta(hours=5, minutes=30))


def _ist_date_expr(column: str = "created_at") -> str:
    if db.engine.dialect.name == "sqlite":
        return f"date(datetime({column}, '+5 hours', '+30 minutes'))"
    return f"date({column} AT TIME ZONE 'Asia/Kolkata')"


def _ist_hour_expr(column: str = "created_at") -> str:
    if db.engine.dialect.name == "sqlite":
        return f"CAST(strftime('%H', datetime({column}, '+5 hours', '+30 minutes')) AS INTEGER)"
    return f"CAST(EXTRACT(HOUR FROM {column} AT TIME ZONE 'Asia/Kolkata') AS INTEGER)"


def _table_columns(conn, table_name: str) -> set[str]:
    if db.engine.dialect.name == "sqlite":
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {row["name"] for row in rows}
    rows = conn.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ?
        """,
        (table_name,),
    ).fetchall()
    return {row["column_name"] for row in rows}


def _table_exists(conn, table_name: str) -> bool:
    if db.engine.dialect.name == "sqlite":
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            (table_name,),
        ).fetchone()
        return bool(row)
    row = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = ?
        """,
        (table_name,),
    ).fetchone()
    return bool(row)


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

    # Top-selling items since last flush
    top_rows = conn.execute(
        """
        SELECT mi.name, SUM(oi.qty) AS total_qty
        FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('cancelled') AND o.created_at > ?
        GROUP BY oi.menu_item_id
        ORDER BY total_qty DESC
        LIMIT 5
        """,
        (closed_at,),
    ).fetchall()
    top_row = top_rows[0] if top_rows else None
    if db.engine.dialect.name == "sqlite":
        time_expr = "strftime('%H:00', datetime(created_at, '+5 hours', '+30 minutes'))"
    else:
        time_expr = "to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'HH24:00')"
    trajectory_rows = conn.execute(
        f"""
        SELECT {time_expr} AS time, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
        FROM orders
        WHERE status NOT IN ('cancelled') AND created_at > ?
        GROUP BY {time_expr}
        ORDER BY {time_expr}
        """,
        (closed_at,),
    ).fetchall()

    return {
        "revenue": int(row["revenue"] or 0),
        "total_orders": int(row["orders"] or 0),
        "orders": int(row["orders"] or 0),
        "top_item": top_row["name"] if top_row else None,
        "top_item_qty": int(top_row["total_qty"]) if top_row else 0,
        "top_items": [
            {"name": r["name"], "qty": int(r["total_qty"] or 0)}
            for r in top_rows
        ],
        "trajectory": [
            {"time": r["time"], "orders": int(r["orders"] or 0), "revenue": int(r["revenue"] or 0)}
            for r in trajectory_rows
        ],
    }


def _bucket_label(bucket: int) -> str:
    return {
        6: "6AM",
        9: "9AM",
        12: "12PM",
        15: "3PM",
        18: "6PM",
        21: "9PM",
        24: "12AM",
    }.get(bucket, "12AM")


def _bucket_time(bucket: int) -> str:
    return {
        6: "06:00 AM",
        9: "09:00 AM",
        12: "12:00 PM",
        15: "03:00 PM",
        18: "06:00 PM",
        21: "09:00 PM",
        24: "12:00 AM",
    }.get(bucket, "12:00 AM")


def _pad_rankings(rows: list[dict]) -> list[dict | None]:
    if not rows:
        return []
    return rows + [None] * max(0, 5 - len(rows))


def _generate_daily_report_ai_summary(payload: dict, peak_amount: float) -> str:
    summary = payload["summary"]
    top_items = payload["top_items"]["most_selling"]
    best_item = next((item["name"] for item in top_items if item), "N/A")
    payments = payload["payment_summary"]
    additional = payload["additional_summary"]
    fallback_item = best_item if best_item != "N/A" else "Biryani"
    fallback = (
        f"Today Jaya Dhaba served {summary['total_bills']} orders with total sales of "
        f"₹{summary['total_sales']:,.2f}. Peak business was at {payload['peak_sales']['peak_time']} "
        f"with ₹{peak_amount:,.2f} in sales. {fallback_item} was the top seller today."
    )
    if not current_app.config.get("GOOGLE_API_KEY"):
        return fallback
    prompt = f"""You are the business analyst for Jaya Dhaba, a Hyderabadi
restaurant in Secunderabad. Write a 3-sentence executive summary
for the owner based on today's real sales data:

Date: {payload['date']}
Total Sales: ₹{summary['total_sales']}
Total Orders: {summary['total_bills']}
Best Selling Item: {best_item}
Peak Hour: {payload['peak_sales']['peak_time']}
Payment Split: Cash ₹{payments['cash']}, UPI ₹{payments['upi']}, Card ₹{payments['card']}
Net Profit: ₹{additional['net_profit']}

Mention the peak time, best-selling item, and one specific
actionable insight for tomorrow. Be concise, warm, and
owner-friendly. Write in English."""
    try:
        import importlib
        import typing as t

        genai = t.cast(t.Any, importlib.import_module("google.generativeai"))
        genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
        model = genai.GenerativeModel("models/gemini-2.5-flash")
        response = gemini_breaker.call(model.generate_content, prompt)
        text = getattr(response, "text", "") or ""
        return text.strip() or fallback
    except Exception as exc:
        current_app.logger.warning("Daily report Gemini summary failed: %s", exc)
        return fallback


@bp.get("/admin/daily-report")
@require_role("staff")
def daily_report():
    try:
        return query_with_timeout(_daily_report_payload, 15)
    except TimeoutError:
        return jsonify({"error": "Report taking too long. Try again."}), 504


def _daily_report_payload():
    requested_date = request.args.get("date") or datetime.now(IST).date().isoformat()
    try:
        report_date = datetime.strptime(requested_date, "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError("date must be YYYY-MM-DD", "date")
    requested_date = report_date.isoformat()

    date_expr = _ist_date_expr("o.created_at")
    order_date_expr = _ist_date_expr("created_at")
    hour_expr = _ist_hour_expr("created_at")
    item_date_expr = _ist_date_expr("o.created_at")
    buckets = [6, 9, 12, 15, 18, 21, 24]
    bucket_case = (
        f"CASE WHEN {hour_expr} BETWEEN 6 AND 8 THEN 6 "
        f"WHEN {hour_expr} BETWEEN 9 AND 11 THEN 9 "
        f"WHEN {hour_expr} BETWEEN 12 AND 14 THEN 12 "
        f"WHEN {hour_expr} BETWEEN 15 AND 17 THEN 15 "
        f"WHEN {hour_expr} BETWEEN 18 AND 20 THEN 18 "
        f"WHEN {hour_expr} BETWEEN 21 AND 23 THEN 21 "
        "ELSE 24 END"
    )

    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        order_columns = _table_columns(conn, "orders")
        has_order_items = _table_exists(conn, "order_items")
        has_menu_items = _table_exists(conn, "menu_items")
        has_menu_categories = _table_exists(conn, "menu_categories")
        total_discount_expr = "COALESCE(SUM(loyalty_discount), 0)" if "loyalty_discount" in order_columns else "0"
        round_off_expr = "COALESCE(SUM(round_off), 0)" if "round_off" in order_columns else "0"
        customer_count_expr = (
            "COUNT(DISTINCT NULLIF(guest_phone, ''))"
            if "guest_phone" in order_columns
            else "COUNT(*)"
        )
        summary_row = conn.execute(
            f"""
            SELECT COALESCE(SUM(total), 0) AS total_sales,
                   COUNT(*) AS total_bills,
                   {customer_count_expr} AS total_customers,
                   {total_discount_expr} AS total_discount,
                   {round_off_expr} AS round_off
            FROM orders
            WHERE {order_date_expr} = ? AND status != 'cancelled'
            """,
            (requested_date,),
        ).fetchone()
        cancelled_row = conn.execute(
            f"""
            SELECT COUNT(*) AS cancelled_bills
            FROM orders
            WHERE {order_date_expr} = ? AND status = 'cancelled'
            """,
            (requested_date,),
        ).fetchone()
        if has_order_items and has_menu_items and has_menu_categories:
            category_rows = conn.execute(
                f"""
                SELECT COALESCE(mc.name, 'Other') AS category,
                       COALESCE(SUM(oi.qty * oi.unit_price), 0) AS revenue
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
                LEFT JOIN menu_categories mc ON mc.id = mi.category_id
                WHERE {item_date_expr} = ? AND o.status != 'cancelled'
                GROUP BY COALESCE(mc.name, 'Other')
                """,
                (requested_date,),
            ).fetchall()
        else:
            current_app.logger.warning("Daily report item categories unavailable because item tables are missing")
            category_rows = []
        hourly_rows = conn.execute(
            f"""
            SELECT {bucket_case} AS bucket, COALESCE(SUM(total), 0) AS amount, COUNT(*) AS orders
            FROM orders
            WHERE {order_date_expr} = ? AND status != 'cancelled'
            GROUP BY {bucket_case}
            """,
            (requested_date,),
        ).fetchall()
        if has_order_items:
            if has_menu_items:
                item_rows = conn.execute(
                    f"""
                    SELECT COALESCE(mi.name, 'Manual Item') AS name,
                           COALESCE(SUM(oi.qty), 0) AS qty_sold,
                           COALESCE(SUM(oi.qty * oi.unit_price), 0) AS revenue
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
                    WHERE {item_date_expr} = ? AND o.status != 'cancelled'
                    GROUP BY COALESCE(mi.name, 'Manual Item')
                    HAVING COALESCE(SUM(oi.qty), 0) > 0
                    ORDER BY qty_sold DESC, revenue DESC, name ASC
                    """,
                    (requested_date,),
                ).fetchall()
            else:
                item_rows = conn.execute(
                    f"""
                    SELECT 'Manual Item' AS name,
                           COALESCE(SUM(oi.qty), 0) AS qty_sold,
                           COALESCE(SUM(oi.qty * oi.unit_price), 0) AS revenue
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    WHERE {item_date_expr} = ? AND o.status != 'cancelled'
                    HAVING COALESCE(SUM(oi.qty), 0) > 0
                    """,
                    (requested_date,),
                ).fetchall()
        else:
            current_app.logger.warning("Daily report item rankings unavailable because order_items table is missing")
            item_rows = []
        payment_rows = conn.execute(
            f"""
            SELECT COALESCE(NULLIF(LOWER(payment_method), ''), 'other') AS method,
                   COALESCE(SUM(total), 0) AS amount
            FROM orders
            WHERE {order_date_expr} = ? AND status != 'cancelled'
            GROUP BY COALESCE(NULLIF(LOWER(payment_method), ''), 'other')
            """,
            (requested_date,),
        ).fetchall()
        refund_amount = 0.0
        if _table_exists(conn, "refunds"):
            refund_cols = _table_columns(conn, "refunds")
            amount_col = "amount" if "amount" in refund_cols else "refund_amount" if "refund_amount" in refund_cols else None
            created_col = "created_at" if "created_at" in refund_cols else None
            if amount_col and created_col:
                refund_date_expr = _ist_date_expr(created_col)
                refund_row = conn.execute(
                    f"SELECT COALESCE(SUM({amount_col}), 0) AS amount FROM refunds WHERE {refund_date_expr} = ?",
                    (requested_date,),
                ).fetchone()
                refund_amount = float(refund_row["amount"] or 0)

    total_sales = float(summary_row["total_sales"] or 0)
    total_bills = int(summary_row["total_bills"] or 0)
    distinct_customers = int(summary_row["total_customers"] or 0)
    total_customers = distinct_customers if distinct_customers else total_bills
    total_discount = float(summary_row["total_discount"] or 0)
    round_off = float(summary_row["round_off"] or 0)
    gross_profit = total_sales * 0.40
    tax_amount = total_sales * 0.05
    net_sales = total_sales - total_discount - tax_amount + round_off

    sales_by_category = {
        "food": {"amount": 0.0, "percentage": 0.0},
        "beverage": {"amount": 0.0, "percentage": 0.0},
        "other": {"amount": 0.0, "percentage": 0.0},
    }
    for row in category_rows:
        category = str(row["category"] or "Other")
        amount = float(row["revenue"] or 0)
        if category.lower() == "beverages":
            bucket = "beverage"
        elif category in {"Starters", "Biryani", "Curries", "Breads", "Rice", "Desserts"}:
            bucket = "food"
        else:
            bucket = "other"
        sales_by_category[bucket]["amount"] += amount
    for bucket in sales_by_category.values():
        bucket["percentage"] = (bucket["amount"] / total_sales * 100) if total_sales else 0.0
    sales_by_category["total"] = {"amount": total_sales, "percentage": 100.0 if total_sales else 0.0}

    hourly_map = {int(row["bucket"]): {"amount": float(row["amount"] or 0), "orders": int(row["orders"] or 0)} for row in hourly_rows}
    sales_trend = [
        {
            "bucket": bucket,
            "label": _bucket_label(bucket),
            "time": _bucket_time(bucket),
            "amount": hourly_map.get(bucket, {"amount": 0.0})["amount"],
            "orders": hourly_map.get(bucket, {"orders": 0})["orders"],
        }
        for bucket in buckets
    ]
    non_zero = [point for point in sales_trend if point["orders"] > 0]
    peak_point = max(sales_trend, key=lambda point: point["amount"]) if sales_trend else {"amount": 0.0, "time": "12:00 AM"}
    lowest_source = non_zero if non_zero else sales_trend
    lowest_point = min(lowest_source, key=lambda point: point["amount"]) if lowest_source else peak_point
    peak_amount = float(peak_point["amount"] or 0)
    lowest_amount = float(lowest_point["amount"] or 0)

    ranked_items = [
        {
            "rank": index + 1,
            "name": row["name"],
            "qty_sold": int(row["qty_sold"] or 0),
            "revenue": float(row["revenue"] or 0),
        }
        for index, row in enumerate(item_rows)
    ]
    least_items = sorted(ranked_items, key=lambda item: (item["qty_sold"], item["revenue"], item["name"]))[:5]
    payment_summary = {"cash": 0.0, "upi": 0.0, "card": 0.0, "other": 0.0}
    for row in payment_rows:
        method = str(row["method"] or "other").lower()
        key = method if method in payment_summary else "other"
        payment_summary[key] += float(row["amount"] or 0)
    payment_summary["total_collection"] = sum(payment_summary.values())

    summary = {
        "total_sales": total_sales,
        "total_bills": total_bills,
        "total_customers": total_customers,
        "avg_bill_value": (total_sales / total_bills) if total_bills else 0.0,
        "gross_profit": gross_profit,
        "gross_profit_pct": 40.0,
    }
    sales_summary = {
        "total_sales": total_sales,
        "total_discount": total_discount,
        "tax_amount": tax_amount,
        "round_off": round_off,
        "net_sales": net_sales,
    }
    additional_summary = {
        "return_refund": refund_amount,
        "cancelled_bills": int(cancelled_row["cancelled_bills"] or 0),
        "void_items": 0,
        "wastage": 0,
        "net_profit": gross_profit - total_discount,
    }
    payload = {
        "date": requested_date,
        "day": report_date.strftime("%A"),
        "prepared_by": "Jaya Dhaba Admin",
        "summary": summary,
        "sales_by_category": sales_by_category,
        "peak_sales": {
            "peak_time": peak_point["time"],
            "peak_amount": peak_amount,
            "peak_percentage": (peak_amount / total_sales * 100) if total_sales else 0.0,
            "lowest_time": lowest_point["time"],
            "lowest_amount": lowest_amount,
            "lowest_percentage": (lowest_amount / total_sales * 100) if total_sales else 0.0,
        },
        "sales_trend": sales_trend,
        "top_items": {
            "most_selling": _pad_rankings(ranked_items[:5]),
            "mid_range": _pad_rankings(ranked_items[5:10]),
            "least_selling": _pad_rankings(least_items),
        },
        "payment_summary": payment_summary,
        "sales_summary": sales_summary,
        "additional_summary": additional_summary,
    }
    payload["ai_summary"] = _generate_daily_report_ai_summary(payload, peak_amount)
    return jsonify(payload)


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
    safe_payload = {
        "success": True,
        "pending": 0,
        "preparing": 0,
        "served": 0,
        "today_orders": 0,
        "today_revenue": 0,
        "total_active": 0,
        "revenue": 0,
        "orders": 0,
        "total_orders": 0,
        "top_item": None,
        "top_item_qty": 0,
        "top_items": [],
        "trajectory": [],
    }
    try:
        cached = stats_cache.get("stats:dashboard")
        if cached is not None:
            return jsonify({**safe_payload, **cached, "success": True})

        payload = dict(safe_payload)
        with db.connect(current_app.config["DATABASE_URL"]) as conn:
            try:
                pending_row = conn.execute("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending', 'confirmed')").fetchone()
                payload["pending"] = int(pending_row["c"] or 0)
            except Exception as e:
                current_app.logger.error(f"stats error: {e}")

            try:
                preparing_row = conn.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'preparing'").fetchone()
                payload["preparing"] = int(preparing_row["c"] or 0)
            except Exception as e:
                current_app.logger.error(f"stats error: {e}")

            try:
                served_row = conn.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'served'").fetchone()
                payload["served"] = int(served_row["c"] or 0)
            except Exception as e:
                current_app.logger.error(f"stats error: {e}")

            try:
                active_row = conn.execute("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending', 'confirmed', 'preparing')").fetchone()
                payload["total_active"] = int(active_row["c"] or 0)
            except Exception as e:
                current_app.logger.error(f"stats error: {e}")

            try:
                today = datetime.now(IST).date().isoformat()
                date_expr = _ist_date_expr("created_at")
                today_row = conn.execute(
                    f"""
                    SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
                    FROM orders
                    WHERE {date_expr} = ? AND status != 'cancelled'
                    """,
                    (today,),
                ).fetchone()
                payload["today_orders"] = int(today_row["orders"] or 0)
                payload["today_revenue"] = int(today_row["revenue"] or 0)
                payload["orders"] = payload["today_orders"]
                payload["total_orders"] = payload["today_orders"]
                payload["revenue"] = payload["today_revenue"]
            except Exception as e:
                current_app.logger.error(f"stats error: {e}")

            try:
                top_rows = conn.execute(
                    """
                    SELECT mi.name, SUM(oi.qty) AS total_qty
                    FROM order_items oi
                    JOIN menu_items mi ON mi.id = oi.menu_item_id
                    JOIN orders o ON o.id = oi.order_id
                    WHERE o.status NOT IN ('cancelled')
                    GROUP BY mi.name
                    ORDER BY total_qty DESC
                    LIMIT 5
                    """
                ).fetchall()
                payload["top_items"] = [{"name": r["name"], "qty": int(r["total_qty"] or 0)} for r in top_rows]
                if top_rows:
                    payload["top_item"] = top_rows[0]["name"]
                    payload["top_item_qty"] = int(top_rows[0]["total_qty"] or 0)
            except Exception as e:
                current_app.logger.error(f"stats error: {e}")

        stats_cache.set("stats:dashboard", payload)
        return jsonify(payload)
    except Exception as e:
        current_app.logger.error(f"stats error: {e}")
        return jsonify(safe_payload)


@bp.get("/admin/pause-orders")
@require_role("staff")
def get_pause_orders():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT value FROM site_settings WHERE key = 'orders_paused'").fetchone()
    return jsonify({"success": True, "paused": (row and row["value"] == "true")})


@bp.post("/admin/pause-orders")
@require_role("staff")
def pause_orders():
    data = body()
    paused = boolean(data.get("paused", False), "paused")
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        conn.execute(
            """
            INSERT INTO site_settings (key, value, updated_at)
            VALUES ('orders_paused', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            ("true" if paused else "false", db.utc_now()),
        )
    broadcast("settings_update", {"action": "orders_paused", "paused": paused})
    status_cache.invalidate("orders:")
    return jsonify({"success": True, "paused": paused})


@bp.get("/orders/status")
def public_order_status():
    cached = status_cache.get("orders:paused")
    if cached is None:
        with db.connect(current_app.config["DATABASE_URL"]) as conn:
            row = conn.execute("SELECT value FROM site_settings WHERE key = 'orders_paused'").fetchone()
        cached = bool(row and row["value"] == "true")
        status_cache.set("orders:paused", cached)
    return jsonify({"success": True, "paused": cached})


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
            "upi_id": row["upi_id"] if "upi_id" in row.keys() else "",
            "upi": row["upi_id"] if "upi_id" in row.keys() else "",
        }
    )


@bp.put("/admin/settings")
@require_role("admin")
def update_settings():
    data = body()
    reject_unknown(data, {"name", "tagline", "hours", "contact", "status", "address", "taxRate", "currency", "upi_id", "upi"})
    payload = {
        "name": raw_text(data.get("name"), "name", 120),
        "tagline": raw_text(data.get("tagline", ""), "tagline", 160, required=False, allow_empty=True),
        "hours": raw_text(data.get("hours"), "hours", 120),
        "contact": phone(data.get("contact"), "contact"),
        "status": raw_text(data.get("status"), "status", 40),
        "address": raw_text(data.get("address"), "address", 240),
        "tax_rate": integer(data.get("taxRate"), "taxRate", 0, 100),
        "currency": raw_text(data.get("currency"), "currency", 10).upper(),
        "upi_id": raw_text(data.get("upi_id", data.get("upi", "")), "upi", 120, required=False, allow_empty=True),
    }
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        conn.execute(
            """
            UPDATE settings
            SET name = ?, tagline = ?, hours = ?, contact = ?, status = ?, address = ?,
                tax_rate = ?, currency = ?, upi_id = ?, updated_at = ?
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
                payload["upi_id"],
                db.utc_now(),
            ),
        )
        audit(conn, "settings.update", "settings", 1, {"fields": sorted(data.keys())})
    return jsonify({"status": "success", "upi_id": payload["upi_id"], "upi": payload["upi_id"]})


@bp.put("/admin/contact")
@require_role("admin")
def update_contact_details():
    data = body()
    reject_unknown(data, {"name", "phone", "contact", "address", "hours"})
    contact_value = data.get("phone", data.get("contact"))
    payload = {
        "name": raw_text(data.get("name", "Jaya Dhaba"), "name", 120, required=False),
        "contact": phone(contact_value, "phone"),
        "address": raw_text(data.get("address"), "address", 240),
        "hours": raw_text(data.get("hours", "11:00 AM - 11:00 PM"), "hours", 120, required=False),
    }
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        conn.execute(
            """
            UPDATE settings
            SET name = ?, contact = ?, address = ?, hours = ?, updated_at = ?
            WHERE id = 1
            """,
            (payload["name"], payload["contact"], payload["address"], payload["hours"], db.utc_now()),
        )
        audit(conn, "contact.update", "settings", 1, {"fields": sorted(data.keys())})
    return jsonify({"status": "success", **payload})


@bp.get("/contact")
def get_contact_details():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT name, contact, address, hours FROM settings WHERE id = 1").fetchone()
    if not row:
        return jsonify({"message": "Contact details not found"}), 404
    return jsonify(
        {
            "name": row["name"],
            "phone": row["contact"],
            "address": row["address"],
            "hours": row["hours"],
        }
    )


def _ensure_contact_submissions_table(conn):
    if db.engine.dialect.name == "postgresql":
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contact_submissions (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(200) NOT NULL,
                phone VARCHAR(20),
                subject VARCHAR(200),
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_read BOOLEAN DEFAULT FALSE
            )
            """
        )
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS contact_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(200) NOT NULL,
            phone VARCHAR(20),
            subject VARCHAR(200),
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_read INTEGER DEFAULT 0
        )
        """
    )


@bp.post("/contact")
def contact_message():
    data = body()
    reject_unknown(data, {"name", "email", "phone", "subject", "message"})
    if looks_like_sql_injection(data.get("name")):
        return jsonify({"error": "Invalid characters in name"}), 400
    raw_phone = str(data.get("phone", "") or "").strip()
    payload = {
        "name": raw_text(data.get("name"), "name", 100),
        "email": email(data.get("email"), "email"),
        "phone": phone(raw_phone, "phone", required=False) if raw_phone else "",
        "subject": raw_text(data.get("subject", ""), "subject", 200, required=False, allow_empty=True),
        "message": raw_text(data.get("message"), "message", 2000),
    }

    def operation():
        with db.transaction(current_app.config["DATABASE_URL"]) as conn:
            _ensure_contact_submissions_table(conn)
            cursor = conn.execute(
                """
                INSERT INTO contact_submissions
                    (name, email, phone, subject, message, created_at, is_read)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["name"],
                    payload["email"],
                    payload["phone"],
                    payload["subject"],
                    payload["message"],
                    db.utc_now(),
                    False if db.engine.dialect.name == "postgresql" else 0,
                ),
            )
            audit(conn, "contact.create", "contact_submission", cursor.lastrowid, {"email": payload["email"]})
            broadcast("contact_update", {"action": "created", "submission_id": cursor.lastrowid})
            return {"success": True, "data": {"id": cursor.lastrowid, "is_read": False}}, 201

    result, status = db.run_write(operation)
    return jsonify(result), status


@bp.route("/admin/contact-submissions", methods=["GET"])
@require_role("staff")
def list_contact_submissions():
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(max(1, int(request.args.get("per_page", 50))), 100)
    offset = (page - 1) * per_page
    try:
        with db.connect(current_app.config["DATABASE_URL"]) as conn:
            _ensure_contact_submissions_table(conn)
            rows = conn.execute(
                "SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (per_page, offset),
            ).fetchall()
            total = conn.execute("SELECT COUNT(*) AS c FROM contact_submissions").fetchone()["c"]
            unread_condition = "is_read = FALSE" if db.engine.dialect.name == "postgresql" else "is_read = 0"
            unread = conn.execute(f"SELECT COUNT(*) AS c FROM contact_submissions WHERE {unread_condition}").fetchone()["c"]
    except Exception as exc:
        current_app.logger.warning("contact_submissions query failed: %s", exc)
        return jsonify({"success": True, "data": [], "total": 0, "unread": 0})
    submissions = [dict(row) for row in rows]
    return jsonify({
        "success": True,
        "data": submissions,
        "total": int(total or 0),
        "unread": int(unread or 0),
        "page": page,
        "per_page": per_page,
        "pages": ((int(total or 0) + per_page - 1) // per_page),
    })


@bp.patch("/admin/contact-submissions/<int:submission_id>/read")
@require_role("staff")
def mark_contact_submission_read(submission_id: int):
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        _ensure_contact_submissions_table(conn)
        existing = conn.execute("SELECT id FROM contact_submissions WHERE id = ?", (submission_id,)).fetchone()
        if not existing:
            raise ValidationError("Contact submission not found", "submission_id", 404)
        read_value = True if db.engine.dialect.name == "postgresql" else 1
        conn.execute("UPDATE contact_submissions SET is_read = ? WHERE id = ?", (read_value, submission_id))
        audit(conn, "contact.read", "contact_submission", submission_id)
    broadcast("contact_update", {"action": "read", "submission_id": submission_id})
    return jsonify({"success": True, "id": submission_id, "is_read": True})


@bp.delete("/admin/contact-submissions/<int:submission_id>")
@require_role("staff")
def delete_contact_submission(submission_id: int):
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        _ensure_contact_submissions_table(conn)
        existing = conn.execute("SELECT id FROM contact_submissions WHERE id = ?", (submission_id,)).fetchone()
        if not existing:
            raise ValidationError("Contact submission not found", "submission_id", 404)
        conn.execute("DELETE FROM contact_submissions WHERE id = ?", (submission_id,))
        audit(conn, "contact.delete", "contact_submission", submission_id)
    broadcast("contact_update", {"action": "deleted", "submission_id": submission_id})
    return jsonify({"success": True, "id": submission_id})


@bp.get("/admin/contact-messages")
@require_role("staff")
def list_contact_messages():
    payload = list_contact_submissions().get_json()
    return jsonify({"messages": payload.get("data", []), "unread_count": payload.get("unread", 0)})


@bp.get("/admin/revenue")
@require_role("staff")
def revenue():
    where_sql, params = _date_filter_sql()
    week_expr = _week_expr()
    month_expr = _month_expr()
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        daily = conn.execute(
            f"""
            SELECT date(created_at) AS label, COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE {where_sql}
            GROUP BY date(created_at)
            ORDER BY label DESC
            LIMIT 30
            """,
            tuple(params),
        ).fetchall()
        weekly = conn.execute(
            f"""
            SELECT {week_expr} AS label, COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE {where_sql}
            GROUP BY {week_expr}
            ORDER BY label DESC
            LIMIT 12
            """,
            tuple(params),
        ).fetchall()
        monthly = conn.execute(
            f"""
            SELECT {month_expr} AS label, COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE {where_sql}
            GROUP BY {month_expr}
            ORDER BY label DESC
            LIMIT 12
            """,
            tuple(params),
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
    requested = PurePosixPath(filename)
    if (
        requested.is_absolute()
        or requested.suffix.lower() not in ALLOWED_UPLOAD_SUFFIXES
        or any(part in {"", ".", ".."} or part.startswith(".") for part in requested.parts)
    ):
        abort(404)
    root = os.path.abspath(current_app.config["UPLOAD_FOLDER"])
    return send_from_directory(root, filename)
