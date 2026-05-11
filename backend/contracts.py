import hashlib
import html
import json
import re

from flask import request

from database import PAYMENT_MODES, PAYMENT_STATES, RESERVATION_STATUSES, SERVICE_TYPES

CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
PHONE_RE = re.compile(r"^\+?[0-9][0-9\s-]{7,14}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,120}@[^@\s]{1,120}\.[^@\s]{2,20}$")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$")
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$")
TIME_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL_PATH_RE = re.compile(r"^(/[-A-Za-z0-9_./%]+|https://[-A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%]+)$")

ADDON_PRICES = {
    "Extra Ghee": 40,
    "Double Saffron": 60,
    "Heritage Spices": 30,
}


class ValidationError(Exception):
    def __init__(self, message, field=None, status=400):
        super().__init__(message)
        self.message = message
        self.field = field
        self.status = status


def canonical_json(payload):
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def request_fingerprint(payload):
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def payload_dict():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object.")
    return data


def reject_unknown(data, allowed):
    unknown = sorted(set(data) - set(allowed))
    if unknown:
        raise ValidationError(f"Unknown field: {unknown[0]}.", unknown[0])


def require_object(allowed, required=()):
    data = payload_dict()
    reject_unknown(data, allowed)
    for field in required:
        if field not in data:
            raise ValidationError(f"{field} is required.", field)
    return data


def clean_text(value, field, max_len=120, required=True, allow_empty=False):
    if value is None:
        if required:
            raise ValidationError(f"{field} is required.", field)
        return ""
    if not isinstance(value, (str, int, float)):
        raise ValidationError(f"{field} must be text.", field)
    text = CONTROL_CHARS.sub("", str(value)).strip()
    text = re.sub(r"[ \t\r\n]+", " ", text)
    if not text and required and not allow_empty:
        raise ValidationError(f"{field} is required.", field)
    if len(text) > max_len:
        raise ValidationError(f"{field} must be at most {max_len} characters.", field)
    return html.escape(text, quote=True)


def clean_choice(value, field, choices):
    text = clean_text(value, field, max_len=40)
    if text not in choices:
        raise ValidationError(f"Invalid {field}.", field)
    return text


def clean_id(value, field="id", required=True):
    text = clean_text(value, field, max_len=80, required=required)
    if required and not ID_RE.fullmatch(text):
        raise ValidationError(f"Invalid {field}.", field)
    return text


def clean_phone(value, field="phone"):
    text = clean_text(value, field, max_len=20)
    if not PHONE_RE.fullmatch(text):
        raise ValidationError("Enter a valid phone number.", field)
    return text


def clean_email(value, field="email"):
    text = clean_text(value, field, max_len=255).lower()
    if not EMAIL_RE.fullmatch(text):
        raise ValidationError("Enter a valid email address.", field)
    return text


def clean_int(value, field, min_value=0, max_value=1_000_000, required=True):
    if value is None:
        if required:
            raise ValidationError(f"{field} is required.", field)
        return None
    if isinstance(value, bool):
        raise ValidationError(f"{field} must be a number.", field)
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field} must be a number.", field)
    if number < min_value or number > max_value:
        raise ValidationError(f"{field} must be between {min_value} and {max_value}.", field)
    return number


def clean_bool(value, field, required=True):
    if value is None:
        if required:
            raise ValidationError(f"{field} is required.", field)
        return None
    if not isinstance(value, bool):
        raise ValidationError(f"{field} must be true or false.", field)
    return value


def clean_image(value, field="image", required=False):
    text = clean_text(value, field, max_len=255, required=required, allow_empty=not required)
    if not text:
        return ""
    if not URL_PATH_RE.fullmatch(html.unescape(text)):
        raise ValidationError("Image must be a relative path or HTTPS URL.", field)
    return text


def clean_idempotency_key(value):
    text = clean_text(value, "Idempotency-Key", max_len=128)
    if not IDEMPOTENCY_RE.fullmatch(text):
        raise ValidationError("A valid Idempotency-Key header is required.", "Idempotency-Key")
    return text


