-- Permite cancelamento de venda (estorno de estoque, remoção da receita e atualização do status)
-- para qualquer usuário, seguindo o padrão das demais telas abertas do sistema.

-- 1) Estoque: permitir lançar a entrada de estorno
DROP POLICY IF EXISTS "sm_insert" ON public.stock_movements;
CREATE POLICY "sm_insert" ON public.stock_movements
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 2) Financeiro: permitir remover a receita da venda cancelada
DROP POLICY IF EXISTS "fin_delete" ON public.financial_entries;
CREATE POLICY "fin_delete" ON public.financial_entries
  FOR DELETE TO anon, authenticated USING (true);

-- 3) Vendas: permitir marcar a venda como cancelada
DROP POLICY IF EXISTS "Sales: managers update" ON public.sales;
CREATE POLICY "Sales: managers update" ON public.sales
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 4) Regra de prazo: venda só pode ser cancelada em até 7 dias
CREATE OR REPLACE FUNCTION public.enforce_sale_cancel_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelada' AND OLD.status IS DISTINCT FROM 'cancelada' THEN
    IF OLD.created_at < now() - interval '7 days' THEN
      RAISE EXCEPTION 'Não é possível cancelar: a venda foi realizada há mais de 7 dias.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sale_cancel_deadline ON public.sales;
CREATE TRIGGER trg_sale_cancel_deadline
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_cancel_deadline();