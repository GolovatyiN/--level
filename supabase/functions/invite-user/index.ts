// Edge function: invite a new user.
//
// Caller must be authenticated and have role 'admin' or 'superadmin'.
// Body:
//   {
//     email: string,
//     display_name?: string,
//     role?: 'superadmin'|'admin'|'department_head'|'manager'|'viewer'|'user',
//     direction_ids?: string[],            // grant access (default 'view')
//     access_level?: 'view'|'edit'|'full', // for the listed directions
//     redirect_to?: string                 // override redirect URL
//   }
//
// Response:
//   { user_id, email, action_link, invited: true }
//   action_link is the one-shot URL that completes the signup.
//
// Implementation notes:
//   * Uses generateLink({ type: 'invite' }) so we get the action_link back to
//     show the admin (Supabase still emails the user, but having the URL means
//     we can copy/paste even if email delivery is unreliable).
//   * Roles and department access are inserted via service_role so they
//     bypass RLS — the admin's own role is verified at the top.

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
    const redirect_to: string | undefined = body.redirect_to?.toString();

    // Admins cannot create superadmins — only an existing superadmin can.
    if (role === "superadmin") {
      const isSuper = (callerRoles ?? []).some((r: any) => r.role === "superadmin");
      if (!isSuper) return json({ error: "Только супер-админ может создавать супер-админов" }, 403);
    }

    // 3. Generate the invite link.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: display_name ? { display_name } : undefined,
        redirectTo: redirect_to,
      },
    });
    if (linkErr || !linkData?.user) {
      return json({ error: linkErr?.message ?? "Не удалось создать приглашение" }, 400);
    }
    const newUser = linkData.user;
    const action_link = (linkData.properties as any)?.action_link as string | undefined;

    // 4. Persist created_by_user_id on the profile so we know who invited them.
    await admin
      .from("profiles")
      .update({ created_by_user_id: caller.id })
      .eq("user_id", newUser.id);

    // 5. Set role (overwrite any default 'user' role from the signup trigger).
    if (role) {
      await admin.from("user_roles").delete().eq("user_id", newUser.id);
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert({ user_id: newUser.id, role });
      if (roleErr) {
        return json({ error: `Роль не назначена: ${roleErr.message}`, user_id: newUser.id, action_link }, 500);
      }
    }

    // 6. Grant department access.
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
          action_link,
        }, 500);
      }
    }

    return json({
      invited: true,
      user_id: newUser.id,
      email: newUser.email,
      action_link,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? "Внутренняя ошибка" }, 500);
  }
});
