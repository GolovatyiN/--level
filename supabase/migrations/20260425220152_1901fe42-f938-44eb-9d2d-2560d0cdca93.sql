-- 1. Drop checkpoints (replaced by tasks)
DROP TABLE IF EXISTS public.kpi_checkpoints CASCADE;

-- 2. M2M between tasks and kpis with contribution amount
CREATE TABLE public.kpi_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  contribution numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, task_id)
);
CREATE INDEX idx_kpi_tasks_kpi ON public.kpi_tasks(kpi_id);
CREATE INDEX idx_kpi_tasks_task ON public.kpi_tasks(task_id);

ALTER TABLE public.kpi_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read kpi_tasks" ON public.kpi_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert kpi_tasks" ON public.kpi_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update kpi_tasks" ON public.kpi_tasks FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete kpi_tasks" ON public.kpi_tasks FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 3. Manual progress log (the "+ add progress" button entries)
CREATE TABLE public.kpi_progress_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  note text,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kpi_progress_kpi ON public.kpi_progress_log(kpi_id);

ALTER TABLE public.kpi_progress_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read kpi_progress" ON public.kpi_progress_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert kpi_progress" ON public.kpi_progress_log FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update kpi_progress" ON public.kpi_progress_log FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete kpi_progress" ON public.kpi_progress_log FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 4. Function to recompute KPI current_value
-- = SUM(contribution) of completed linked tasks + SUM(delta) from progress log
CREATE OR REPLACE FUNCTION public.recompute_kpi_value(_kpi_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tasks numeric;
  v_log numeric;
BEGIN
  SELECT COALESCE(SUM(kt.contribution), 0) INTO v_tasks
  FROM public.kpi_tasks kt
  JOIN public.tasks t ON t.id = kt.task_id
  WHERE kt.kpi_id = _kpi_id AND t.status = 'completed';

  SELECT COALESCE(SUM(delta), 0) INTO v_log
  FROM public.kpi_progress_log
  WHERE kpi_id = _kpi_id;

  UPDATE public.kpis SET current_value = v_tasks + v_log, updated_at = now()
  WHERE id = _kpi_id;
END;
$$;

-- 5. Trigger: task status change -> recompute all linked KPIs
CREATE OR REPLACE FUNCTION public.on_task_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN SELECT kpi_id FROM public.kpi_tasks WHERE task_id = NEW.id LOOP
      PERFORM public.recompute_kpi_value(r.kpi_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_task_status_change ON public.tasks;
CREATE TRIGGER trg_task_status_change
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.on_task_status_change();

-- 6. Trigger: kpi_tasks insert/update/delete -> recompute affected KPIs
CREATE OR REPLACE FUNCTION public.on_kpi_tasks_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_kpi_value(OLD.kpi_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_kpi_value(NEW.kpi_id);
    IF TG_OP = 'UPDATE' AND OLD.kpi_id IS DISTINCT FROM NEW.kpi_id THEN
      PERFORM public.recompute_kpi_value(OLD.kpi_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_kpi_tasks_change ON public.kpi_tasks;
CREATE TRIGGER trg_kpi_tasks_change
AFTER INSERT OR UPDATE OR DELETE ON public.kpi_tasks
FOR EACH ROW EXECUTE FUNCTION public.on_kpi_tasks_change();

-- 7. Trigger: kpi_progress_log changes -> recompute
CREATE OR REPLACE FUNCTION public.on_kpi_progress_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_kpi_value(OLD.kpi_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_kpi_value(NEW.kpi_id);
    RETURN NEW;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_kpi_progress_change ON public.kpi_progress_log;
CREATE TRIGGER trg_kpi_progress_change
AFTER INSERT OR UPDATE OR DELETE ON public.kpi_progress_log
FOR EACH ROW EXECUTE FUNCTION public.on_kpi_progress_change();