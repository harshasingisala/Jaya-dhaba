from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any


class TTLCache:
    def __init__(self, max_items: int = 128, ttl_seconds: int = 60):
        self.max_items = max_items
        self.ttl_seconds = ttl_seconds
        self._lock = threading.RLock()
        self._items: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str):
        now = time.monotonic()
        with self._lock:
            item = self._items.get(key)
            if not item:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._items.pop(key, None)
                return None
            self._items.move_to_end(key)
            return value

    def set(self, key: str, value):
        with self._lock:
            self._items[key] = (time.monotonic() + self.ttl_seconds, value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)

    def invalidate(self, prefix: str | None = None):
        with self._lock:
            if prefix is None:
                self._items.clear()
                return
            for key in list(self._items.keys()):
                if key.startswith(prefix):
                    self._items.pop(key, None)


menu_cache = TTLCache(max_items=64, ttl_seconds=30)
status_cache = TTLCache(max_items=8, ttl_seconds=3)
stats_cache = TTLCache(max_items=16, ttl_seconds=5)
orders_cache = TTLCache(max_items=128, ttl_seconds=2)
