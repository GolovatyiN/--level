-- =============================================================================
-- Custom user-invite tokens.
--
-- Why not Supabase magic links?
--   * `generateLink({type: 'magiclink'|'recovery'})` returns a URL pointing at
--     Supabase's `/auth/v1/verify` endpoint. To actually land the user back in
--     our app, Supabase requires the redirect URL to be on the project's
--     Redirect URLs allowlist — otherwise it strips the path to "/" and adds
--     an error to the URL hash. Easy to forget in dev / preview environments.
--   * The token's TTL is also project-wide auth config (often 1h), and once
--     consumed (or previewed by an email scanner) it's dead.
--
-- This table stores our own one-time invite tokens. The invite-user edge
-- function inserts a row; the accept-invite edge function consumes it.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.invites (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_user_id ON public.invites(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_email   ON public.invites(email);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Только админ/супер-админ может видеть инвайты. Modify/insert/delete
-- происходит только из edge-функций под service_role (RLS bypass).
CREATE POLICY "Admins read invites" ON public.invites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid()
        AND r.role IN ('admin', 'superadmin')
    )
  );
