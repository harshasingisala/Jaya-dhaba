from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import uuid

from flask import Blueprint, current_app, g, jsonify, request
from razorpay.errors import BadRequestError, GatewayError, ServerError
from sqlalchemy.exc import IntegrityError as SAIntegrityError

import db
from audit import audit
from auth import ROLE_RANK, require_role, request_ip
from events import broker, order_topic_id
from rate_limits import enforce_limit
from validators import ValidationError, body, integer, raw_text, reject_unknown


bp = Blueprint("payments", __name__, url_prefix="/api")

STAFF_PAYMENT_ROLES = {"staff", "manager", "owner", "admin"}


def razorpay_client():
    import razorpay

    return razorpay.Client(auth=(current_app.config["RAZORPAY_KEY_ID"], current_app.config["RAZORPAY_KEY_SECRET"]))


def _str_id(value) -> str:
    return str(value) if value is not None else ""


def _same_id(left, right) -> bool:
    return _str_id(left).replace("-", "") == _str_id(right).replace("-", "")


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _order_audit_payload(order, **extra) -> dict:
    payload = {
        "order_id": _str_id(order["id"]) if order else None,
        "order_number": order["order_number"] if order else None,
    }
    payload.update({k: v for k, v in extra.items() if v is not None})
    return payload


def find_order_for_payment(conn, order_id: str | None, order_number: int | None):
    order = None
    if order_id:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not order:
            try:
                order = conn.execute("SELECT * FROM orders WHERE id = ?", (uuid.UUID(order_id).hex,)).fetchone()
            except (TypeError, ValueError):
                order = None
    if not order and order_number is not None:
        order = conn.execute("SELECT * FROM orders WHERE order_number = ?", (order_number,)).fetchone()
    return order


def _find_order_by_razorpay_order(conn, razorpay_order_id: str):
    if not razorpay_order_id:
        return None
    row = conn.execute(
        """
        SELECT o.*
        FROM orders o
        JOIN payments p ON p.order_id = o.id
        WHERE p.razorpay_order_id = ?
        LIMIT 1
        """,
        (razorpay_order_id,),
    ).fetchone()
    return row


def _payment_for_order(conn, order_id):
    return conn.execute("SELECT * FROM payments WHERE order_id = ? LIMIT 1", (order_id,)).fetchone()


def _completed_payment_for_order(conn, order_id):
    return conn.execute(
        "SELECT * FROM payments WHERE order_id = ? AND status = 'completed' LIMIT 1",
        (order_id,),
    ).fetchone()


def _payment_by_razorpay_payment_id(conn, payment_id: str):
    if not payment_id:
        return None
    return conn.execute(
        "SELECT * FROM payments WHERE razorpay_payment_id = ? LIMIT 1",
        (payment_id,),
    ).fetchone()


def _ensure_payment_access(order) -> None:
    user = getattr(g, "current_user", None)
    if user and user.get("role") in STAFF_PAYMENT_ROLES:
        return
    if order["user_id"]:
        if not user or not _same_id(order["user_id"], user.get("id")):
            raise ValidationError("Forbidden", "our_order_id", 403)


def _ensure_order_payable(conn, order) -> None:
    if order["status"] != "pending":
        raise ValidationError("Order is not payable", "our_order_id", 409)
    paid = _completed_payment_for_order(conn, order["id"])
    if paid:
        raise ValidationError("Order already paid", "our_order_id", 409)


def _validate_amount(order, amount_rupees: int) -> None:
    expected = _safe_int(order["total"])
    if amount_rupees <= 0 or amount_rupees != expected:
        raise ValidationError("Payment amount does not match order total", "amount", 409)


def _record_pending_attempt(conn, *, order, razorpay_order_id: str, amount_rupees: int):
    existing = _payment_for_order(conn, order["id"])
    if existing:
        if existing["status"] == "completed":
            raise ValidationError("Order already paid", "our_order_id", 409)
        conn.execute(
            """
            UPDATE payments
            SET razorpay_order_id = ?, razorpay_payment_id = NULL, amount = ?,
                status = 'pending', failure_reason = NULL
            WHERE id = ?
            """,
            (razorpay_order_id, amount_rupees, existing["id"]),
        )
        return

    conn.execute(
        """
        INSERT INTO payments (
            id, order_id, stripe_payment_intent_id, stripe_event_id,
            razorpay_payment_id, razorpay_order_id, amount, status, failure_reason, created_at
        ) VALUES (?, ?, NULL, NULL, NULL, ?, ?, 'pending', NULL, ?)
        """,
        (uuid.uuid4().hex, order["id"], razorpay_order_id, amount_rupees, db.utc_now()),
    )


