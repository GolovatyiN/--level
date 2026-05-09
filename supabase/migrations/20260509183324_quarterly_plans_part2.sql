-- =============================================================================
-- Quarterly plans (continued from 20260509183323_quarterly_plans.sql which
-- only added enum values — those must be committed before this file uses
-- them in WHERE/CHECK clauses).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. quarters: dates, year, lifecycle status, visibility
-- ---------------------------------------------------------------------------
ALTER TABLE public.quarters
  ADD COLUMN IF NOT EXISTS year       INTEGER,
  ADD COLUMN IF NOT EXISTS quarter_no INTEGER CHECK (quarter_no IN (1,2,3,4)),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE,
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quarter_status') THEN
    CREATE TYPE public.quarter_status AS ENUM ('planned','active','closed','archived');
  END IF;
END $$;

ALTER TABLE public.quarters
  ADD COLUMN IF NOT EXISTS status public.quarter_status NOT NULL DEFAULT 'planned';

UPDATE public.quarters
SET
  year       = COALESCE(year, NULLIF(substring(label FROM '\d{4}'), '')::int),
  quarter_no = COALESCE(quarter_no, NULLIF(substring(label FROM '[1-4]'), '')::int)
WHERE year IS NULL OR quarter_no IS NULL;

UPDATE public.quarters
SET
  start_date = make_date(year, (quarter_no - 1) * 3 + 1, 1),
  end_date   = (make_date(year, (quarter_no - 1) * 3 + 1, 1) + INTERVAL '3 months' - INTERVAL '1 day')::date
WHERE start_date IS NULL OR end_date IS NULL;

UPDATE public.quarters SET is_visible = false WHERE year IS NOT NULL AND year < 2026;

UPDATE public.quarters
SET status = CASE
  WHEN end_date < CURRENT_DATE THEN 'closed'::public.quarter_status
  WHEN start_date <= CURRENT_DATE THEN 'active'::public.quarter_status
  ELSE 'planned'::public.quarter_status
END
WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS idx_quarters_year_q ON public.quarters(year, quarter_no);
CREATE INDEX IF NOT EXISTS idx_quarters_visible ON public.quarters(is_visible);

-- ---------------------------------------------------------------------------
-- 2. plan_status enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_status') THEN
    CREATE TYPE public.plan_status AS ENUM (
      'draft','on_review','changes_requested','approved','in_progress',
      'at_risk','blocked','completed','archived'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. department_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.department_plans (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction_id UUID NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  quarter_id   UUID NOT NULL REFERENCES public.quarters(id)   ON DELETE CASCADE,
  status       public.plan_status NOT NULL DEFAULT 'draft',
  description  TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direction_id, quarter_id)
);

CREATE INDEX IF NOT EXISTS idx_dept_plans_direction ON public.department_plans(direction_id);
CREATE INDEX IF NOT EXISTS idx_dept_plans_quarter   ON public.department_plans(quarter_id);
CREATE INDEX IF NOT EXISTS idx_dept_plans_status    ON public.department_plans(status);

DROP TRIGGER IF EXISTS trg_department_plans_updated_at ON public.department_plans;
CREATE TRIGGER trg_department_plans_updated_at
BEFORE UPDATE ON public.department_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.department_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read department_plans" ON public.department_plans;
CREATE POLICY "Authenticated read department_plans"
  ON public.department_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated write department_plans (insert)" ON public.department_plans;
CREATE POLICY "Authenticated write department_plans (insert)"
  ON public.department_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated write department_plans (update)" ON public.department_plans;
CREATE POLICY "Authenticated write department_plans (update)"
  ON public.department_plans FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated write department_plans (delete)" ON public.department_plans;
CREATE POLICY "Authenticated write department_plans (delete)"
  ON public.department_plans FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 4. tasks.plan_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.department_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_plan ON public.tasks(plan_id);

