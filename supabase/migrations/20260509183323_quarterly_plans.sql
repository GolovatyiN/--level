-- Step 1: enum extensions only.
-- Postgres won't let us reference these new values in the same transaction,
-- so the rest of the change lives in 20260509183324_quarterly_plans.sql.

ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'backlog';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'cancelled';
