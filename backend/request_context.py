from __future__ import annotations

import secrets

from flask import current_app, request


def get_real_ip() -> str:
    if current_app.config.get("REQUIRE_CLOUDFLARE_TUNNEL_SECRET"):
        expected = current_app.config.get("CLOUDFLARE_TUNNEL_SECRET", "")
        provided = request.headers.get("X-Cloudflare-Secret", "")
        if expected and secrets.compare_digest(provided, expected):
            return request.headers.get("CF-Connecting-IP") or request.remote_addr or "unknown"
    return request.remote_addr or "unknown"
