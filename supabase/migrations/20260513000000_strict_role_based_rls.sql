-- =============================================================================
-- Жёсткий RLS на роли + per-direction access.
--
-- До этой миграции все ключевые таблицы (tasks, directions, department_plans,
-- task_history и т.п.) были защищены условием USING (auth.uid() IS NOT NULL)
-- — то есть любой залогиненный пользователь мог читать и редактировать всё.
-- Роли в UI скрывали кнопки, но любой человек с DevTools мог обойти.
--
-- Теперь:
--   • Admin / superadmin видит всё, редактирует всё.
--   • Department_head (или head_user_id отдела) видит/правит свои отделы.
--   • Обычный user видит:
--       — отделы и их данные, к которым ему выдали `user_department_access`;
--       — задачи, где он assignee_id.
--   • user_department_access.access_level:
--       view  → только чтение
--       edit  → можно создавать/обновлять задачи и планы
--       full  → плюс удалять
--   • Роли (user_roles) — только админ может назначать.
--   • user_department_access — только админ может управлять.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER => функция выполняется правами своего владельца (postgres)
-- и обходит RLS на user_roles. Иначе сама проверка триггерила бы RLS
-- бесконечно.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role IN ('admin', 'superadmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role = 'superadmin'
  );
$$;

-- Главная функция доступа к отделу. min_level — нужный уровень:
--   'view' — пользователь хотя бы видит отдел
--   'edit' — может править данные
--   'full' — может удалять
-- Возвращает true если:
--   * пользователь admin/superadmin, ИЛИ
--   * у него есть запись в user_department_access с подходящим уровнем, ИЛИ
--   * он head_user_id отдела (руководитель → full права).
CREATE OR REPLACE FUNCTION public.has_direction_access(
  dir_id UUID,
  min_level TEXT DEFAULT 'view'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dir_id IS NOT NULL
    AND (
      public.current_user_is_admin()
      OR EXISTS (
        SELECT 1
          FROM public.directions d
         WHERE d.id = dir_id
           AND d.head_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
          FROM public.user_department_access uda
         WHERE uda.user_id = auth.uid()
           AND uda.direction_id = dir_id
           AND CASE min_level
                 WHEN 'view' THEN uda.access_level IN ('view', 'edit', 'full')
                 WHEN 'edit' THEN uda.access_level IN ('edit', 'full')
                 WHEN 'full' THEN uda.access_level = 'full'
                 ELSE FALSE
               END
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- TASKS — scoped by direction access + assignee
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read tasks"   ON public.tasks;
DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated delete tasks" ON public.tasks;

CREATE POLICY "Read tasks scoped" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'view')
    OR assignee_id = auth.uid()
  );

CREATE POLICY "Insert tasks scoped" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'edit')
  );

CREATE POLICY "Update tasks scoped" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'edit')
    OR assignee_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'edit')
    OR assignee_id = auth.uid()
  );

CREATE POLICY "Delete tasks scoped" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'full')
  );

-- ---------------------------------------------------------------------------
-- DIRECTIONS — read scoped, write admin-only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read directions"   ON public.directions;
DROP POLICY IF EXISTS "Authenticated insert directions" ON public.directions;
DROP POLICY IF EXISTS "Authenticated update directions" ON public.directions;
DROP POLICY IF EXISTS "Authenticated delete directions" ON public.directions;

CREATE POLICY "Read directions scoped" ON public.directions
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(id, 'view')
  );

CREATE POLICY "Manage directions (admin)" ON public.directions
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- ---------------------------------------------------------------------------
-- DEPARTMENT PLANS — scoped same as tasks/directions
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read department_plans"            ON public.department_plans;
DROP POLICY IF EXISTS "Authenticated write department_plans (insert)"  ON public.department_plans;
DROP POLICY IF EXISTS "Authenticated write department_plans (update)"  ON public.department_plans;
DROP POLICY IF EXISTS "Authenticated write department_plans (delete)"  ON public.department_plans;

CREATE POLICY "Read plans scoped" ON public.department_plans
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'view')
  );

CREATE POLICY "Insert plans scoped" ON public.department_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'edit')
  );

CREATE POLICY "Update plans scoped" ON public.department_plans
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'edit')
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'edit')
  );

CREATE POLICY "Delete plans scoped" ON public.department_plans
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin()
    OR public.has_direction_access(direction_id, 'full')
  );

-- ---------------------------------------------------------------------------
-- TASK HISTORY — visible if parent task is visible
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read history"   ON public.task_history;
DROP POLICY IF EXISTS "Authenticated insert history" ON public.task_history;

CREATE POLICY "Read task_history scoped" ON public.task_history
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
       WHERE t.id = task_history.task_id
         AND (
           public.has_direction_access(t.direction_id, 'view')
           OR t.assignee_id = auth.uid()
         )
    )
  );

CREATE POLICY "Insert task_history scoped" ON public.task_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
       WHERE t.id = task_history.task_id
         AND (
           public.has_direction_access(t.direction_id, 'edit')
           OR t.assignee_id = auth.uid()
         )
    )
  );

-- ---------------------------------------------------------------------------
-- PLAN COMMENTS / PLAN HISTORY — visible if parent plan is visible
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read plan_comments"             ON public.department_plan_comments;
DROP POLICY IF EXISTS "Authenticated write plan_comments (insert)"   ON public.department_plan_comments;
DROP POLICY IF EXISTS "Authenticated write plan_comments (delete own)" ON public.department_plan_comments;

CREATE POLICY "Read plan_comments scoped" ON public.department_plan_comments
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.department_plans p
       WHERE p.id = department_plan_comments.plan_id
         AND public.has_direction_access(p.direction_id, 'view')
    )
  );

CREATE POLICY "Insert plan_comments scoped" ON public.department_plan_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.department_plans p
       WHERE p.id = department_plan_comments.plan_id
         AND public.has_direction_access(p.direction_id, 'view')
    )
  );

CREATE POLICY "Delete plan_comments own" ON public.department_plan_comments
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin()
    OR author_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- USER ROLES — only admin can manage; everyone reads
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Superadmin manages roles insert" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmin manages roles update" ON public.user_roles;
DROP POLICY IF EXISTS "Superadmin manages roles delete" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated read roles"        ON public.user_roles;

CREATE POLICY "Read roles authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage roles (admin)" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- ---------------------------------------------------------------------------
-- USER DEPARTMENT ACCESS — admin manages, everyone reads own + admins read all
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated read department access"         ON public.user_department_access;
DROP POLICY IF EXISTS "Admins manage department access (insert)"     ON public.user_department_access;
DROP POLICY IF EXISTS "Admins manage department access (update)"     ON public.user_department_access;
DROP POLICY IF EXISTS "Admins manage department access (delete)"     ON public.user_department_access;

CREATE POLICY "Read access (own + admin)" ON public.user_department_access
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY "Manage access (admin)" ON public.user_department_access
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
