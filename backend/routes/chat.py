from __future__ import annotations

import os
import threading

import google.generativeai as genai
from flask import (
    Blueprint,
    current_app,
    jsonify,
)

import db
from audit import audit
from validators import (
    ValidationError,
    body,
    raw_text,
    reject_unknown,
)

bp = Blueprint("chat", __name__, url_prefix="/api")


SYSTEM_PROMPT = """You are Jaya, the friendly AI assistant for
Jaya Dhaba, a Hyderabadi restaurant in East Marredpally,
Secunderabad. Help customers with menu, reservations, hours,
and directions. Keep answers short and warm.
Hours: 11AM-11PM daily. Phone: {}.""".format(
    os.environ.get("RESTAURANT_PHONE")
    or os.environ.get("JAYA_DHABA_PHONE")
    or os.environ.get("CONTACT_PHONE")
    or ""
)


def get_gemini_reply(message: str, history: list) -> str:
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("missing_key")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    chat_history = []
    for turn in history[-10:]:
        role = "user" if turn.get("role") == "user" else "model"
        chat_history.append({"role": role, "parts": [turn.get("text", "")]})

    chat = model.start_chat(history=chat_history)
    response = chat.send_message(message)
    return response.text.strip()


# =========================================================
# SYSTEM PROMPT
# =========================================================
def build_system_prompt(conn) -> str:
    rows = conn.execute(
        """
        SELECT c.name AS category,
               mi.name,
               mi.description,
               mi.price,
               mi.dietary_tags
        FROM menu_items mi
        JOIN menu_categories c
            ON c.id = mi.category_id
        WHERE mi.available = 1
        ORDER BY c.display_order, mi.name
        """
    ).fetchall()

    by_category: dict[str, list[str]] = {}

    for row in rows:
        tags = ", ".join(
            db.decode_json(
                row["dietary_tags"],
                []
            )
        )

        item_line = (
            f"• {row['name']} "
            f"(₹{int(row['price'])})\n"
            f"  {row['description']}\n"
            f"  Tags: {tags}"
        )

        by_category.setdefault(
            row["category"],
            []
        ).append(item_line)

    menu_block = "\n\n".join(
        f"{category}:\n" + "\n".join(items)
        for category, items in by_category.items()
    )

    try:
        offers = conn.execute(
            """
            SELECT trigger_category,
                   suggested_item_ids
            FROM pairing_rules
            WHERE active = 1
            ORDER BY priority DESC
            LIMIT 10
            """
        ).fetchall()

        combo_text = "\n".join([
            (
                f"• {row['trigger_category']} "
                f"→ {', '.join(str(x) for x in db.decode_json(row['suggested_item_ids'], []))}"
            )
            for row in offers
        ]) or "No active offers"

    except Exception:
        combo_text = "No active offers"

    try:
        promotions = conn.execute(
            """
            SELECT name,
                   discount_type,
                   discount_value
            FROM pricing_rules
            WHERE active = 1
            ORDER BY id DESC
            LIMIT 10
            """
        ).fetchall()

        promotion_text = "\n".join([
            (
                f"• {row['name']} "
                f"({row['discount_type']} "
                f"{row['discount_value']})"
            )
            for row in promotions
        ]) or "No active promotions"

    except Exception:
        promotion_text = "No active promotions"

    try:
        settings_rows = conn.execute(
            """
            SELECT key, value
            FROM site_settings
            """
        ).fetchall()

        settings = {
            row["key"]: row["value"]
            for row in settings_rows
        }

    except Exception:
        settings = {}

    return f"""
You are Jaya.

You are NOT a robotic support bot.

You are a warm, funny, smart, charismatic AI concierge
for Jaya Dhaba in Hyderabad.

You speak naturally like a real modern human.

Your vibe:
- Friendly
- Witty
- Chill
- Smart
- Slightly playful
- Emotionally aware
- Confident
- Helpful

You can:
- Talk casually
- Crack jokes
- Recommend food
- Answer random questions
- Have natural conversations
- Guide users
- Talk like a premium AI assistant

VERY IMPORTANT:
Never sound robotic.

Bad Example:
"How may I assist you today?"

Good Example:
"Yooo 😄 What are you craving today?"

IMPORTANT:
Always feel conversational and human.

You should feel like:
- ChatGPT
- Gemini
- A premium restaurant AI assistant

not like:
- FAQ bot
- customer support machine

You are deeply connected to Jaya Dhaba.

Naturally connect conversations back to:
- food
- dining
- cravings
- Hyderabad food culture
- restaurant experiences

BUT DON'T FORCE IT.

Examples:

If user says:
"The weather is nice"

You can say:
"Perfect biryani weather honestly 😄"

If user says:
"Tell me a joke"

You can say:
"Why did the biryani break up with the curry? 😂
Too much emotional gravy."

If user says:
"Who owns this restaurant?"

Answer:
"Jaya Dhaba is owned by Sunil Kumar Behera 😄"

RULES:
- Never invent prices
- Never invent dishes
- Keep answers concise
- Use emojis naturally
- Sound modern
- Sound premium
- Avoid long boring paragraphs

=========================================================
RESTAURANT INFO
=========================================================

Restaurant Name:
Jaya Dhaba

Owner:
Sunil Kumar Behera

Location:
East Marredpally, Hyderabad

Phone:
{settings.get("restaurant_phone", "")}

Hours:
{settings.get("restaurant_hours", "")}

Specialties:
- Chicken Biryani
- Chicken 65
- Dhaba curries
- Fried rice
- Fresh breads
- Lassi and buttermilk

=========================================================
ACTIVE OFFERS
=========================================================

{combo_text}

=========================================================
ACTIVE PROMOTIONS
=========================================================

{promotion_text}

=========================================================
FULL MENU
=========================================================

{menu_block}
"""


