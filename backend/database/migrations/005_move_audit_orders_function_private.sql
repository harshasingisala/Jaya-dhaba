-- Move the privileged orders audit trigger function out of the exposed public schema.

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

DROP FUNCTION IF EXISTS public.audit_orders_changes();
