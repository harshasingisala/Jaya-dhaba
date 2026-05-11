from __future__ import annotations

import json
import logging
import queue
import threading
import time
import uuid
import weakref
from dataclasses import dataclass, field


@dataclass(eq=False)
class Subscriber:
    topic: str
    events: queue.Queue = field(default_factory=lambda: queue.Queue(maxsize=100))
    created_at: float = field(default_factory=time.monotonic)
    last_heartbeat: float = field(default_factory=time.monotonic)


class EventBroker:
    def __init__(self):
        self._lock = threading.RLock()
        self._subscribers: dict[str, set[Subscriber]] = {}
        self._cleanup_interval = 30  # seconds
        self._last_cleanup = time.monotonic()
        self._sequence = 0

    def subscribe(self, topic: str) -> Subscriber:
        subscriber = Subscriber(topic=topic)
        with self._lock:
            self._subscribers.setdefault(topic, set()).add(subscriber)
            # Clean up dead subscribers every 30s
            now = time.monotonic()
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup_dead_subscribers()
                self._last_cleanup = now
        return subscriber

    def unsubscribe(self, subscriber: Subscriber) -> None:
        """Called when client disconnects or stream ends."""
        with self._lock:
            subscribers = self._subscribers.get(subscriber.topic)
            if subscribers:
                subscribers.discard(subscriber)
                if not subscribers:
                    self._subscribers.pop(subscriber.topic, None)
            # Also clean up any other dead subscribers while we have the lock
            self._cleanup_dead_subscribers()

    def _cleanup_dead_subscribers(self) -> None:
        """Remove subscribers with full queues (clients not reading)."""
        now = time.monotonic()
        stale_threshold = 60  # seconds without heartbeat
        cleaned = 0
        
        for topic in list(self._subscribers.keys()):
            subscribers = self._subscribers[topic]
            for sub in list(subscribers):
                # If queue is full for 60+ seconds, client is dead (not reading)
                if now - sub.last_heartbeat > stale_threshold:
                    try:
                        # Try to push a test message — if it fails, queue is full
                        sub.events.put_nowait(None)
                        sub.events.get_nowait()  # Remove test message
                    except queue.Full:
                        # Client not reading — remove it
                        subscribers.discard(sub)
                        cleaned += 1
            
            if not subscribers:
                self._subscribers.pop(topic, None)
        
        if cleaned > 0:
            logging.getLogger(__name__).debug(f"Cleaned up {cleaned} stale SSE subscribers")

    def publish(self, topic: str, event: str, payload: dict) -> None:
        with self._lock:
            self._sequence += 1
            event_id = f"{int(time.time())}-{self._sequence}"
            envelope = {"id": event_id, "event": event, "data": payload, "ts": int(time.time())}
            encoded = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False)
            targets = list(self._subscribers.get(topic, set()))
            targets.extend(self._subscribers.get("*", set()))
        
        for subscriber in targets:
            try:
                subscriber.events.put_nowait(encoded)
                subscriber.last_heartbeat = time.monotonic()  # Update heartbeat on successful write
            except queue.Full:
                try:
                    # Queue full — drop oldest event, add new one
                    subscriber.events.get_nowait()
                    subscriber.events.put_nowait(encoded)
                    subscriber.last_heartbeat = time.monotonic()
                except queue.Empty:
                    logging.getLogger(__name__).warning(
                        "event_broker_queue_drop_failed",
                        extra={"topic": topic, "event": event, "subscriber_age": time.monotonic() - subscriber.created_at}
                    )


broker = EventBroker()


def order_topic_id(value) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return str(value)


def sse_format(event: str, payload: dict | str, event_id: str | None = None) -> str:
    data = payload if isinstance(payload, str) else json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    id_line = f"id: {event_id}\n" if event_id else ""
    return f"{id_line}event: {event}\ndata: {data}\n\n"


def stream_topic(topic: str, heartbeat_seconds: int = 15):
    """Stream SSE events for a topic. Properly cleans up on disconnect."""
    subscriber = broker.subscribe(topic)
    logger = logging.getLogger(__name__)
    
    try:
        yield sse_format("connected", {"topic": topic})
        logger.debug(f"SSE stream opened: {topic}")
        
        while True:
            try:
                encoded = subscriber.events.get(timeout=heartbeat_seconds)
                if encoded is None:  # Cleanup sentinel
                    break
                envelope = json.loads(encoded)
                yield sse_format(envelope["event"], envelope["data"], envelope.get("id"))
            except queue.Empty:
                # Heartbeat
                subscriber.last_heartbeat = time.monotonic()
                yield sse_format("ping", {"ts": int(time.time())})
    except GeneratorExit:
        # Client disconnected
        logger.debug(f"SSE stream closed: {topic}")
    except Exception as e:
        logger.error(f"SSE stream error: {topic} — {e}")
    finally:
        # CRITICAL: Must unsubscribe to avoid memory leak
        broker.unsubscribe(subscriber)
        logger.debug(f"SSE unsubscribed: {topic}")
