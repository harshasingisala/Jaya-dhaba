#!/usr/bin/env python
"""
Direct test of the orders.create_order() validation flow.
Simulates exactly what happens when POST /api/orders is called.
"""
import json
import sys
sys.path.insert(0, '/backend')

# Mock Flask request object
class MockRequest:
    def __init__(self, json_data):
        self._json = json_data
        self._data = json.dumps(json_data).encode('utf-8')
    
    def get_data(self, cache=True):
        return self._data
    
    def get_json(self, silent=True):
        return self._json

# Simulate the exact normalization that happens in create_order()
def simulate_create_order(json_payload):
    """Simulate the exact flow in backend/routes/orders.py::create_order()"""
    import uuid
    
    print("\n" + "=" * 80)
    print("SIMULATING: backend/routes/orders.py::create_order()")
    print("=" * 80)
    
    # Step 1: Get raw JSON (exactly as in the code)
    raw = json_payload
    print(f"\n[STEP 1] get_json() returns: {json.dumps(raw, indent=2)}")
    
    # Step 2: Extract items and normalize (exactly as in the code)
    items_raw = raw.get("items", [])
    print(f"\n[STEP 2] Extracted {len(items_raw)} items, now normalizing...")
    
    for i, it in enumerate(items_raw):
        mid = it.get("menu_item_id")
        print(f"\n  Item {i}:")
        print(f"    Before: menu_item_id = {mid!r}")
        
        if isinstance(mid, str) and (mid.endswith("-half") or mid.endswith("-full")):
            try:
                candidate = mid[: mid.rfind("-")]
                uuid.UUID(candidate)
                it["menu_item_id"] = candidate
                print(f"    After:  menu_item_id = {candidate!r} (normalized)")
            except Exception as e:
                print(f"    ERROR:  {e}")
        else:
            print(f"    Status: No suffix, kept as-is")
    
    # Step 3: Show the payload that will be sent to Pydantic
    print(f"\n[STEP 3] Final payload for Pydantic validation:")
    print(f"  {json.dumps(raw, indent=4)}")
    
    # Step 4: Validate with Pydantic (simulate)
    print(f"\n[STEP 4] Simulating Pydantic OrderCreate.model_validate()...")
    for i, it in enumerate(items_raw):
        mid = it.get("menu_item_id")
        try:
            uuid.UUID(mid)
            print(f"  Item {i}: menu_item_id = {mid!r} ✓ Valid UUID")
        except Exception as e:
            print(f"  Item {i}: menu_item_id = {mid!r} ✗ INVALID - {e}")
            return False
    
    print("\n[RESULT] ✓ All menu_item_id values are valid UUIDs")
    return True

# Test Case 1: Suffixed IDs from frontend (should be normalized)
print("\n\n" + "#" * 80)
print("TEST CASE 1: Frontend sends suffixed menu_item_id (like '-half')")
print("#" * 80)

payload1 = {
    "table_id": "00000000-0000-0000-0000-000000000001",
    "items": [
        {"menu_item_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479-half", "qty": 1, "special_note": ""}
    ],
    "order_type": "dine_in",
    "guest_name": "Test",
    "guest_phone": "1234567890"
}

simulate_create_order(payload1)

# Test Case 2: Clean UUIDs (should pass through unchanged)
print("\n\n" + "#" * 80)
print("TEST CASE 2: Frontend sends clean UUIDs (no suffix)")
print("#" * 80)

payload2 = {
    "table_id": "00000000-0000-0000-0000-000000000001",
    "items": [
        {"menu_item_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "qty": 1, "special_note": ""}
    ],
    "order_type": "dine_in",
    "guest_name": "Test",
    "guest_phone": "1234567890"
}

simulate_create_order(payload2)

# Test Case 3: Invalid UUID (should fail)
print("\n\n" + "#" * 80)
print("TEST CASE 3: Invalid UUID received (no suffix to strip)")
print("#" * 80)

payload3 = {
    "table_id": "00000000-0000-0000-0000-000000000001",
    "items": [
        {"menu_item_id": "not-a-uuid", "qty": 1, "special_note": ""}
    ],
    "order_type": "dine_in",
    "guest_name": "Test",
    "guest_phone": "1234567890"
}

simulate_create_order(payload3)

print("\n\n" + "=" * 80)
print("CONCLUSION")
print("=" * 80)
print("""
If you are seeing "Input should be a valid UUID" error on the real /api/orders:

1. The frontend is NOT sending menu_item_id with the suffix stripped
2. OR the frontend normalization patch was not applied correctly
3. OR the browser is serving a stale JS bundle

VERIFICATION:
- Open browser DevTools (F12)
- Go to Network tab
- Try to place an order
- Find the POST /api/orders request
- Click it and view the Request Body in the "Request" tab
- Look at the "items[0].menu_item_id" field - does it end with "-half" or "-full"?
  - If YES: Frontend normalization is not working (patch not applied or browser cache)
  - If NO: Backend is receiving clean UUID, so error is from a different field
""")
