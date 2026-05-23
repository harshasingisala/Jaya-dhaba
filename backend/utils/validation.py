import ipaddress
import os
import re
from urllib.parse import urlparse


FORBIDDEN_NOSQL_OPERATORS = {"$where", "$gt", "$lt", "$ne", "$regex"}

ALLOWED_IMAGE_HOSTS = {
    "images.unsplash.com",
    "res.cloudinary.com",
    "i.imgur.com",
    "storage.googleapis.com",
    "upload.wikimedia.org",
}

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
}


def validate_lengths(**fields):
    limits = {
        "name": 100,
        "email": 200,
        "phone": 20,
        "message": 2000,
        "subject": 200,
        "password": 128,
    }
    for field, value in fields.items():
        if value and field in limits and len(str(value)) > limits[field]:
            return False, f"{field} is too long"
    return True, None


def contains_forbidden_nosql_operator(value) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            if str(key) in FORBIDDEN_NOSQL_OPERATORS:
                return True
            if contains_forbidden_nosql_operator(nested):
                return True
    if isinstance(value, list):
        return any(contains_forbidden_nosql_operator(item) for item in value)
    return False


def extract_fields(data: dict, allowed: list[str] | set[str]) -> dict:
    if not isinstance(data, dict):
        return {}
    allowed_set = set(allowed)
    return {key: value for key, value in data.items() if key in allowed_set}


def safe_path(filename: str) -> str:
    filename = os.path.basename(str(filename or ""))
    return re.sub(r"[^a-zA-Z0-9._-]", "", filename)


def sanitize_header_value(value: str) -> str:
    return str(value or "").replace("\r", "").replace("\n", "")


def safe_redirect_url(url: str | None) -> str:
    if not url:
        return "/"
    value = str(url)
    if value.startswith("/") and not value.startswith("//") and "://" not in value:
        return value
    return "/"


def looks_like_sql_injection(value) -> bool:
    text = str(value or "")
    return bool(
        re.search(r"(?i)'\s*(or|and)\s+\d+\s*=\s*\d+", text)
        or re.search(r"(?i);\s*(drop|select|insert|update|delete|alter)\b", text)
        or "--" in text
        or "/*" in text
        or "*/" in text
    )


def _host_is_private(hostname: str) -> bool:
    host = hostname.lower().rstrip(".")
    if host in BLOCKED_HOSTNAMES or host.endswith(".localhost") or host.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(
        (
            address.is_loopback,
            address.is_private,
            address.is_link_local,
            address.is_reserved,
            address.is_multicast,
        )
    )


def validate_image_url(url: str, *, strict_allowlist: bool = False) -> bool:
    if not url:
        return True
    try:
        parsed = urlparse(str(url).strip())
    except Exception:
        return False
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    hostname = parsed.hostname.lower().rstrip(".")
    if _host_is_private(hostname):
        return False
    if strict_allowlist and hostname not in ALLOWED_IMAGE_HOSTS:
        return False
    return True
