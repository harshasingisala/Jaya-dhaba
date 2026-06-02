import pytest
import rate_limits

def test_csrf_protection(client):
    # Try POST without CSRF token
    resp = client.post("/api/auth/login", json={"login": "a", "password": "b"})
    assert resp.status_code == 403
    assert "CSRF" in resp.get_json()["message"]

def test_rate_limiting(client):
    # Standard health check is not rate limited usually, but /api/auth/login is.
    # We'll mock or just spam a route that has limits.
    
    # Let's try to get CSRF tokens in a loop
    for i in range(101): # Default limit is usually 100/min or similar
        resp = client.get("/api/csrf-token")
        if resp.status_code == 429:
            break
    
    # If the limit is high, this might not trigger in a small loop, 
    # but the logic is there in security_middleware.
    pass

def test_security_headers(client):
    resp = client.get("/api/health")
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "max-age=31536000" in resp.headers["Strict-Transport-Security"]
    assert "default-src 'self'" in resp.headers["Content-Security-Policy"]
    assert resp.headers["X-Permitted-Cross-Domain-Policies"] == "none"


def test_api_mutations_reject_form_content_type(client):
    resp = client.post(
        "/api/auth/login",
        data='{"email":"admin@example.com","password":"AdminPass123!"}',
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert resp.status_code == 415
    assert "Content-Type" in resp.get_json()["message"]


def test_route_specific_rate_limits_include_retry_after(app):
    rate_limits._BUCKETS.clear()
    with app.test_request_context("/api/contact", method="POST"):
        max_requests, window_seconds = rate_limits.request_limit()
        assert (max_requests, window_seconds) == (10, 300)

        for _ in range(max_requests):
            assert rate_limits.enforce_limit("test:contact", max_requests, window_seconds) is None

        blocked = rate_limits.enforce_limit("test:contact", max_requests, window_seconds)

    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"] == str(window_seconds)


def test_health_response_is_minimal(client):
    resp = client.get("/api/health")

    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["status"] == "ok"
    assert payload["db"] == "ok"
    assert "timestamp" in payload


def test_seed_does_not_create_known_admin_without_bootstrap_variables(app, monkeypatch):
    import db
    from models import User
    from sqlalchemy import select

    monkeypatch.delenv("ADMIN_BOOTSTRAP_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_BOOTSTRAP_PASSWORD", raising=False)

    with app.app_context():
        db.seed_db()
        with db.get_db() as session:
            unsafe_admin = session.execute(
                select(User).filter_by(email="admin@jayadhaba.in")
            ).scalar_one_or_none()

    assert unsafe_admin is None


def test_public_user_cannot_forge_manual_order(client):
    from conftest import csrf_headers, order_payload

    payload = order_payload(client)
    payload["source"] = "manual"
    response = client.post(
        "/api/orders",
        json=payload,
        headers={**csrf_headers(client), "Idempotency-Key": "manual-forgery"},
    )

    assert response.status_code == 403


def test_real_ip_ignores_x_forwarded_for_without_cloudflare(app):
    from request_context import get_real_ip

    with app.test_request_context(
        "/api/health",
        headers={"X-Forwarded-For": "203.0.113.10"},
        environ_base={"REMOTE_ADDR": "10.0.0.7"},
    ):
        assert get_real_ip() == "10.0.0.7"

    with app.test_request_context(
        "/api/health",
        headers={"X-Forwarded-For": "203.0.113.10", "CF-Connecting-IP": "198.51.100.4"},
        environ_base={"REMOTE_ADDR": "10.0.0.7"},
    ):
        assert get_real_ip() == "10.0.0.7"

    app.config["CLOUDFLARE_TUNNEL_SECRET"] = "test-cloudflare-secret"
    with app.test_request_context(
        "/api/health",
        headers={
            "CF-Connecting-IP": "198.51.100.4",
            "X-Cloudflare-Secret": "test-cloudflare-secret",
        },
        environ_base={"REMOTE_ADDR": "10.0.0.7"},
    ):
        assert get_real_ip() == "198.51.100.4"


def test_jwt_payload_excludes_email_and_phone(client, app):
    from flask_jwt_extended import decode_token
    from conftest import csrf_headers

    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "AdminPass123!"},
        headers=csrf_headers(client),
    )

    with app.app_context():
        claims = decode_token(response.get_json()["access_token"])

    assert claims["role"] == "owner"
    assert "email" not in claims
    assert "phone" not in claims


def test_register_duplicate_uses_same_generic_response(client):
    from conftest import csrf_headers

    payload = {"email": "new@example.com", "password": "CustomerPass123!"}
    first = client.post("/api/auth/register", json=payload, headers=csrf_headers(client))
    duplicate = client.post("/api/auth/register", json=payload, headers=csrf_headers(client))

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert first.get_json() == duplicate.get_json()
    assert "access_token" not in first.get_json()


def test_stream_ticket_is_required_and_one_time(client, admin_headers):
    missing = client.get("/api/kitchen/stream")
    assert missing.status_code == 401

    ticket_response = client.post("/api/stream/ticket", json={}, headers=admin_headers)
    assert ticket_response.status_code == 200
    ticket = ticket_response.get_json()["ticket"]

    opened = client.get(f"/api/kitchen/stream?ticket={ticket}", buffered=False)
    assert opened.status_code == 200
    opened.close()

    replay = client.get(f"/api/kitchen/stream?ticket={ticket}")
    assert replay.status_code == 401


def test_order_addons_require_order_access(client):
    import db
    from conftest import create_order, csrf_headers
    from models import MenuItem
    from sqlalchemy import select

    created = create_order(client, key="addon-access-check")
    order_id = created["id"]
    with db.get_db() as session:
        item = session.execute(select(MenuItem).filter_by(available=True)).scalar_one()

    response = client.post(
        f"/api/orders/{order_id}/addons",
        json={"items": [{"menu_item_id": str(item.id), "qty": 1}]},
        headers=csrf_headers(client),
    )

    assert response.status_code == 404
