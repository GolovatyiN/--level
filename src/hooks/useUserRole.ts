import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole =
  | "superadmin"
  | "admin"
  | "department_head"
  | "manager"
  | "viewer"
  | "user";

/** Display order for badges and pickers — most-privileged first. */
export const ROLE_ORDER: AppRole[] = [
  "superadmin",
  "admin",
  "department_head",
  "manager",
  "viewer",
  "user",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Супер-админ",
  admin: "Админ",
  department_head: "Руководитель отдела",
  manager: "Менеджер",
  viewer: "Наблюдатель",
  user: "Пользователь",
};

/**
 * "Effective" role for a user — the highest-privileged one assigned to
 * them. Drives badge colour, sidebar visibility, and Management UI guards.
 */
export function effectiveRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_ORDER) if (roles.includes(r)) return r;
  return null;
}

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

/** Admin or above — used to show the Management nav and protect routes. */
export function useCanManage() {
  return useIsAdmin();
}

/** Department head or above. */
export function useIsDepartmentHead() {
  const { data: roles = [] } = useUserRoles();
  return (
    roles.includes("department_head") ||
    roles.includes("admin") ||
    roles.includes("superadmin")
  );
}