def _mark_payment_failed(conn, *, order, razorpay_order_id: str, payment_id: str, amount_rupees: int, reason: str):
    existing = _payment_for_order(conn, order["id"])
    if existing:
        if existing["status"] == "completed":
            return {"status": "already_completed", "order_id": order["id"]}
        if existing["razorpay_order_id"] and existing["razorpay_order_id"] != razorpay_order_id:
            return {"status": "stale_failed_event", "order_id": order["id"]}
        conn.execute(
            """
            UPDATE payments
            SET razorpay_order_id = ?, razorpay_payment_id = ?, amount = ?,
                status = 'failed', failure_reason = ?
            WHERE id = ?
            """,
            (razorpay_order_id, payment_id or existing["razorpay_payment_id"], amount_rupees, reason, existing["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO payments (
                id, order_id, stripe_payment_intent_id, stripe_event_id,
                razorpay_payment_id, razorpay_order_id, amount, status, failure_reason, created_at
            ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'failed', ?, ?)
            """,
            (uuid.uuid4().hex, order["id"], payment_id or None, razorpay_order_id, amount_rupees, reason, db.utc_now()),
        )
    audit(
        conn,
        "payment.failed",
        "order",
        order["id"],
        _order_audit_payload(order, razorpay_order_id=razorpay_order_id, razorpay_payment_id=payment_id, reason=reason),
    )
    return {"status": "failed", "order_id": order["id"]}


def apply_success_payment(conn, *, order, razorpay_payment_id: str, razorpay_order_id: str, amount: int, source: str):
    _validate_amount(order, amount)

    existing_reference = _payment_by_razorpay_payment_id(conn, razorpay_payment_id)
    if existing_reference:
        if _same_id(existing_reference["order_id"], order["id"]):
            return {"status": "already_processed", "order_id": order["id"]}
        raise ValidationError("Payment reference already used", "razorpay_payment_id", 409)

    completed = _completed_payment_for_order(conn, order["id"])
    if completed:
        return {"status": "already_processed", "order_id": order["id"]}

    if order["status"] != "pending":
        raise ValidationError("Order is not payable", "our_order_id", 409)

    attempt = _payment_for_order(conn, order["id"])
    if attempt and attempt["razorpay_order_id"] and attempt["razorpay_order_id"] != razorpay_order_id:
        raise ValidationError("Payment order does not match this restaurant order", "razorpay_order_id", 409)
    if attempt and _safe_int(attempt["amount"]) != amount:
        raise ValidationError("Payment amount does not match order total", "amount", 409)

    if attempt:
        conn.execute(
            """
            UPDATE payments
            SET razorpay_payment_id = ?, razorpay_order_id = ?, amount = ?,
                status = 'completed', failure_reason = NULL
            WHERE id = ?
            """,
            (razorpay_payment_id, razorpay_order_id, amount, attempt["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO payments (
                id, order_id, stripe_payment_intent_id, stripe_event_id,
                razorpay_payment_id, razorpay_order_id, amount, status, failure_reason, created_at
            ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 'completed', NULL, ?)
            """,
            (uuid.uuid4().hex, order["id"], razorpay_payment_id, razorpay_order_id, amount, db.utc_now()),
        )

    conn.execute("UPDATE orders SET status = 'confirmed', updated_at = ? WHERE id = ?", (db.utc_now(), order["id"]))
    points = max(0, amount // 10)
    if order["user_id"] and points > 0:
        user_row = conn.execute("SELECT loyalty_points FROM users WHERE id = ?", (order["user_id"],)).fetchone()
        balance = int(user_row["loyalty_points"]) + points
        conn.execute("UPDATE users SET loyalty_points = ? WHERE id = ?", (balance, order["user_id"]))
        conn.execute(
            """
            INSERT INTO loyalty_ledger (user_id, order_id, delta, balance_after, reason, created_at)
            VALUES (?, ?, ?, ?, 'earn', ?)
            """,
            (order["user_id"], order["id"], points, balance, db.utc_now()),
        )
    audit(
        conn,
        "payment.completed",
        "order",
        order["id"],
        _order_audit_payload(
            order,
            source=source,
            razorpay_payment_id=razorpay_payment_id,
            razorpay_order_id=razorpay_order_id,
            amount=amount,
        ),
    )
    return {"status": "processed", "order_id": order["id"]}


def _publish_payment_update(order_id, event_status: str = "confirmed") -> None:
    normalized_order_id = order_topic_id(order_id)
    payload = {"id": normalized_order_id, "status": event_status}
    broker.publish("kitchen", "order.updated", payload)
    broker.publish(f"order:{normalized_order_id}", "order.updated", payload)


@bp.post("/payments/create-order")
def create_payment_order():
    try:
        user = getattr(g, "current_user", None)
        rate_user = user["id"] if user else "guest"
        rate = enforce_limit(f"payments:create:{rate_user}:{request_ip()}", 30, 60)
        if rate is not None:
            return rate
        if not current_app.config["RAZORPAY_KEY_ID"] or not current_app.config["RAZORPAY_KEY_SECRET"]:
            return jsonify({"success": False, "message": "Payments are unavailable"}), 503

        data = body()
        reject_unknown(data, {"order_id", "order_number", "amount", "total", "customer_name"})
        order_id = raw_text(data.get("order_id"), "order_id", 120, required=False, allow_empty=True) or None
        order_number = integer(data.get("order_number"), "order_number", 1, required=False) or None
        customer_name = raw_text(data.get("customer_name", ""), "customer_name", 200, required=False, allow_empty=True)

        with db.connect(current_app.config["DATABASE_URL"]) as conn:
            order = find_order_for_payment(conn, order_id, order_number)
            if not order:
                return jsonify({"success": False, "message": "Order not found"}), 404
            _ensure_payment_access(order)
            _ensure_order_payable(conn, order)
            amount_rupees = _safe_int(order["total"])
            if amount_rupees <= 0:
                return jsonify({"success": False, "message": "Order total is invalid"}), 409
            existing = _payment_for_order(conn, order["id"])
            if (
                existing
                and existing["status"] == "pending"
                and existing["razorpay_order_id"]
                and _safe_int(existing["amount"]) == amount_rupees
            ):
                current_app.logger.info(
                    "payment_order_reused",
                    extra=_order_audit_payload(order, razorpay_order_id=existing["razorpay_order_id"]),
                )
                return jsonify(
                    {
                        "success": True,
                        "razorpay_order_id": existing["razorpay_order_id"],
                        "amount": amount_rupees * 100,
                        "currency": "INR",
                        "key_id": current_app.config["RAZORPAY_KEY_ID"],
                    }
                )

        client = razorpay_client()
        amount_paise = amount_rupees * 100
        created = client.order.create(
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": str(order["order_number"]),
                "notes": {
                    "our_order_id": str(order["order_number"]),
                    "order_id": _str_id(order["id"]),
                    "order_uuid": _str_id(order["id"]),
                    "order_number": str(order["order_number"]),
                    "customer_name": customer_name,
                },
            }
        )
        razorpay_order_id = created.get("id")
        if not razorpay_order_id:
            current_app.logger.error("razorpay_create_order_missing_id", extra=_order_audit_payload(order))
            return jsonify({"success": False, "message": "Payment gateway returned an invalid order response"}), 502

        try:
            with db.transaction(current_app.config["DATABASE_URL"]) as conn:
                fresh_order = find_order_for_payment(conn, order_id, order_number)
                if not fresh_order:
                    return jsonify({"success": False, "message": "Order not found"}), 404
                _ensure_order_payable(conn, fresh_order)
                _record_pending_attempt(conn, order=fresh_order, razorpay_order_id=razorpay_order_id, amount_rupees=amount_rupees)
                audit(
                    conn,
                    "payment.order_created",
                    "order",
                    fresh_order["id"],
                    _order_audit_payload(fresh_order, razorpay_order_id=razorpay_order_id, amount=amount_paise),
                )
        except (sqlite3.IntegrityError, SAIntegrityError):
            with db.connect(current_app.config["DATABASE_URL"]) as conn:
                existing = _payment_for_order(conn, order["id"])
                if existing and existing["status"] == "pending" and existing["razorpay_order_id"]:
                    razorpay_order_id = existing["razorpay_order_id"]
                else:
                    raise

        current_app.logger.info(
            "payment_order_created",
            extra=_order_audit_payload(order, razorpay_order_id=razorpay_order_id, amount=amount_paise),
        )
        return jsonify(
            {
                "success": True,
                "razorpay_order_id": razorpay_order_id,
                "amount": amount_paise,
                "currency": "INR",
                "key_id": current_app.config["RAZORPAY_KEY_ID"],
            }
        )
    except ValidationError:
        raise
    except BadRequestError as exc:
        current_app.logger.warning("razorpay_create_order_rejected", extra={"error": str(exc)})
        return jsonify({"success": False, "message": "Payment gateway rejected the order request"}), 502
    except (GatewayError, ServerError) as exc:
        current_app.logger.warning("razorpay_create_order_unavailable", extra={"error": str(exc)})
        return jsonify({"success": False, "message": "Payment gateway is temporarily unavailable"}), 502
    except Exception:
        current_app.logger.exception("payment_create_order_failed")
        return jsonify({"success": False, "message": "Unable to initialize payment"}), 500


@bp.post("/create-order")
def create_order_alias():
    return create_payment_order()


@bp.post("/payments/verify")
def verify_payment():
    user = getattr(g, "current_user", None)
    rate_user = user["id"] if user else "guest"
    rate = enforce_limit(f"payments:verify:{rate_user}:{request_ip()}", 10, 60)
    if rate is not None:
        return rate
    if not current_app.config["RAZORPAY_KEY_SECRET"]:
        return jsonify({"success": False, "message": "Payments are unavailable"}), 503

    data = body()
    reject_unknown(data, {"razorpay_payment_id", "razorpay_order_id", "razorpay_signature", "our_order_id"})
    payment_id = raw_text(data.get("razorpay_payment_id"), "razorpay_payment_id", 120)
    razorpay_order_id = raw_text(data.get("razorpay_order_id"), "razorpay_order_id", 120)
    signature = raw_text(data.get("razorpay_signature"), "razorpay_signature", 200)
    our_order_id = raw_text(data.get("our_order_id"), "our_order_id", 120)

    expected = hmac.new(
        current_app.config["RAZORPAY_KEY_SECRET"].encode(),
        f"{razorpay_order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        current_app.logger.warning(
            "payment_signature_mismatch",
            extra={"razorpay_payment_id": payment_id, "razorpay_order_id": razorpay_order_id},
        )
        return jsonify({"success": False, "message": "Invalid payment signature"}), 400

    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        try:
            order_number = int(our_order_id)
        except (TypeError, ValueError):
            order_number = None
        order = find_order_for_payment(conn, our_order_id, order_number)
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        _ensure_payment_access(order)
        attempt = _payment_for_order(conn, order["id"])
        if not attempt or attempt["razorpay_order_id"] != razorpay_order_id:
            audit(
                conn,
                "payment.verify_rejected",
                "order",
                order["id"],
                _order_audit_payload(order, razorpay_order_id=razorpay_order_id, reason="missing_or_mismatched_attempt"),
            )
            raise ValidationError("Payment order does not match this restaurant order", "razorpay_order_id", 409)

        result = apply_success_payment(
            conn,
            order=order,
            razorpay_payment_id=payment_id,
            razorpay_order_id=razorpay_order_id,
            amount=_safe_int(order["total"]),
            source="verify",
        )

    current_app.logger.info(
        "payment_signature_verified",
        extra=_order_audit_payload(order, razorpay_payment_id=payment_id, razorpay_order_id=razorpay_order_id),
    )
    _publish_payment_update(result["order_id"], "confirmed")
    return jsonify({"success": True, "status": result["status"], "our_order_id": _str_id(result["order_id"])}), 200


def _event_seen(conn, event_id: str) -> bool:
    if not event_id:
        return False
    if db.engine.dialect.name == "postgresql":
        sql = "SELECT 1 FROM audit_log WHERE action = 'payment.webhook' AND payload ->> 'event_id' = ? LIMIT 1"
    else:
        sql = "SELECT 1 FROM audit_log WHERE action = 'payment.webhook' AND json_extract(payload, '$.event_id') = ? LIMIT 1"
    return conn.execute(sql, (event_id,)).fetchone() is not None


def _order_from_webhook(conn, entity: dict, razorpay_order_id: str):
    order = _find_order_by_razorpay_order(conn, razorpay_order_id)
    if order:
        return order

    notes = entity.get("notes") or {}
    order_id_raw = notes.get("order_uuid") or notes.get("order_id")
    order_number_raw = notes.get("our_order_id") or notes.get("order_number") or entity.get("receipt")
    try:
        order_number = int(order_number_raw)
    except (TypeError, ValueError):
        order_number = None
    return find_order_for_payment(conn, order_id_raw, order_number)


@bp.post("/payments/webhook")
def payments_webhook():
    payload = request.get_data(cache=True)
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = current_app.config.get("RAZORPAY_WEBHOOK_SECRET", "")
    if not secret:
        current_app.logger.critical("razorpay_webhook_secret_missing")
        return jsonify({"success": False, "status": "webhook_not_configured"}), 503

    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        current_app.logger.warning("razorpay_webhook_bad_signature")
        return jsonify({"success": False, "status": "bad_signature"}), 400

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        return jsonify({"success": False, "status": "bad_payload"}), 400

    event_name = str(event.get("event", ""))
    entity = ((event.get("payload", {}) or {}).get("payment", {}) or {}).get("entity", {}) or {}
    payment_id = str(entity.get("id") or "")
    razorpay_order_id = str(entity.get("order_id") or "")
    amount_rupees = max(0, _safe_int(entity.get("amount")) // 100)
    event_id = (
        request.headers.get("X-Razorpay-Event-Id")
        or event.get("id")
        or f"{event_name}:{payment_id}:{razorpay_order_id}"
    )

    def operation():
        with db.transaction(current_app.config["DATABASE_URL"]) as conn:
            if _event_seen(conn, event_id):
                return {"status": "duplicate", "order_id": None}

            order = _order_from_webhook(conn, entity, razorpay_order_id)
            if not order:
                audit(
                    conn,
                    "payment.webhook",
                    "order",
                    "unknown",
                    {
                        "event_id": event_id,
                        "event": event_name,
                        "payment_id": payment_id,
                        "razorpay_order_id": razorpay_order_id,
                        "status": "order_missing",
                    },
                )
                return {"status": "order_missing", "order_id": None}

            if event_name == "payment.captured" and payment_id:
                try:
                    result = apply_success_payment(
                        conn,
                        order=order,
                        razorpay_payment_id=payment_id,
                        razorpay_order_id=razorpay_order_id,
                        amount=amount_rupees,
                        source="webhook",
                    )
                    audit(
                        conn,
                        "payment.webhook",
                        "order",
                        order["id"],
                        _order_audit_payload(order, event_id=event_id, event=event_name, payment_id=payment_id, status=result["status"]),
                    )
                    return result
                except (sqlite3.IntegrityError, SAIntegrityError):
                    audit(
                        conn,
                        "payment.webhook",
                        "order",
                        order["id"],
                        _order_audit_payload(order, event_id=event_id, event=event_name, payment_id=payment_id, status="already_processed"),
                    )
                    return {"status": "already_processed", "order_id": order["id"]}

            if event_name == "payment.failed":
                reason = str((entity.get("error_description") or entity.get("error_reason") or "payment_failed"))[:500]
                result = _mark_payment_failed(
                    conn,
                    order=order,
                    razorpay_order_id=razorpay_order_id,
                    payment_id=payment_id,
                    amount_rupees=amount_rupees or _safe_int(order["total"]),
                    reason=reason,
                )
                audit(
                    conn,
                    "payment.webhook",
                    "order",
                    order["id"],
                    _order_audit_payload(order, event_id=event_id, event=event_name, payment_id=payment_id, status=result["status"]),
                )
                return result

            audit(
                conn,
                "payment.webhook",
                "order",
                order["id"],
                _order_audit_payload(order, event_id=event_id, event=event_name, payment_id=payment_id, status="ignored"),
            )
            return {"status": "ignored", "order_id": order["id"]}

    try:
        result = db.run_write(operation)
    except ValidationError as exc:
        current_app.logger.warning("razorpay_webhook_rejected", extra={"reason": exc.message, "event_id": event_id})
        return jsonify({"success": False, "status": "rejected", "message": exc.message}), exc.status

    if result.get("order_id"):
        event_status = "confirmed" if result["status"] in {"processed", "already_processed"} else "pending"
        _publish_payment_update(result["order_id"], event_status)
    return jsonify({"success": True, "status": "ok"}), 200


@bp.get("/admin/payments")
@require_role("admin")
def list_payments():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute("SELECT * FROM payments ORDER BY created_at DESC LIMIT 250").fetchall()
    return jsonify({"success": True, "payments": [dict(row) for row in rows]})
