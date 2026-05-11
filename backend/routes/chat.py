from __future__ import annotations

import json
import threading

import uuid

from flask import Blueprint, Response, current_app, g, jsonify, request, stream_with_context

import db
from audit import audit
from rate_limits import enforce_limit
from validators import ValidationError, body, raw_text, reject_unknown


bp = Blueprint("chat", __name__, url_prefix="/api")


def build_system_prompt(conn) -> str:
    rows = conn.execute(
        """
        SELECT c.name AS category, mi.name, mi.description, mi.price, mi.dietary_tags
        FROM menu_items mi
        JOIN menu_categories c ON c.id = mi.category_id
        WHERE mi.available = true
        ORDER BY c.display_order, mi.name
        """
    ).fetchall()
    by_category: dict[str, list[str]] = {}
    for row in rows:
        allergens = ", ".join(db.decode_json(row["dietary_tags"], []))
        line = f"  • {row['name']} (₹{int(row['price'])}): {row['description']} [{allergens}]"
        by_category.setdefault(row["category"], []).append(line)
    menu_block = "\n".join(f"{name}:\n" + "\n".join(items) for name, items in by_category.items())
    try:
        combos = conn.execute("SELECT trigger_category, suggested_item_ids FROM pairing_rules WHERE active = true ORDER BY priority DESC LIMIT 10").fetchall()
        combo_text = ", ".join(
            [f"{row['trigger_category']} → {', '.join(str(x) for x in db.decode_json(row['suggested_item_ids'], []))}" for row in combos]
        ) or "No active combos"
    except Exception:
        combo_text = "No active combos"

    try:
        pricing = conn.execute("SELECT name, discount_type, discount_value FROM pricing_rules WHERE active = true ORDER BY id DESC LIMIT 15").fetchall()
        pricing_text = ", ".join(
            [f"{row['name']} ({row['discount_type']} {row['discount_value']})" for row in pricing]
        ) or "No active promotions"
    except Exception:
        pricing_text = "No active promotions"

    try:
        settings_rows = conn.execute(
            "SELECT key, value FROM site_settings WHERE key IN ('restaurant_phone','restaurant_hours')"
        ).fetchall()
        settings = {row["key"]: row["value"] for row in settings_rows}
    except Exception:
        settings = {}
    return (
        "You are Jaya — warm, witty, deeply knowledgeable AI concierge for Jaya Dhaba,\n"
        "a legendary heritage restaurant in East Marredpally, Hyderabad.\n"
        "You speak like a friendly local who genuinely loves food.\n\n"
        "Answer EVERYTHING — food, order help, jokes, general knowledge, anything.\n"
        "Never rude. Never refuse reasonable questions. Always bring it back to\n"
        "how Jaya Dhaba can make the customer's day better.\n\n"
        "CURRENT FULL MENU (live from kitchen):\n"
        f"{menu_block}\n\n"
        f"ACTIVE COMBO OFFERS: {combo_text}\n"
        f"ACTIVE PROMOTIONS TODAY: {pricing_text}\n\n"
        "RESTAURANT INFO:\n"
        "Name: Jaya Dhaba | Address: East Marredpally, Secunderabad, Hyderabad\n"
        f"Phone: {settings.get('restaurant_phone', '')} | Hours: {settings.get('restaurant_hours', '')}\n"
        "Specialty: Biryani, Curries, Chinese, Roti | Signature: Dum Chicken Biryani\n\n"
        "RULES: Use ₹ not Rs · bullets for lists · 2-4 sentences max unless listing\n"
        "· order status → tracking page · never invent prices or dishes"
    )


def save_chat_log(session_id: str, user_id: str | None, message: str, full_response: str, database_url: str):
    with db.transaction(database_url) as conn:
        conn.execute(
            "INSERT INTO chat_log (user_id, session_id, role, message, created_at) VALUES (?, ?, 'user', ?, ?)",
            (user_id, session_id, message, db.utc_now()),
        )
        conn.execute(
            "INSERT INTO chat_log (user_id, session_id, role, message, created_at) VALUES (?, ?, 'assistant', ?, ?)",
            (user_id, session_id, full_response, db.utc_now()),
        )
        audit(conn, "chat.response", "chat", session_id, {"chars": len(full_response)}, user_id=user_id)


