import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanStatus =
  | "draft"
  | "on_review"
  | "changes_requested"
  | "approved"
  | "in_progress"
  | "at_risk"
  | "blocked"
  | "completed"
  | "archived";

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "В процессе",
  on_review: "На согласовании",
  changes_requested: "Нужны правки",
  approved: "Готов",
  in_progress: "Выполняется",
  at_risk: "Под риском",
  blocked: "Заблокирован",
  completed: "Завершён",
  archived: "Архивный",
};

/** Display order for status pickers and badges. */
export const PLAN_STATUS_ORDER: PlanStatus[] = [
  "draft",
  "on_review",
  "changes_requested",
  "approved",
  "in_progress",
  "at_risk",
  "blocked",
  "completed",
  "archived",
];

/**
 * Tailwind status tones — read by PlanStatusBadge / matrix cells.
 *
 * Spec mapping (Бэклог=neutral, В процессе=info, На согласовании=warning,
 * Нужны правки=destructive, Готов=success, Выполняется=info, Завершён=success).
 * "Бэклог" itself is a synthetic status — when no plan row exists yet.
 */
export const PLAN_STATUS_TONE: Record<PlanStatus, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  draft:             "info",         // В процессе → синий
  on_review:         "warning",      // На согласовании → жёлтый
  changes_requested: "destructive",  // Нужны правки → красный
  approved:          "success",      // Готов → зелёный
  in_progress:       "info",         // Выполняется → синий
  at_risk:           "warning",
  blocked:           "destructive",
  completed:         "success",      // Завершён → зелёный
  archived:          "neutral",
};

/** Synthetic status when no plan row exists for this department × quarter. */
export const BACKLOG_TONE = "neutral" as const;
export const BACKLOG_LABEL = "Бэклог";

export type DepartmentPlan = {
  id: string;
  direction_id: string;
  quarter_id: string;
  status: PlanStatus;
  description: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  /**
   * Восемь полей «Итогов» квартала. Добавлены миграцией
   * 20260512100000_task_remarks_and_revision_status.
   */
  outcome_planned: string | null;
  outcome_done: string | null;
  outcome_not_done: string | null;
  outcome_not_done_reason: string | null;
  outcome_achievements: string | null;
  outcome_problems: string | null;
  outcome_conclusions: string | null;
  outcome_next_quarter: string | null;
  created_at: string;
  updated_at: string;
};

/** Ключи полей «Итогов» — для итерации в UI. */
export const PLAN_OUTCOME_FIELDS = [
  { key: "outcome_planned",         label: "Что было запланировано" },
  { key: "outcome_done",            label: "Что выполнено" },
  { key: "outcome_not_done",        label: "Что не выполнено" },
  { key: "outcome_not_done_reason", label: "Причины невыполнения" },
  { key: "outcome_achievements",    label: "Основные достижения" },
  { key: "outcome_problems",        label: "Проблемы квартала" },
  { key: "outcome_conclusions",     label: "Выводы" },
  { key: "outcome_next_quarter",    label: "План действий на следующий квартал" },
] as const;
export type PlanOutcomeField = (typeof PLAN_OUTCOME_FIELDS)[number]["key"];

export type DepartmentPlanStats = {
  plan_id: string;
  direction_id: string;
  quarter_id: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  at_risk_tasks: number;
  blocked_tasks: number;
  overdue_tasks: number;
  progress_pct: number;
  last_task_update: string | null;
};

export type PlanCommentKind =
  | "comment"
  | "submit"
  | "request_changes"
  | "approve"
  | "status_change"
  | "final_review";

export const COMMENT_KIND_LABELS: Record<PlanCommentKind, string> = {
  comment: "Комментарий",
  submit: "Отправлен на согласование",
  request_changes: "Запрос изменений",
  approve: "Утверждение",
  status_change: "Смена статуса",
  final_review: "Итоги квартала",
};

