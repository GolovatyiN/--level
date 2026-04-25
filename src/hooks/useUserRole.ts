import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "superadmin" | "admin" | "user";

export function useUserRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.role as AppRole);
    },
  });
}

export function useIsSuperadmin() {
  const { data: roles = [] } = useUserRoles();
  return roles.includes("superadmin");
}

export function useIsAdmin() {
  const { data: roles = [] } = useUserRoles();
  return roles.includes("admin") || roles.includes("superadmin");
}
