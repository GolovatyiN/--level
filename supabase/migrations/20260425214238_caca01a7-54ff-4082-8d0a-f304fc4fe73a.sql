
CREATE TABLE public.kpi_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  author_id UUID,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read kpi_comments" ON public.kpi_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert kpi_comments" ON public.kpi_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update kpi_comments" ON public.kpi_comments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated delete kpi_comments" ON public.kpi_comments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_kpi_comments_updated_at
BEFORE UPDATE ON public.kpi_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_kpi_comments_kpi_id ON public.kpi_comments(kpi_id);

CREATE TABLE public.kpi_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT,
  value NUMERIC,
  checkpoint_date DATE NOT NULL DEFAULT CURRENT_DATE,
  done BOOLEAN NOT NULL DEFAULT false,
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read kpi_checkpoints" ON public.kpi_checkpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert kpi_checkpoints" ON public.kpi_checkpoints FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update kpi_checkpoints" ON public.kpi_checkpoints FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated delete kpi_checkpoints" ON public.kpi_checkpoints FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_kpi_checkpoints_updated_at
BEFORE UPDATE ON public.kpi_checkpoints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_kpi_checkpoints_kpi_id ON public.kpi_checkpoints(kpi_id);
