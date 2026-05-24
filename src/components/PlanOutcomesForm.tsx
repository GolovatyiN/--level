import { useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PLAN_OUTCOME_FIELDS,
  type DepartmentPlan,
  type PlanOutcomeField,
  useUpdatePlanOutcomes,
} from "@/hooks/usePlans";

/**
 * «Итоги» квартального плана — структурированный пост-мортем по 8 полям.
 *
 * Используется на /plans/:id и на /departments/:id (в режиме конкретного
 * квартала). Сохраняется в `department_plans.outcome_*`.
 */
export function PlanOutcomesForm({
  plan,
  canEdit,
}: {
  plan: DepartmentPlan;
  canEdit: boolean;
}) {
  const update = useUpdatePlanOutcomes();
  const [form, setForm] = useState<Record<PlanOutcomeField, string>>(() => {
    const acc = {} as Record<PlanOutcomeField, string>;
    PLAN_OUTCOME_FIELDS.forEach((f) => {
      acc[f.key] = (plan as any)[f.key] ?? "";
    });
    return acc;
  });
  const [savedSnapshot, setSavedSnapshot] = useState(form);

  const dirty = PLAN_OUTCOME_FIELDS.some((f) => form[f.key] !== savedSnapshot[f.key]);

  const save = async () => {
    const patch: Partial<Record<PlanOutcomeField, string | null>> = {};
    PLAN_OUTCOME_FIELDS.forEach((f) => {
      if (form[f.key] !== savedSnapshot[f.key]) {
        patch[f.key] = form[f.key].trim() || null;
      }
    });
    if (Object.keys(patch).length === 0) return;
    await update.mutateAsync({ plan_id: plan.id, patch });
    setSavedSnapshot({ ...form });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {PLAN_OUTCOME_FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5 rounded-lg border border-border bg-card p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </Label>
            <Textarea
              rows={4}
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              disabled={!canEdit}
              placeholder={canEdit ? "Заполните по итогам квартала..." : "—"}
            />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
          <span className="mr-auto text-xs text-muted-foreground">
            {dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
          </span>
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trophy className="mr-1 h-3.5 w-3.5" />
            )}
            Сохранить итоги
          </Button>
        </div>
      )}
    </div>
  );
}