def parse_order_items(items):
    if not isinstance(items, list) or not items:
        raise ValidationError("Order must contain at least one item.", "items")
    if len(items) > 50:
        raise ValidationError("Order can contain at most 50 items.", "items")

    normalized = []
    allowed = {"id", "qty", "selectedSize", "spiceLevel", "instructions", "addons"}
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValidationError("Each order item must be an object.", f"items.{index}")
        reject_unknown(item, allowed)
        addons = item.get("addons") or []
        if not isinstance(addons, list) or len(addons) > 10:
            raise ValidationError("addons must be a list with at most 10 entries.", f"items.{index}.addons")
        safe_addons = []
        for addon in addons:
            addon_id = clean_text(addon, "addon", max_len=40)
            if addon_id not in ADDON_PRICES:
                raise ValidationError("Invalid addon.", f"items.{index}.addons")
            safe_addons.append(addon_id)

        size = clean_text(item.get("selectedSize", ""), "selectedSize", max_len=10, required=False, allow_empty=True)
        if size and size not in ("half", "full"):
            raise ValidationError("Invalid selectedSize.", f"items.{index}.selectedSize")
        spice = clean_text(item.get("spiceLevel", "Medium"), "spiceLevel", max_len=20, required=False, allow_empty=True) or "Medium"
        if spice not in ("Mild", "Medium", "Hot"):
            raise ValidationError("Invalid spiceLevel.", f"items.{index}.spiceLevel")

        normalized.append(
            {
                "id": clean_id(item.get("id"), f"items.{index}.id"),
                "qty": clean_int(item.get("qty", 1), f"items.{index}.qty", min_value=1, max_value=50),
                "selectedSize": size,
                "spiceLevel": spice,
                "instructions": clean_text(item.get("instructions", ""), "instructions", max_len=200, required=False, allow_empty=True),
                "addons": safe_addons,
            }
        )
    return normalized


def parse_order_payload():
    data = require_object(
        {"customerName", "customerPhone", "tableNumber", "serviceType", "paymentMode", "items", "notes", "subtotal", "tax", "total"},
        {"customerName", "customerPhone", "serviceType", "paymentMode", "items", "subtotal", "tax", "total"},
    )
    return {
        "customerName": clean_text(data.get("customerName"), "customerName"),
        "customerPhone": clean_phone(data.get("customerPhone"), "customerPhone"),
        "tableNumber": clean_text(data.get("tableNumber", ""), "tableNumber", max_len=20, required=False, allow_empty=True),
        "serviceType": clean_choice(data.get("serviceType"), "serviceType", SERVICE_TYPES),
        "paymentMode": clean_choice(data.get("paymentMode"), "paymentMode", PAYMENT_MODES),
        "items": parse_order_items(data.get("items")),
        "notes": clean_text(data.get("notes", ""), "notes", max_len=500, required=False, allow_empty=True),
        "subtotal": clean_int(data.get("subtotal"), "subtotal", min_value=0),
        "tax": clean_int(data.get("tax"), "tax", min_value=0),
        "total": clean_int(data.get("total"), "total", min_value=0),
    }


def parse_reservation_payload():
    data = require_object({"name", "phone", "guests", "date", "time", "note"}, {"name", "phone", "guests", "date", "time"})
    date = clean_text(data.get("date"), "date", max_len=10)
    visit_time = clean_text(data.get("time"), "time", max_len=5)
    if not DATE_RE.fullmatch(date):
        raise ValidationError("Invalid date.", "date")
    if not TIME_RE.fullmatch(visit_time):
        raise ValidationError("Invalid time.", "time")
    return {
        "name": clean_text(data.get("name"), "name"),
        "phone": clean_phone(data.get("phone")),
        "guests": clean_int(data.get("guests"), "guests", min_value=1, max_value=30),
        "date": date,
        "time": visit_time,
        "note": clean_text(data.get("note", ""), "note", max_len=500, required=False, allow_empty=True),
    }


def parse_contact_payload():
    data = require_object({"name", "email", "message"}, {"name", "email", "message"})
    return {
        "name": clean_text(data.get("name"), "name"),
        "email": clean_email(data.get("email")),
        "message": clean_text(data.get("message"), "message", max_len=1000),
    }


def parse_login_payload():
    data = require_object({"username", "password"}, {"username", "password"})
    return {
        "username": clean_text(data.get("username"), "username", max_len=80).lower(),
        "password": str(data.get("password") or ""),
    }


