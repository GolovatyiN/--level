-- Удаление сирот в notifications + триггеры, которые чистят уведомления
-- при удалении исходной сущности.
--
-- notifications.entity_id — обычный UUID без FK (тип сущности
-- определяется entity_type), поэтому ON DELETE CASCADE напрямую не
-- навешивается. Используем триггеры на каждую таблицу, на которую
-- пишутся нотификации.

-- ---------------------------------------------------------------------------
-- 1. Single-shot cleanup: удалить все уведомления, чьи сущности уже
--    физически удалены.
-- ---------------------------------------------------------------------------
DELETE FROM public.notifications n
 WHERE n.entity_type = 'task'
   AND n.entity_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = n.entity_id);

DELETE FROM public.notifications n
 WHERE n.entity_type = 'kpi'
   AND n.entity_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.kpis k WHERE k.id = n.entity_id);

DELETE FROM public.notifications n
 WHERE n.entity_type = 'kpi_comment'
   AND n.entity_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.kpi_comments c WHERE c.id = n.entity_id);

DELETE FROM public.notifications n
 WHERE n.entity_type = 'department_plan'
   AND n.entity_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.department_plans p WHERE p.id = n.entity_id);

-- ---------------------------------------------------------------------------
-- 2. Триггеры на удаление сущности → удаление связанных уведомлений.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_task_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications WHERE entity_type = 'task' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_notifications_on_task_delete ON public.tasks;
CREATE TRIGGER trg_cleanup_notifications_on_task_delete
AFTER DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.cleanup_notifications_on_task_delete();

CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_kpi_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications WHERE entity_type = 'kpi' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_notifications_on_kpi_delete ON public.kpis;
CREATE TRIGGER trg_cleanup_notifications_on_kpi_delete
AFTER DELETE ON public.kpis
FOR EACH ROW EXECUTE FUNCTION public.cleanup_notifications_on_kpi_delete();

CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_kpi_comment_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications WHERE entity_type = 'kpi_comment' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_notifications_on_kpi_comment_delete ON public.kpi_comments;
CREATE TRIGGER trg_cleanup_notifications_on_kpi_comment_delete
AFTER DELETE ON public.kpi_comments
FOR EACH ROW EXECUTE FUNCTION public.cleanup_notifications_on_kpi_comment_delete();

CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_plan_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications WHERE entity_type = 'department_plan' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_notifications_on_plan_delete ON public.department_plans;
CREATE TRIGGER trg_cleanup_notifications_on_plan_delete
AFTER DELETE ON public.department_plans
FOR EACH ROW EXECUTE FUNCTION public.cleanup_notifications_on_plan_delete();

-- При удалении отдела все его планы каскадятся (FK ON DELETE CASCADE),
-- и наш триггер на planов уберёт связанные нотификации. Для самих
-- direction-уведомлений триггер не нужен — они никем не пишутся.
