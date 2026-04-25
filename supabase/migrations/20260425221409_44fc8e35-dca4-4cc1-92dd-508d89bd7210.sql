
DROP TRIGGER IF EXISTS trg_kpi_progress_change ON public.kpi_progress_log;
CREATE TRIGGER trg_kpi_progress_change
AFTER INSERT OR UPDATE OR DELETE ON public.kpi_progress_log
FOR EACH ROW EXECUTE FUNCTION public.on_kpi_progress_change();

DROP TRIGGER IF EXISTS trg_kpi_tasks_change ON public.kpi_tasks;
CREATE TRIGGER trg_kpi_tasks_change
AFTER INSERT OR UPDATE OR DELETE ON public.kpi_tasks
FOR EACH ROW EXECUTE FUNCTION public.on_kpi_tasks_change();

DROP TRIGGER IF EXISTS trg_task_status_change ON public.tasks;
CREATE TRIGGER trg_task_status_change
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.on_task_status_change();

-- Recompute existing KPI values
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.kpis LOOP
    PERFORM public.recompute_kpi_value(r.id);
  END LOOP;
END $$;
