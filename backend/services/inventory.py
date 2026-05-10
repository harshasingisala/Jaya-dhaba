from sqlalchemy import select, update
from models import InventoryItem, StockTransaction, OrderItem
import uuid


def deduct_stock_for_order(session, order_id: uuid.UUID, actor_id: uuid.UUID = None):
    """
    Deducts inventory levels for all items in an order.
    Should be called when order status moves to 'PREPARING'.
    """
    order_items = session.execute(
        select(OrderItem).filter_by(order_id=order_id)
    ).scalars().all()
    
    for item in order_items:
        inventory = session.execute(
            select(InventoryItem).filter_by(menu_item_id=item.menu_item_id)
        ).scalar_one_or_none()
        
        if inventory:
            delta = -float(item.qty)
            inventory.quantity += delta
            
            # Log transaction
            tx = StockTransaction(
                inventory_item_id=inventory.id,
                delta=delta,
                type="deduction",
                reason=f"Order #{order_id}",
                created_by=actor_id
            )
            session.add(tx)
    
    session.commit()
