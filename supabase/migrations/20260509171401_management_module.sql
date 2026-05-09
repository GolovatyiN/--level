-- =============================================================================
-- Management module
--
-- Adds the schema/triggers/policies needed for the new Management section:
--   * Extra roles (department_head, manager, viewer)
--   * Department-level access matrix (user_department_access)
--   * A primary head per department (directions.head_user_id)
--   * Per-user activity tracking (profiles.last_active_at, is_active)
--   * Audit log of administrative changes
--   * RLS that prevents non-superadmins from elevating themselves
--   * Helper functions for the frontend to compute access levels
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the app_role enum
-- Postgres doesn't allow ADD VALUE inside a transaction block, but Supabase
-- migrations run each file in its own transaction, so we use IF NOT EXISTS.
-- ---------------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'department_head';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- ---------------------------------------------------------------------------
-- 2. Profile additions: activation, audit metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- ---------------------------------------------------------------------------
-- 3. Department head FK on directions
-- ---------------------------------------------------------------------------
ALTER TABLE public.directions
  ADD COLUMN IF NOT EXISTS head_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_directions_head_user_id ON public.directions(head_user_id);

-- ---------------------------------------------------------------------------
-- 4. Access level enum + user_department_access matrix
--
-- One row per (user, department). Missing row = 'no access' from the
-- Management UI's POV. The enum values are ordered so enum comparison
-- (level_a >= level_b) works as expected.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_level') THEN
    CREATE TYPE public.access_level AS ENUM ('view', 'edit', 'full');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_department_access (
  user_id       UUID NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  direction_id  UUID NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  access_level  public.access_level NOT NULL DEFAULT 'view',
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, direction_id)
);

ALTER TABLE public.user_department_access ENABLE ROW LEVEL SECURITY;

-- Reads: every authenticated user can see access entries (used by the
-- Management UI and access-checks in the frontend). The data isn't
-- particularly sensitive — it's "who can see what".
DROP POLICY IF EXISTS "Authenticated read department access" ON public.user_department_access;
CREATE POLICY "Authenticated read department access"
  ON public.user_department_access FOR SELECT TO authenticated USING (true);

-- Writes: only super/admin (admins can grant, superadmin can do anything).
DROP POLICY IF EXISTS "Admins manage department access (insert)" ON public.user_department_access;
CREATE POLICY "Admins manage department access (insert)"
  ON public.user_department_access FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins manage department access (update)" ON public.user_department_access;
CREATE POLICY "Admins manage department access (update)"
  ON public.user_department_access FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins manage department access (delete)" ON public.user_department_access;
CREATE POLICY "Admins manage department access (delete)"
  ON public.user_department_access FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_uda_user        ON public.user_department_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uda_direction   ON public.user_department_access(direction_id);

-- ---------------------------------------------------------------------------
-- 5. Audit log
--
-- Append-only. Every administrative action that mutates roles, access or
-- department heads writes one row. The Management UI's "Activity Log" tab
-- reads this directly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Reads: super/admin only.
DROP POLICY IF EXISTS "Admins read audit log" ON public.audit_log;
CREATE POLICY "Admins read audit log"
  ON public.audit_log FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Writes happen exclusively from triggers (SECURITY DEFINER); no client
-- INSERT policy.

CREATE INDEX IF NOT EXISTS idx_audit_log_created   ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target    ON public.audit_log(target_type, target_id);

-- ---------------------------------------------------------------------------
-- 6. Helper functions for the frontend
-- ---------------------------------------------------------------------------

-- Returns the user's effective access level on a department:
--   superadmin / admin → 'full' (unrestricted)
--   department_head    → 'full' for departments where they're listed as head
--   otherwise          → access_level from user_department_access (or NULL)
CREATE OR REPLACE FUNCTION public.user_dept_access_level(_user UUID, _direction UUID)
RETURNS public.access_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lvl public.access_level;
BEGIN
  -- Superadmin / admin always have full access.
  IF public.has_role(_user, 'superadmin') OR public.has_role(_user, 'admin') THEN
    RETURN 'full';
  END IF;
  -- Department head: full on their own department(s).
  IF EXISTS (SELECT 1 FROM public.directions WHERE id = _direction AND head_user_id = _user) THEN
    RETURN 'full';
  END IF;
  -- Otherwise: explicit grant.
  SELECT access_level INTO lvl
  FROM public.user_department_access
  WHERE user_id = _user AND direction_id = _direction;
  RETURN lvl;  -- NULL means no access
