import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TaskStatus, TaskPriority } from "@/lib/constants";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  direction_id: string | null;
  quarter: string;
  customer: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string | null;
  assignee: string | null;
  asana_url: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export function useTasks(includeArchived = false) {
  return useQuery({
    queryKey: ["tasks", { includeArchived }],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (!includeArchived) q = q.eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data as Task[];
    },
  });
}

export function useTaskHistory(taskId: string | null) {
  return useQuery({
    queryKey: ["task_history", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_history")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

async function logHistory(taskId: string, eventType: string, description: string) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("task_history").insert({
    task_id: taskId,
    event_type: eventType,
    description,
    actor_id: u.user?.id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Task> & { title: string; quarter: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...input, created_by: u.user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      await logHistory(data.id, "created", `Задача создана`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Задача создана");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, prev }: { id: string; patch: Partial<Task>; prev?: Task }) => {
      const { data, error } = await supabase
        .from("tasks")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (prev) {
        const changes: string[] = [];
        if (patch.status && patch.status !== prev.status) changes.push(`статус: ${prev.status} → ${patch.status}`);
        if (patch.priority && patch.priority !== prev.priority) changes.push(`приоритет: ${prev.priority} → ${patch.priority}`);
        if (patch.deadline !== undefined && patch.deadline !== prev.deadline) changes.push(`дедлайн изменён`);
        if (patch.notes !== undefined && patch.notes !== prev.notes) changes.push(`заметки обновлены`);
        if (changes.length) await logHistory(id, "updated", changes.join("; "));
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_history"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Задача удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });
}