from __future__ import annotations

from flask import request


def get_real_ip() -> str:
    return request.headers.get("CF-Connecting-IP") or request.remote_addr or "unknown"
