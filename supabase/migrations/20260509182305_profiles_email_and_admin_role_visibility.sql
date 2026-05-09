-- =============================================================================
-- Make user list available to admins without an edge function
--
-- Problem:
--   * The Management Users tab used the `admin-users` edge function (it can
--     read auth.users via service_role). That function isn't deployed on the
--     new project, so the list was empty.
--   * `user_roles` RLS only let superadmin (or self) read rows, so admins
--     couldn't see other users' roles even via direct table queries.
--
-- Fix:
--   * Mirror auth.users.email into profiles so the anon-client can show it.
--   * Auto-populate on insert (via trigger) and on auth.users.email updates.
--   * Backfill existing rows.
--   * Loosen user_roles SELECT so anyone authenticated can read role rows
--     (roles are not particularly sensitive — knowing someone is "manager"
--     doesn't expose anything secret, and the Management UI must show them).
-- =============================================================================

-- 1. Add the column.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. Backfill from auth.users.
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE p.user_id = u.id AND (p.email IS NULL OR p.email IS DISTINCT FROM u.email);

-- 3. Update the existing handle_new_user() trigger to also populate email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    NEW.email
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- 4. Keep email in sync if a user changes it (rare but possible).
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- 5. Loosen user_roles SELECT — any authenticated user can now read roles.
--    Roles aren't secret; the Management UI needs them, and admin-only
--    visibility was overkill.
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Authenticated read roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);
