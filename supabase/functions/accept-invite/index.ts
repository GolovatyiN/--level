// Edge function: accept a custom invite token.
//
// No auth header required — the invite token itself is the credential.
// Body:
//   {
//     invite: string,         // UUID token from /auth/invite?invite=...
//     password: string,       // user-chosen password (>=6 chars)
//     display_name?: string,  // optional, replaces what's in profiles
//   }
//
// Response:
//   { ok: true, email: string }
//   The client then calls signInWithPassword({ email, password }) to finalise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({} as any));
    const inviteId = (body.invite ?? "").toString().trim();
    const password = (body.password ?? "").toString();
    const display_name: string | null = body.display_name?.toString().trim() || null;

    if (!inviteId || !/^[0-9a-f-]{36}$/i.test(inviteId)) {
      return json({ error: "Некорректный invite-токен" }, 400);
    }
    if (!password || password.length < 6) {
      return json({ error: "Пароль должен быть не короче 6 символов" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Find the invite.
    const { data: invite, error: invErr } = await admin
      .from("invites")
      .select("id, user_id, email, expires_at, used_at")
      .eq("id", inviteId)
      .maybeSingle();
    if (invErr) {
      return json({ error: `Ошибка чтения invite: ${invErr.message}` }, 500);
    }
    if (!invite) {
      return json({ error: "Ссылка-приглашение не найдена" }, 404);
    }
    if (invite.used_at) {
      return json({ error: "Ссылка-приглашение уже использована" }, 410);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return json({ error: "Срок действия ссылки истёк" }, 410);
    }

    // 2. Set the password (and display_name if provided).
    const { error: updErr } = await admin.auth.admin.updateUserById(invite.user_id, {
      password,
      user_metadata: display_name ? { display_name } : undefined,
      email_confirm: true,
    });
    if (updErr) {
      return json({ error: `Не удалось установить пароль: ${updErr.message}` }, 500);
    }

    // 3. Sync display_name into profiles too, so the new name shows up
    // everywhere immediately (sidebar, comments, etc.).
    if (display_name) {
      await admin
        .from("profiles")
        .update({ display_name })
        .eq("user_id", invite.user_id);
    }

    // 4. Mark the invite as used.
    await admin
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", inviteId);

    return json({ ok: true, email: invite.email });
  } catch (err: any) {
    console.error("accept-invite fatal", err);
    return json({ error: err?.message ?? "Внутренняя ошибка", stack: err?.stack }, 500);
  }
});