export type PlanComment = {
  id: string;
  plan_id: string;
  task_id: string | null;
  is_final: boolean;
  author_id: string | null;
  author_name: string | null;
  content: string;
  kind: PlanCommentKind;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePlans() {
  return useQuery({
    queryKey: ["department_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_plans" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return ((data ?? []) as unknown) as DepartmentPlan[];
    },
  });
}

export function usePlan(planId?: string | null) {
  return useQuery({
    queryKey: ["department_plan", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_plans" as any)
        .select("*")
        .eq("id", planId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DepartmentPlan | null;
    },
  });
}

export function usePlanStats() {
  return useQuery({
    queryKey: ["department_plan_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_plan_stats" as any)
        .select("*");
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return ((data ?? []) as unknown) as DepartmentPlanStats[];
    },
  });
}

export function usePlanComments(planId?: string | null) {
  return useQuery({
    queryKey: ["plan_comments", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_plan_comments" as any)
        .select("*")
        .eq("plan_id", planId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as PlanComment[];
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      direction_id: string;
      quarter_id: string;
      description?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("department_plans" as any)
        .insert({
          ...input,
          created_by: u.user?.id ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DepartmentPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["department_plans"] });
      qc.invalidateQueries({ queryKey: ["department_plan_stats"] });
      toast.success("План создан");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/**
 * Single mutation for any status transition. When the new status is
 * `changes_requested` or `final_review`, a comment is required and stored
 * alongside the status flip in `department_plan_comments`.
 */
/**
 * Save the eight «Итоги» fields на плане. Поддерживает частичный
 * patch — обновляются только переданные ключи. На успех инвалидирует
 * запрос конкретного плана + общий список.
 */
export function useUpdatePlanOutcomes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      plan_id,
      patch,
    }: {
      plan_id: string;
      patch: Partial<Record<PlanOutcomeField, string | null>>;
    }) => {
      const { error } = await supabase
        .from("department_plans" as any)
        .update(patch as any)
        .eq("id", plan_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["plan", vars.plan_id] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Итоги сохранены");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить итоги"),
  });
}

export function useUpdatePlanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      plan_id: string;
      status: PlanStatus;
      comment?: string;
      kind?: PlanCommentKind;
      is_final?: boolean;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? null;

      // Optional comment first — author/timestamp will be picked up by the
      // notify trigger, and the row already serves as proof of the transition.
      if (input.comment && input.comment.trim().length > 0) {
        let author_name: string | null = null;
        if (userId) {
          const { data: p } = await supabase
            .from("profiles" as any)
            .select("display_name, email")
            .eq("user_id", userId)
            .maybeSingle();
          author_name = (p as any)?.display_name ?? (p as any)?.email ?? null;
        }
        const { error: cerr } = await supabase
          .from("department_plan_comments" as any)
          .insert({
            plan_id: input.plan_id,
            author_id: userId,
            author_name,
            content: input.comment.trim(),
            kind: input.kind ?? "comment",
            is_final: input.is_final ?? false,
          } as any);
        if (cerr) throw cerr;
      }

      // Status flip — DB trigger will write its own status_change comment +
      // emit notifications.
      const patch: any = { status: input.status };
      if (input.status === "approved") {
        patch.approved_by = userId;
        patch.approved_at = new Date().toISOString();
      }
      if (input.status === "on_review") {
        patch.submitted_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("department_plans" as any)
        .update(patch)
        .eq("id", input.plan_id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["department_plans"] });
      qc.invalidateQueries({ queryKey: ["department_plan", v.plan_id] });
      qc.invalidateQueries({ queryKey: ["plan_comments", v.plan_id] });
      qc.invalidateQueries({ queryKey: ["audit_log"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddPlanComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      plan_id: string;
      content: string;
      kind?: PlanCommentKind;
      task_id?: string | null;
      is_final?: boolean;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? null;
      let author_name: string | null = null;
      if (userId) {
        const { data: p } = await supabase
          .from("profiles" as any)
          .select("display_name, email")
          .eq("user_id", userId)
          .maybeSingle();
        author_name = (p as any)?.display_name ?? (p as any)?.email ?? null;
      }
      const { error } = await supabase.from("department_plan_comments" as any).insert({
        plan_id: input.plan_id,
        task_id: input.task_id ?? null,
        is_final: input.is_final ?? false,
        author_id: userId,
        author_name,
        content: input.content.trim(),
        kind: input.kind ?? "comment",
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["plan_comments", v.plan_id] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Комментарий добавлен");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeletePlanComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; plan_id: string }) => {
      const { error } = await supabase.from("department_plan_comments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["plan_comments", v.plan_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// Plan activity (audit log filtered to a given plan)
// ---------------------------------------------------------------------------

export function usePlanActivity(planId?: string | null) {
  return useQuery({
    queryKey: ["plan_activity", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log" as any)
        .select("*")
        .eq("target_type", "department_plan")
        .eq("target_id", planId!)
        .order("created_at", { ascending: false });
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }
      return ((data ?? []) as any[]) as Array<{
        id: string;
        actor_id: string | null;
        action: string;
        details: Record<string, unknown>;
        created_at: string;
      }>;
    },
  });
}