-- ---------------------------------------------------------------------------
-- 5. department_plan_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.department_plan_comments (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id     UUID NOT NULL REFERENCES public.department_plans(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,
  content     TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'comment'
    CHECK (kind IN ('comment','submit','request_changes','approve','status_change')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_comments_plan_created
  ON public.department_plan_comments(plan_id, created_at DESC);

ALTER TABLE public.department_plan_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read plan_comments" ON public.department_plan_comments;
CREATE POLICY "Authenticated read plan_comments"
  ON public.department_plan_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated write plan_comments (insert)" ON public.department_plan_comments;
CREATE POLICY "Authenticated write plan_comments (insert)"
  ON public.department_plan_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id OR author_id IS NULL);
DROP POLICY IF EXISTS "Authenticated write plan_comments (delete own)" ON public.department_plan_comments;
CREATE POLICY "Authenticated write plan_comments (delete own)"
  ON public.department_plan_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 6. department_plan_stats view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.department_plan_stats AS
SELECT
  p.id                                                 AS plan_id,
  p.direction_id,
  p.quarter_id,
  COUNT(t.id)                                          AS total_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'completed')    AS completed_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'in_progress')  AS in_progress_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'at_risk')      AS at_risk_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'blocked')      AS blocked_tasks,
  COUNT(t.id) FILTER (
    WHERE t.deadline IS NOT NULL
      AND t.deadline < CURRENT_DATE
      AND t.status NOT IN ('completed','cancelled')
  )                                                    AS overdue_tasks,
  CASE
    WHEN COUNT(t.id) = 0 THEN 0
    ELSE ROUND(
      COUNT(t.id) FILTER (WHERE t.status = 'completed')::numeric * 100.0 / COUNT(t.id)
    )::int
  END                                                  AS progress_pct,
  MAX(t.updated_at)                                    AS last_task_update
FROM public.department_plans p
LEFT JOIN public.tasks t ON t.plan_id = p.id AND t.archived = false
GROUP BY p.id, p.direction_id, p.quarter_id;

GRANT SELECT ON public.department_plan_stats TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Plan status audit + auto-comment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_plan_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COALESCE(display_name, email) INTO actor_name FROM public.profiles WHERE user_id = actor;

    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (actor, 'plan_status_changed', 'department_plan', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status));

    INSERT INTO public.department_plan_comments (plan_id, author_id, author_name, content, kind)
    VALUES (NEW.id, actor, actor_name,
            'Статус: ' || OLD.status || ' → ' || NEW.status,
            'status_change');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_plan_status ON public.department_plans;
CREATE TRIGGER trg_audit_plan_status
AFTER UPDATE OF status ON public.department_plans
FOR EACH ROW EXECUTE FUNCTION public.audit_plan_status();

-- ---------------------------------------------------------------------------
-- 8. Notifications on plan transitions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_plan_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor      UUID := auth.uid();
  dir_name   TEXT;
  q_label    TEXT;
  body_text  TEXT;
  recipient  UUID;
  head_id    UUID;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT name, head_user_id INTO dir_name, head_id FROM public.directions WHERE id = NEW.direction_id;
  SELECT label INTO q_label FROM public.quarters WHERE id = NEW.quarter_id;
  body_text := COALESCE(dir_name,'—') || ' · ' || COALESCE(q_label,'—');

  IF NEW.status = 'on_review' THEN
    FOR recipient IN
      SELECT user_id FROM public.user_roles WHERE role IN ('superadmin','admin')
    LOOP
      IF recipient <> actor THEN
        INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
        VALUES (recipient, actor, 'plan_on_review', 'План отправлен на согласование', body_text, 'department_plan', NEW.id);
      END IF;
    END LOOP;

  ELSIF NEW.status IN ('approved','changes_requested','at_risk','blocked','completed') THEN
    FOR recipient IN
      SELECT DISTINCT v FROM unnest(ARRAY[NEW.created_by, head_id]) AS v WHERE v IS NOT NULL
    LOOP
      IF recipient = actor THEN CONTINUE; END IF;
      INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_type, entity_id)
      VALUES (
        recipient, actor,
        CASE NEW.status
          WHEN 'approved'           THEN 'plan_approved'
          WHEN 'changes_requested'  THEN 'plan_changes_requested'
          WHEN 'at_risk'            THEN 'plan_at_risk'
          WHEN 'blocked'            THEN 'plan_blocked'
          WHEN 'completed'          THEN 'plan_completed'
        END,
        CASE NEW.status
          WHEN 'approved'           THEN 'План утверждён'
          WHEN 'changes_requested'  THEN 'План возвращён на доработку'
          WHEN 'at_risk'            THEN 'План под риском'
          WHEN 'blocked'            THEN 'План заблокирован'
          WHEN 'completed'          THEN 'План завершён'
        END,
        body_text, 'department_plan', NEW.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_plan_status ON public.department_plans;
CREATE TRIGGER trg_notify_plan_status
AFTER UPDATE OF status ON public.department_plans
FOR EACH ROW EXECUTE FUNCTION public.notify_plan_status();

-- Extend allowed notification types.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'task_assigned','kpi_assigned','kpi_mention','kpi_progress','kpi_comment',
    'plan_on_review','plan_approved','plan_changes_requested','plan_at_risk',
    'plan_blocked','plan_completed','plan_comment'
  ));
