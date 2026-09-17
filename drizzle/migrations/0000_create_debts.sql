CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'aberto',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO anon, authenticated;
GRANT ALL ON public.debts TO service_role;

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Debts: open access" ON public.debts;
CREATE POLICY "Debts: open access" ON public.debts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'dinheiro',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_payments TO anon, authenticated;
GRANT ALL ON public.debt_payments TO service_role;

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Debt payments: open access" ON public.debt_payments;
CREATE POLICY "Debt payments: open access" ON public.debt_payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_debts_customer ON public.debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON public.debt_payments(debt_id);

CREATE OR REPLACE FUNCTION public.apply_debt_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.debts
    SET paid_amount = paid_amount + NEW.amount,
        status = CASE WHEN paid_amount + NEW.amount >= amount THEN 'pago' ELSE 'aberto' END,
        updated_at = now()
  WHERE id = NEW.debt_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_debt_payment ON public.debt_payments;
CREATE TRIGGER trg_apply_debt_payment
AFTER INSERT ON public.debt_payments
FOR EACH ROW EXECUTE FUNCTION public.apply_debt_payment();

DROP TRIGGER IF EXISTS trg_debts_updated ON public.debts;
CREATE TRIGGER trg_debts_updated
BEFORE UPDATE ON public.debts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();