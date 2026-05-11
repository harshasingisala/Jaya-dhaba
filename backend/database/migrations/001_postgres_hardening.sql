-- Jaya Dhaba Postgres Hardening Migration

-- 1. Immutable Audit Log Trigger
CREATE OR REPLACE FUNCTION prevent_audit_tamper()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_tamper ON audit_log;
CREATE TRIGGER trg_prevent_audit_tamper
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_tamper();

-- 2. Soft Delete View Helper (Example for Menu Items)
-- This allows us to query 'menu_items_active' instead of checking deleted_at every time
CREATE OR REPLACE VIEW menu_items_active AS
SELECT * FROM menu_items WHERE deleted_at IS NULL;

-- 3. Automatic updated_at Update Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER trg_update_menu_items_updated_at
BEFORE UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Payment attempt binding
-- Checkout verification must match the Razorpay order id created by this backend.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_order_id
ON payments (razorpay_order_id)
WHERE razorpay_order_id IS NOT NULL;
