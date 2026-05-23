from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta


_lock = threading.RLock()
_inflight: set[str] = set()
_recent_results: dict[str, tuple[datetime, dict]] = {}
MAX_INFLIGHT_ORDERS = int(os.environ.get("MAX_INFLIGHT_ORDERS", "250"))
RESULT_TTL_SECONDS = int(os.environ.get("ORDER_RESULT_TTL_SECONDS", "120"))


def _prune_results(now: datetime) -> None:
    cutoff = now - timedelta(seconds=RESULT_TTL_SECONDS)
    for key, (created_at, _result) in list(_recent_results.items()):
        if created_at < cutoff:
            _recent_results.pop(key, None)


def enqueue_order(order_data: dict, idempotency_key: str):
    now = datetime.utcnow()
    with _lock:
        _prune_results(now)
        if idempotency_key in _recent_results:
            return _recent_results[idempotency_key][1]
        if idempotency_key in _inflight:
            return {"queued": True, "duplicate": True, "position": len(_inflight)}
        if len(_inflight) >= MAX_INFLIGHT_ORDERS:
            return {"queued": False, "error": "Server busy. Try again in 30 seconds."}
        _inflight.add(idempotency_key)
        return {"queued": True, "position": len(_inflight)}


def finish_order(idempotency_key: str, result: dict | None = None):
    with _lock:
        _inflight.discard(idempotency_key)
        if result:
            _recent_results[idempotency_key] = (datetime.utcnow(), result)


@contextmanager
def order_admission(idempotency_key: str):
    admission = enqueue_order({}, idempotency_key)
    try:
        yield admission
    finally:
        if admission.get("queued") and not admission.get("duplicate"):
            finish_order(idempotency_key)


def queue_depth() -> int:
    with _lock:
        return len(_inflight)
