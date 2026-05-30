-- Jaya Dhaba Supabase RLS and audit hardening.
-- Apply in Supabase SQL editor after reviewing table names against production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_closures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.sessions FROM anon;
REVOKE ALL ON TABLE public.payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.loyalty_ledger FROM anon;
REVOKE ALL ON TABLE public.stock_transactions FROM anon;

DO $$
BEGIN
    CREATE POLICY menu_categories_public_read ON public.menu_categories
        FOR SELECT TO anon, authenticated
        USING (active IS TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY menu_items_public_read ON public.menu_items
        FOR SELECT TO anon, authenticated
        USING (available IS TRUE AND deleted_at IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY tables_public_active_read ON public.tables
        FOR SELECT TO anon, authenticated
        USING (active IS TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY users_own_profile ON public.users
        FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY users_own_profile_update ON public.users
        FOR UPDATE TO authenticated
        USING ((SELECT auth.uid()) = id)
        WITH CHECK ((SELECT auth.uid()) = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY sessions_own_rows ON public.sessions
        FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY orders_customer_read ON public.orders
        FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY order_items_customer_read ON public.order_items
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1
                FROM public.orders o
                WHERE o.id = order_items.order_id
                  AND o.user_id = (SELECT auth.uid())
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY reservations_customer_read ON public.reservations
        FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY payments_no_direct_access ON public.payments
        FOR ALL TO anon, authenticated
        USING (false)
        WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY audit_log_no_direct_read ON public.audit_log
        FOR SELECT TO anon, authenticated
        USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY audit_log_service_insert_only ON public.audit_log
        FOR INSERT TO service_role
        WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE VIEW public.menu_items_active
WITH (security_invoker = true)
AS
SELECT *
FROM public.menu_items
WHERE deleted_at IS NULL;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.audit_orders_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, payload, ip_address, user_agent, created_at)
    VALUES (
        'db.orders.' || lower(TG_OP),
        'order',
        COALESCE(NEW.id, OLD.id)::text,
        jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)),
        '0.0.0.0',
        'database-trigger',
        now()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.audit_orders_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_orders_changes ON public.orders;
CREATE TRIGGER trg_audit_orders_changes
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.audit_orders_changes();

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
