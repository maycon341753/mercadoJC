GRANT SELECT, INSERT, UPDATE ON public.sales TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon, authenticated;
GRANT SELECT ON public.customers TO anon;

DROP POLICY IF EXISTS "Sales: authenticated insert" ON public.sales;
DROP POLICY IF EXISTS "Sales: authenticated read" ON public.sales;
DROP POLICY IF EXISTS "Sales: pdv open" ON public.sales;
CREATE POLICY "Sales: pdv open" ON public.sales
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Sale items: authenticated read" ON public.sale_items;
DROP POLICY IF EXISTS "Sale items: authenticated write" ON public.sale_items;
DROP POLICY IF EXISTS "Sale items: pdv open" ON public.sale_items;
CREATE POLICY "Sale items: pdv open" ON public.sale_items
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);