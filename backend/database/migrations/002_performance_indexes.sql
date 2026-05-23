-- Phase 23 performance indexes for Supabase/Postgres.
-- Run in Supabase SQL editor after deployment.

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
    ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_date
    ON orders((DATE(created_at)));

CREATE INDEX IF NOT EXISTS idx_orders_payment_method
    ON orders(payment_method);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
    ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id
    ON order_items(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_available
    ON menu_items(available)
    WHERE available = true;

CREATE INDEX IF NOT EXISTS idx_menu_items_category_id
    ON menu_items(category_id);

CREATE INDEX IF NOT EXISTS idx_reservations_reserved_at
    ON reservations(reserved_at);

CREATE INDEX IF NOT EXISTS idx_reservations_status
    ON reservations(status);

CREATE INDEX IF NOT EXISTS idx_contact_is_read
    ON contact_submissions(is_read)
    WHERE is_read = false;
