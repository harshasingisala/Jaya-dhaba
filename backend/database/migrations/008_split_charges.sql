-- Bill splitting and split payment links.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid';
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_rotated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS split_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    amount INTEGER NOT NULL,
    razorpay_link_id VARCHAR(120) UNIQUE NOT NULL,
    short_url VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_charges_order_id ON split_charges(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_split_charges_link_id ON split_charges(razorpay_link_id);
