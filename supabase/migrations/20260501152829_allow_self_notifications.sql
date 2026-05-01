-- Allow self-notifications.
--
-- The original trigger functions skipped writing a notification when the
-- recipient was the same user who triggered the change ("don't ping
-- yourself"). In practice that:
--   * makes testing painful — devs assign themselves and see nothing happen;
--   * removes a useful "you just made yourself responsible for X" reminder.
--
-- We drop the self-skip in all three trigger functions and also backfill
-- notifications for existing tasks/KPIs that already have an assignee/owner
-- but never got a notification (because they were created under the old
-- behaviour).

-- ---------------------------------------------------------------------------
-- 1. Updated trigger: notify_task_assigned
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND COALESCE(OLD.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid) <> NEW.assignee_id) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
    VALUES (
      NEW.assignee_id,
      actor,
      'task_assigned',
      'Вам назначили задачу',
      NEW.title,
      'task',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Updated trigger: notify_kpi_assigned
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_kpi_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) <> NEW.owner_id) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
    VALUES (
      NEW.owner_id,
      actor,
      'kpi_assigned',
      'Вы — ответственный за KPI',
      NEW.name,
      'kpi',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Updated trigger: notify_kpi_mention
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_kpi_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mentioned UUID;
  kpi_name  TEXT;
  actor     UUID := auth.uid();
BEGIN
  IF NEW.mentioned_user_ids IS NULL OR cardinality(NEW.mentioned_user_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT name INTO kpi_name FROM public.kpis WHERE id = NEW.kpi_id;

  FOREACH mentioned IN ARRAY NEW.mentioned_user_ids LOOP
    -- De-dupe (user could be mentioned twice in one comment).
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
    SELECT mentioned, actor, 'kpi_mention',
           'Вас упомянули в KPI «' || COALESCE(kpi_name, '—') || '»',
           NEW.content,
           'kpi_comment', NEW.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = mentioned AND entity_type = 'kpi_comment' AND entity_id = NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Backfill: existing tasks/KPIs that already have an assignee/owner but
--    no notification (because the previous trigger skipped self-assigns)
--    get one now. We use the row's created_by as the synthetic actor so
--    the notification has reasonable provenance.
-- ---------------------------------------------------------------------------
INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id, created_at)
SELECT
  t.assignee_id,
  t.created_by,
  'task_assigned',
  'Вам назначили задачу',
  t.title,
  'task',
  t.id,
  t.updated_at
FROM public.tasks t
WHERE t.assignee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.entity_type = 'task' AND n.entity_id = t.id AND n.user_id = t.assignee_id
  );

INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id, created_at)
SELECT
  k.owner_id,
  k.created_by,
  'kpi_assigned',
  'Вы — ответственный за KPI',
  k.name,
  'kpi',
  k.id,
  k.updated_at
FROM public.kpis k
WHERE k.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.entity_type = 'kpi' AND n.entity_id = k.id AND n.user_id = k.owner_id
  );
