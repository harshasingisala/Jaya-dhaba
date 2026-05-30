-- Indexes for high-concurrency admin dashboards and kitchen screens.

CREATE INDEX IF NOT EXISTS idx_orders_live_status_created
    ON orders(status, created_at DESC)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_orders_live_created
    ON orders(created_at DESC)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_orders_archived_at
    ON orders(archived_at DESC)
    WHERE is_archived = true;

CREATE INDEX IF NOT EXISTS idx_orders_today_created_total
    ON orders(created_at DESC, total);
