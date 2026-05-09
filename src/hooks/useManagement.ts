import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppRole } from "./useUserRole";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessLevel = "view" | "edit" | "full";

/** Levels in increasing privilege — used for comparisons & dropdowns. */
export const ACCESS_LEVELS: AccessLevel[] = ["view", "edit", "full"];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  view: "Только просмотр",
  edit: "Просмотр + редактирование",
  full: "Полный доступ",
};

export type ManagementUser = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  last_active_at: string | null;
  created_by_user_id: string | null;
  roles: AppRole[];
};

export type DepartmentAccess = {
  user_id: string;
  direction_id: string;
  access_level: AccessLevel;
  granted_at: string;
  granted_by: string | null;
};

export type AuditLogEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Users (Management view)
// ---------------------------------------------------------------------------

/**
 * Full Management-side user list. Uses the existing admin-users edge
 * function (it returns auth metadata that's not available to the anon
 * client) and merges in roles, profile flags, and access entries.
 */
export function useManagementUsers(enabled = true) {
  return useQuery({
    queryKey: ["management_users"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const users = ((data as any).users ?? []) as Array<{
        id: string;
        email: string | null;
        display_name: string | null;
        created_at: string;
        last_sign_in_at: string | null;
        roles: string[];
      }>;

      // Augment with profile flags (is_active etc).
      const ids = users.map((u) => u.id);
      let profiles: Array<{
        user_id: string;
        is_active?: boolean;
        last_active_at?: string | null;
        created_by_user_id?: string | null;
      }> = [];
      if (ids.length > 0) {
        const { data: pdata } = await supabase
          .from("profiles" as any)
          .select("user_id, is_active, last_active_at, created_by_user_id")
          .in("user_id", ids);
        profiles = (pdata as any[]) ?? [];
      }
      const pmap = new Map(profiles.map((p) => [p.user_id, p]));

      return users.map<ManagementUser>((u) => {
        const p = pmap.get(u.id);
        return {
          user_id: u.id,
          email: u.email,
          display_name: u.display_name,
          created_at: u.created_at,
          last_active_at: p?.last_active_at ?? u.last_sign_in_at ?? null,
          is_active: p?.is_active ?? true,
          created_by_user_id: p?.created_by_user_id ?? null,
          roles: u.roles as AppRole[],
        };
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Role mutations
// ---------------------------------------------------------------------------

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      // Replace the user's roles with this single role. Most apps treat the
      // primary role as a property of the user; allowing many roles per user
      // is supported by the schema but the Management UI surfaces one role
      // at a time for simplicity.
      const { error: delErr } = await supabase
        .from("user_roles" as any)
        .delete()
        .eq("user_id", user_id);
      if (delErr) throw delErr;
      const { error } = await supabase
        .from("user_roles" as any)
        .insert({ user_id, role } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["management_users"] });
      qc.invalidateQueries({ queryKey: ["user_roles"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Роль обновлена");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Profile flags (deactivation)
// ---------------------------------------------------------------------------

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, is_active }: { user_id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("profiles" as any)
        .update({ is_active } as any)
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["management_users"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success(v.is_active ? "Пользователь активирован" : "Пользователь деактивирован");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Department access matrix
// ---------------------------------------------------------------------------

export function useDepartmentAccess() {
  return useQuery({
    queryKey: ["user_department_access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_department_access" as any)
        .select("*");
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return ((data ?? []) as unknown) as DepartmentAccess[];
    },
  });
}

export function useSetDepartmentAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      user_id,
      direction_id,
      access_level,
    }: {
      user_id: string;
      direction_id: string;
      access_level: AccessLevel | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (access_level === null) {
        // Revoke entirely.
        const { error } = await supabase
          .from("user_department_access" as any)
          .delete()
          .eq("user_id", user_id)
          .eq("direction_id", direction_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_department_access" as any)
          .upsert(
            {
              user_id,
              direction_id,
              access_level,
              granted_by: u.user?.id ?? null,
              granted_at: new Date().toISOString(),
            } as any,
            { onConflict: "user_id,direction_id" } as any,
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_department_access"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Department head
// ---------------------------------------------------------------------------

export function useSetDepartmentHead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      direction_id,
      head_user_id,
    }: {
      direction_id: string;
      head_user_id: string | null;
    }) => {
      const { error } = await supabase
        .from("directions")
        .update({ head_user_id } as any)
        .eq("id", direction_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directions"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Руководитель обновлён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ["audit_log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return ((data ?? []) as unknown) as AuditLogEntry[];
    },
  });
}
