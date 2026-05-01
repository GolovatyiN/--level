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
  /** Legacy free-text assignee. Kept for backwards compatibility. */
  assignee: string | null;
  /** New: FK to auth.users.id. When set, takes priority over `assignee`. */
  assignee_id: string | null;
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

/**
 * Strip optional fields that map to columns added by recent migrations,
 * but only when they have no value. This way the basic create/update
 * flows still work against a Supabase that hasn't yet applied the
 * `user_assignments_and_notifications` migration; setting an actual user
 * is the only path that requires the column to exist.
 */
function stripUnreadyTaskFields<T extends Partial<Task>>(input: T): T {
  const out: any = { ...input };
  if (out.assignee_id == null) delete out.assignee_id;
  return out;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Task> & { title: string; quarter: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = stripUnreadyTaskFields(input);
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...payload, created_by: u.user?.id } as any)
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
      const cleanPatch = stripUnreadyTaskFields(patch);
      const { data, error } = await supabase
        .from("tasks")
        .update(cleanPatch as any)
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
    // Optimistic update — apply the patch to all cached task lists *before*
    // the network round-trip. The Kanban card snaps to the new column the
    // instant the user drops it; if the server rejects, we roll back.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      qc.setQueriesData<Task[] | undefined>({ queryKey: ["tasks"] }, (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx) => {
      // Roll back to the snapshot we took in onMutate.
      ctx?.snapshots.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      toast.error(e.message);
    },
    onSettled: () => {
      // Whether success or failure, refetch to converge with the server.
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_history"] });
    },
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