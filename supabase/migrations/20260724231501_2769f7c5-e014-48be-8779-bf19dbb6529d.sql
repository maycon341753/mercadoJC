-- ENUMS
CREATE TYPE public.stock_movement_type AS ENUM ('entrada','saida','ajuste','perda');
CREATE TYPE public.financial_type AS ENUM ('receita','despesa');
CREATE TYPE public.financial_status AS ENUM ('pendente','pago','cancelado');

-- STOCK MOVEMENTS
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,2),
  reason TEXT,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_mov_product ON public.stock_movements(product_id);
CREATE INDEX idx_stock_mov_created ON public.stock_movements(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sm_select" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "sm_insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente')
    OR public.has_role(auth.uid(),'estoquista')
  );
CREATE POLICY "sm_update" ON public.stock_movements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente'));
CREATE POLICY "sm_delete" ON public.stock_movements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- FINANCIAL ENTRIES
CREATE TABLE public.financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.financial_type NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  status public.financial_status NOT NULL DEFAULT 'pendente',
  payment_method public.payment_method,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fin_created ON public.financial_entries(created_at DESC);
CREATE INDEX idx_fin_status ON public.financial_entries(status);
CREATE INDEX idx_fin_type ON public.financial_entries(type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries TO authenticated;
GRANT ALL ON public.financial_entries TO service_role;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_select" ON public.financial_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_insert" ON public.financial_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente')
    OR public.has_role(auth.uid(),'financeiro')
  );
CREATE POLICY "fin_update" ON public.financial_entries FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente')
    OR public.has_role(auth.uid(),'financeiro')
  );
CREATE POLICY "fin_delete" ON public.financial_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_fin_updated_at BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated USING (true);

-- AUDIT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs(table_name, record_id, action, old_data, new_data, user_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_financial AFTER INSERT OR UPDATE OR DELETE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- AUTO CREATE FINANCIAL RECEITA + STOCK MOVEMENT ON SALE COMPLETE
CREATE OR REPLACE FUNCTION public.on_sale_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluida' AND (OLD.status IS DISTINCT FROM 'concluida') THEN
    INSERT INTO public.financial_entries(type, category, description, amount, status, payment_method, sale_id, paid_at, user_id)
    VALUES ('receita','Vendas','Venda #'||NEW.sale_number, NEW.total, 'pago', NEW.payment_method, NEW.id, now(), NEW.cashier_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_completed AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.on_sale_completed();

-- Also log stock movement on sale_items insert (complement to existing decrement trigger)
CREATE OR REPLACE FUNCTION public.log_sale_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO public.stock_movements(product_id, type, quantity, reason, sale_id)
    VALUES (NEW.product_id, 'saida', NEW.quantity, 'Venda', NEW.sale_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_item_stock AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.log_sale_stock_movement();

-- When creating a stock_movement of type entrada/ajuste, update product stock
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sale_id IS NOT NULL THEN
    -- saida via venda já é decrementada por outro trigger
    RETURN NEW;
  END IF;
  IF NEW.type = 'entrada' THEN
    UPDATE public.products SET stock = stock + NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'saida' OR NEW.type = 'perda' THEN
    UPDATE public.products SET stock = stock - NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE public.products SET stock = NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_mov AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();