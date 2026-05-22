from __future__ import annotations

import threading
import time
import os
from collections import deque

from flask import jsonify, request


_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = {}

DEFAULT_LIMIT = (500, 60)
ROUTE_LIMITS: dict[tuple[str, str], tuple[int, int]] = {
    ("GET", "/api/menu"): (200, 60),
    ("GET", "/api/orders/status"): (200, 60),
    ("GET", "/api/admin/stats"): (120, 60),
    ("GET", "/api/admin/orders"): (120, 60),
    ("GET", "/api/admin/pause-orders"): (120, 60),
    ("GET", "/api/admin/orders/stats"): (120, 60),
    ("GET", "/api/admin/revenue"): (120, 60),
    ("GET", "/api/health"): (300, 60),
    ("POST", "/api/jaya-concierge"): (30, 60),
    ("POST", "/api/orders"): (60, 60),
    ("GET", "/api/admin/daily-report"): (30, 60),
}


def _prune(bucket: deque[float], now: float, window_seconds: int) -> None:
    cutoff = now - window_seconds
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()


def is_allowed(key: str, max_requests: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _LOCK:
        bucket = _BUCKETS.setdefault(key, deque())
        _prune(bucket, now, window_seconds)
        if len(bucket) >= max_requests:
            return False
        bucket.append(now)
    return True


def enforce_limit(key: str, max_requests: int, window_seconds: int):
    if is_allowed(key, max_requests, window_seconds):
        return None
    return jsonify({"message": "Too many requests"}), 429


def init_rate_limits(app) -> None:
    @app.before_request
    def apply_rate_limits():
        if request.method == "OPTIONS" or request.path.startswith("/socket.io"):
            return None

        runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
        if runtime_env == "development":
            return None

        max_requests, window_seconds = ROUTE_LIMITS.get(
            (request.method, request.path),
            DEFAULT_LIMIT,
        )
        # Render appends the true client IP at the end of X-Forwarded-For; use the last hop to avoid spoofed first values.
        client = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown")
        client_ip = client.split(",")[-1].strip()
        key = f"http:{client_ip}:{request.method}:{request.path}"
        return enforce_limit(key, max_requests, window_seconds)
