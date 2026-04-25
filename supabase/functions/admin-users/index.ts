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
    const isSuper = (roles ?? []).some((r: any) => r.role === 'superadmin');
    if (!isSuper) return json({ error: 'Forbidden' }, 403);

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
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
