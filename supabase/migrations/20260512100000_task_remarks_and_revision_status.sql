-- =============================================================================
-- Phase 1 of the Plan Detail redesign.
--
-- Что добавляется:
--   1. Статус задачи `needs_revision` («На доработке») — отдельный bucket
--      между «in_review» (на согласовании) и «in_progress». При переводе
--      в этот статус UI требует обязательный комментарий-причину.
--   2. Колонка `tasks.latest_remark` — последний комментарий руководителя
--      к задаче. UI показывает его в табличной колонке «Комментарий».
--      Полная история замечаний пишется в `task_history` (event_type =
--      'remark'), поэтому отдельной таблицы не заводим.
--   3. Колонка `tasks.outcome` — краткий «итог выполнения». Заполняется
--      после `completed` (можно и раньше). История правок — также через
--      `task_history` (event_type = 'outcome').
--   4. Расширение `department_plans` восемью текстовыми полями для
--      структурированной вкладки «Итоги» (что планировалось / выполнено
--      / не выполнено / причины / достижения / проблемы / выводы /
--      план на следующий квартал). Каждая правка пишется в
--      plan_history (если есть) либо просто хранится в записи —
--      историю plan-level можно догнать в следующей фазе.
-- =============================================================================

-- 1. Новый статус. ALTER TYPE ... ADD VALUE требует, чтобы это была
-- единственная операция в транзакции, поэтому ставим вначале файла.
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'needs_revision';

-- 2. Колонки tasks.latest_remark и tasks.outcome.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS latest_remark TEXT,
  ADD COLUMN IF NOT EXISTS outcome       TEXT;

-- 3. Восемь полей для «Итогов» на уровне плана. Все nullable — план
-- может быть в процессе заполнения. Опционально потом можно вынести в
-- отдельную таблицу с историей версий; пока — флэт-поля.
ALTER TABLE public.department_plans
  ADD COLUMN IF NOT EXISTS outcome_planned         TEXT,
  ADD COLUMN IF NOT EXISTS outcome_done            TEXT,
  ADD COLUMN IF NOT EXISTS outcome_not_done        TEXT,
  ADD COLUMN IF NOT EXISTS outcome_not_done_reason TEXT,
  ADD COLUMN IF NOT EXISTS outcome_achievements    TEXT,
  ADD COLUMN IF NOT EXISTS outcome_problems        TEXT,
  ADD COLUMN IF NOT EXISTS outcome_conclusions     TEXT,
  ADD COLUMN IF NOT EXISTS outcome_next_quarter    TEXT;
