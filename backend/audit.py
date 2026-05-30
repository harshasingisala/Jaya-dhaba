from __future__ import annotations

import logging
import uuid

from flask import g, request

import db
from request_context import get_real_ip


def client_ip() -> str:
    return get_real_ip()


def audit(conn, action: str, entity_type: str, entity_id, payload: dict | None = None, user_id: int | None = None) -> None:
    actor = user_id
    if actor is None:
        current = getattr(g, "current_user", None)
        actor = current.get("id") if isinstance(current, dict) else None
    if isinstance(actor, uuid.UUID):
        actor = str(actor)
    conn.execute(
        """
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, payload, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (actor, action, entity_type, str(entity_id), db.encode_json(payload or {}), client_ip(), request.headers.get("User-Agent", ""), db.utc_now()),
    )


def audit_out_of_band(database_url: str, action: str, entity_type: str, entity_id, payload: dict | None = None, user_id: int | None = None) -> None:
    try:
        with db.transaction(database_url) as conn:
            audit(conn, action, entity_type, entity_id, payload, user_id)
    except Exception:
        logging.getLogger(__name__).exception("audit_out_of_band_failed", extra={"action": action, "entity_type": entity_type, "entity_id": str(entity_id)})
        raise
