import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * supabase.functions.invoke прячет тело non-2xx ответа в error.context
 * (FunctionsHttpError). Без этого пользователь видит только
 * "Edge Function returned a non-2xx status code" и не понимает, что
 * пошло не так. Достаём JSON из context и возвращаем настоящий
 * `error` от edge-функции, либо `null` если не удалось распарсить.
 */
async function readFnError(err: unknown): Promise<string | null> {
  const ctx = (err as any)?.context;
  if (ctx?.json) {
    try {
      const j = await ctx.json();
      if (j?.error) return j.error as string;
    } catch {/* ignore */}
  }
  if (ctx?.text) {
    try {
      const t = await ctx.text();
      if (t) return t;
    } catch {/* ignore */}
  }
  return null;
}

export type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
};

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["admin_users"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" },
      });
      if (error) {
        const detail = await readFnError(error);
        throw new Error(detail ?? error.message ?? "Не удалось загрузить пользователей");
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any).users ?? []) as AdminUser[];
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete", user_id },
      });
      if (error) {
        const detail = await readFnError(error);
        throw new Error(detail ?? error.message ?? "Не удалось удалить пользователя");
      }
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: async (_data, user_id) => {
      // Optimistic update — выкидываем юзера из кэшей сразу, чтобы UX
      // не зависел от того, как быстро прилетит refetch. Если по какой-то
      // причине юзер вернётся из refetch (т.е. в DB он остался) — он
      // моментально появится снова, и это будет явный сигнал, что что-то
      // не так на стороне сервера.
      qc.setQueryData(["management_users"], (old: any[] | undefined) =>
        (old ?? []).filter((u) => u.user_id !== user_id),
      );
      qc.setQueryData(["admin_users"], (old: any[] | undefined) =>
        (old ?? []).filter((u) => u.id !== user_id),
      );
      qc.setQueryData(["app_users"], (old: any[] | undefined) =>
        (old ?? []).filter((u) => u.user_id !== user_id && u.id !== user_id),
      );
      // refetchQueries (а не просто invalidate) гарантирует что мы
      // сразу подтянем актуальное состояние с сервера. Если юзер в DB
      // остался — он вернётся в таблицу, и это будет видно.
      await Promise.all([
        qc.refetchQueries({ queryKey: ["management_users"] }),
        qc.refetchQueries({ queryKey: ["admin_users"] }),
        qc.refetchQueries({ queryKey: ["app_users"] }),
        qc.refetchQueries({ queryKey: ["user_department_access"] }),
      ]);
      toast.success("Пользователь удалён");
    },
    onError: (e: any) => toast.error(e.message ?? "Ошибка удаления"),
  });
}
