from sqlalchemy import select
from models import MenuCategory, MenuItem, Order
from db import get_db


def calculate_order_totals(session, order_items_data):
    """
    Calculates subtotal, tax, and total based on dynamic GST rates.
    order_items_data: List of dicts with {menu_item_id, qty}
    """
    subtotal = 0
    total_tax = 0
    
    # Pre-fetch all items and categories for efficiency
    item_ids = [item["menu_item_id"] for item in order_items_data]
    items = session.execute(
        select(MenuItem, MenuCategory)
        .join(MenuCategory, MenuItem.category_id == MenuCategory.id)
        .filter(MenuItem.id.in_(item_ids))
    ).all()
    
    item_map = {}
    for item in items:
        item_id = item.MenuItem.id
        item_map[str(item_id)] = (item.MenuItem, item.MenuCategory)
        if hasattr(item_id, "hex"):
            item_map[item_id.hex] = (item.MenuItem, item.MenuCategory)
    
    for item_req in order_items_data:
        lookup_id = item_req["menu_item_id"]
        found = item_map.get(str(lookup_id)) or item_map.get(getattr(lookup_id, "hex", ""))
        if not found:
            continue
        menu_item, category = found
        if not menu_item:
            continue
            
        qty = item_req["qty"]
        line_subtotal = menu_item.price * qty
        
        # GST calculation
        cgst_amt = int(line_subtotal * (category.cgst_rate / 100))
        sgst_amt = int(line_subtotal * (category.sgst_rate / 100))
        
        subtotal += line_subtotal
        total_tax += (cgst_amt + sgst_amt)
        
    return {
        "subtotal": subtotal,
        "tax": total_tax,
        "total": subtotal + total_tax
    }
