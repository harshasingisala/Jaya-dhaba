from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import uuid
import base64
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request
from razorpay.errors import BadRequestError, GatewayError, ServerError
from sqlalchemy.exc import IntegrityError as SAIntegrityError
from sqlalchemy import select
from sqlalchemy.orm import joinedload

import db
from audit import audit as legacy_audit
from auth import ROLE_RANK, log_audit, require_role, request_ip
from events import broker, order_topic_id
from realtime import broadcast
from rate_limits import enforce_limit
from security_log import log_security_event
from validators import ValidationError, body, integer, raw_text, reject_unknown
from models import Order, OrderItem, MenuItem, User, Payment, SplitCharge
from qr_sessions import get_table_session
from routes.orders import allocate_order_number, serialize_order
from services.billing import calculate_order_totals


bp = Blueprint("payments", __name__, url_prefix="/api")

STAFF_PAYMENT_ROLES = {"staff", "manager", "owner", "admin"}
IST = timezone(timedelta(hours=5, minutes=30))


def audit(conn_or_session, action: str, entity_type: str, entity_id, payload: dict | None = None, user_id=None) -> None:
    if hasattr(conn_or_session, "add") and hasattr(conn_or_session, "flush"):
        log_audit(conn_or_session, action, entity_type, entity_id, payload, user_id=user_id)
        return
    legacy_audit(conn_or_session, action, entity_type, entity_id, payload, user_id=user_id)


def _is_development() -> bool:
    return (
        current_app.config.get("APP_ENV")
        or current_app.config.get("FLASK_ENV")
        or os.getenv("APP_ENV")
        or os.getenv("FLASK_ENV")
        or ""
    ).lower() == "development"


def _require_https():
    if current_app.config.get("TESTING"):
        return None
    is_https = request.headers.get("X-Forwarded-Proto", request.scheme).split(",")[0].strip() == "https"
    if not _is_development() and not is_https:
        return jsonify({"success": False, "message": "HTTPS required"}), 403
    return None


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


def _rupees(amount_paise: int) -> int | float:
    value = int(amount_paise or 0)
    if value % 100 == 0:
        return value // 100
    return round(value / 100, 2)


def _serialize_split_charge(charge: SplitCharge) -> dict:
    return {
        "id": str(charge.id),
        "name": charge.name,
        "phone": charge.phone,
        "amount": _rupees(charge.amount),
        "amount_paise": int(charge.amount or 0),
        "short_url": charge.short_url,
        "status": charge.status,
        "expires_at": charge.expires_at.isoformat() if charge.expires_at else None,
        "created_at": charge.created_at.isoformat() if charge.created_at else None,
    }


def _split_uuid() -> uuid.UUID | str:
    return uuid.uuid4()


def _table_session_owns_order(session_id: str | None, order: Order) -> bool:
    payload = get_table_session(session_id)
    if not payload:
        return False
    known_orders = {str(value).replace("-", "") for value in payload.get("orders") or []}
    if str(order.id).replace("-", "") in known_orders:
        return True
    return str(order.table_id or "").replace("-", "") == str(payload.get("table_id") or "").replace("-", "")


def _create_split_payment_link(order: Order, charge_id: str, name: str, phone: str | None, amount_paise: int, expires_at: datetime) -> dict:
    description = f"Jaya Dhaba - {order.table.label if order.table else 'Table'} - {name}"
    if current_app.config.get("TESTING") or _is_development():
        link_id = f"plink_dev_{uuid.uuid4().hex[:24]}"
        return {
            "id": link_id,
            "short_url": f"https://rzp.io/i/{link_id}",
            "status": "created",
        }
    return razorpay_client().payment_link.create({
        "amount": amount_paise,
        "currency": "INR",
        "description": description,
        "reference_id": charge_id,
        "expire_by": int(expires_at.timestamp()),
        "notify": {"sms": bool(phone), "email": False},
        "customer": {"name": name, "contact": phone or ""},
        "notes": {
            "order_id": str(order.id),
            "order_number": str(order.order_number),
            "split_charge_id": charge_id,
        },
    })


