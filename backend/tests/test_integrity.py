import sqlite3
import uuid

import pytest

import db
import routes.orders as orders_module
from conftest import auth_headers, create_order, csrf_headers, order_payload


def sqlite_path(app):
    return app.config["DATABASE_URL"].replace("sqlite:///", "")


def test_order_idempotent(client):
    key = str(uuid.uuid4())
    headers = auth_headers(client, extra={"Idempotency-Key": key})
    payload = order_payload(client)

    first = client.post("/api/orders", json=payload, headers=headers)
    second = client.post("/api/orders", json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.get_json()["id"] == second.get_json()["id"]


def test_order_rollback_on_failure(client, app, monkeypatch):
    conn = sqlite3.connect(sqlite_path(app))
    try:
        before = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    finally:
        conn.close()

    def boom(*args, **kwargs):
        raise RuntimeError("audit failed")

    monkeypatch.setattr(orders_module, "audit", boom)
    with pytest.raises(RuntimeError):
        client.post("/api/orders", json=order_payload(client), headers=auth_headers(client, extra={"Idempotency-Key": "rollback-key-1"}))

    conn = sqlite3.connect(sqlite_path(app))
    try:
        after = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    finally:
        conn.close()
    assert after == before


def test_loyalty_atomic(client, app):
    with db.transaction(app.config["DATABASE_URL"]) as conn:
        user_id = db.create_user(conn, email="loyalty@example.com", phone=None, password="LoyaltyPass123!", role="customer")
        conn.execute("UPDATE users SET loyalty_points = 100 WHERE id = ?", (user_id,))

    headers = auth_headers(client, email="loyalty@example.com", password="LoyaltyPass123!")
    payload = order_payload(client, loyalty_points=100)
    first = client.post("/api/orders", json=payload, headers={**headers, "Idempotency-Key": "loyalty-1"})
    second = client.post("/api/orders", json=payload, headers={**headers, "Idempotency-Key": "loyalty-2"})

    codes = sorted([first.status_code, second.status_code])
    assert 201 in codes
    assert 409 in codes


def test_every_order_has_audit_log(client, app):
    created = create_order(client, key="audit-check-order")
    conn = sqlite3.connect(sqlite_path(app))
    try:
        row = conn.execute("SELECT id FROM audit_log WHERE entity_type = 'order' AND entity_id = ?", (str(created["id"]),)).fetchone()
    finally:
        conn.close()
    assert row is not None
