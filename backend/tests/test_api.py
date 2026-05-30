import hashlib
import hmac
import json
import sqlite3
import time
import uuid
from datetime import timedelta

from flask_jwt_extended import create_access_token

from conftest import auth_headers, create_order, csrf_headers, order_payload


def sqlite_path(app):
    return app.config["DATABASE_URL"].replace("sqlite:///", "")


def fake_signature(payload: bytes, secret: str) -> str:
    timestamp = int(time.time())
    signed = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_sql_injection_rejected(client, app):
    payload = order_payload(client)
    payload["guest_name"] = "'; DROP TABLE orders; --"
    response = client.post("/api/orders", json=payload, headers=auth_headers(client, extra={"Idempotency-Key": str(uuid.uuid4())}))
    assert response.status_code == 201
    conn = sqlite3.connect(sqlite_path(app))
    try:
        conn.execute("SELECT COUNT(*) FROM orders").fetchone()
    finally:
        conn.close()


def test_idor_blocked(client):
    client.post("/api/auth/register", json={"email": "a@example.com", "password": "CustomerPass123!"}, headers=csrf_headers(client))
    client.post("/api/auth/register", json={"email": "b@example.com", "password": "CustomerPass123!"}, headers=csrf_headers(client))
    customer_a = client.post("/api/auth/login", json={"email": "a@example.com", "password": "CustomerPass123!"}, headers=csrf_headers(client)).get_json()
    customer_b = client.post("/api/auth/login", json={"email": "b@example.com", "password": "CustomerPass123!"}, headers=csrf_headers(client)).get_json()
    response = client.post(
        "/api/orders",
        json=order_payload(client),
        headers={**csrf_headers(client), "Authorization": f"Bearer {customer_a['access_token']}", "Idempotency-Key": "idor-a-order"},
    )
    order_id = response.get_json()["id"]
    blocked = client.get(f"/api/orders/{order_id}", headers={"Authorization": f"Bearer {customer_b['access_token']}"})
    assert blocked.status_code == 404


def test_jwt_expired_rejected(client, app):
    with app.app_context():
        expired = create_access_token(identity="1", additional_claims={"role": "admin"}, expires_delta=timedelta(minutes=-20))
    response = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_refresh_token_not_in_response_body(client):
    response = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "AdminPass123!"}, headers=csrf_headers(client))
    payload = response.get_json()
    assert response.status_code == 200
    assert "refresh_token" not in payload
    assert "refresh_token=" in response.headers.get("Set-Cookie", "")


def test_logout_revokes_db_session(client, app):
    response = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "AdminPass123!"}, headers=csrf_headers(client))
    token = response.get_json()["access_token"]
    logout = client.post("/api/auth/logout", json={}, headers={**csrf_headers(client), "Authorization": f"Bearer {token}"})
    assert logout.status_code == 200
    conn = sqlite3.connect(sqlite_path(app))
    try:
        revoked = conn.execute("SELECT COUNT(*) FROM sessions WHERE revoked = 1").fetchone()[0]
    finally:
        conn.close()
    assert revoked >= 1


def test_payment_replay_blocked(client, app):
    created = create_order(client, key="payment-replay-order")
    amount = int(created["total"]) * 100
    event = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_123",
                    "order_id": "order_test_456",
                    "amount": amount,
                    "receipt": str(created.get("order_number", created["id"])),
                    "notes": {"our_order_id": str(created.get("order_number", created["id"]))},
                }
            }
        },
    }
    payload = json.dumps(event).encode("utf-8")
    import hmac, hashlib
    signature = hmac.new(app.config["RAZORPAY_WEBHOOK_SECRET"].encode(), payload, hashlib.sha256).hexdigest()
    first = client.post("/api/payments/webhook", data=payload, headers={"X-Razorpay-Signature": signature, "Content-Type": "application/json"})
    second = client.post("/api/payments/webhook", data=payload, headers={"X-Razorpay-Signature": signature, "Content-Type": "application/json"})
    assert first.status_code == 200
    assert second.status_code == 200
    conn = sqlite3.connect(sqlite_path(app))
    try:
        count = conn.execute("SELECT COUNT(*) FROM payments WHERE razorpay_payment_id = ?", ("pay_test_123",)).fetchone()[0]
    finally:
        conn.close()
    assert count == 1


def test_razorpay_bad_signature_rejected(client):
    response = client.post("/api/payments/webhook", data=b'{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_bad","order_id":"order_bad","amount":100,"receipt":"1","notes":{}}}}}', headers={"X-Razorpay-Signature": "bad_signature", "Content-Type": "application/json"})
    assert response.status_code == 400


def test_razorpay_failed_webhook_keeps_order_retryable(client, app):
    created = create_order(client, key="payment-failed-retryable")
    event = {
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_failed_123",
                    "order_id": "order_failed_456",
                    "amount": int(created["total"]) * 100,
                    "receipt": str(created.get("order_number", created["id"])),
                    "error_description": "bank declined",
                    "notes": {"our_order_id": str(created.get("order_number", created["id"]))},
                }
            }
        },
    }
    payload = json.dumps(event).encode("utf-8")
    signature = hmac.new(app.config["RAZORPAY_WEBHOOK_SECRET"].encode(), payload, hashlib.sha256).hexdigest()
    webhook = client.post("/api/payments/webhook", data=payload, headers={"X-Razorpay-Signature": signature, "Content-Type": "application/json"})
    assert webhook.status_code == 200

    conn = sqlite3.connect(sqlite_path(app))
    try:
        order_status = conn.execute("SELECT status FROM orders WHERE id = ?", (created["id"].replace("-", ""),)).fetchone()
        if not order_status:
            order_status = conn.execute("SELECT status FROM orders WHERE id = ?", (created["id"],)).fetchone()
        payment_status = conn.execute("SELECT status FROM payments WHERE razorpay_payment_id = ?", ("pay_failed_123",)).fetchone()
    finally:
        conn.close()
    assert order_status[0] == "pending"
    assert payment_status[0] == "failed"


def test_checkout_verify_requires_server_created_attempt(client, app):
    created = create_order(client, key="verify-needs-attempt")
    payment_id = "pay_without_attempt"
    razorpay_order_id = "order_without_attempt"
    signature = hmac.new(
        app.config["RAZORPAY_KEY_SECRET"].encode(),
        f"{razorpay_order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    response = client.post(
        "/api/payments/verify",
        json={
            "our_order_id": created["id"],
            "razorpay_payment_id": payment_id,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_signature": signature,
        },
        headers=auth_headers(client),
    )
    assert response.status_code == 409


def test_full_order_flow(client, app):
    created = create_order(client, key="full-flow-order")
    amount = int(created["total"]) * 100
    event = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_flow",
                    "order_id": "order_test_flow",
                    "amount": amount,
                    "receipt": str(created.get("order_number", created["id"])),
                    "notes": {"our_order_id": str(created.get("order_number", created["id"]))},
                }
            }
        },
    }
    payload = json.dumps(event).encode("utf-8")
    import hmac, hashlib
    signature = hmac.new(app.config["RAZORPAY_WEBHOOK_SECRET"].encode(), payload, hashlib.sha256).hexdigest()
    webhook = client.post("/api/payments/webhook", data=payload, headers={"X-Razorpay-Signature": signature, "Content-Type": "application/json"})
    tracked = client.get(f"/api/orders/{created['id']}?token={created['public_token']}")
    assert webhook.status_code == 200
    assert tracked.status_code == 200
    assert tracked.get_json()["status"] == "confirmed"
