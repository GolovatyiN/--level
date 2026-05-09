import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type QuarterStatus = "planned" | "active" | "closed" | "archived";

export type Quarter = {
  id: string;
  label: string;
  sort_key: string;
  year: number | null;
  quarter_no: number | null;
  start_date: string | null;
  end_date: string | null;
  status: QuarterStatus;
  is_visible: boolean;
  created_at: string;
};

export const QUARTER_STATUS_LABELS: Record<QuarterStatus, string> = {
  planned: "Запланирован",
  active: "Активен",
  closed: "Закрыт",
  archived: "Архивный",
};
export type KpiUnit = { id: string; symbol: string; description: string | null; created_at: string };
export type Tag = { id: string; name: string; color: string; created_at: string };

/* === Quarters === */
/**
 * Visible quarters (used everywhere except Management → Кварталы which
 * needs to see hidden ones too). Filters out is_visible=false on the
 * client so the SQL stays simple even before the migration is applied.
 */
export function useQuarters() {
  return useQuery({
    queryKey: ["quarters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarters" as any)
        .select("*")
        .order("sort_key", { ascending: true });
      if (error) throw error;
      const all = (data ?? []) as unknown as Quarter[];
      // Treat missing column (pre-migration) as visible.
      return all.filter((q) => q.is_visible !== false);
    },
    staleTime: 60_000,
  });
}

/** Full list including hidden quarters — for Management → Кварталы. */
export function useAllQuarters() {
  return useQuery({
    queryKey: ["quarters_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarters" as any)
        .select("*")
        .order("sort_key", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as Quarter[];
    },
    staleTime: 60_000,
  });
}

function quarterSortKey(label: string) {
  // "Q3 2026" -> "2026-3"
  const m = label.match(/Q(\d)\s*(\d{4})/i);
  if (!m) return label;
  return `${m[2]}-${m[1]}`;
}

/** Parse "Q3 2026" → { year, quarter_no, start_date, end_date }. */
function parseQuarter(label: string) {
  const m = label.match(/Q([1-4])\s*(\d{4})/i);
  if (!m) return null;
  const quarter_no = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  const startMonth = (quarter_no - 1) * 3; // 0,3,6,9
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0); // last day of the 3rd month
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { year, quarter_no, start_date: fmt(start), end_date: fmt(end) };
}

export function useCreateQuarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error("Название не может быть пустым");
      if (trimmed.length > 30) throw new Error("Слишком длинное название");
      const { data: u } = await supabase.auth.getUser();
      const parsed = parseQuarter(trimmed);
      const payload: any = {
        label: trimmed,
        sort_key: quarterSortKey(trimmed),
        created_by: u.user?.id ?? null,
        is_visible: true,
      };
      if (parsed) {
        payload.year = parsed.year;
        payload.quarter_no = parsed.quarter_no;
        payload.start_date = parsed.start_date;
        payload.end_date = parsed.end_date;
      }
      const { data, error } = await supabase
        .from("quarters" as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Quarter;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quarters"] });
      qc.invalidateQueries({ queryKey: ["quarters_all"] });
      toast.success("Квартал добавлен");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteQuarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quarters" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quarters"] });
      qc.invalidateQueries({ queryKey: ["quarters_all"] });
      toast.success("Квартал удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateQuarter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Quarter, "label" | "status" | "is_visible" | "start_date" | "end_date">>;
    }) => {
      const { error } = await supabase.from("quarters" as any).update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quarters"] });
      qc.invalidateQueries({ queryKey: ["quarters_all"] });
      toast.success("Квартал обновлён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* === KPI units === */
export function useKpiUnits() {
  return useQuery({
    queryKey: ["kpi_units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_units" as any)
        .select("*")
        .order("symbol", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as KpiUnit[];
    },
    staleTime: 60_000,
  });
}

export function useCreateKpiUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (symbol: string) => {
      const trimmed = symbol.trim();
      if (!trimmed) throw new Error("Пустое значение");
      if (trimmed.length > 16) throw new Error("Слишком длинная единица");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("kpi_units" as any)
        .insert({ symbol: trimmed, created_by: u.user?.id ?? null } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as KpiUnit;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi_units"] });
      toast.success("Единица добавлена");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteKpiUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kpi_units" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi_units"] });
      toast.success("Единица удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* === Tags === */
export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags" as any).select("*").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Tag[];
    },
    staleTime: 60_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Пустое имя");
      if (trimmed.length > 30) throw new Error("Слишком длинное имя тега");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tags" as any)
        .insert({ name: trimmed, color: color ?? "#6366f1", created_by: u.user?.id ?? null } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Tag;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Тег удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* === Entity-tag links === */
export function useTaskTags(taskId?: string | null) {
  return useQuery({
    queryKey: ["task_tags", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_tags" as any)
        .select("tag_id")
        .eq("task_id", taskId!);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.tag_id as string);
    },
  });
}

export function useKpiTags(kpiId?: string | null) {
  return useQuery({
    queryKey: ["kpi_tags", kpiId],
    enabled: !!kpiId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_tags" as any)
        .select("tag_id")
        .eq("kpi_id", kpiId!);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.tag_id as string);
    },
  });
}

export function useToggleEntityTag(entity: "task" | "kpi") {
  const qc = useQueryClient();
  const table = entity === "task" ? "task_tags" : "kpi_tags";
  const fkCol = entity === "task" ? "task_id" : "kpi_id";
  const queryKey = entity === "task" ? "task_tags" : "kpi_tags";
  return useMutation({
    mutationFn: async ({ entityId, tagId, attach }: { entityId: string; tagId: string; attach: boolean }) => {
      if (attach) {
        const { error } = await supabase.from(table as any).insert({ [fkCol]: entityId, tag_id: tagId } as any);
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from(table as any)
          .delete()
          .eq(fkCol, entityId)
          .eq("tag_id", tagId);
        if (error) throw error;
      }
      return entityId;
    },
    onSuccess: (entityId) => {
      qc.invalidateQueries({ queryKey: [queryKey, entityId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}