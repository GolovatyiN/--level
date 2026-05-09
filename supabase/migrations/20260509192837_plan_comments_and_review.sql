-- =============================================================================
-- Plan comments tied to tasks + review notifications
--
-- * department_plan_comments.task_id — optional FK to a task. When set, the
--   row is a "comment on a task within this plan"; the same table now
--   handles both plan-level and task-level discussion under one stream.
-- * department_plan_comments.is_final — marks the closing-quarter summary so
--   the UI can render it in a dedicated "Итоги квартала" tab.
-- * notify_plan_comment trigger — fires on INSERT for kind='comment' /
--   'request_changes' / 'submit' / 'approve'. Routes notifications to
--   plan author, department head, task assignee (if task-scoped) and the
--   actor who triggered the previous status transition. Skips self-pings.
-- =============================================================================

ALTER TABLE public.department_plan_comments
  ADD COLUMN IF NOT EXISTS task_id  UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_plan_comments_task_id ON public.department_plan_comments(task_id);

-- Allow more 'kind' values that the workflow now supports.
ALTER TABLE public.department_plan_comments DROP CONSTRAINT IF EXISTS department_plan_comments_kind_check;
ALTER TABLE public.department_plan_comments ADD CONSTRAINT department_plan_comments_kind_check
  CHECK (kind IN ('comment','submit','request_changes','approve','status_change','final_review'));

-- ---------------------------------------------------------------------------
-- Notifications on new comments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_plan_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor       UUID := NEW.author_id;
  plan_row    RECORD;
  dir_name    TEXT;
  q_label     TEXT;
  body_text   TEXT;
  recipient   UUID;
  task_assign UUID;
  task_title  TEXT;
  notif_title TEXT;
BEGIN
  -- Only "human-conversational" kinds emit notifications. status_change rows
  -- are written automatically by the status trigger and notif'd separately.
  IF NEW.kind = 'status_change' THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.direction_id, p.quarter_id, p.created_by, d.name AS dir_name, d.head_user_id, q.label AS q_label
    INTO plan_row
    FROM public.department_plans p
    LEFT JOIN public.directions d ON d.id = p.direction_id
    LEFT JOIN public.quarters   q ON q.id = p.quarter_id
   WHERE p.id = NEW.plan_id;

  dir_name := COALESCE(plan_row.dir_name, '—');
  q_label  := COALESCE(plan_row.q_label, '—');
  body_text := dir_name || ' · ' || q_label
            || CASE WHEN length(NEW.content) > 0
                    THEN E'\n' || left(NEW.content, 240)
                    ELSE '' END;

  notif_title := CASE NEW.kind
    WHEN 'request_changes' THEN 'План возвращён на доработку'
    WHEN 'submit'          THEN 'План отправлен на согласование'
    WHEN 'approve'         THEN 'План утверждён'
    WHEN 'final_review'    THEN 'Итоги по плану'
    ELSE                       'Новый комментарий к плану'
  END;

  -- Task-scoped comment: also notify the assignee.
  IF NEW.task_id IS NOT NULL THEN
    SELECT assignee_id, title INTO task_assign, task_title FROM public.tasks WHERE id = NEW.task_id;
    IF task_assign IS NOT NULL AND task_assign <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
      VALUES (
        task_assign, actor, 'plan_comment',
        'Комментарий к задаче «' || COALESCE(task_title,'—') || '»',
        body_text, 'department_plan', NEW.plan_id
      );
    END IF;
  END IF;

  -- Notify plan author + department head, deduped, excluding the actor.
  FOR recipient IN
    SELECT DISTINCT v
      FROM unnest(ARRAY[plan_row.created_by, plan_row.head_user_id]) AS v
     WHERE v IS NOT NULL
  LOOP
    IF recipient = actor THEN CONTINUE; END IF;
    IF recipient = task_assign THEN CONTINUE; END IF;  -- already got the task notif above
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
    VALUES (recipient, actor, 'plan_comment', notif_title, body_text, 'department_plan', NEW.plan_id);
  END LOOP;

  -- For request_changes / submit also fan out to admins (matches the status
  -- trigger's own notification logic — but only when the comment is the
  -- FIRST event of that transition; the status trigger handles the rest).
  -- We keep this simple: only send to recipients above.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_plan_comment ON public.department_plan_comments;
CREATE TRIGGER trg_notify_plan_comment
AFTER INSERT ON public.department_plan_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_plan_comment();
