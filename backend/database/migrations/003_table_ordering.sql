-- QR table ordering support for PostgreSQL / Supabase Postgres.
-- Existing tables are extended in place; no data is dropped.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_token VARCHAR(100) UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    label VARCHAR(50) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 4,
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number INTEGER UNIQUE,
    user_id UUID,
    table_id UUID REFERENCES tables(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    subtotal INTEGER NOT NULL DEFAULT 0,
    tax INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    guest_name VARCHAR(100) NOT NULL DEFAULT '',
    order_type VARCHAR(20) NOT NULL DEFAULT 'dine_in',
    source VARCHAR(20) NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    served_at TIMESTAMPTZ,
    is_archived BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0)
);

ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_token VARCHAR(100);
ALTER TABLE tables ADD COLUMN IF NOT EXISTS label VARCHAR(50);
ALTER TABLE tables ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 4;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

UPDATE tables
SET qr_token = gen_random_uuid()::text
WHERE qr_token IS NULL OR qr_token = '';

ALTER TABLE tables ALTER COLUMN qr_token SET NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'dine_in';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS menu_item_id UUID REFERENCES menu_items(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_qr_token_unique ON tables(qr_token);
CREATE INDEX IF NOT EXISTS idx_tables_label ON tables(label);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_table
ON orders(table_id)
WHERE table_id IS NOT NULL
  AND COALESCE(is_archived, false) = false
  AND status NOT IN ('served', 'cancelled');