@bp.post("/chat")
def chat():
    data = body()
    reject_unknown(data, {"message", "session_id", "conversation_history"})
    session_id = raw_text(data.get("session_id", ""), "session_id", 120, required=False, allow_empty=True)
    message = raw_text(data.get("message"), "message", 500)
    if len(message) > 500:
        raise ValidationError("message must be <= 500 chars", "message", 400)
    history = data.get("conversation_history") or []
    if not isinstance(history, list):
        raise ValidationError("conversation_history must be an array", "conversation_history")
    history = history[-20:]
    rate = enforce_limit(f"chat:{session_id or request.remote_addr}", 20, 60)
    if rate is not None:
        return rate
    if not current_app.config["OPENAI_API_KEY"]:
        return jsonify({"message": "AI service unavailable"}), 503
    if not current_app.config.get("CHATBOT_ENABLED", False):
        return jsonify({"message": "Chat is not currently available"}), 503
    user = getattr(g, "current_user", None)
    user_id = str(uuid.UUID(user["id"])) if user else None

    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        system_prompt = build_system_prompt(conn)
    normalized_history = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            normalized_history.append({"role": role, "content": content[:1200]})

    def generate():
        from openai import APIError, OpenAI, RateLimitError

        client = OpenAI(api_key=current_app.config["OPENAI_API_KEY"], timeout=20.0)
        full_response = []
        try:
            stream = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=500,
                temperature=0.7,
                stream=True,
                messages=[
                    {"role": "system", "content": system_prompt},
                    *normalized_history[-20:],
                    {"role": "user", "content": message},
                ],
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full_response.append(delta)
                    yield f"data: {json.dumps({'token': delta})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            threading.Thread(
                target=save_chat_log,
                args=(session_id, user_id, message, "".join(full_response), current_app.config["DATABASE_URL"]),
                daemon=True,
            ).start()
        except RateLimitError:
            current_app.logger.warning("OpenAI chat rate limited for session %s", session_id)
            yield f"data: {json.dumps({'error': 'rate_limited', 'message': 'Too many AI requests right now.'})}\n\n"
        except APIError:
            current_app.logger.exception("OpenAI chat upstream error for session %s", session_id)
            yield f"data: {json.dumps({'error': 'upstream_unavailable', 'message': 'AI service is temporarily unavailable.'})}\n\n"
        except Exception:
            current_app.logger.exception("OpenAI chat stream failed for session %s", session_id)
            yield f"data: {json.dumps({'error': 'stream_failed', 'message': 'Chat response failed.'})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@bp.post('/jaya-concierge')
def jaya_concierge():
    data = body()
    reject_unknown(data, {"sessionId", "message", "history", "language"})

    session_id = raw_text(data.get("sessionId", ""), "sessionId", 120, required=False, allow_empty=True)
    message = raw_text(data.get("message"), "message", 2000)
    language = raw_text(data.get("language", "en"), "language", 5, required=False, allow_empty=True) or "en"

    history = data.get("history", [])
    if history is None:
        history = []
    if not isinstance(history, list):
        raise ValidationError("history must be an array", "history")

    normalized_history = []
    for item in history[-10:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("text") or item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            normalized_history.append({"role": role, "content": content.strip()[:1200]})

    rate = enforce_limit(f"concierge:{session_id or request.remote_addr}", 20, 60)
    if rate is not None:
        return rate

    if not current_app.config.get("GOOGLE_API_KEY"):
        return jsonify({"success": False, "message": "AI service unavailable"}), 503

    try:
        import google.generativeai as genai

        with db.connect(current_app.config["DATABASE_URL"]) as conn:
            system_prompt = build_system_prompt(conn)

        genai.configure(api_key=current_app.config.get("GOOGLE_API_KEY"))
        model = genai.GenerativeModel("models/gemini-2.5-flash")

        full_prompt = system_prompt + "\n\nConversation history:\n"
        for item in normalized_history:
            role = "User" if item["role"] == "user" else "Assistant"
            full_prompt += f"{role}: {item['content']}\n"
        full_prompt += f"User: {message}\nAssistant:"

        response = model.generate_content(full_prompt)
        text = getattr(response, "text", "").strip() or "Jaya could not generate a response at this time."

        if session_id:
            threading.Thread(
                target=save_chat_log,
                args=(session_id, None, message, text, current_app.config["DATABASE_URL"]),
                daemon=True,
            ).start()

        return jsonify({"success": True, "reply": text, "message": text})
    except Exception as exc:
        current_app.logger.error("Jaya concierge error: %s", exc)
        return jsonify({"success": False, "message": "AI generation failed."}), 500
