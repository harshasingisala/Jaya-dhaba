from __future__ import annotations

import json
import secrets
import threading
import time
import uuid

from flask import Blueprint, current_app, jsonify, request

import db
from auth import redis_client, require_role
from events import broker
from qr_sessions import get_table_session
from validators import raw_text


bp = Blueprint("waiter", __name__, url_prefix="/api")
VALID_REASONS = {"need_assistance", "need_water", "have_question", "requesting_bill"}
_CALLS: dict[str, list[dict]] = {}
_CALLS_LOCK = threading.Lock()
_CALL_TTL_SECONDS = 60 * 60


def _table_id_variants(table_id: str) -> tuple[str, str]:
    try:
        parsed = uuid.UUID(str(table_id))
    except ValueError:
        return str(table_id), str(table_id)
    return str(parsed), parsed.hex


def _table_payload(table_id: str) -> dict | None:
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        row = conn.execute("SELECT id, label FROM tables WHERE id IN (?, ?)", _table_id_variants(table_id)).fetchone()
    if not row:
        return None
    return {"id": str(row["id"]), "label": row["label"]}


def _call_key(table_id: str) -> str:
    return f"waiter_calls:{table_id}"


def _runtime_env() -> str:
    import os

    return (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()


def _store_call(call: dict) -> None:
    client = redis_client()
    if client is not None:
        key = _call_key(call["table_id"])
        client.rpush(key, json.dumps(call))
        client.expire(key, _CALL_TTL_SECONDS)
        return
    if _runtime_env() == "production":
        raise RuntimeError("Waiter call service unavailable")
    with _CALLS_LOCK:
        _CALLS.setdefault(call["table_id"], []).append(call)


def _load_calls() -> list[dict]:
    client = redis_client()
    if client is not None:
        calls = []
        for raw_key in client.scan_iter("waiter_calls:*"):
            key = raw_key.decode("utf-8") if isinstance(raw_key, bytes) else str(raw_key)
            for raw in client.lrange(key, 0, -1):
                text = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
                try:
                    calls.append(json.loads(text))
                except Exception:
                    continue
        return calls
    with _CALLS_LOCK:
        return [dict(call) for calls in _CALLS.values() for call in calls]


def _replace_table_calls(table_id: str, calls: list[dict]) -> None:
    client = redis_client()
    if client is not None:
        key = _call_key(table_id)
        client.delete(key)
        if calls:
            client.rpush(key, *[json.dumps(call) for call in calls])
            client.expire(key, _CALL_TTL_SECONDS)
        return
    with _CALLS_LOCK:
        _CALLS[table_id] = calls


def _resolve_call(call_id: str) -> dict | None:
    calls = _load_calls()
    by_table: dict[str, list[dict]] = {}
    resolved = None
    for call in calls:
        if call.get("id") == call_id and call.get("status") == "pending":
            call = {**call, "status": "resolved", "resolved_at": int(time.time())}
            resolved = call
        by_table.setdefault(str(call.get("table_id")), []).append(call)
    if not resolved:
        return None
    for table_id, table_calls in by_table.items():
        _replace_table_calls(table_id, table_calls)
    return resolved


def _pending_calls() -> list[dict]:
    return sorted(
        [call for call in _load_calls() if call.get("status") == "pending"],
        key=lambda call: int(call.get("created_at") or 0),
    )


def _calls_for_today(include_resolved: bool = False) -> list[dict]:
    start_of_day = int(time.time()) - (int(time.time()) % 86400)
    rows = []
    for call in _load_calls():
        if int(call.get("created_at") or 0) < start_of_day:
            continue
        if not include_resolved and call.get("status") != "pending":
            continue
        row = dict(call)
        if row.get("status") == "resolved" and row.get("resolved_at"):
            row["time_to_resolve_seconds"] = max(0, int(row["resolved_at"]) - int(row.get("created_at") or 0))
        rows.append(row)
    return sorted(rows, key=lambda call: int(call.get("created_at") or 0))


def _broadcast(event: str, call: dict) -> None:
    broker.publish("kitchen", event, call)


@bp.post("/waiter/call")
def call_waiter():
    data = request.get_json(silent=True) or {}
    session_id = raw_text(data.get("table_session"), "table_session", 200)
    reason = raw_text(data.get("reason"), "reason", 80)
    if reason not in VALID_REASONS:
        return jsonify({"success": False, "message": "Invalid waiter call reason"}), 400
    session_payload = get_table_session(session_id)
    if not session_payload:
        return jsonify({"success": False, "message": "Table session expired. Please scan the QR code again."}), 403
    table = _table_payload(str(session_payload.get("table_id") or ""))
    if not table:
        return jsonify({"success": False, "message": "Table not found"}), 404
    call = {
        "id": secrets.token_urlsafe(16),
        "table_id": table["id"],
        "table_name": table["label"],
        "reason": reason,
        "status": "pending",
        "created_at": int(time.time()),
    }
    try:
        _store_call(call)
    except RuntimeError:
        return jsonify({"success": False, "message": "Waiter call service unavailable"}), 503
    _broadcast("waiter_call", call)
    return jsonify({"success": True, "call_id": call["id"], "data": call})


@bp.get("/waiter/calls")
@require_role("staff")
def list_waiter_calls():
    include_resolved = str(request.args.get("include_resolved", "")).lower() in {"1", "true", "yes"}
    calls = _calls_for_today(include_resolved=include_resolved)
    return jsonify({"success": True, "calls": calls, "data": calls})


@bp.patch("/waiter/calls/<call_id>/resolve")
@require_role("staff")
def resolve_waiter_call(call_id: str):
    resolved = _resolve_call(call_id)
    if not resolved:
        return jsonify({"success": False, "message": "Waiter call not found"}), 404
    _broadcast("waiter_call_resolved", resolved)
    return jsonify({"success": True, "call": resolved, "data": resolved})
