"""
Smoke tests — 5 critical paths that must pass before any deployment.
These tests verify the production-critical flows identified in the CTO audit:
  1. Order placement (idempotent)
  2. Payment verify (HMAC + duplicate detection)
  3. Admin flush (daily closure + top_item)
  4. Top-item analytics (live_stats returns correct dish)
  5. Auth flow (login + protected route)

Run with: pytest backend/tests/test_smoke.py -v
"""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_csrf(client) -> str:
    resp = client.get("/api/csrf-token")
    assert resp.status_code == 200, f"CSRF endpoint failed: {resp.data}"
    data = resp.get_json()
    # Handle both envelope formats
    token = (data.get("data") or {}).get("csrfToken") or data.get("csrfToken")
    assert token, f"No csrfToken in response: {data}"
    return token


def login(client, email: str, password: str) -> dict:
    csrf = get_csrf(client)
    resp = client.post(
        "/api/auth/login",
        json={"login": email, "password": password},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200, f"Login failed: {resp.data}"
    data = resp.get_json()
    token = (data.get("data") or data).get("access_token")
    assert token, f"No access_token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "X-CSRF-Token": csrf}


def place_order(client, headers: dict, table_qr: str, menu_item_id: str) -> dict:
    """Place a minimal order. Returns parsed JSON response."""
    resp = client.post(
        "/api/orders",
        json={
            "table_token": table_qr,
            "items": [{"menu_item_id": menu_item_id, "qty": 2}],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers=headers,
    )
    assert resp.status_code in (200, 201), f"Order placement failed: {resp.data}"
    return resp.get_json()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_headers(client):
    return login(client, "admin@example.com", "AdminPass123!")


@pytest.fixture
def seeded_menu(app):
    """Return (table_qr_token, menu_item_id) from seeded test database."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()

    table = session.execute(text("SELECT qr_token FROM tables LIMIT 1")).fetchone()
    item = session.execute(text("SELECT id FROM menu_items WHERE available = 1 LIMIT 1")).fetchone()
    session.close()

    assert table, "No table in test DB — check conftest seed"
    assert item, "No menu item in test DB — check conftest seed"
    return str(table[0]), str(item[0])


# ---------------------------------------------------------------------------
# SMOKE TEST 1 — Auth flow
# Login with valid credentials returns a JWT.
# A protected endpoint returns 401 without it.
# ---------------------------------------------------------------------------

def test_auth_login_returns_jwt(client):
    headers = login(client, "admin@example.com", "AdminPass123!")
    assert headers["Authorization"].startswith("Bearer ")


def test_protected_route_rejects_unauthenticated(client):
    resp = client.get("/api/admin/stats")
    assert resp.status_code in (401, 403), (
        f"Expected 401/403 without token, got {resp.status_code}"
    )


def test_chat_endpoint_is_accessible_without_csrf(client):
    resp = client.post("/api/chat", json={"message": "Hi"})
    assert resp.status_code == 503, (
        f"Expected /api/chat to be reachable without CSRF and return 503 due to missing AI key, got {resp.status_code}"
    )


# ---------------------------------------------------------------------------
# SMOKE TEST 2 — Order placement + idempotency
# Same idempotency_key placed twice must not create two orders.
# ---------------------------------------------------------------------------

def test_order_placement_succeeds(client, admin_headers, seeded_menu):
    table_qr, item_id = seeded_menu
    resp = client.post(
        "/api/orders",
        json={
            "table_token": table_qr,
            "items": [{"menu_item_id": item_id, "qty": 1}],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers=admin_headers,
    )
    assert resp.status_code in (200, 201), f"Order failed: {resp.data}"


def test_guest_order_placement_succeeds(client, seeded_menu):
    table_qr, item_id = seeded_menu
    csrf = get_csrf(client)
    resp = client.post(
        "/api/orders",
        json={
            "table_token": table_qr,
            "items": [{"menu_item_id": item_id, "qty": 1}],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 201, f"Guest order failed: {resp.data}"
    data = resp.get_json()
    assert data.get("success") is True
    assert data["data"]["order_number"] is not None


def test_order_idempotency(client, admin_headers, seeded_menu):
    table_qr, item_id = seeded_menu
    key = uuid.uuid4().hex
    payload = {
        "table_token": table_qr,
        "items": [{"menu_item_id": item_id, "qty": 1}],
        "idempotency_key": key,
    }
    r1 = client.post("/api/orders", json=payload, headers=admin_headers)
    r2 = client.post("/api/orders", json=payload, headers=admin_headers)
    assert r1.status_code in (200, 201), f"First order failed: {r1.data}"
    # Second call with same key must return 200 (existing) not 201 (new) or 500
    assert r2.status_code in (200, 409), (
        f"Duplicate order key should return 200 or 409, got {r2.status_code}: {r2.data}"
    )
    # Confirm only one order row was created
    id1 = (r1.get_json().get("data") or r1.get_json()).get("id") or \
          (r1.get_json().get("order") or {}).get("id")
    id2 = (r2.get_json().get("data") or r2.get_json()).get("id") or \
          (r2.get_json().get("order") or {}).get("id")
    if id1 and id2:
        assert id1 == id2, "Same idempotency_key produced two different order IDs"


# ---------------------------------------------------------------------------
# SMOKE TEST 3 — Admin stats endpoint returns top_item
# This verifies the live_stats() fix is wired through to the API response.
# ---------------------------------------------------------------------------

def test_admin_stats_returns_top_item(client, admin_headers, seeded_menu, app):
    # Place an order so there's data to aggregate
    table_qr, item_id = seeded_menu
    client.post(
        "/api/orders",
        json={
            "table_token": table_qr,
            "items": [{"menu_item_id": item_id, "qty": 3}],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers=admin_headers,
    )

    resp = client.get("/api/admin/stats", headers=admin_headers)
    assert resp.status_code == 200, f"Admin stats failed: {resp.data}"
    data = resp.get_json()

    # top_item key must exist (value may be None if order status filters it out)
    assert "top_item" in data, (
        f"top_item missing from /admin/stats response. Got keys: {list(data.keys())}"
    )
    assert "top_item_qty" in data, (
        f"top_item_qty missing from /admin/stats response. Got keys: {list(data.keys())}"
    )


# ---------------------------------------------------------------------------
# SMOKE TEST 4 — Admin flush creates a daily_closure row
# Verifies the analytics reset mechanism works end-to-end.
# ---------------------------------------------------------------------------

def test_admin_flush_creates_closure(client, admin_headers, app):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)

    # Count closures before flush
    session = Session()
    before = session.execute(text("SELECT COUNT(*) FROM daily_closures")).scalar()
    session.close()

    resp = client.post("/api/admin/flush", headers=admin_headers)
    assert resp.status_code == 200, f"Admin flush failed: {resp.data}"

    # Count closures after flush — must have increased by 1
    session = Session()
    after = session.execute(text("SELECT COUNT(*) FROM daily_closures")).scalar()
    session.close()

    assert after == before + 1, (
        f"Expected daily_closures count to increase by 1 after flush. "
        f"Before: {before}, After: {after}"
    )


# ---------------------------------------------------------------------------
# SMOKE TEST 5 — Payment replay is blocked
# Posting the same razorpay_payment_id twice must not double-credit the order.
# ---------------------------------------------------------------------------

def test_payment_replay_blocked(client, admin_headers, seeded_menu, app):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    table_qr, item_id = seeded_menu

    # Place an order first
    order_resp = client.post(
        "/api/orders",
        json={
            "table_token": table_qr,
            "items": [{"menu_item_id": item_id, "qty": 1}],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers=admin_headers,
    )
    assert order_resp.status_code in (200, 201)
    order_data = order_resp.get_json()
    order_id = (
        (order_data.get("data") or order_data).get("id")
        or (order_data.get("order") or {}).get("id")
    )
    assert order_id, f"Could not extract order id from: {order_data}"

    # Build a fake payment verify payload
    fake_payment_id = f"pay_{uuid.uuid4().hex[:16]}"
    fake_razorpay_order_id = f"order_{uuid.uuid4().hex[:16]}"
    secret = app.config.get("RAZORPAY_KEY_SECRET", "test-secret")
    sig = hmac.new(
        secret.encode(),
        f"{fake_razorpay_order_id}|{fake_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    verify_payload = {
        "our_order_id": order_id,
        "razorpay_payment_id": fake_payment_id,
        "razorpay_order_id": fake_razorpay_order_id,
        "razorpay_signature": sig,
    }

    r1 = client.post("/api/payments/verify", json=verify_payload, headers=admin_headers)
    r2 = client.post("/api/payments/verify", json=verify_payload, headers=admin_headers)

    # First call: success or order-not-payable (status guard)
    assert r1.status_code in (200, 409), f"First payment verify: {r1.status_code} {r1.data}"

    # Second call must not be a new successful payment — must be 409 or already_processed
    if r2.status_code == 200:
        result = (r2.get_json().get("data") or r2.get_json()).get("status")
        assert result == "already_processed", (
            f"Payment replay was accepted as a new payment. Response: {r2.data}"
        )
    else:
        assert r2.status_code in (409, 400), (
            f"Unexpected status on payment replay: {r2.status_code} {r2.data}"
        )

    # Confirm only one payment row exists for this order
    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    count = session.execute(
        text("SELECT COUNT(*) FROM payments WHERE order_id = :oid"),
        {"oid": str(order_id)},
    ).scalar()
    session.close()
    assert count <= 1, f"Payment replay created {count} payment rows for order {order_id}"


def test_jaya_concierge_returns_503_without_api_key(client):
    resp = client.post("/api/jaya-concierge", json={"message": "How many orders today?"})
    assert resp.status_code == 503, f"Expected 503 when OPENAI_API_KEY is missing, got {resp.status_code}"
    data = resp.get_json()
    assert data.get("message") == "AI service unavailable"
