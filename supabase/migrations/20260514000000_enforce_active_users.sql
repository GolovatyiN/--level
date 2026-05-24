-- =============================================================================
-- Жёсткое enforcement флага profiles.is_active на уровне БД.
--
-- До этого отключение пользователя через /management → «Деактивировать»
-- меняло поле, но RLS-политики его не проверяли. Отключённый пользователь
-- продолжал видеть данные и мог писать в БД через прямой API.
--
-- После миграции:
--   • current_user_is_active() — новый helper: проверяет
--     profiles.is_active для auth.uid(). Любая отсутствующая профильная
--     строка трактуется как inactive.
--   • current_user_is_admin / current_user_is_superadmin /
--     has_direction_access — все требуют, чтобы пользователь был активен.
--     Если is_active = false, helpers возвращают false → RLS отрезает
--     все запросы.
--   • Полиси tasks SELECT/UPDATE с веткой `assignee_id = auth.uid()` —
--     обёрнуты в current_user_is_active(). Иначе отключённый
--     исполнитель мог бы продолжать видеть/менять свои задачи.
-- =============================================================================

-- 1. Helper: пользователь активен.
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE user_id = auth.uid()),
    FALSE
  );
$$;

-- 2. Обновляем уже существующие helpers, чтобы они учитывали is_active.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_active() AND EXISTS (
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
  SELECT public.current_user_is_active() AND EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role = 'superadmin'
  );
$$;

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
    public.current_user_is_active()
    AND dir_id IS NOT NULL
    AND (
      public.current_user_is_admin()
      OR EXISTS (
        SELECT 1 FROM public.directions d
         WHERE d.id = dir_id AND d.head_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.user_department_access uda
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

-- 3. Чиним полиси на tasks где была ветка `assignee_id = auth.uid()` —
-- без обёртки is_active. Просто replace.

DROP POLICY IF EXISTS "Read tasks scoped"   ON public.tasks;
DROP POLICY IF EXISTS "Update tasks scoped" ON public.tasks;

CREATE POLICY "Read tasks scoped" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND (
      public.current_user_is_admin()
      OR public.has_direction_access(direction_id, 'view')
      OR assignee_id = auth.uid()
    )
  );

CREATE POLICY "Update tasks scoped" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_active()
    AND (
      public.current_user_is_admin()
      OR public.has_direction_access(direction_id, 'edit')
      OR assignee_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_is_active()
    AND (
      public.current_user_is_admin()
      OR public.has_direction_access(direction_id, 'edit')
      OR assignee_id = auth.uid()
    )
  );

-- 4. task_history Read — тоже была ветка assignee_id. Обновим.
DROP POLICY IF EXISTS "Read task_history scoped"   ON public.task_history;
DROP POLICY IF EXISTS "Insert task_history scoped" ON public.task_history;

CREATE POLICY "Read task_history scoped" ON public.task_history
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND (
      public.current_user_is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
         WHERE t.id = task_history.task_id
           AND (
             public.has_direction_access(t.direction_id, 'view')
             OR t.assignee_id = auth.uid()
           )
      )
    )
  );

CREATE POLICY "Insert task_history scoped" ON public.task_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_active()
    AND (
      public.current_user_is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
         WHERE t.id = task_history.task_id
           AND (
             public.has_direction_access(t.direction_id, 'edit')
             OR t.assignee_id = auth.uid()
           )
      )
    )
  );

-- 5. user_department_access — ветка `user_id = auth.uid()` (своя строка
-- доступа) тоже должна отвалиться для disabled-юзера.
DROP POLICY IF EXISTS "Read access (own + admin)" ON public.user_department_access;

CREATE POLICY "Read access (own + admin)" ON public.user_department_access
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND (
      public.current_user_is_admin()
      OR user_id = auth.uid()
    )
  );
