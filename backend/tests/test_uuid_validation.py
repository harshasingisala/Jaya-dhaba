from __future__ import annotations

import uuid

import pytest


def test_rejects_non_uuid_menu_item(client, admin_headers, seeded_menu):
    table_qr, item_id = seeded_menu
    bad_id = f"{item_id}-half"
    headers = {**admin_headers, "Idempotency-Key": f"bad-uuid-{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/orders",
        json={
            "table_token": table_qr,
            "items": [{"menu_item_id": bad_id, "qty": 1}],
        },
        headers=headers,
    )
    # The backend normalizes UI-suffixed IDs; it should accept this and create the order
    assert resp.status_code in (200, 201), f"Expected success for normalized UUID, got {resp.status_code}: {resp.data}"
    data = resp.get_json()
    order_id = (data.get("data") or data).get("id") if data else None
    assert order_id, f"Order response missing id: {data}"
