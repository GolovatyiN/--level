import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Kpi = {
  id: string;
  name: string;
  description: string | null;
  direction_id: string | null;
  quarter: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  owner: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
};

export function useKpis() {
  return useQuery({
    queryKey: ["kpis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kpis").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Kpi[];
    },
  });
}

export function useUpsertKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Kpi> & { name: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = { ...input };
      if (!input.id) payload.created_by = u.user?.id;
      const { data, error } = await supabase.from("kpis").upsert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("KPI сохранён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kpis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success("KPI удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });
}