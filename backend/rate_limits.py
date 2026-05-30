from __future__ import annotations

import threading
import time
import os
from collections import deque

from flask import jsonify, make_response, request
from request_context import get_real_ip


_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = {}
_REDIS_CLIENT = None
_REDIS_DISABLED = False

DEFAULT_LIMIT = (500, 60)
ROUTE_LIMITS: dict[tuple[str, str], tuple[int, int]] = {
    ("GET", "/api/csrf-token"): (60, 60),
    ("GET", "/api/menu"): (200, 60),
    ("GET", "/api/orders/status"): (200, 60),
    ("GET", "/api/admin/stats"): (120, 60),
    ("GET", "/api/admin/orders"): (120, 60),
    ("GET", "/api/admin/pause-orders"): (120, 60),
    ("GET", "/api/admin/orders/stats"): (120, 60),
    ("GET", "/api/admin/revenue"): (120, 60),
    ("GET", "/api/health"): (300, 60),
    ("POST", "/api/auth/login"): (5, 60),
    ("POST", "/api/auth/register"): (10, 60 * 60),
    ("POST", "/api/auth/forgot-password"): (3, 60 * 60),
    ("POST", "/api/contact"): (10, 300),
    ("POST", "/api/reservations"): (10, 300),
    ("POST", "/api/chat"): (20, 60),
    ("POST", "/api/jaya-concierge"): (20, 60),
    ("POST", "/api/orders"): (30, 60),
    ("POST", "/api/orders/<uuid:order_id>/addons"): (20, 60),
    ("GET", "/api/admin/daily-report"): (30, 60),
}


def _redis():
    global _REDIS_CLIENT, _REDIS_DISABLED
    if _REDIS_DISABLED:
        return None
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return None
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    try:
        import redis

        _REDIS_CLIENT = redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        _REDIS_CLIENT.ping()
        return _REDIS_CLIENT
    except Exception:
        _REDIS_DISABLED = True
        return None


def _prune(bucket: deque[float], now: float, window_seconds: int) -> None:
    cutoff = now - window_seconds
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()


def is_allowed(key: str, max_requests: int, window_seconds: int) -> bool:
    client = _redis()
    if client is not None:
        redis_key = f"jaya:{key}"
        try:
            pipe = client.pipeline()
            pipe.incr(redis_key)
            pipe.expire(redis_key, window_seconds, nx=True)
            count, _ = pipe.execute()
            return int(count) <= max_requests
        except Exception:
            pass

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
    response = make_response(jsonify({
        "success": False,
        "message": "Too many requests",
    }), 429)
    response.headers["Retry-After"] = str(window_seconds)
    return response


def request_rule() -> str:
    rule = getattr(request, "url_rule", None)
    return rule.rule if rule is not None else request.path


def request_limit() -> tuple[int, int]:
    return ROUTE_LIMITS.get((request.method, request_rule()), DEFAULT_LIMIT)


def init_rate_limits(app) -> None:
    @app.before_request
    def apply_rate_limits():
        if request.method == "OPTIONS" or request.path.startswith("/socket.io"):
            return None

        runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
        if runtime_env == "development":
            return None

        max_requests, window_seconds = request_limit()
        client_ip = get_real_ip()
        key = f"http:{client_ip}:{request.method}:{request.path}"
        return enforce_limit(key, max_requests, window_seconds)
