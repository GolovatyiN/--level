-- Quarters
CREATE TABLE public.quarters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  sort_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.quarters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read quarters" ON public.quarters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert quarters" ON public.quarters FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin update quarters" ON public.quarters FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin delete quarters" ON public.quarters FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

-- KPI units
CREATE TABLE public.kpi_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.kpi_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read kpi_units" ON public.kpi_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert kpi_units" ON public.kpi_units FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin update kpi_units" ON public.kpi_units FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin delete kpi_units" ON public.kpi_units FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

-- Tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read tags" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert tags" ON public.tags FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin update tags" ON public.tags FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin delete tags" ON public.tags FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

CREATE TABLE public.task_tags (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX idx_task_tags_tag ON public.task_tags(tag_id);
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read task_tags" ON public.task_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write task_tags ins" ON public.task_tags FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth write task_tags del" ON public.task_tags FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TABLE public.kpi_tags (
  kpi_id uuid NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kpi_id, tag_id)
);
CREATE INDEX idx_kpi_tags_tag ON public.kpi_tags(tag_id);
ALTER TABLE public.kpi_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read kpi_tags" ON public.kpi_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write kpi_tags ins" ON public.kpi_tags FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth write kpi_tags del" ON public.kpi_tags FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Seed initial quarters and units
INSERT INTO public.quarters (label, sort_key) VALUES
  ('Q1 2025','2025-1'), ('Q2 2025','2025-2'), ('Q3 2025','2025-3'), ('Q4 2025','2025-4'),
  ('Q1 2026','2026-1'), ('Q2 2026','2026-2'), ('Q3 2026','2026-3'), ('Q4 2026','2026-4')
ON CONFLICT (label) DO NOTHING;

INSERT INTO public.kpi_units (symbol, description) VALUES
  ('%','Проценты'),
  ('шт','Штуки'),
  ('$','Доллары'),
  ('₽','Рубли'),
  ('ч','Часы')
ON CONFLICT (symbol) DO NOTHING;