from __future__ import annotations

import json
import os
import threading
import uuid
import warnings
from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

import db
from audit import audit
from auth import require_role
from cache import menu_cache
from events import broker, stream_topic
from realtime import broadcast
from validators import ValidationError, body, boolean, integer, raw_text, reject_unknown, tags, url
from utils.validation import validate_image_url


bp = Blueprint("menu", __name__, url_prefix="/api")

ENHANCE_JOBS: dict[str, dict] = {}


def _image_url(value) -> str:
    cleaned = url(value, "image_url", required=False)
    if not validate_image_url(
        cleaned,
        strict_allowlist=current_app.config.get("STRICT_IMAGE_URL_ALLOWLIST", False),
    ):
        raise ValidationError("Image URL must be from allowed hosts", "image_url")
    return cleaned


def serialize_item(row) -> dict:
    return {
        "id": row["id"],
        "client_id": str(row["id"]),
        "category_id": row["category_id"],
        "category": row["category_name"],
        "name": row["name"],
        "description": row["description"],
        "price": int(row["price"]),
        "image_url": row["image_url"],
        "dietary_tags": db.decode_json(row["dietary_tags"], []),
        "chef_note": row["chef_note"] if "chef_note" in row.keys() else "",
        "ingredients": db.decode_json(row["ingredients"], []) if "ingredients" in row.keys() else [],
        "spice_level": int(row["spice_level"] or 0) if "spice_level" in row.keys() else 0,
        "calories": row["calories"] if "calories" in row.keys() else None,
        "protein_g": row["protein_g"] if "protein_g" in row.keys() else None,
        "carbs_g": row["carbs_g"] if "carbs_g" in row.keys() else None,
        "fat_g": row["fat_g"] if "fat_g" in row.keys() else None,
        "model_url": row["model_url"] if "model_url" in row.keys() else None,
        "available": bool(row["available"]),
        "is_available": bool(row["available"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def serialize_category(row) -> dict:
    return {"id": row["id"], "name": row["name"], "display_order": row["display_order"], "active": bool(row["active"])}


def fetch_menu_item_payload(conn, item_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT i.*, c.name AS category_name
        FROM menu_items i
        JOIN menu_categories c ON c.id = i.category_id
        WHERE i.id = ?
        """,
        (item_id,),
    ).fetchone()
    return serialize_item(row) if row else None


def get_celebration_for_table(conn, table_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT celebration_type FROM reservations
        WHERE table_id = ? AND date(reserved_at) = date('now') AND status = 'confirmed'
          AND celebration_type IS NOT NULL
        LIMIT 1
        """,
        (table_id,),
    ).fetchone()
    if not row:
        return None
    messages = {
        "birthday": "Happy Birthday! A complimentary dessert awaits you.",
        "anniversary": "Happy Anniversary! Wishing you a wonderful celebration.",
        "wedding": "Congratulations! We're honoured to be part of your celebration.",
    }
    return {"type": row["celebration_type"], "message": messages.get(row["celebration_type"], "")}


def load_menu(table_token: str | None = None, include_unavailable: bool = False) -> dict:
    cache_key = f"menu:{table_token or 'public'}:{'admin' if include_unavailable else 'public'}"
    cached = menu_cache.get(cache_key)
    if cached is not None:
        return cached
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        table = None
        if table_token:
            table = conn.execute("SELECT * FROM tables WHERE qr_token = ? AND active = true", (table_token,)).fetchone()
            if not table:
                raise ValidationError("Table QR token was not found", "qr_token", 404)
        categories = conn.execute("SELECT * FROM menu_categories WHERE active = true ORDER BY display_order, name").fetchall()
        availability_filter = "" if include_unavailable else "AND i.available = true"
        items = conn.execute(
            """
            SELECT i.*, c.name AS category_name
            FROM menu_items i
            JOIN menu_categories c ON c.id = i.category_id
            WHERE c.active = true
              AND i.deleted_at IS NULL
              {availability_filter}
            ORDER BY c.display_order, i.name
            """.format(availability_filter=availability_filter)
        ).fetchall()
        celebration = get_celebration_for_table(conn, table["id"]) if table else None
    payload = {
        "table": dict(table) if table else None,
        "celebration": celebration,
        "categories": [serialize_category(row) for row in categories],
        "items": [serialize_item(row) for row in items],
    }
    menu_cache.set(cache_key, payload)
    return payload


@bp.get("/menu")
def menu():
    return jsonify(load_menu(request.args.get("table_token") or request.args.get("table")))


@bp.post("/menu/pairings")
def get_pairings():
    data = body()
    item_ids = data.get("item_ids", [])
    if not item_ids or not isinstance(item_ids, list) or not all(isinstance(i, int) for i in item_ids[:50]):
        return jsonify({"suggestions": []})
    item_ids = item_ids[:50]
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        placeholders = ",".join("?" * len(item_ids))
        cart_items = conn.execute(f"SELECT id, category_id FROM menu_items WHERE id IN ({placeholders})", item_ids).fetchall()
        category_ids = [row["category_id"] for row in cart_items]
        cats_clause = ",".join("?" * len(category_ids)) if category_ids else "NULL"
        rules = conn.execute(
            f"""
            SELECT suggested_item_ids FROM pairing_rules
            WHERE active = true
              AND (trigger_item_id IN ({placeholders}) OR trigger_category IN (
                  SELECT name FROM menu_categories WHERE id IN ({cats_clause})
              ))
            ORDER BY priority DESC LIMIT 10
            """,
            item_ids + category_ids,
        ).fetchall()
        suggested_ids = []
        seen = set(item_ids)
        for rule in rules:
            for sid in db.decode_json(rule["suggested_item_ids"], []):
                try:
                    sid = int(sid)
                except (TypeError, ValueError):
                    continue
                if sid not in seen:
                    suggested_ids.append(sid)
                    seen.add(sid)
        if not suggested_ids:
            return jsonify({"suggestions": []})
        top3 = suggested_ids[:3]
        ph = ",".join("?" * len(top3))
        rows = conn.execute(
            f"""
            SELECT i.*, c.name AS category_name
            FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
            WHERE i.id IN ({ph}) AND i.available = true
            """,
            top3,
        ).fetchall()
    return jsonify({"suggestions": [serialize_item(row) for row in rows]})


@bp.get("/tables/<qr_token>")
def table_from_token(qr_token):
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT * FROM tables WHERE qr_token = ? AND active = true", (qr_token,)).fetchone()
    if not row:
        return jsonify({"message": "Table not found"}), 404
    return jsonify({"table": dict(row)})


@bp.get("/admin/menu")
@require_role("staff")
def admin_menu():
    return jsonify(load_menu(include_unavailable=True))


@bp.get("/menu/<item_id>")
@require_role("staff")
def menu_item(item_id: str):
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute(
            """
            SELECT i.*, c.name AS category_name
            FROM menu_items i
            JOIN menu_categories c ON c.id = i.category_id
            WHERE i.id = ?
            """,
            (item_id,),
        ).fetchone()
    if not row:
        raise ValidationError("Menu item not found", "item_id", 404)
    return jsonify({"item": serialize_item(row)})


@bp.post("/admin/menu")
@bp.post("/menu/items")
@require_role("staff")
def create_menu_item():
    data = body()
    reject_unknown(data, {"category_id", "name", "description", "price", "image_url", "dietary_tags", "available", "chef_note", "ingredients", "spice_level", "calories", "protein_g", "carbs_g", "fat_g", "model_url"})
    ingredients = data.get("ingredients", [])
    if isinstance(ingredients, str):
        ingredients = db.decode_json(ingredients, None)
    if ingredients is None or not isinstance(ingredients, list):
        raise ValidationError("ingredients must be a JSON array", "ingredients")
    now = db.utc_now()
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        category = conn.execute("SELECT id FROM menu_categories WHERE id = ?", (raw_text(data.get("category_id"), "category_id", 80),)).fetchone()
        if not category:
            raise ValidationError("Category not found", "category_id", 404)
        item_id = str(uuid4())
        conn.execute(
            """
            INSERT INTO menu_items
            (id, category_id, name, description, price, image_url, dietary_tags, available, chef_note, ingredients, spice_level,
             calories, protein_g, carbs_g, fat_g, model_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                category["id"],
                raw_text(data.get("name"), "name", 120),
                raw_text(data.get("description", ""), "description", 1000, required=False, allow_empty=True),
                integer(data.get("price"), "price", 0, 100000),
                _image_url(data.get("image_url", "")),
                db.encode_json(tags(data.get("dietary_tags"))),
                1 if boolean(data.get("available", True), "available") else 0,
                raw_text(data.get("chef_note", ""), "chef_note", 1000, required=False, allow_empty=True),
                db.encode_json([raw_text(i, "ingredients", 80) for i in ingredients[:50]]),
                integer(data.get("spice_level", 0), "spice_level", 0, 5),
                integer(data.get("calories"), "calories", 1, 10000, required=False),
                float(data["protein_g"]) if data.get("protein_g") is not None else None,
                float(data["carbs_g"]) if data.get("carbs_g") is not None else None,
                float(data["fat_g"]) if data.get("fat_g") is not None else None,
                url(data.get("model_url", ""), "model_url", required=False),
                now,
                now,
            ),
        )
        audit(conn, "menu.create", "menu_item", item_id)
        item_payload = fetch_menu_item_payload(conn, item_id)
    menu_cache.invalidate("menu:")
    broker.publish("menu_updates", "menu.updated", {"type": "created", "item_id": item_id})
    broker.publish("kitchen", "menu.updated", {"item_id": item_id})
    broadcast("menu_update", {"action": "created", "item_id": item_id, "item": item_payload})
    return jsonify({"id": item_id}), 201


@bp.patch("/admin/menu/<item_id>")
@bp.put("/menu/items/<item_id>")
@bp.patch("/menu/items/<item_id>")
@require_role("staff")
def update_menu_item(item_id: str):
    data = body()
    reject_unknown(data, {"category_id", "name", "description", "price", "image_url", "dietary_tags", "available", "chef_note", "ingredients", "spice_level", "calories", "protein_g", "carbs_g", "fat_g", "model_url"})
    if not data:
        raise ValidationError("At least one field is required")
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        existing = conn.execute("SELECT * FROM menu_items WHERE id = ?", (item_id,)).fetchone()
        if not existing:
            raise ValidationError("Menu item not found", "item_id", 404)
        next_category_id = raw_text(data.get("category_id"), "category_id", 80) if "category_id" in data else existing["category_id"]
        category = conn.execute("SELECT id FROM menu_categories WHERE id = ?", (next_category_id,)).fetchone()
        if not category:
            raise ValidationError("Category not found", "category_id", 404)
        ingredients_value = existing["ingredients"]
        if "ingredients" in data:
            incoming = data.get("ingredients")
            if isinstance(incoming, str):
                incoming = db.decode_json(incoming, None)
            if incoming is None or not isinstance(incoming, list):
                raise ValidationError("ingredients must be a JSON array", "ingredients")
            ingredients_value = db.encode_json([raw_text(i, "ingredients", 80) for i in incoming[:50]])
        conn.execute(
            """
            UPDATE menu_items
            SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, dietary_tags = ?, available = ?,
                chef_note = ?, ingredients = ?, spice_level = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
                model_url = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                next_category_id,
                raw_text(data["name"], "name", 120) if "name" in data else existing["name"],
                raw_text(data.get("description"), "description", 1000, required=False, allow_empty=True) if "description" in data else existing["description"],
                integer(data.get("price"), "price", 0, 100000) if "price" in data else existing["price"],
                _image_url(data.get("image_url")) if "image_url" in data else existing["image_url"],
                db.encode_json(tags(data.get("dietary_tags"))) if "dietary_tags" in data else existing["dietary_tags"],
                (1 if boolean(data.get("available"), "available") else 0) if "available" in data else existing["available"],
                raw_text(data.get("chef_note"), "chef_note", 1000, required=False, allow_empty=True) if "chef_note" in data else existing["chef_note"],
                ingredients_value,
                integer(data.get("spice_level"), "spice_level", 0, 5) if "spice_level" in data else existing["spice_level"],
                integer(data.get("calories"), "calories", 1, 10000, required=False) if "calories" in data else existing["calories"],
                float(data["protein_g"]) if data.get("protein_g") is not None else None if "protein_g" in data else existing["protein_g"],
                float(data["carbs_g"]) if data.get("carbs_g") is not None else None if "carbs_g" in data else existing["carbs_g"],
                float(data["fat_g"]) if data.get("fat_g") is not None else None if "fat_g" in data else existing["fat_g"],
                url(data.get("model_url"), "model_url", required=False) if "model_url" in data else existing["model_url"],
                db.utc_now(),
                item_id,
            ),
        )
        audit(conn, "menu.update", "menu_item", item_id, {"fields": sorted(data.keys())})
        item_payload = fetch_menu_item_payload(conn, item_id)
    menu_cache.invalidate("menu:")
    broker.publish("menu_updates", "menu.updated", {"type": "updated", "item_id": item_id})
    broker.publish("kitchen", "menu.updated", {"item_id": item_id})
    broadcast("menu_update", {"action": "updated", "item_id": item_id, "item": item_payload})
    return jsonify({"status": "ok"})


@bp.patch("/admin/menu/<item_id>/availability")
@bp.patch("/menu/items/<item_id>/availability")
@require_role("staff")
def toggle_availability(item_id: str):
    data = body()
    available = bool(data.get("available"))
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        before = conn.execute("SELECT * FROM menu_items WHERE id = ?", (item_id,)).fetchone()
        if not before:
            raise ValidationError("Menu item not found", "item_id", 404)
        conn.execute("UPDATE menu_items SET available = ?, updated_at = ? WHERE id = ?", (1 if available else 0, db.utc_now(), item_id))
        audit(conn, "menu.availability", "menu_item", item_id, {"from": bool(before["available"]), "to": available})
        item_payload = fetch_menu_item_payload(conn, item_id)
    menu_cache.invalidate("menu:")
    broker.publish("menu_updates", "menu.updated", {"type": "availability", "item_id": item_id, "available": available})
    broker.publish("kitchen", "menu.updated", {"item_id": item_id})
    broadcast("menu_update", {"action": "updated", "item_id": item_id, "item": item_payload})
    return jsonify({"status": "ok", "available": available, "item": item_payload})


@bp.get("/menu/stream")
def menu_stream():
    return Response(
        stream_with_context(stream_topic("menu_updates")),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def enhance_image_job(job_id: str, image_bytes: bytes, output_path: str):
    from PIL import Image, ImageEnhance, ImageFilter

    try:
        img = Image.open(BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        size = min(w, h)
        img = img.crop(((w - size) // 2, (h - size) // 2, (w + size) // 2, (h + size) // 2))
        img = img.resize((800, 800), Image.LANCZOS)
        img = ImageEnhance.Brightness(img).enhance(1.05)
        img = ImageEnhance.Contrast(img).enhance(1.15)
        img = ImageEnhance.Sharpness(img).enhance(1.5)
        img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=120))
        buf = BytesIO()
        img.save(buf, format="WEBP", quality=82, optimize=True)
        if buf.tell() > 150_000:
            buf = BytesIO()
            img.save(buf, format="WEBP", quality=65)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(buf.getvalue())
        ENHANCE_JOBS[job_id] = {"status": "done", "url": f"/uploads/menu/{job_id}.webp"}
    except Exception as exc:
        current_app.logger.error("ENHANCE_FAILED", extra={"job_id": job_id, "error": str(exc)})
        ENHANCE_JOBS[job_id] = {"status": "error", "url": None}


@bp.post("/admin/menu/enhance-photo")
@require_role("staff")
def enhance_photo():
    from PIL import Image

    f = request.files.get("image")
    if not f:
        raise ValidationError("No file", "image")
    if f.mimetype not in ("image/jpeg", "image/png", "image/webp"):
        raise ValidationError("JPG, PNG, or WebP only", "image")
    data = f.read()
    if len(data) > 10 * 1024 * 1024:
        raise ValidationError("Max 10MB", "image", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(BytesIO(data))
            image.verify()
    except Exception:
        raise ValidationError("Invalid image content", "image")
    job_id = str(uuid.uuid4())
    ENHANCE_JOBS[job_id] = {"status": "processing"}
    out_path = os.path.join(current_app.config["UPLOAD_FOLDER"], "menu", f"{job_id}.webp")
    threading.Thread(target=enhance_image_job, args=(job_id, data, out_path), daemon=True).start()
    return jsonify({"job_id": job_id}), 202


@bp.get("/admin/menu/enhance-status/<job_id>")
@require_role("staff")
def enhance_status(job_id):
    job = ENHANCE_JOBS.get(job_id)
    if not job:
        raise ValidationError("Enhancement job not found", "job_id", 404)
    return jsonify(job)


@bp.post("/admin/menu/<item_id>/upload-model")
@require_role("staff")
def upload_model(item_id: str):
    f = request.files.get("model")
    if not f:
        raise ValidationError("No file", "model")
    if not f.filename.lower().endswith(".glb"):
        raise ValidationError(".glb files only", "model")
    data = f.read()
    if len(data) > 20 * 1024 * 1024:
        raise ValidationError("Max 20MB", "model", 413)
    if data[:4] != b"glTF":
        raise ValidationError("Invalid GLB content", "model")
    fname = f"model_{item_id}_{uuid.uuid4().hex[:8]}.glb"
    path = os.path.join(current_app.config["UPLOAD_FOLDER"], "models", fname)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as out:
        out.write(data)
    model_url = f"/uploads/models/{fname}"
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise ValidationError("Menu item not found", "item_id", 404)
        conn.execute("UPDATE menu_items SET model_url = ?, updated_at = ? WHERE id = ?", (model_url, db.utc_now(), item_id))
        audit(conn, "menu.model", "menu_item", item_id)
    menu_cache.invalidate("menu:")
    return jsonify({"model_url": model_url})


@bp.get("/menu/<item_id>/ratings")
def item_ratings(item_id: str):
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT AVG(rating) AS avg_rating, COUNT(*) AS count FROM dish_ratings WHERE menu_item_id = ?", (item_id,)).fetchone()
        photos = conn.execute(
            """
            SELECT photo_url FROM dish_ratings
            WHERE menu_item_id = ? AND photo_approved = true
            ORDER BY created_at DESC LIMIT 20
            """,
            (item_id,),
        ).fetchall()
    return jsonify({"avg_rating": round(row["avg_rating"] or 0, 1), "count": row["count"] or 0, "photos": [r["photo_url"] for r in photos]})


@bp.delete("/admin/menu/<item_id>")
@bp.delete("/menu/items/<item_id>")
@require_role("staff")
def delete_menu_item(item_id: str):
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        existing = conn.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,)).fetchone()
        if not existing:
            raise ValidationError("Menu item not found", "item_id", 404)
        conn.execute(
            "UPDATE menu_items SET deleted_at = ?, available = ?, updated_at = ? WHERE id = ?",
            (datetime.now(timezone.utc), 0, datetime.now(timezone.utc), item_id),
        )
        audit(conn, "menu.delete", "menu_item", item_id)
    menu_cache.invalidate("menu:")
    broker.publish("menu_updates", "menu.updated", {"type": "deleted", "item_id": item_id})
    broker.publish("kitchen", "menu.updated", {"item_id": item_id})
    broadcast("menu_update", {"action": "deleted", "item_id": item_id, "item": None})
    return jsonify({"status": "ok"})
