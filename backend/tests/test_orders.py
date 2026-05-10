import uuid
import pytest
from sqlalchemy import select
from models import Order, InventoryItem, StockTransaction, MenuItem, RestaurantTable

def test_order_creation_and_inventory_deduct(client, app):
    from conftest import auth_headers, get_csrf
    headers = auth_headers(client)
    
    # 1. Get Table and Item IDs from DB
    with app.app_context():
        import db
        with db.get_db() as session:
            item = session.execute(select(MenuItem)).scalar()
            table = session.execute(select(RestaurantTable)).scalar()
            
            # Setup Inventory
            inv = InventoryItem(menu_item_id=item.id, quantity=10.0)
            session.add(inv)
            session.commit()
            
            item_id = str(item.id)
            table_id = str(table.id)

    # 2. Create Order
    payload = {
        "table_id": table_id,
        "guest_name": "Test Guest",
        "items": [
            {"menu_item_id": item_id, "qty": 2}
        ],
        "order_type": "dine_in"
    }
    
    # Add Idempotency key
    headers["Idempotency-Key"] = "test-idemp-1"
    
    resp = client.post("/api/orders", json=payload, headers=headers)
    assert resp.status_code == 201
    order_data = resp.get_json()["data"]
    order_id = order_data["id"]
    
    assert order_data["subtotal"] == 1000
    assert order_data["tax"] == 50
    assert order_data["total"] == 1050

    # 3. Update Status to 'preparing' (Triggers Inventory Deduct)
    status_payload = {"status": "preparing"}
    resp = client.patch(f"/api/admin/orders/{order_id}/status", json=status_payload, headers=headers)
    assert resp.status_code == 200
    
    # 4. Verify Inventory Deduction
    with app.app_context():
        with db.get_db() as session:
            inv = session.execute(select(InventoryItem).filter_by(menu_item_id=uuid.UUID(item_id))).scalar()
            assert inv.quantity == 8.0 # 10 - 2
            
            # Verify Audit Log entry
            from models import AuditLog
            audit = session.execute(select(AuditLog).filter_by(action="order.status_change")).first()
            assert audit is not None
