import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppUser = {
  user_id: string;
  display_name: string | null;
  /** Mirrored from auth.users.email via trigger — см. миграцию
   * profiles_email_and_admin_role_visibility. Используем в пикерах,
   * чтобы пользователь видел не только имя, но и email. */
  email: string | null;
};

/**
 * All registered users (from `profiles`). Cached for 1 minute since the list
 * rarely changes during a session — pickers and notification displays both
 * draw from this single query.
 */
export function useUsers() {
  return useQuery({
    queryKey: ["app_users"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles" as any)
        .select("user_id, display_name, email")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return ((data as any[]) ?? []) as AppUser[];
    },
  });
}

/** Convenience: build a Map<user_id, display_name | null>. */
export function useUserMap() {
  const q = useUsers();
  const map = new Map<string, string | null>();
  (q.data ?? []).forEach((u) => map.set(u.user_id, u.display_name));
  return { ...q, map };
}