def parse_status_payload(allowed_statuses):
    data = require_object({"status"}, {"status"})
    return clean_choice(data.get("status"), "status", allowed_statuses)


def parse_settings_payload():
    data = require_object({"name", "tagline", "hours", "contact", "status", "address", "taxRate", "currency"}, {"name", "hours", "contact", "status", "address", "taxRate", "currency"})
    currency = clean_text(data.get("currency"), "currency", max_len=10).upper()
    return {
        "name": clean_text(data.get("name"), "name"),
        "tagline": clean_text(data.get("tagline", ""), "tagline", max_len=120, required=False, allow_empty=True),
        "hours": clean_text(data.get("hours"), "hours", max_len=80),
        "contact": clean_phone(data.get("contact"), "contact"),
        "status": clean_text(data.get("status"), "status", max_len=40),
        "address": clean_text(data.get("address"), "address", max_len=200),
        "taxRate": clean_int(data.get("taxRate"), "taxRate", min_value=0, max_value=100),
        "currency": currency,
    }


def parse_menu_payload(partial=False):
    allowed = {"name", "category", "price", "description", "image", "isAvailable"}
    data = require_object(allowed, set() if partial else {"name", "category", "price"})
    if partial and not data:
        raise ValidationError("At least one field is required.")
    parsed = {}
    if "name" in data:
        parsed["name"] = clean_text(data.get("name"), "name")
    if "category" in data:
        parsed["category"] = clean_text(data.get("category"), "category", max_len=60)
    if "price" in data:
        parsed["price"] = clean_int(data.get("price"), "price", min_value=0, max_value=100_000)
    if "description" in data:
        parsed["description"] = clean_text(data.get("description", ""), "description", max_len=300, required=False, allow_empty=True)
    if "image" in data:
        parsed["image"] = clean_image(data.get("image", ""), "image", required=False)
    if "isAvailable" in data:
        parsed["isAvailable"] = clean_bool(data.get("isAvailable"), "isAvailable")
    return parsed


def parse_payment_create_payload():
    data = require_object({"orderId", "amount", "provider", "method"}, {"orderId", "amount", "provider", "method"})
    provider = clean_choice(data.get("provider"), "provider", ("razorpay", "cash", "offline"))
    method = clean_choice(data.get("method"), "method", PAYMENT_MODES)
    return {
        "orderId": clean_id(data.get("orderId"), "orderId"),
        "amount": clean_int(data.get("amount"), "amount", min_value=0),
        "provider": provider,
        "method": method,
    }


def parse_payment_webhook_payload():
    data = require_object({"eventId", "paymentId", "orderId", "providerReference", "result", "amount", "failureReason"}, {"eventId", "paymentId", "orderId", "providerReference", "result", "amount"})
    result = clean_choice(data.get("result"), "result", ("success", "failure"))
    return {
        "eventId": clean_id(data.get("eventId"), "eventId"),
        "paymentId": clean_id(data.get("paymentId"), "paymentId"),
        "orderId": clean_id(data.get("orderId"), "orderId"),
        "providerReference": clean_text(data.get("providerReference"), "providerReference", max_len=120),
        "result": result,
        "amount": clean_int(data.get("amount"), "amount", min_value=0),
        "failureReason": clean_text(data.get("failureReason", ""), "failureReason", max_len=200, required=False, allow_empty=True),
    }


def parse_concierge_payload():
    data = require_object({"sessionId", "message", "history", "language"}, {"sessionId", "message"})
    history = data.get("history", [])
    if not isinstance(history, list) or len(history) > 6:
        raise ValidationError("history must contain at most 6 messages.", "history")
    safe_history = []
    for index, item in enumerate(history):
        if not isinstance(item, dict):
            raise ValidationError("history entries must be objects.", f"history.{index}")
        reject_unknown(item, {"role", "text"})
        safe_history.append(
            {
                "role": clean_choice(item.get("role"), f"history.{index}.role", ("user", "model")),
                "text": clean_text(item.get("text"), f"history.{index}.text", max_len=500),
            }
        )
    language = clean_text(data.get("language", "en"), "language", max_len=5, required=False, allow_empty=True) or "en"
    return {
        "sessionId": clean_id(data.get("sessionId"), "sessionId"),
        "message": clean_text(data.get("message"), "message", max_len=500),
        "history": safe_history,
        "language": language,
    }
