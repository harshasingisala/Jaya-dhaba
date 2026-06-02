-- Production safety patch.
-- 1) Add order item kitchen status columns if an older production database missed migration 007.
-- 2) Enable RLS for public tables flagged by Supabase Advisor.
--
-- The tables below are server-managed and should not be directly readable or
-- writable through the Supabase browser/client API.

ALTER TABLE IF EXISTS public.order_items
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS public.order_items
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.order_items
    ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_order_items_status ON public.order_items(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_status ON public.order_items(order_id, status);

ALTER TABLE IF EXISTS public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_number_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.split_charges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contact_submissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.order_number_counter FROM anon, authenticated;
REVOKE ALL ON TABLE public.split_charges FROM anon, authenticated;

DO $$
BEGIN
    CREATE POLICY contact_submissions_no_direct_access ON public.contact_submissions
        FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY order_number_counter_no_direct_access ON public.order_number_counter
        FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY split_charges_no_direct_access ON public.split_charges
        FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
