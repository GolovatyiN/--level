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
 * Full Management-side user list, sourced directly from `profiles` and
 * `user_roles` (no edge function needed).
 *
 * `profiles.email` is mirrored from `auth.users` by a trigger so the
 * anon-client can read it under RLS. Roles are joined client-side.
 */
export function useManagementUsers(enabled = true) {
  return useQuery({
    queryKey: ["management_users"],
    enabled,
    queryFn: async () => {
      const { data: pdata, error: perr } = await supabase
        .from("profiles" as any)
        .select("user_id, display_name, email, is_active, last_active_at, created_by_user_id, created_at")
        .order("created_at", { ascending: false });
      if (perr) throw perr;

      const profiles = (pdata as any[]) ?? [];
      if (profiles.length === 0) return [] as ManagementUser[];

      const ids = profiles.map((p) => p.user_id);
      const { data: rdata, error: rerr } = await supabase
        .from("user_roles" as any)
        .select("user_id, role")
        .in("user_id", ids);
      if (rerr) throw rerr;

      const rolesByUser = new Map<string, AppRole[]>();
      ((rdata as any[]) ?? []).forEach((r) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        rolesByUser.set(r.user_id, arr);
      });

      return profiles.map<ManagementUser>((p) => ({
        user_id: p.user_id,
        email: p.email ?? null,
        display_name: p.display_name ?? null,
        created_at: p.created_at,
        last_active_at: p.last_active_at ?? null,
        is_active: p.is_active ?? true,
        created_by_user_id: p.created_by_user_id ?? null,
        roles: rolesByUser.get(p.user_id) ?? [],
      }));
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

      // При деактивации — отзываем все активные invite-ссылки для
      // этого пользователя, чтобы их нельзя было использовать
      // повторно после отключения.
      if (!is_active) {
        await supabase
          .from("invites" as any)
          .update({ used_at: new Date().toISOString() } as any)
          .eq("user_id", user_id)
          .is("used_at", null);
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["management_users"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast.success(
        v.is_active
          ? "Пользователь активирован"
          : "Пользователь деактивирован. RLS блокирует его запросы; активные приглашения отозваны.",
      );
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

/**
 * Назначает одному пользователю заведование набором отделов.
 *
 * Один человек может быть head'ом нескольких отделов одновременно
 * (data model уже это позволяет — у `directions.head_user_id` нет
 * UNIQUE-констрейнта). Этот хук работает с user-centric точки зрения:
 * выбираешь юзера → отмечаешь чекбоксами все отделы, которыми он
 * руководит.
 *
 * Diff-логика:
 *   • прошлые: directions, где `head_user_id == user_id`
 *   • новые: переданный direction_ids
 *   • для отделов, что были, но больше не выбраны → set head_user_id = null
 *   • для новых, но ещё не назначенных → set head_user_id = user_id
 *   • те, что и были и остались, не трогаем (не сбиваем updated_at)
 */
export function useSetUserDepartmentHeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      user_id,
      direction_ids,
    }: {
      user_id: string;
      direction_ids: string[];
    }) => {
      // Тянем актуальный список отделов одного запроса.
      const { data: dirs, error: readErr } = await supabase
        .from("directions")
        .select("id, head_user_id");
      if (readErr) throw readErr;

      const currentlyManaged = (dirs ?? [])
        .filter((d: any) => d.head_user_id === user_id)
        .map((d: any) => d.id as string);
      const nextSet = new Set(direction_ids);
      const toClear = currentlyManaged.filter((id) => !nextSet.has(id));
      const toAssign = direction_ids.filter((id) => !currentlyManaged.includes(id));

      await Promise.all([
        ...toClear.map((id) =>
          supabase.from("directions").update({ head_user_id: null } as any).eq("id", id),
        ),
        ...toAssign.map((id) =>
          supabase.from("directions").update({ head_user_id: user_id } as any).eq("id", id),
        ),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directions"] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      toast.success("Руководство отделами обновлено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось обновить"),
  });
}

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
