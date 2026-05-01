import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type NotificationType =
  | "task_assigned"
  | "kpi_assigned"
  | "kpi_mention"
  | "kpi_progress"
  | "kpi_comment";

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Just the react-query side. Safe to call from many components — they all
 * share the same cache key. Does NOT subscribe to realtime; that's done
 * exactly once via {@link useNotificationsRealtime} mounted at the app
 * root, otherwise multiple consumers race each other on the same channel
 * name and Supabase rejects "cannot add postgres_changes callbacks ... after
 * subscribe()".
 */
export function useNotifications(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        // Table missing (migration not yet applied) — fail soft so the bell
        // and the rest of the UI keep working.
        if ((error as any).code === "42P01" || /not found|relation/i.test(error.message)) {
          return [];
        }
        throw error;
      }
      return (data ?? []) as unknown as Notification[];
    },
  });
}

/**
 * Mount once at the app root. Subscribes to INSERTs on the user's
 * notifications, surfaces a toast for each, and invalidates the cache so
 * any open bell repaints. Idempotent on re-renders thanks to the channel
 * cleanup.
 */
export function useNotificationsRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (cancelled) return;
          const n = payload.new as Notification;
          toast(n.title, { description: n.body ?? undefined });
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, qc]);
}

export function useUnreadCount() {
  const q = useNotifications();
  const data = q.data ?? [];
  return data.filter((n) => !n.read_at).length;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ read_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notifications" as any)
        .update({ read_at: new Date().toISOString() } as any)
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useClearAllNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notifications" as any)
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      toast.success("Уведомления очищены");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
