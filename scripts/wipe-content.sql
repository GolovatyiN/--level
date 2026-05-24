-- =============================================================================
-- WIPE-CONTENT: чистим демо/тестовые данные, оставляем пользователей.
--
-- Запускается ВРУЧНУЮ через Supabase Dashboard → SQL Editor → New query.
-- Под service_role обходит RLS. Делайте бэкап если есть важные данные.
--
-- Что удаляется:
--   • Все задачи и история по ним
--   • Все квартальные планы и комментарии к ним
--   • Все отделы (directions)
--   • Все KPI и связанные таблицы
--   • Доступы пользователей к отделам (user_department_access)
--   • Уведомления
--   • Invite-токены (включая неиспользованные)
--   • Audit-log
--
-- Что НЕ удаляется:
--   • auth.users — пользователи остаются
--   • profiles — карточки пользователей остаются
--   • user_roles — роли (admin/superadmin/user) остаются
--   • quarters — квартальные периоды как справочник
--   • tags, kpi_units и т.п. справочники
-- =============================================================================

-- Используем DO-блок, чтобы пропускать таблицы которых нет в текущей схеме
-- (на разных проектах могут отличаться KPI-таблицы и т.п.). Каждый DELETE
-- защищён EXCEPTION-handler'ом.
DO $$
DECLARE
  t TEXT;
  -- Порядок важен: сначала зависимые таблицы, потом «родительские».
  tables TEXT[] := ARRAY[
    'task_history',
    'task_tags',
    'kpi_tasks',
    'tasks',
    'department_plan_comments',
    'department_plans',
    'kpi_progress_log',
    'kpi_comments',
    'kpi_checkpoints',
    'kpi_tags',
    'kpis',
    'directions',
    'user_department_access',
    'notifications',
    'invites',
    'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I', t);
      RAISE NOTICE 'Wiped: %', t;
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'Skipped (no table): %', t;
    END;
  END LOOP;
END $$;

-- Проверка — должно быть 0 везде, кроме profiles/user_roles/quarters/tags.
SELECT 'directions' AS tbl, COUNT(*) AS n FROM public.directions
UNION ALL SELECT 'tasks', COUNT(*) FROM public.tasks
UNION ALL SELECT 'task_history', COUNT(*) FROM public.task_history
UNION ALL SELECT 'department_plans', COUNT(*) FROM public.department_plans
UNION ALL SELECT 'department_plan_comments', COUNT(*) FROM public.department_plan_comments
UNION ALL SELECT 'kpis', COUNT(*) FROM public.kpis
UNION ALL SELECT 'user_department_access', COUNT(*) FROM public.user_department_access
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'invites', COUNT(*) FROM public.invites
UNION ALL SELECT 'profiles (keep)', COUNT(*) FROM public.profiles
UNION ALL SELECT 'user_roles (keep)', COUNT(*) FROM public.user_roles
UNION ALL SELECT 'quarters (keep)', COUNT(*) FROM public.quarters;
