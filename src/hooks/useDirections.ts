import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Direction = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  owner: string | null;
  /** Primary department head — references auth.users.id. Set in the
   *  Management UI; renders the owner block on direction cards. */
  head_user_id: string | null;
  /** Ручная сортировка для /plans. Меньшее значение — выше в списке. */
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function useDirections() {
  return useQuery({
    queryKey: ["directions"],
    queryFn: async () => {
      // Основная сортировка — `sort_order`. По имени — стабильный
      // tie-breaker, если у нескольких строк одинаковый sort_order
      // (бывает после ручного перетаскивания, пока reorder ещё не
      // дописал новые значения).
      const { data, error } = await supabase
        .from("directions")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Direction[];
    },
  });
}

/**
 * Сохраняет новый порядок отделов после drag&drop.
 *
 * Принимает массив id в желаемом порядке и проставляет каждому строке
 * её индекс как новый `sort_order`. Параллельно делаем все апдейты —
 * для 10–50 отделов это пара десятков RPC, лежит в пределах разумного.
 *
 * onMutate сразу обновляет кэш `["directions"]`, чтобы UI не мигал
 * между перетаскиванием и приходом ответа сервера. Если запрос упадёт,
 * onError откатит кэш и покажет тост.
 */
export function useReorderDirections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Параллельные UPDATE'ы — простой и читаемый код. Альтернатива —
      // RPC с одним батчем, но это перебор для редкой операции.
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("directions").update({ sort_order: idx }).eq("id", id),
        ),
      );
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ["directions"] });
      const prev = qc.getQueryData<Direction[]>(["directions"]);
      if (prev) {
        const byId = new Map(prev.map((d) => [d.id, d]));
        const next = orderedIds
          .map((id, idx) => {
            const d = byId.get(id);
            return d ? { ...d, sort_order: idx } : null;
          })
          .filter(Boolean) as Direction[];
        qc.setQueryData(["directions"], next);
      }
      return { prev };
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["directions"], ctx.prev);
      toast.error(e?.message ?? "Не удалось сохранить порядок");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["directions"] });
    },
  });
}

export function useUpsertDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Direction> & { name: string; color: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = { ...input };
      if (!input.id) payload.created_by = u.user?.id;
      const { data, error } = await supabase.from("directions").upsert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directions"] });
      toast.success("Отдел сохранён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("directions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["directions"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Отдел удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}