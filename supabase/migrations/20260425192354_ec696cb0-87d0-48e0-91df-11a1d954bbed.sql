
CREATE TABLE public.kpis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  direction_id UUID REFERENCES public.directions(id) ON DELETE SET NULL,
  quarter TEXT,
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '%',
  owner TEXT,
  deadline DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read kpis" ON public.kpis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert kpis" ON public.kpis FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update kpis" ON public.kpis FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated delete kpis" ON public.kpis FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_kpis_updated_at BEFORE UPDATE ON public.kpis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_kpis_direction ON public.kpis(direction_id);
