import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type KpiComment = {
  id: string;
  kpi_id: string;
  author_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export type KpiProgressEntry = {
  id: string;
  kpi_id: string;
  delta: number;
  note: string | null;
  log_date: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
};

export type KpiTaskLink = {
  id: string;
  kpi_id: string;
  task_id: string;
  contribution: number;
  created_at: string;
  task?: {
    id: string;
    title: string;
    status: string;
    assignee: string | null;
    deadline: string | null;
  } | null;
};

export function useKpiComments(kpiId?: string | null) {
  return useQuery({
    queryKey: ["kpi_comments", kpiId],
    enabled: !!kpiId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_comments" as any)
        .select("*")
        .eq("kpi_id", kpiId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KpiComment[];
    },
  });
}

export function useAddKpiComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kpi_id, content }: { kpi_id: string; content: string }) => {
      const { data: u } = await supabase.auth.getUser();
      let author_name: string | null = u.user?.email ?? null;
      if (u.user?.id) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("user_id", u.user.id).maybeSingle();
        if (p?.display_name) author_name = p.display_name;
      }
      const { error } = await supabase.from("kpi_comments" as any).insert({
        kpi_id,
        content,
        author_id: u.user?.id ?? null,
        author_name,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["kpi_comments", v.kpi_id] });
      toast.success("Комментарий добавлен");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteKpiComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kpi_id }: { id: string; kpi_id: string }) => {
      const { error } = await supabase.from("kpi_comments" as any).delete().eq("id", id);
      if (error) throw error;
      return kpi_id;
    },
    onSuccess: (kpi_id) => {
      qc.invalidateQueries({ queryKey: ["kpi_comments", kpi_id] });
      toast.success("Комментарий удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ===== Связанные задачи ===== */

export function useKpiLinkedTasks(kpiId?: string | null) {
  return useQuery({
    queryKey: ["kpi_tasks", kpiId],
    enabled: !!kpiId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_tasks" as any)
        .select("id, kpi_id, task_id, contribution, created_at, task:tasks(id, title, status, assignee, deadline)")
        .eq("kpi_id", kpiId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KpiTaskLink[];
    },
  });
}

export function useTaskKpiLinks(taskId?: string | null) {
  return useQuery({
    queryKey: ["task_kpis", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_tasks" as any)
        .select("id, kpi_id, task_id, contribution")
        .eq("task_id", taskId!);
      if (error) throw error;
      return (data ?? []) as unknown as KpiTaskLink[];
    },
  });
}

export function useLinkKpiTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kpi_id: string; task_id: string; contribution: number }) => {
      const { error } = await supabase.from("kpi_tasks" as any).insert(input as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["kpi_tasks", v.kpi_id] });
      qc.invalidateQueries({ queryKey: ["task_kpis", v.task_id] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Задача привязана к KPI");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateKpiTaskLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contribution, kpi_id }: { id: string; contribution: number; kpi_id: string }) => {
      const { error } = await supabase.from("kpi_tasks" as any).update({ contribution } as any).eq("id", id);
      if (error) throw error;
      return kpi_id;
    },
    onSuccess: (kpi_id) => {
      qc.invalidateQueries({ queryKey: ["kpi_tasks", kpi_id] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUnlinkKpiTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kpi_id, task_id }: { id: string; kpi_id: string; task_id?: string }) => {
      const { error } = await supabase.from("kpi_tasks" as any).delete().eq("id", id);
      if (error) throw error;
      return { kpi_id, task_id };
    },
    onSuccess: ({ kpi_id, task_id }) => {
      qc.invalidateQueries({ queryKey: ["kpi_tasks", kpi_id] });
      if (task_id) qc.invalidateQueries({ queryKey: ["task_kpis", task_id] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Связь удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ===== Журнал ручного прогресса ===== */

export function useKpiProgressLog(kpiId?: string | null) {
  return useQuery({
    queryKey: ["kpi_progress", kpiId],
    enabled: !!kpiId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_progress_log" as any)
        .select("*")
        .eq("kpi_id", kpiId!)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KpiProgressEntry[];
    },
  });
}

export function useAddKpiProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kpi_id: string; delta: number; note?: string | null; log_date: string }) => {
      const { data: u } = await supabase.auth.getUser();
      let author_name: string | null = u.user?.email ?? null;
      if (u.user?.id) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("user_id", u.user.id).maybeSingle();
        if (p?.display_name) author_name = p.display_name;
      }
      const { error } = await supabase.from("kpi_progress_log" as any).insert({
        ...input,
        author_id: u.user?.id ?? null,
        author_name,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["kpi_progress", v.kpi_id] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Прогресс добавлен");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteKpiProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kpi_id }: { id: string; kpi_id: string }) => {
      const { error } = await supabase.from("kpi_progress_log" as any).delete().eq("id", id);
      if (error) throw error;
      return kpi_id;
    },
    onSuccess: (kpi_id) => {
      qc.invalidateQueries({ queryKey: ["kpi_progress", kpi_id] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("Запись удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
