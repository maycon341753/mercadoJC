
DROP POLICY IF EXISTS "Products: managers write" ON public.products;
DROP POLICY IF EXISTS "Products: authenticated read" ON public.products;
DROP POLICY IF EXISTS "Categories: managers write" ON public.categories;
DROP POLICY IF EXISTS "Categories: authenticated read" ON public.categories;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;

CREATE POLICY "Products: open access" ON public.products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Categories: open access" ON public.categories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
