// Edge function: create a new user and return a custom invite link.
//
// Caller must be authenticated and have role 'admin' or 'superadmin'.
// Body:
//   {
//     email: string,
//     display_name?: string,
//     role?: 'superadmin'|'admin'|'department_head'|'manager'|'viewer'|'user',
//     direction_ids?: string[],            // grant access (default 'view')
//     access_level?: 'view'|'edit'|'full', // for the listed directions
//     app_url?: string                     // override (defaults to caller's origin)
//   }
//
// Response:
//   { user_id, email, action_link, created: true, invite_id }
//   action_link = `${app_url}/auth/invite?invite=<UUID>` — opens our own page
//   that consumes the token via accept-invite.
//
// Implementation notes:
//   * No email is sent.
//   * We bypass Supabase's magic-link / recovery flow entirely (their tokens
//     hit auth.v1.verify which requires the redirect URL to be on the project
//     allowlist and have a short TTL). Instead we generate our own one-time
//     token in `public.invites` with a 7-day TTL.
//   * If the email already exists we reuse the existing user and just create
//     a new invite row for them.

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

const INVITE_TTL_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // 1. Verify caller.
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const isAdmin = (callerRoles ?? []).some(
      (r: any) => r.role === "admin" || r.role === "superadmin",
    );
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    // 2. Validate body.
    const body = await req.json().catch(() => ({} as any));
    const email = (body.email ?? "").toString().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Некорректный email" }, 400);
    }
    const display_name: string | null = body.display_name?.toString().trim() || null;
    const role = body.role as string | undefined;
    const direction_ids: string[] = Array.isArray(body.direction_ids) ? body.direction_ids : [];
    const access_level = (body.access_level as string) ?? "view";
    const app_url: string | undefined = (body.app_url ?? body.redirect_to)?.toString();

    // Admins cannot create superadmins — only an existing superadmin can.
    if (role === "superadmin") {
      const isSuper = (callerRoles ?? []).some((r: any) => r.role === "superadmin");
      if (!isSuper) return json({ error: "Только супер-админ может создавать супер-админов" }, 403);
    }

    // 3. Create or reuse the user.
    let newUser: any = null;
    {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: display_name ? { display_name } : undefined,
      });
      if (created?.user) {
        newUser = created.user;
      } else {
        const msg = (createErr?.message ?? "").toLowerCase();
        const alreadyExists =
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("duplicate") ||
          (createErr as any)?.status === 422;
        if (!alreadyExists) {
          return json({ error: createErr?.message ?? "Не удалось создать пользователя" }, 400);
        }
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) {
          return json({ error: `Не удалось найти существующего пользователя: ${listErr.message}` }, 500);
        }
        const existing = (list?.users ?? []).find(
          (u: any) => (u.email ?? "").toLowerCase() === email,
        );
        if (!existing) {
          return json({ error: "Пользователь уже существует, но не найден в auth" }, 500);
        }
        newUser = existing;
      }
    }

    // 3b. Если пользователь существует но отключён — не создаём для
    // него новую invite-ссылку. Сначала его нужно активировать в
    // /management → Пользователи. Иначе invite даст человеку доступ
    // в обход деактивации.
    {
      const { data: prof } = await admin
        .from("profiles")
        .select("is_active")
        .eq("user_id", newUser.id)
        .maybeSingle();
      if (prof && (prof as any).is_active === false) {
        return json(
          {
            error:
              "Пользователь с этим email отключён. Сначала активируйте его в /management → Пользователи.",
            user_id: newUser.id,
          },
          403,
        );
      }
    }

    // 4. Invalidate previous unused invites for this user, then create a fresh
    // one. Keeping a single live invite per user means clicking "create link"
    // again rotates the token (older copies of the URL stop working).
    await admin
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", newUser.id)
      .is("used_at", null);

    const expires_at = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: invite, error: inviteErr } = await admin
      .from("invites")
      .insert({
        user_id: newUser.id,
        email,
        expires_at,
        created_by: caller.id,
      })
      .select("id")
      .single();
    if (inviteErr || !invite) {
      return json({ error: `Не удалось создать invite-токен: ${inviteErr?.message ?? ""}` }, 500);
    }

    // 5. Persist created_by_user_id on the profile so we know who invited them.
    await admin
      .from("profiles")
      .update({ created_by_user_id: caller.id })
      .eq("user_id", newUser.id);

    // 6. Set role (overwrite any default 'user' role from the signup trigger).
    if (role) {
      await admin.from("user_roles").delete().eq("user_id", newUser.id);
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert({ user_id: newUser.id, role });
      if (roleErr) {
        return json({ error: `Роль не назначена: ${roleErr.message}`, user_id: newUser.id }, 500);
      }
    }

    // 7. Grant department access.
    if (direction_ids.length > 0) {
      const rows = direction_ids.map((id) => ({
        user_id: newUser.id,
        direction_id: id,
        access_level,
        granted_by: caller.id,
      }));
      const { error: accessErr } = await admin.from("user_department_access").insert(rows);
      if (accessErr) {
        return json({
          error: `Доступы не выданы: ${accessErr.message}`,
          user_id: newUser.id,
        }, 500);
      }
    }

    // 8. Build the action link. Normalize app_url to just scheme+host+port —
    // strip any path/query/hash. Older clients passed `redirect_to` already
    // containing "/auth/invite", which would otherwise double up to
    // "/auth/invite/auth/invite".
    const rawOrigin = app_url ?? req.headers.get("origin") ?? "";
    let origin = "";
    try {
      const u = new URL(rawOrigin);
      origin = `${u.protocol}//${u.host}`;
    } catch {
      // If app_url isn't a valid URL (e.g. just a host:port), use it as-is
      // after trimming trailing slashes.
      origin = rawOrigin.replace(/\/+$/, "");
    }
    if (!origin) {
      return json({ error: "Не указан app_url и не удалось определить Origin запроса" }, 400);
    }
    const action_link = `${origin}/auth/invite?invite=${invite.id}`;

    return json({
      created: true,
      user_id: newUser.id,
      email: newUser.email,
      invite_id: invite.id,
      action_link,
    });
  } catch (err: any) {
    console.error("invite-user fatal", err);
    return json({ error: err?.message ?? "Внутренняя ошибка", stack: err?.stack }, 500);
  }
});
