import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const callerRoles = (roles ?? []).map((r: any) => r.role as string);
    const isSuper = callerRoles.includes('superadmin');
    const isAdmin = callerRoles.includes('admin') || isSuper;
    // Both admin and superadmin manage users — matches the visibility rules
    // for /management (see useCanManage). Per-action checks below restrict
    // privileged operations (e.g. only superadmin may delete a superadmin).
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'list') {
      const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;

      const users = list.users;
      const ids = users.map((u) => u.id);
      const [{ data: rolesData }, { data: profilesData }] = await Promise.all([
        admin.from('user_roles').select('user_id, role').in('user_id', ids),
        admin.from('profiles').select('user_id, display_name').in('user_id', ids),
      ]);
      const rolesByUser: Record<string, string[]> = {};
      (rolesData ?? []).forEach((r: any) => {
        rolesByUser[r.user_id] = [...(rolesByUser[r.user_id] ?? []), r.role];
      });
      const profileByUser: Record<string, string | null> = {};
      (profilesData ?? []).forEach((p: any) => { profileByUser[p.user_id] = p.display_name; });

      const result = users.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: profileByUser[u.id] ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        roles: rolesByUser[u.id] ?? [],
      }));
      return json({ users: result });
    }

    if (action === 'delete') {
      const targetId = body.user_id as string;
      if (!targetId) return json({ error: 'user_id required' }, 400);
      if (targetId === user.id) return json({ error: 'Нельзя удалить самого себя' }, 400);

      // Only a superadmin may delete another superadmin.
      const { data: targetRoles } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', targetId);
      const targetIsSuper = (targetRoles ?? []).some((r: any) => r.role === 'superadmin');
      if (targetIsSuper && !isSuper) {
        return json({ error: 'Удалить супер-админа может только супер-админ' }, 403);
      }

      // Defense-in-depth: even though FKs to auth.users are declared CASCADE,
      // we have seen cases where the row in `profiles` survives the auth
      // delete (some triggers / replicas). So we explicitly clear our app
      // tables first. The deletes are idempotent — if cascade already fired,
      // these are no-ops.
      const cleanupErrors: string[] = [];
      for (const step of [
        () => admin.from('user_roles').delete().eq('user_id', targetId),
        () => admin.from('user_department_access').delete().eq('user_id', targetId),
        () => admin.from('notifications').delete().eq('user_id', targetId),
        () => admin.from('profiles').delete().eq('user_id', targetId),
      ]) {
        const { error } = await step();
        if (error) cleanupErrors.push(error.message);
      }

      // Hard-delete the auth user. Second arg `shouldSoftDelete` defaults to
      // false → real deletion from auth.users.
      const { error: delErr } = await admin.auth.admin.deleteUser(targetId, false);
      if (delErr) {
        return json({
          error: `Не удалось удалить из auth: ${delErr.message}`,
          cleanup_errors: cleanupErrors,
        }, 500);
      }

      // Verify: list users (filter is not supported, so we just probe by id).
      const { data: stillThere } = await admin.auth.admin.getUserById(targetId);
      if (stillThere?.user) {
        return json({
          error: 'Auth API сообщил об успехе, но пользователь всё ещё существует. Проверьте права service_role и настройки проекта.',
          cleanup_errors: cleanupErrors,
        }, 500);
      }
      // Verify profile row is gone too.
      const { data: profileLeft } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', targetId)
        .maybeSingle();
      if (profileLeft) {
        return json({
          error: 'auth.users удалён, но строка profiles осталась. Возможно, триггер пересоздаёт профиль.',
          cleanup_errors: cleanupErrors,
        }, 500);
      }

      return json({ ok: true, cleanup_errors: cleanupErrors });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('admin-users fatal', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
