import json
import logging
import re
from datetime import datetime, timezone


security_logger = logging.getLogger("security")

CRITICAL_EVENTS = {
    "payment_replay",
    "bad_payment_sig",
    "csrf_attempt",
    "admin_takeover_attempt",
}


def _safe_detail(detail) -> str:
    text = str(detail or "").replace("\r", " ").replace("\n", " ").strip()
    if "@" in text:
        name, _, domain = text.partition("@")
        text = f"{name[:3]}***@{domain}" if domain else f"{name[:3]}***"
    digits = re.sub(r"\D", "", text)
    if len(digits) >= 8:
        text = re.sub(r"\d(?=\d{4})", "*", text)
    return text[:500]


def structured_log(event, data=None):
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "jaya-dhaba-backend",
        "event": event,
        **(data or {}),
    }
    print(json.dumps(payload, default=str))


def log_security_event(event, ip, detail=""):
    safe_detail = _safe_detail(detail)
    level = "CRITICAL" if event in CRITICAL_EVENTS else "WARNING"
    log_method = security_logger.critical if level == "CRITICAL" else security_logger.warning
    log_method(
        "[SECURITY] %s | IP: %s | Detail: %s",
        event,
        ip or "unknown",
        safe_detail,
    )
    structured_log(
        "security_event",
        {
            "severity": level,
            "security_event": event,
            "ip": ip or "unknown",
            "detail": safe_detail,
        },
    )
