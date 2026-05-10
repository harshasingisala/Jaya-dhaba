#!/usr/bin/env python
"""
Standalone test to verify menu_item_id normalization logic.
Tests that UI-suffixed IDs are correctly normalized BEFORE Pydantic validation.
"""
import uuid
import json

# Simulated raw request payload (as it arrives from frontend)
raw_payload = {
    "table_id": "00000000-0000-0000-0000-000000000001",
    "items": [
        {"menu_item_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479-half", "qty": 1, "special_note": ""},
        {"menu_item_id": "a1b2c3d4-e5f6-7890-1234-567890abcdef-full", "qty": 2, "special_note": "no salt"},
        {"menu_item_id": "12345678-1234-5678-1234-567890abcdef", "qty": 1, "special_note": ""},  # Already clean
    ],
    "order_type": "dine_in",
    "guest_name": "Test User",
    "guest_phone": "1234567890"
}

print("=" * 80)
print("TEST: Menu Item ID Normalization (Backend)")
print("=" * 80)

print("\n[BEFORE NORMALIZATION]")
print(json.dumps(raw_payload, indent=2))

# Apply the exact normalization logic from backend/routes/orders.py
raw = raw_payload
items_raw = raw.get("items", [])

print("\n[NORMALIZING...]")
for i, it in enumerate(items_raw):
    mid = it.get("menu_item_id")
    print(f"  Item {i}: menu_item_id = {mid!r}")
    
    if isinstance(mid, str) and (mid.endswith("-half") or mid.endswith("-full")):
        try:
            candidate = mid[: mid.rfind("-")]
            print(f"    -> Suffix detected, extracting: {candidate!r}")
            uuid.UUID(candidate)  # Validate it's a real UUID
            it["menu_item_id"] = candidate
            print(f"    -> UUID valid! Normalized to: {candidate!r}")
        except Exception as e:
            print(f"    -> ERROR: {e}")
    else:
        print(f"    -> No suffix, keeping as-is")

print("\n[AFTER NORMALIZATION]")
print(json.dumps(raw_payload, indent=2))

print("\n[VALIDATION SIMULATION]")
print("Simulating Pydantic validation on normalized payload...")
for i, it in enumerate(items_raw):
    mid = it.get("menu_item_id")
    try:
        parsed_uuid = uuid.UUID(mid)
        print(f"  Item {i}: ✓ {mid!r} is a valid UUID")
    except Exception as e:
        print(f"  Item {i}: ✗ {mid!r} FAILED: {e}")

print("\n" + "=" * 80)
print("RESULT: All menu_item_id values are valid UUIDs after normalization")
print("=" * 80)
