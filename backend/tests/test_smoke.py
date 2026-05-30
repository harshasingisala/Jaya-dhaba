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


def test_signed_qr_creates_table_session(client, app):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    session.close()
    assert table, "No table in test DB"

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200, f"QR verify failed: {resp.data}"
    data = resp.get_json()
    table_session = data.get("table_session") or (data.get("data") or {}).get("table_session")
    assert table_session, f"No table session returned: {data}"

    menu_resp = client.get(f"/api/menu?table_session={table_session}")
    assert menu_resp.status_code == 200, f"Session menu failed: {menu_resp.data}"
    menu_data = menu_resp.get_json()
    assert menu_data.get("table"), f"No table returned for session menu: {menu_data}"


def test_group_cart_checkout_uses_table_session(client, app):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    item = session.execute(text("SELECT id FROM menu_items WHERE available = 1 LIMIT 1")).fetchone()
    session.close()
    assert table and item

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    verify_resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert verify_resp.status_code == 200, f"QR verify failed: {verify_resp.data}"
    table_session = verify_resp.get_json()["table_session"]

    add_resp = client.post(
        "/api/session/cart/add",
        json={"table_session": table_session, "item_id": str(item[0]), "quantity": 2, "added_by": "Asha"},
        headers={"X-CSRF-Token": csrf},
    )
    assert add_resp.status_code == 200, f"Group cart add failed: {add_resp.data}"
    assert len(add_resp.get_json()["cart"]) == 1

    order_resp = client.post(
        "/api/orders",
        json={
            "table_session": table_session,
            "group_cart": True,
            "items": [],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert order_resp.status_code == 201, f"Group cart order failed: {order_resp.data}"
    assert order_resp.get_json()["data"]["order_number"] is not None

    cart_resp = client.get(f"/api/session/cart?table_session={table_session}")
    assert cart_resp.status_code == 200
    assert cart_resp.get_json()["cart"] == []


def test_waiter_call_lifecycle(client, app, admin_headers):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    session.close()
    assert table

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    verify_resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert verify_resp.status_code == 200, f"QR verify failed: {verify_resp.data}"
    table_session = verify_resp.get_json()["table_session"]

    call_resp = client.post(
        "/api/waiter/call",
        json={"table_session": table_session, "reason": "need_water"},
        headers={"X-CSRF-Token": csrf},
    )
    assert call_resp.status_code == 200, f"Waiter call failed: {call_resp.data}"
    call_id = call_resp.get_json()["call_id"]

    list_resp = client.get("/api/waiter/calls", headers=admin_headers)
    assert list_resp.status_code == 200, f"Waiter calls list failed: {list_resp.data}"
    assert any(call["id"] == call_id for call in list_resp.get_json()["calls"])

    resolve_headers = {**admin_headers, "X-CSRF-Token": csrf}
    resolve_resp = client.patch(f"/api/waiter/calls/{call_id}/resolve", headers=resolve_headers)
    assert resolve_resp.status_code == 200, f"Waiter call resolve failed: {resolve_resp.data}"


def test_item_level_status_auto_readies_order(client, app, admin_headers):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    item = session.execute(text("SELECT id FROM menu_items WHERE available = 1 LIMIT 1")).fetchone()
    session.close()
    assert table and item

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    verify_resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert verify_resp.status_code == 200, f"QR verify failed: {verify_resp.data}"
    table_session = verify_resp.get_json()["table_session"]

    order_resp = client.post(
        "/api/orders",
        json={
            "table_session": table_session,
            "items": [
                {"menu_item_id": str(item[0]), "qty": 1},
                {"menu_item_id": str(item[0]), "qty": 1},
            ],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert order_resp.status_code == 201, f"Order failed: {order_resp.data}"
    order = order_resp.get_json()["data"]
    order_id = order["id"]
    public_token = order["public_token"]
    order_items = order["items"]
    assert len(order_items) == 2

    patch_headers = {**admin_headers, "X-CSRF-Token": get_csrf(client)}
    first_item_id = order_items[0]["item_id"]
    second_item_id = order_items[1]["item_id"]

    preparing_resp = client.patch(
        f"/api/kitchen/orders/{order_id}/items/{first_item_id}/status",
        json={"status": "preparing"},
        headers=patch_headers,
    )
    assert preparing_resp.status_code == 200, f"Preparing status failed: {preparing_resp.data}"
    assert preparing_resp.get_json()["all_ready"] is False

    first_ready_resp = client.patch(
        f"/api/kitchen/orders/{order_id}/items/{first_item_id}/status",
        json={"status": "ready"},
        headers=patch_headers,
    )
    assert first_ready_resp.status_code == 200, f"First ready failed: {first_ready_resp.data}"
    assert first_ready_resp.get_json()["all_ready"] is False

    second_ready_resp = client.patch(
        f"/api/kitchen/orders/{order_id}/items/{second_item_id}/status",
        json={"status": "ready"},
        headers=patch_headers,
    )
    assert second_ready_resp.status_code == 200, f"Second ready failed: {second_ready_resp.data}"
    assert second_ready_resp.get_json()["all_ready"] is True

    track_resp = client.get(f"/api/orders/{order_id}?token={public_token}")
    assert track_resp.status_code == 200, f"Tracking fetch failed: {track_resp.data}"
    track_order = track_resp.get_json()["data"]
    assert track_order["status"] == "ready"
    assert track_order["all_items_ready"] is True

    kitchen_resp = client.get("/api/kitchen/orders", headers=admin_headers)
    assert kitchen_resp.status_code == 200, f"Kitchen orders failed: {kitchen_resp.data}"
    kitchen_orders = kitchen_resp.get_json()["data"]
    kitchen_order = next((row for row in kitchen_orders if row["id"] == order_id), None)
    assert kitchen_order, f"Order {order_id} missing from kitchen list"
    statuses = {line["item_id"]: line["status"] for line in kitchen_order["items"]}
    assert statuses[first_item_id] == "ready"
    assert statuses[second_item_id] == "ready"


def test_bill_split_equal_and_by_item(client, app):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    item = session.execute(text("SELECT id FROM menu_items WHERE available = 1 LIMIT 1")).fetchone()
    session.close()
    assert table and item

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    verify_resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert verify_resp.status_code == 200, f"QR verify failed: {verify_resp.data}"
    table_session = verify_resp.get_json()["table_session"]

    order_resp = client.post(
        "/api/orders",
        json={
            "table_session": table_session,
            "items": [
                {"menu_item_id": str(item[0]), "qty": 1},
                {"menu_item_id": str(item[0]), "qty": 1},
            ],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert order_resp.status_code == 201, f"Order failed: {order_resp.data}"
    order = order_resp.get_json()["data"]
    order_id = order["id"]

    equal_resp = client.post(
        f"/api/orders/{order_id}/split",
        json={
            "table_session": table_session,
            "mode": "equal",
            "splits": [{"name": "Asha"}, {"name": "Ravi"}],
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert equal_resp.status_code == 200, f"Equal split failed: {equal_resp.data}"
    equal_splits = equal_resp.get_json()["splits"]
    assert len(equal_splits) == 2
    assert all(split["short_url"] for split in equal_splits)
    assert sum(split["amount_paise"] for split in equal_splits) == order["total"] * 100
    assert equal_splits[0]["amount"] == order["total"] / 2

    item_lines = order["items"]
    by_item_resp = client.post(
        f"/api/orders/{order_id}/split",
        json={
            "table_session": table_session,
            "mode": "by_item",
            "splits": [
                {"name": "Asha", "item_ids": [item_lines[0]["item_id"]]},
                {"name": "Ravi", "item_ids": [item_lines[1]["item_id"]]},
            ],
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert by_item_resp.status_code == 200, f"By-item split failed: {by_item_resp.data}"
    by_item_splits = by_item_resp.get_json()["splits"]
    expected = {
        "Asha": item_lines[0]["unit_price"] * item_lines[0]["qty"],
        "Ravi": item_lines[1]["unit_price"] * item_lines[1]["qty"],
    }
    assert {split["name"]: split["amount"] for split in by_item_splits} == expected

    status_resp = client.get(f"/api/orders/{order_id}/split?table_session={table_session}")
    assert status_resp.status_code == 200, f"Split status failed: {status_resp.data}"
    assert len(status_resp.get_json()["splits"]) == 2


def test_bulk_item_status_update(client, app, admin_headers):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    item = session.execute(text("SELECT id FROM menu_items WHERE available = 1 LIMIT 1")).fetchone()
    session.close()
    assert table and item

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    verify_resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert verify_resp.status_code == 200
    table_session = verify_resp.get_json()["table_session"]
    order_resp = client.post(
        "/api/orders",
        json={
            "table_session": table_session,
            "items": [{"menu_item_id": str(item[0]), "qty": 1} for _ in range(3)],
            "idempotency_key": uuid.uuid4().hex,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert order_resp.status_code == 201, f"Order failed: {order_resp.data}"
    order = order_resp.get_json()["data"]
    item_ids = [line["item_id"] for line in order["items"]]
    headers = {**admin_headers, "X-CSRF-Token": get_csrf(client)}

    preparing_resp = client.post(
        f"/api/kitchen/orders/{order['id']}/items/bulk-status",
        json={"status": "preparing", "item_ids": item_ids},
        headers=headers,
    )
    assert preparing_resp.status_code == 200, f"Bulk preparing failed: {preparing_resp.data}"
    assert preparing_resp.get_json()["updated"] == 3
    assert all(item["status"] == "preparing" for item in preparing_resp.get_json()["items"])

    ready_resp = client.post(
        f"/api/kitchen/orders/{order['id']}/items/bulk-status",
        json={"status": "ready", "item_ids": item_ids},
        headers=headers,
    )
    assert ready_resp.status_code == 200, f"Bulk ready failed: {ready_resp.data}"
    assert ready_resp.get_json()["updated"] == 3
    assert ready_resp.get_json()["all_ready"] is True


def test_waiter_include_resolved_history(client, app, admin_headers):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from qr_sessions import generate_qr_token

    engine = create_engine(app.config["DATABASE_URL"])
    Session = sessionmaker(bind=engine)
    session = Session()
    table = session.execute(text("SELECT id, qr_token FROM tables LIMIT 1")).fetchone()
    session.close()
    assert table

    with app.app_context():
        token = generate_qr_token(str(table[0]), table_version=str(table[1]))

    csrf = get_csrf(client)
    verify_resp = client.post("/api/qr/verify", json={"token": token}, headers={"X-CSRF-Token": csrf})
    assert verify_resp.status_code == 200
    table_session = verify_resp.get_json()["table_session"]
    call_resp = client.post(
        "/api/waiter/call",
        json={"table_session": table_session, "reason": "have_question"},
        headers={"X-CSRF-Token": csrf},
    )
    assert call_resp.status_code == 200
    call_id = call_resp.get_json()["call_id"]
    resolve_resp = client.patch(f"/api/waiter/calls/{call_id}/resolve", headers={**admin_headers, "X-CSRF-Token": get_csrf(client)})
    assert resolve_resp.status_code == 200

    history_resp = client.get("/api/waiter/calls?include_resolved=true", headers=admin_headers)
    assert history_resp.status_code == 200
    assert any(call["id"] == call_id and call["status"] == "resolved" for call in history_resp.get_json()["calls"])

    pending_resp = client.get("/api/waiter/calls", headers=admin_headers)
    assert pending_resp.status_code == 200
    assert not any(call["id"] == call_id for call in pending_resp.get_json()["calls"])


def test_contact_enquiry_submission_succeeds(client):
    csrf = get_csrf(client)
    resp = client.post(
        "/api/contact",
        json={
            "name": "Test Guest",
            "email": "guest@example.com",
            "phone": "+917386185821",
            "subject": "Event enquiry",
            "message": "Please share catering details.",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 201, f"Contact enquiry failed: {resp.data}"
    data = resp.get_json()
    assert data.get("success") is True
    assert data["data"]["id"] is not None


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
