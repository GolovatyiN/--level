-- =============================================================================
-- User assignments + notifications system
--
-- Adds:
--   * tasks.assignee_id  → auth.users.id (alongside the legacy `assignee` text)
--   * kpis.owner_id      → auth.users.id (alongside the legacy `owner` text)
--   * kpi_comments.mentioned_user_ids UUID[]  — populated by the client when
--     the user @-mentions someone via the picker
--   * notifications table for the in-app bell
--   * Triggers that auto-create notifications for assignment changes and
--     comment mentions
--
-- Backwards compatible: the legacy text columns are preserved. If a row has
-- both, the FK takes priority on the client.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tasks: add assignee_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON public.tasks(assignee_id);

-- ---------------------------------------------------------------------------
-- 2. KPIs: add owner_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kpis_owner_id ON public.kpis(owner_id);

-- ---------------------------------------------------------------------------
-- 3. KPI comments: track @mentions as a uuid array
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpi_comments
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- ---------------------------------------------------------------------------
-- 4. Notifications table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- recipient
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,           -- triggered by
  type         TEXT NOT NULL CHECK (type IN ('task_assigned','kpi_assigned','kpi_mention','kpi_progress','kpi_comment')),
  title        TEXT NOT NULL,
  body         TEXT,
  entity_type  TEXT,                                                        -- 'task' | 'kpi' | 'kpi_comment'
  entity_id    UUID,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipients see only their own.
DROP POLICY IF EXISTS "Read own notifications" ON public.notifications;
CREATE POLICY "Read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Recipients can update only their own (used for read_at).
DROP POLICY IF EXISTS "Update own notifications" ON public.notifications;
CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Recipients can delete (clear) their own.
DROP POLICY IF EXISTS "Delete own notifications" ON public.notifications;
CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Inserts come from triggers (SECURITY DEFINER) — no client INSERT policy.

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at NULLS FIRST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- Realtime: include this table in the supabase_realtime publication so the
-- bell can subscribe to live inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- publication may not exist in self-hosted dev — ignore
  NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Trigger: notify on task assignment changes
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
  -- Don't notify yourself.
  IF NEW.assignee_id = actor THEN
    RETURN NEW;
  END IF;
  -- Only on INSERT or when assignee_id actually changed.
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

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned
AFTER INSERT OR UPDATE OF assignee_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- ---------------------------------------------------------------------------
-- 6. Trigger: notify on KPI ownership changes
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
  IF NEW.owner_id = actor THEN
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

DROP TRIGGER IF EXISTS trg_notify_kpi_assigned ON public.kpis;
CREATE TRIGGER trg_notify_kpi_assigned
AFTER INSERT OR UPDATE OF owner_id ON public.kpis
FOR EACH ROW EXECUTE FUNCTION public.notify_kpi_assigned();

-- ---------------------------------------------------------------------------
-- 7. Trigger: notify mentioned users on new KPI comments
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
    -- Skip self-mentions.
    CONTINUE WHEN mentioned = actor;
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

DROP TRIGGER IF EXISTS trg_notify_kpi_mention ON public.kpi_comments;
CREATE TRIGGER trg_notify_kpi_mention
AFTER INSERT ON public.kpi_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_kpi_mention();
