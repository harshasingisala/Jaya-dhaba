from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

import db
from qr_sessions import add_to_group_cart, get_group_cart, get_table_session, remove_from_group_cart
from validators import integer, raw_text


bp = Blueprint("qr_sessions", __name__, url_prefix="/api")


def _item_details(conn, item_ids: list[str]) -> dict[str, dict]:
    if not item_ids:
        return {}
    placeholders = ",".join("?" * len(item_ids))
    rows = conn.execute(
        f"""
        SELECT i.id, i.name, i.price, i.image_url, i.available, c.name AS category_name
        FROM menu_items i
        JOIN menu_categories c ON c.id = i.category_id
        WHERE i.id IN ({placeholders})
          AND i.deleted_at IS NULL
        """,
        item_ids,
    ).fetchall()
    return {
        str(row["id"]): {
            "id": str(row["id"]),
            "name": row["name"],
            "price": int(row["price"] or 0),
            "image_url": row["image_url"],
            "available": bool(row["available"]),
            "category": row["category_name"],
        }
        for row in rows
    }


def _enrich_cart(cart: list[dict]) -> list[dict]:
    item_ids = [str(line.get("item_id") or "") for line in cart if line.get("item_id")]
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        details = _item_details(conn, item_ids)
    enriched = []
    for line in cart:
        item_id = str(line.get("item_id") or "")
        item = details.get(item_id, {})
        enriched.append({
            **line,
            "item_id": item_id,
            "name": item.get("name") or line.get("name") or "Menu item",
            "price": int(item.get("price") if item else line.get("price") or 0),
            "available": bool(item.get("available", True)),
            "item": item or {
                "id": item_id,
                "name": line.get("name") or "Menu item",
                "price": int(line.get("price") or 0),
                "available": True,
            },
        })
    return enriched


@bp.post("/session/cart/add")
def add_session_cart_item():
    data = request.get_json(silent=True) or {}
    session_id = raw_text(data.get("table_session"), "table_session", 200)
    if not get_table_session(session_id):
        return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403

    item_id = raw_text(data.get("item_id"), "item_id", 120)
    quantity = integer(data.get("quantity", 1), "quantity", 1, 50)
    added_by = raw_text(data.get("added_by", "Guest"), "added_by", 80, required=False, allow_empty=True) or "Guest"
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute(
            """
            SELECT id, name, price
            FROM menu_items
            WHERE id = ?
              AND deleted_at IS NULL
              AND available = true
            """,
            (item_id,),
        ).fetchone()
    if not row:
        return jsonify({"success": False, "message": "Menu item is unavailable"}), 404

    cart = add_to_group_cart(session_id, {
        "item_id": str(row["id"]),
        "name": row["name"],
        "price": int(row["price"] or 0),
        "quantity": quantity,
        "added_by": added_by,
    })
    if cart is None:
        return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403
    enriched = _enrich_cart(cart)
    return jsonify({"success": True, "cart": enriched, "data": {"cart": enriched}})


@bp.post("/session/cart/remove")
def remove_session_cart_item():
    data = request.get_json(silent=True) or {}
    session_id = raw_text(data.get("table_session"), "table_session", 200)
    if not get_table_session(session_id):
        return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403
    item_id = raw_text(data.get("item_id"), "item_id", 120)
    added_by = raw_text(data.get("added_by", "Guest"), "added_by", 80, required=False, allow_empty=True) or "Guest"
    cart = remove_from_group_cart(session_id, item_id, added_by)
    if cart is None:
        return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403
    enriched = _enrich_cart(cart)
    return jsonify({"success": True, "cart": enriched, "data": {"cart": enriched}})


@bp.get("/session/cart")
def get_session_cart():
    session_id = raw_text(request.args.get("table_session"), "table_session", 200)
    cart = get_group_cart(session_id)
    if cart is None:
        return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403
    enriched = _enrich_cart(cart)
    return jsonify({"success": True, "cart": enriched, "data": {"cart": enriched}})
