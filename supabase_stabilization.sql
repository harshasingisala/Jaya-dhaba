-- Jaya Dhaba stabilization script
-- Safe to run multiple times in Supabase SQL Editor.

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'orders'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.orders', trigger_record.trigger_name);
  END LOOP;
END $$;

DO $$
DECLARE
  function_record RECORD;
BEGIN
  FOR function_record IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname ILIKE 'validate_order_items%'
        OR p.proname ILIKE '%validate%order%item%'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)', function_record.nspname, function_record.proname, function_record.args);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT DEFAULT 'Jaya Dhaba',
  tagline TEXT DEFAULT 'Where Heritage Meets the Golden Hour',
  hours TEXT DEFAULT '11:00 AM - 11:30 PM',
  contact TEXT DEFAULT '073861 85823',
  status TEXT DEFAULT 'Open',
  address TEXT DEFAULT 'East Marredpally, Secunderabad',
  tax_rate NUMERIC DEFAULT 5,
  currency TEXT DEFAULT 'INR',
  upi_id TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_daily_analytics_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.daily_analytics (id, revenue, total_orders)
  VALUES (1, COALESCE(NEW.total, 0), 1)
  ON CONFLICT (id) DO UPDATE
    SET revenue = COALESCE(public.daily_analytics.revenue, 0) + COALESCE(NEW.total, 0),
        total_orders = COALESCE(public.daily_analytics.total_orders, 0) + 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_daily_analytics_insert ON public.orders;
CREATE TRIGGER orders_daily_analytics_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.increment_daily_analytics_on_order();

CREATE OR REPLACE FUNCTION public.get_hourly_revenue()
RETURNS TABLE(hour INTEGER, revenue NUMERIC, total_orders BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXTRACT(HOUR FROM created_at)::INTEGER AS hour,
    COALESCE(SUM(total), 0)::NUMERIC AS revenue,
    COUNT(*)::BIGINT AS total_orders
  FROM public.orders
  WHERE created_at >= date_trunc('day', NOW())
  GROUP BY EXTRACT(HOUR FROM created_at)
  ORDER BY hour;
$$;

CREATE OR REPLACE FUNCTION public.get_top_items(lim INT DEFAULT 5)
RETURNS TABLE(name TEXT, qty BIGINT, revenue NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    item->>'name' AS name,
    COALESCE(SUM((item->>'qty')::INT), 0)::BIGINT AS qty,
    COALESCE(SUM(((item->>'qty')::INT) * ((item->>'price')::NUMERIC)), 0)::NUMERIC AS revenue
  FROM public.orders
  CROSS JOIN LATERAL jsonb_array_elements(items) AS item
  WHERE item ? 'name'
  GROUP BY item->>'name'
  ORDER BY qty DESC, revenue DESC
  LIMIT lim;
$$;