# =========================================================
# SAVE CHAT LOG
# =========================================================
def save_chat_log(
    session_id: str,
    message: str,
    response_text: str,
):
    with db.transaction(
        current_app.config["DATABASE_URL"]
    ) as conn:

        conn.execute(
            """
            INSERT INTO chat_log (
                session_id,
                role,
                message,
                created_at
            )
            VALUES (?, 'user', ?, ?)
            """,
            (
                session_id,
                message,
                db.utc_now(),
            ),
        )

        conn.execute(
            """
            INSERT INTO chat_log (
                session_id,
                role,
                message,
                created_at
            )
            VALUES (?, 'assistant', ?, ?)
            """,
            (
                session_id,
                response_text,
                db.utc_now(),
            ),
        )

        audit(
            conn,
            "chat.response",
            "chat",
            session_id,
            {"chars": len(response_text)},
        )


# =========================================================
# MAIN ROUTE
# =========================================================
@bp.post("/chat")
@bp.post("/jaya-concierge")
def jaya_concierge():
    data = body()

    reject_unknown(
        data,
        {
            "sessionId",
            "message",
            "history",
            "language",
        }
    )

    session_id = raw_text(data.get("sessionId", ""), "sessionId", 120, required=False, allow_empty=True)

    if not isinstance(data.get("message"), str) or not data.get("message", "").strip():
        return jsonify({"error": "message required"}), 400

    message = raw_text(data.get("message"), "message", 2000)
    history = data.get("history", [])

    if history is None:
        history = []

    if not isinstance(history, list):
        raise ValidationError("history must be an array", "history")

    normalized_history = []
    for item in history[-15:]:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        content = item.get("text") or item.get("content")

        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            normalized_history.append({
                "role": role,
                "text": content.strip()[:1500],
            })

    try:
        reply = get_gemini_reply(message, normalized_history)

        if session_id:
            threading.Thread(
                target=save_chat_log,
                args=(session_id, message, reply),
                daemon=True,
            ).start()

        return jsonify({"reply": reply, "success": True})

    except Exception as exc:
        msg = str(exc or "")
        lowered = msg.lower()

        if isinstance(exc, ValueError) and msg == "missing_key":
            return jsonify({
                "error": "AI assistant is temporarily unavailable.",
                "message": "AI service unavailable",
            }), 503

        if any(token in lowered for token in ("api key", "403", "invalid", "blocked", "leaked")):
            return jsonify({
                "error": "AI assistant is temporarily unavailable.",
                "message": "AI service unavailable",
            }), 503

        if any(token in lowered for token in ("429", "quota")):
            return jsonify({"error": "Too many requests. Please wait."}), 429

        current_app.logger.error(
            "Gemini concierge error: %s",
            exc,
            exc_info=True,
        )
        return jsonify({
            "error": "AI assistant is temporarily unavailable.",
            "message": "AI service unavailable",
        }), 500