END;
$$;

-- Convenience wrapper: does the user have at least the requested level?
CREATE OR REPLACE FUNCTION public.has_dept_access(_user UUID, _direction UUID, _min_level public.access_level)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(public.user_dept_access_level(_user, _direction) >= _min_level, false);
$$;

-- ---------------------------------------------------------------------------
-- 7. Audit triggers
--
-- Each trigger writes one row to audit_log with the actor (auth.uid()) and
-- enough context to reconstruct the change. Action names use kebab-case so
-- they're easy to filter on in the UI.
-- ---------------------------------------------------------------------------

-- 7.1 user_roles
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'role_granted', 'user', NEW.user_id,
            jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'role_revoked', 'user', OLD.user_id,
            jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

-- 7.2 user_department_access
CREATE OR REPLACE FUNCTION public.audit_user_department_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'department_access_granted', 'user', NEW.user_id,
            jsonb_build_object('direction_id', NEW.direction_id, 'access_level', NEW.access_level));
  ELSIF TG_OP = 'UPDATE' AND OLD.access_level IS DISTINCT FROM NEW.access_level THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'department_access_changed', 'user', NEW.user_id,
            jsonb_build_object(
              'direction_id', NEW.direction_id,
              'from', OLD.access_level,
              'to', NEW.access_level));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'department_access_revoked', 'user', OLD.user_id,
            jsonb_build_object('direction_id', OLD.direction_id, 'access_level', OLD.access_level));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_dept_access ON public.user_department_access;
CREATE TRIGGER trg_audit_user_dept_access
AFTER INSERT OR UPDATE OR DELETE ON public.user_department_access
FOR EACH ROW EXECUTE FUNCTION public.audit_user_department_access();

-- 7.3 directions.head_user_id
CREATE OR REPLACE FUNCTION public.audit_directions_head()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.head_user_id IS DISTINCT FROM NEW.head_user_id THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'department_head_changed', 'department', NEW.id,
            jsonb_build_object(
              'department_name', NEW.name,
              'from', OLD.head_user_id,
              'to', NEW.head_user_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_directions_head ON public.directions;
CREATE TRIGGER trg_audit_directions_head
AFTER UPDATE OF head_user_id ON public.directions
FOR EACH ROW EXECUTE FUNCTION public.audit_directions_head();

-- 7.4 profiles.is_active flips (deactivation / reactivation)
CREATE OR REPLACE FUNCTION public.audit_profiles_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      CASE WHEN NEW.is_active THEN 'user_reactivated' ELSE 'user_deactivated' END,
      'user', NEW.user_id, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profiles_active ON public.profiles;
CREATE TRIGGER trg_audit_profiles_active
AFTER UPDATE OF is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_active();

-- ---------------------------------------------------------------------------
-- 8. Tighten user_roles security: prevent non-superadmins from elevating
--    themselves to superadmin. Existing policy only allowed superadmin to
--    insert/update/delete. We now also let admins manage non-superadmin
--    roles, with a guard that they cannot create a superadmin row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Superadmin manages roles insert" ON public.user_roles;
CREATE POLICY "Admin manages roles insert"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (public.has_role(auth.uid(), 'admin') AND role <> 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmin manages roles update" ON public.user_roles;
CREATE POLICY "Admin manages roles update"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (public.has_role(auth.uid(), 'admin') AND role <> 'superadmin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (public.has_role(auth.uid(), 'admin') AND role <> 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmin manages roles delete" ON public.user_roles;
CREATE POLICY "Admin manages roles delete"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (public.has_role(auth.uid(), 'admin') AND role <> 'superadmin')
  );

-- ---------------------------------------------------------------------------
-- 9. Allow admins/superadmins to update any profile (deactivation flow)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ---------------------------------------------------------------------------
-- 10. Allow superadmins to manage profiles.created_by_user_id and other
--     metadata. Existing "users update own" stays for self-edits.
-- ---------------------------------------------------------------------------
-- (Nothing extra needed — covered by "Admins update any profile" above.)