def _refresh_order_payment_status(session, order: Order) -> tuple[int, bool]:
    charges = list(order.split_charges or [])
    paid_count = sum(1 for charge in charges if charge.status == "paid")
    if charges and paid_count == len(charges):
        order.payment_status = "paid"
    elif paid_count > 0:
        order.payment_status = "partial"
    else:
        order.payment_status = "unpaid"
    return paid_count, bool(charges and paid_count == len(charges))


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _sign_pending_intent(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True, default=str).encode("utf-8")
    signature = hmac.new(current_app.config["SECRET_KEY"].encode("utf-8"), body, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(body).decode("ascii") + "." + signature


def verify_razorpay_signature(order_id, payment_id, signature):
    key = current_app.config.get("RAZORPAY_KEY_SECRET") or os.environ.get("RAZORPAY_KEY_SECRET", "")
    message = f"{order_id}|{payment_id}"
    expected = hmac.new(
        key.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _verify_pending_intent(token: str) -> dict:
    try:
        encoded, signature = token.rsplit(".", 1)
        body = base64.urlsafe_b64decode(encoded.encode("ascii"))
    except Exception as exc:
        raise ValidationError("Invalid payment intent", "pending_intent", 400) from exc
    expected = hmac.new(current_app.config["SECRET_KEY"].encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ValidationError("Invalid payment intent signature", "pending_intent", 400)
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError("Invalid payment intent payload", "pending_intent", 400) from exc


def _normalize_intent_items(items: list[dict]) -> list[dict]:
    normalized = []
    for item in items:
        normalized.append({
            "menu_item_id": uuid.UUID(str(item["menu_item_id"])),
            "qty": max(1, int(item.get("qty") or 1)),
            "special_note": str(item.get("special_note") or ""),
        })
    return normalized


def _create_order_from_intent(session, intent: dict) -> Order:
    idempotency_key = intent["idempotency_key"]
    existing = session.execute(select(Order).filter_by(idempotency_key=idempotency_key)).scalar_one_or_none()
    if existing:
        return existing

    items_req = _normalize_intent_items(intent.get("items") or [])
    totals = calculate_order_totals(session, items_req)
    expected_total = _safe_int((intent.get("totals") or {}).get("total"))
    if expected_total <= 0 or totals["total"] != expected_total:
        raise ValidationError("Payment amount does not match order total", "amount", 409)

    user_id = uuid.UUID(intent["user_id"]) if intent.get("user_id") else None
    new_order = Order(
        user_id=user_id,
        table_id=uuid.UUID(intent["table_id"]) if intent.get("table_id") else None,
        status="pending",
        idempotency_key=idempotency_key,
        subtotal=totals["subtotal"],
        tax=totals["tax"],
        total=totals["total"],
        loyalty_discount=0,
        guest_name=intent.get("guest_name") or "",
        guest_phone=intent.get("guest_phone") or "",
        public_token_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        order_type=intent.get("order_type") or "dine_in",
        source=intent.get("source") or "customer",
        payment_method="razorpay",
        pickup_time=datetime.fromisoformat(intent["pickup_time"]) if intent.get("pickup_time") else None,
    )
    new_order.order_number = allocate_order_number(session)
    session.add(new_order)
    session.flush()

    for item_req in items_req:
        menu_item = session.execute(select(MenuItem).filter_by(id=item_req["menu_item_id"], available=True)).scalar_one_or_none()
        if not menu_item:
            raise ValidationError(f"Item {item_req['menu_item_id']} is unavailable", "items", 409)
        session.add(OrderItem(
            order_id=new_order.id,
            menu_item_id=menu_item.id,
            qty=item_req["qty"],
            unit_price=menu_item.price,
            special_note=item_req["special_note"],
        ))

    audit(session, "order.create", "order", new_order.id, {"total": totals["total"]})
    return new_order


def _broadcast_order_created(order: Order) -> None:
    serialized = serialize_order(order, include_public_token=True)
    broker.publish("kitchen", "order.created", serialized)
    broker.publish(f"order:{order_topic_id(order.id)}", "order.created", serialized)
    broadcast("orders_update", {"action": "new_order", "order": serialized})
    broadcast("analytics_update", {"action": "orders_changed"})


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


def _create_payment_order_from_intent(data: dict):
    pending_intent = raw_text(data.get("pending_intent"), "pending_intent", 20000)
    intent = _verify_pending_intent(pending_intent)
    amount_rupees = _safe_int((intent.get("totals") or {}).get("total"))
    if amount_rupees <= 0:
        return jsonify({"success": False, "message": "Order total is invalid"}), 409

    if _is_development():
        razorpay_order_id = f"order_dev_{uuid.uuid4().hex[:24]}"
        signed = _sign_pending_intent({**intent, "razorpay_order_id": razorpay_order_id})
        return jsonify({
            "success": True,
            "razorpay_order_id": razorpay_order_id,
            "pending_intent": signed,
            "amount": amount_rupees * 100,
            "currency": "INR",
            "key_id": current_app.config["RAZORPAY_KEY_ID"],
            "mode": "development",
        })

    created = razorpay_client().order.create({
        "amount": amount_rupees * 100,
        "currency": "INR",
        "receipt": str(intent["idempotency_key"])[:40],
        "notes": {
            "pending_intent": pending_intent[:15000],
            "idempotency_key": str(intent["idempotency_key"]),
            "customer_name": str(intent.get("guest_name") or ""),
        },
    })
    razorpay_order_id = created.get("id")
    if not razorpay_order_id:
        return jsonify({"success": False, "message": "Payment gateway returned an invalid order response"}), 502
    return jsonify({
        "success": True,
        "razorpay_order_id": razorpay_order_id,
        "pending_intent": _sign_pending_intent({**intent, "razorpay_order_id": razorpay_order_id}),
        "amount": amount_rupees * 100,
        "currency": "INR",
        "key_id": current_app.config["RAZORPAY_KEY_ID"],
    })


def _create_development_payment_order(order, amount_rupees: int):
    razorpay_order_id = f"order_dev_{uuid.uuid4().hex[:24]}"
    with db.transaction(current_app.config["DATABASE_URL"]) as conn:
        fresh_order = find_order_for_payment(conn, _str_id(order["id"]), None)
        if not fresh_order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        _ensure_order_payable(conn, fresh_order)
        _record_pending_attempt(conn, order=fresh_order, razorpay_order_id=razorpay_order_id, amount_rupees=amount_rupees)
        audit(
            conn,
            "payment.order_created",
            "order",
            fresh_order["id"],
            _order_audit_payload(fresh_order, razorpay_order_id=razorpay_order_id, amount=amount_rupees * 100, mode="development"),
        )
    return jsonify(
        {
            "success": True,
            "razorpay_order_id": razorpay_order_id,
            "amount": amount_rupees * 100,
            "currency": "INR",
            "key_id": current_app.config["RAZORPAY_KEY_ID"],
            "mode": "development",
        }
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


@bp.post("/orders/<uuid:order_id>/split")
def create_order_split(order_id: uuid.UUID):
    data = request.get_json(silent=True) or {}
    table_session = raw_text(data.get("table_session"), "table_session", 200)
    mode = raw_text(data.get("mode"), "mode", 20)
    splits = data.get("splits") or []
    if mode not in {"equal", "by_item"}:
        return jsonify({"success": False, "message": "Invalid split mode"}), 400
    if not isinstance(splits, list) or not splits:
        return jsonify({"success": False, "message": "At least one split is required"}), 400

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    with db.get_db() as session:
        order = session.execute(
            select(Order)
            .options(joinedload(Order.table), joinedload(Order.items).joinedload(OrderItem.menu_item), joinedload(Order.split_charges))
            .where(Order.id == order_id)
        ).unique().scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        if not _table_session_owns_order(table_session, order):
            return jsonify({"success": False, "message": "Table session does not match this order"}), 403
        if order.status == "cancelled" or getattr(order, "payment_status", "unpaid") == "paid":
            return jsonify({"success": False, "message": "Order is not splittable"}), 409
        if any(charge.status == "paid" for charge in order.split_charges):
            return jsonify({"success": False, "message": "A split has already been paid"}), 409

        for existing in list(order.split_charges):
            session.delete(existing)
        session.flush()

        charge_specs = []
        if mode == "equal":
            count = len(splits)
            if count < 2 or count > 10:
                return jsonify({"success": False, "message": "Equal split requires 2 to 10 people"}), 400
            total_paise = int(order.total or 0) * 100
            base = total_paise // count
            remainder = total_paise % count
            for index, split in enumerate(splits):
                name = raw_text((split or {}).get("name"), "name", 100)
                phone = raw_text((split or {}).get("phone"), "phone", 20, required=False, allow_empty=True) or None
                charge_specs.append({"name": name, "phone": phone, "amount": base + (1 if index < remainder else 0)})
        else:
            order_items = {str(item.id): item for item in order.items}
            covered = []
            for split in splits:
                name = raw_text((split or {}).get("name"), "name", 100)
                phone = raw_text((split or {}).get("phone"), "phone", 20, required=False, allow_empty=True) or None
                item_ids = [str(value) for value in ((split or {}).get("item_ids") or [])]
                if not item_ids:
                    return jsonify({"success": False, "message": "Each person needs at least one item"}), 400
                amount = 0
                for item_id in item_ids:
                    item = order_items.get(item_id)
                    if not item:
                        return jsonify({"success": False, "message": "Split contains an invalid item"}), 400
                    amount += int(item.unit_price or 0) * int(item.qty or 1) * 100
                    covered.append(item_id)
                charge_specs.append({"name": name, "phone": phone, "amount": amount})
            if sorted(covered) != sorted(order_items.keys()) or len(covered) != len(set(covered)):
                return jsonify({"success": False, "message": "All order items must be assigned exactly once"}), 400

        created_charges = []
        for spec in charge_specs:
            charge_uuid = _split_uuid()
            charge_id = str(charge_uuid)
            link = _create_split_payment_link(order, charge_id, spec["name"], spec["phone"], spec["amount"], expires_at)
            charge = SplitCharge(
                id=charge_uuid,
                order_id=order.id,
                name=spec["name"],
                phone=spec["phone"],
                amount=spec["amount"],
                razorpay_link_id=str(link.get("id") or ""),
                short_url=str(link.get("short_url") or ""),
                status="pending",
                expires_at=expires_at,
            )
            session.add(charge)
            created_charges.append(charge)
        order.payment_status = "unpaid"
        session.commit()
        for charge in created_charges:
            session.refresh(charge)
        payload = [_serialize_split_charge(charge) for charge in created_charges]

    broker.publish("kitchen", "split_updated", {"order_id": str(order_id), "splits": payload, "payment_status": "unpaid"})
    return jsonify({"success": True, "mode": mode, "splits": payload, "data": {"mode": mode, "splits": payload}})


@bp.get("/orders/<uuid:order_id>/split")
def get_order_split(order_id: uuid.UUID):
    table_session = request.args.get("table_session")
    with db.get_db() as session:
        order = session.execute(
            select(Order)
            .options(joinedload(Order.split_charges))
            .where(Order.id == order_id)
        ).unique().scalar_one_or_none()
        if not order:
            return jsonify({"success": False, "message": "Order not found"}), 404
        if not _table_session_owns_order(table_session, order):
            return jsonify({"success": False, "message": "Table session does not match this order"}), 403

        now = datetime.now(timezone.utc)
        changed = False
        for charge in order.split_charges:
            expires_at = _as_utc(charge.expires_at)
            if charge.status == "pending" and expires_at and expires_at < now:
                charge.status = "expired"
                changed = True
            if not (current_app.config.get("TESTING") or _is_development()) and charge.status == "pending":
                try:
                    latest = razorpay_client().payment_link.fetch(charge.razorpay_link_id)
                    latest_status = str(latest.get("status") or "").lower()
                    if latest_status == "paid":
                        charge.status = "paid"
                        changed = True
                    elif latest_status == "expired":
                        charge.status = "expired"
                        changed = True
                except Exception:
                    current_app.logger.warning("split_link_status_refresh_failed", extra={"split_charge_id": str(charge.id)})
        paid_count, all_paid = _refresh_order_payment_status(session, order)
        if changed:
            session.commit()
        payload = [_serialize_split_charge(charge) for charge in order.split_charges]
        remaining = sum(int(charge.amount or 0) for charge in order.split_charges if charge.status != "paid")

    return jsonify({
        "success": True,
        "splits": payload,
        "data": payload,
        "paid_count": paid_count,
        "all_paid": all_paid,
        "remaining": _rupees(remaining),
    })


@bp.post("/payments/create-order")
def create_payment_order():
    try:
        https_error = _require_https()
        if https_error is not None:
            return https_error
        user = getattr(g, "current_user", None)
        rate_user = user["id"] if user else "guest"
        rate = enforce_limit(f"payments:create:{rate_user}:{request_ip()}", 30, 60)
        if rate is not None:
            return rate
        if not current_app.config["RAZORPAY_KEY_ID"] or not current_app.config["RAZORPAY_KEY_SECRET"]:
            return jsonify({"success": False, "message": "Payments are unavailable"}), 503

        data = body()
        if data.get("pending_intent"):
            return _create_payment_order_from_intent(data)
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

        if _is_development():
            return _create_development_payment_order(order, amount_rupees)

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


@bp.post("/payment/create")
def create_payment_singular_alias():
    return create_payment_order()


@bp.post("/payments/verify")
def verify_payment():
    https_error = _require_https()
    if https_error is not None:
        return https_error
    user = getattr(g, "current_user", None)
    rate_user = user["id"] if user else "guest"
    rate = enforce_limit(f"payments:verify:{rate_user}:{request_ip()}", 10, 60)
    if rate is not None:
        return rate
    if not current_app.config["RAZORPAY_KEY_SECRET"]:
        return jsonify({"success": False, "message": "Payments are unavailable"}), 503

    data = body()
    reject_unknown(data, {"razorpay_payment_id", "razorpay_order_id", "razorpay_signature", "our_order_id", "pending_intent"})
    payment_id = raw_text(data.get("razorpay_payment_id"), "razorpay_payment_id", 120)
    razorpay_order_id = raw_text(data.get("razorpay_order_id"), "razorpay_order_id", 120)
    signature = raw_text(data.get("razorpay_signature"), "razorpay_signature", 200)
    our_order_id = raw_text(data.get("our_order_id"), "our_order_id", 120, required=False, allow_empty=True)
    pending_intent = raw_text(data.get("pending_intent", ""), "pending_intent", 20000, required=False, allow_empty=True)

    if not verify_razorpay_signature(razorpay_order_id, payment_id, signature):
        log_security_event("bad_payment_sig", request_ip(), razorpay_order_id)
        current_app.logger.warning(
            "payment_signature_mismatch",
            extra={"razorpay_payment_id": payment_id, "razorpay_order_id": razorpay_order_id},
        )
        return jsonify({"success": False, "message": "Invalid payment signature", "error": "Invalid payment signature"}), 400

    if pending_intent:
        try:
            intent = _verify_pending_intent(pending_intent)
            if intent.get("razorpay_order_id") != razorpay_order_id:
                raise ValidationError("Payment order does not match this restaurant order", "razorpay_order_id", 409)
            with db.get_db() as session:
                order = _create_order_from_intent(session, intent)
                payment = session.execute(select(Payment).filter_by(order_id=order.id)).scalar_one_or_none()
                if payment and payment.status == "completed":
                    result = {"status": "already_processed", "order_id": order.id}
                else:
                    if not payment:
                        payment = Payment(order_id=order.id, amount=order.total)
                        session.add(payment)
                    payment.razorpay_payment_id = payment_id
                    payment.razorpay_order_id = razorpay_order_id
                    payment.amount = order.total
                    payment.status = "completed"
                    payment.failure_reason = None
                    order.status = "confirmed"
                    order.confirmed_at = datetime.now(IST)
                    order.updated_at = datetime.now(IST)
                    if order.user_id:
                        points = max(0, int(order.total or 0) // 10)
                        user_row = session.execute(select(User).filter_by(id=order.user_id)).scalar_one_or_none()
                        if user_row and points > 0:
                            user_row.loyalty_points += points
                    audit(session, "payment.completed", "order", order.id, _order_audit_payload({"id": order.id, "order_number": order.order_number}, source="verify", razorpay_payment_id=payment_id, razorpay_order_id=razorpay_order_id, amount=order.total))
                    result = {"status": "processed", "order_id": order.id}
                session.commit()
                session.refresh(order)
                _broadcast_order_created(order)
            return jsonify({"success": True, "status": result["status"], "our_order_id": _str_id(result["order_id"]), "data": serialize_order(order, include_public_token=True)}), 200
        except ValidationError:
            raise
        except Exception as exc:
            current_app.logger.exception(
                "payment_recorded_pending",
                extra={"razorpay_payment_id": payment_id, "razorpay_order_id": razorpay_order_id, "error": str(exc)},
            )
            return jsonify({"success": False, "error": "payment_recorded_pending", "payment_id": payment_id}), 500

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

        try:
            result = apply_success_payment(
                conn,
                order=order,
                razorpay_payment_id=payment_id,
                razorpay_order_id=razorpay_order_id,
                amount=_safe_int(order["total"]),
                source="verify",
            )
        except Exception as exc:
            current_app.logger.critical(
                "payment_recorded_pending",
                extra={"razorpay_payment_id": payment_id, "razorpay_order_id": razorpay_order_id, "error": str(exc)},
            )
            return jsonify({"success": False, "error": "payment_recorded_pending", "payment_id": payment_id}), 500

    current_app.logger.info(
        "payment_signature_verified",
        extra=_order_audit_payload(order, razorpay_payment_id=payment_id, razorpay_order_id=razorpay_order_id),
    )
    _publish_payment_update(result["order_id"], "confirmed")
    return jsonify({"success": True, "status": result["status"], "our_order_id": _str_id(result["order_id"])}), 200


@bp.post("/payment/verify")
def verify_payment_singular_alias():
    https_error = _require_https()
    if https_error is not None:
        return https_error
    if _is_development():
        data = body()
        reject_unknown(data, {"razorpay_payment_id", "razorpay_order_id", "razorpay_signature"})
        payment_id = raw_text(data.get("razorpay_payment_id"), "razorpay_payment_id", 120)
        razorpay_order_id = raw_text(data.get("razorpay_order_id"), "razorpay_order_id", 120)
        signature = raw_text(data.get("razorpay_signature"), "razorpay_signature", 200)
        if not hmac.compare_digest(signature, "test_signature"):
            log_security_event("bad_payment_sig", request_ip(), razorpay_order_id)
            return jsonify({"success": False, "message": "Invalid development payment signature"}), 400
        with db.transaction(current_app.config["DATABASE_URL"]) as conn:
            order = _find_order_by_razorpay_order(conn, razorpay_order_id)
            if not order:
                return jsonify({"success": False, "message": "Order not found"}), 404
            _ensure_payment_access(order)
            result = apply_success_payment(
                conn,
                order=order,
                razorpay_payment_id=payment_id,
                razorpay_order_id=razorpay_order_id,
                amount=_safe_int(order["total"]),
                source="development_verify",
            )
        _publish_payment_update(result["order_id"], "confirmed")
        return jsonify({"success": True, "status": result["status"], "our_order_id": _str_id(result["order_id"])}), 200
    return verify_payment()


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
        return jsonify({"success": False, "status": "webhook_not_configured"}), 400

    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        log_security_event("bad_payment_sig", request_ip(), "razorpay_webhook")
        current_app.logger.warning("razorpay_webhook_bad_signature")
        return jsonify({"success": False, "status": "bad_signature"}), 400

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        return jsonify({"success": False, "status": "bad_payload"}), 400

    event_name = str(event.get("event", ""))
    if event_name == "payment_link.paid":
        link_entity = ((event.get("payload", {}) or {}).get("payment_link", {}) or {}).get("entity", {}) or {}
        razorpay_link_id = str(link_entity.get("id") or "")
        if not razorpay_link_id:
            return jsonify({"success": False, "status": "bad_payload"}), 400
        with db.get_db() as session:
            charge = session.execute(
                select(SplitCharge)
                .options(joinedload(SplitCharge.order).joinedload(Order.split_charges))
                .where(SplitCharge.razorpay_link_id == razorpay_link_id)
            ).unique().scalar_one_or_none()
            if not charge:
                return jsonify({"success": True, "status": "split_missing"}), 200
            charge.status = "paid"
            paid_count, all_paid = _refresh_order_payment_status(session, charge.order)
            order_id = str(charge.order_id)
            payload_out = {
                "order_id": order_id,
                "name": charge.name,
                "amount": _rupees(charge.amount),
                "all_paid": all_paid,
                "paid_count": paid_count,
            }
            session.commit()
        broker.publish("kitchen", "split_paid", payload_out)
        broker.publish(f"order:{order_topic_id(order_id)}", "split_paid", payload_out)
        broadcast("orders_update", {"action": "split_paid", **payload_out})
        return jsonify({"success": True, "status": "ok"}), 200

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
                log_security_event("payment_replay", request_ip(), event_id)
                return {"status": "duplicate", "order_id": None}

            order = _order_from_webhook(conn, entity, razorpay_order_id)
            pending_intent = str((entity.get("notes") or {}).get("pending_intent") or "")
            if not order and pending_intent and event_name == "payment.captured" and payment_id:
                intent = _verify_pending_intent(pending_intent)
                if intent.get("razorpay_order_id") != razorpay_order_id:
                    intent["razorpay_order_id"] = razorpay_order_id
                with db.get_db() as session:
                    created_order = _create_order_from_intent(session, intent)
                    payment = session.execute(select(Payment).filter_by(order_id=created_order.id)).scalar_one_or_none()
                    if not payment:
                        payment = Payment(order_id=created_order.id, amount=created_order.total)
                        session.add(payment)
                    payment.razorpay_payment_id = payment_id
                    payment.razorpay_order_id = razorpay_order_id
                    payment.amount = amount_rupees or created_order.total
                    payment.status = "completed"
                    created_order.status = "confirmed"
                    created_order.confirmed_at = datetime.now(IST)
                    created_order.updated_at = datetime.now(IST)
                    audit(session, "payment.webhook", "order", created_order.id, {"event_id": event_id, "event": event_name, "payment_id": payment_id, "status": "processed"})
                    session.commit()
                    session.refresh(created_order)
                    _broadcast_order_created(created_order)
                    return {"status": "processed", "order_id": created_order.id}
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


@bp.post("/payments/razorpay/webhook")
def razorpay_webhook_alias():
    return payments_webhook()


@bp.get("/admin/payments")
@require_role("admin")
def list_payments():
    with db.connect(current_app.config["DATABASE_URL"]) as conn:
        rows = conn.execute("SELECT * FROM payments ORDER BY created_at DESC LIMIT 250").fetchall()
    return jsonify({"success": True, "payments": [dict(row) for row in rows]})
