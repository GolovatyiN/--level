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
  created_at: string;
  updated_at: string;
};

export function useDirections() {
  return useQuery({
    queryKey: ["directions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("directions").select("*").order("name");
      if (error) throw error;
      return data as Direction[];
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