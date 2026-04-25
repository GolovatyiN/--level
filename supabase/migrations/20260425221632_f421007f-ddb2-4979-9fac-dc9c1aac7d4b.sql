
DROP POLICY IF EXISTS "Admin insert tags" ON public.tags;
DROP POLICY IF EXISTS "Admin update tags" ON public.tags;
DROP POLICY IF EXISTS "Admin delete tags" ON public.tags;

CREATE POLICY "Auth insert tags" ON public.tags
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update tags" ON public.tags
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete tags" ON public.tags
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
