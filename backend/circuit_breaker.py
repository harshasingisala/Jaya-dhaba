from __future__ import annotations

from datetime import datetime, timedelta
from enum import Enum

import eventlet


class State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(self, name, failure_threshold=5, recovery_timeout=30):
        self.name = name
        self.state = State.CLOSED
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.last_failure = None

    def call(self, func, *args, **kwargs):
        if self.state == State.OPEN:
            if self.last_failure and datetime.utcnow() - self.last_failure > timedelta(seconds=self.recovery_timeout):
                self.state = State.HALF_OPEN
            else:
                raise RuntimeError(f"Circuit {self.name} is OPEN. Service temporarily unavailable.")
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise

    def _on_success(self):
        self.failure_count = 0
        self.state = State.CLOSED

    def _on_failure(self):
        self.failure_count += 1
        self.last_failure = datetime.utcnow()
        if self.failure_count >= self.failure_threshold:
            self.state = State.OPEN


def query_with_timeout(func, timeout_secs=10):
    timeout = eventlet.Timeout(timeout_secs)
    try:
        with timeout:
            return func()
    except eventlet.Timeout as exc:
        if exc is timeout:
            raise TimeoutError("Query timed out") from exc
        raise


db_breaker = CircuitBreaker("database", failure_threshold=5, recovery_timeout=30)
gemini_breaker = CircuitBreaker("gemini", failure_threshold=3, recovery_timeout=30)
