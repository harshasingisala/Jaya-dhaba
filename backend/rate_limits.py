from __future__ import annotations

import threading
import time
from collections import deque

from flask import jsonify


_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = {}


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
