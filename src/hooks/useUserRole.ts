import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDirections } from "@/hooks/useDirections";
import { useDepartmentAccess } from "@/hooks/useManagement";

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

/**
 * Может ли текущий пользователь РЕДАКТИРОВАТЬ конкретный отдел —
 * создавать/менять планы и задачи. Это не то же самое, что
 * «утверждать» (это только админ).
 *
 * Возвращает true если:
 *   • admin / superadmin, ИЛИ
 *   • пользователь — head_user_id этого отдела, ИЛИ
 *   • у него выдан user_department_access уровня 'edit' / 'full'.
 *
 * RLS на бэке проверяет то же самое (см. has_direction_access).
 * Хук просто отражает это в UI, чтобы не показывать кнопки, которые
 * RLS всё равно отрежет.
 */
export function useCanEditDirection(directionId?: string | null): boolean {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles();
  const { data: directions = [] } = useDirections();
  const { data: access = [] } = useDepartmentAccess();

  if (!user || !directionId) return false;
  if (roles.includes("admin") || roles.includes("superadmin")) return true;

  const dir = directions.find((d) => d.id === directionId);
  if (dir?.head_user_id === user.id) return true;

  return access.some(
    (a) =>
      a.user_id === user.id &&
      a.direction_id === directionId &&
      (a.access_level === "edit" || a.access_level === "full"),
  );
}
