import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleDashed, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/UiState";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import {
  BACKLOG_LABEL,
  PLAN_STATUS_LABELS,
  type DepartmentPlan,
  type DepartmentPlanStats,
  useCreatePlan,
  usePlans,
  usePlanStats,
} from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";
import { quarterLabelRu } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Quarterly plans matrix. Each (department × quarter) cell is either a
 * full status card (PlanCell) or a Backlog placeholder with a "Создать"
 * button that opens a richer creation form (description, expected
 * outcomes, kickoff comment).
 */
export default function Plans() {
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [], isLoading } = usePlans();
  const { data: stats = [] } = usePlanStats();
  const { map: userMap } = useUserMap();

  const planByCell = useMemo(() => {
    const m = new Map<string, DepartmentPlan>();
    plans.forEach((p) => m.set(`${p.direction_id}::${p.quarter_id}`, p));
    return m;
  }, [plans]);

  const statsByPlan = useMemo(() => {
    const m = new Map<string, DepartmentPlanStats>();
    stats.forEach((s) => m.set(s.plan_id, s));
    return m;
  }, [stats]);

  const sortedQuarters = useMemo(
    () => [...quarters].sort((a, b) => (a.sort_key ?? a.label).localeCompare(b.sort_key ?? b.label)),
    [quarters],
  );

  const [creatingFor, setCreatingFor] = useState<{ direction_id: string; quarter_id: string } | null>(null);

  return (
    <>
      <PageHeader
        title="Квартальные планы"
        description="Планы отделов на каждый квартал — статус, прогресс, согласование"
      />
      <div className="p-4 sm:p-8">
        {isLoading && plans.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : directions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Сначала создайте хотя бы один отдел и один квартал.
            </p>
          </div>
        ) : sortedQuarters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              В системе нет видимых кварталов. Создайте их в разделе «Управление → Кварталы».
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/30 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Отдел
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Руководитель
                  </th>
                  {sortedQuarters.map((q) => (
                    <th
                      key={q.id}
                      className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
                      style={{ minWidth: 200 }}
                    >
                      {quarterLabelRu(q.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {directions.map((d) => {
                  const head = d.head_user_id ? userMap.get(d.head_user_id) : null;
                  return (
                    <tr key={d.id} className="border-b border-border/50 last:border-0 align-top">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="font-medium">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">
                        {head ?? "— не назначен —"}
                      </td>
                      {sortedQuarters.map((q) => {
                        const plan = planByCell.get(`${d.id}::${q.id}`);
                        return (
                          <td key={q.id} className="px-3 py-3">
                            {plan ? (
                              <PlanCell plan={plan} stats={statsByPlan.get(plan.id)} />
                            ) : (
                              <BacklogCell
                                onCreate={() => setCreatingFor({ direction_id: d.id, quarter_id: q.id })}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creatingFor && (
        <CreatePlanDialog
          open
          onClose={() => setCreatingFor(null)}
          directionId={creatingFor.direction_id}
          quarterId={creatingFor.quarter_id}
          directionName={directions.find((d) => d.id === creatingFor.direction_id)?.name ?? "—"}
          quarterLabel={quarterLabelRu(quarters.find((q) => q.id === creatingFor.quarter_id)?.label ?? "—")}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function PlanCell({ plan, stats }: { plan: DepartmentPlan; stats?: DepartmentPlanStats }) {
  const navigate = useNavigate();
  const pct = stats?.progress_pct ?? 0;
  const total = stats?.total_tasks ?? 0;
  const done = stats?.completed_tasks ?? 0;

  // Tone-driven progress bar fill — reuses the same colour palette the
  // status pill uses, so the row tells one consistent story at a glance.
  const fillCls =
    plan.status === "approved" || plan.status === "completed"
      ? "bg-success"
      : plan.status === "changes_requested" || plan.status === "blocked"
      ? "bg-destructive"
      : plan.status === "on_review" || plan.status === "at_risk"
      ? "bg-warning"
      : "bg-info";

  return (
    <button
      type="button"
      onClick={() => navigate(`/plans/${plan.id}`)}
      className="group block w-full rounded-lg border border-border bg-background p-2.5 text-left transition-all hover:-translate-y-px hover:border-foreground/30 hover:shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <PlanStatusBadge status={plan.status} />
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{pct}%</span>
        <span className="text-[10px] text-muted-foreground">выполнено</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fillCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(stats?.overdue_tasks || stats?.blocked_tasks || stats?.at_risk_tasks) ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          {stats.overdue_tasks ? (
            <span className="text-destructive">{stats.overdue_tasks} просроч.</span>
          ) : null}
          {stats.blocked_tasks ? (
            <span className="text-destructive">{stats.blocked_tasks} блок.</span>
          ) : null}
          {stats.at_risk_tasks ? (
            <span className="text-warning">{stats.at_risk_tasks} риск</span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function BacklogCell({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group flex w-full flex-col items-start gap-1.5 rounded-lg border border-dashed border-border bg-background/40 p-2.5 text-left transition-all hover:border-foreground/40 hover:bg-background"
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <CircleDashed className="h-3 w-3" /> {BACKLOG_LABEL}
      </span>
      <span className="text-[11px] text-muted-foreground/80">План ещё не создан</span>
      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground transition-opacity opacity-70 group-hover:opacity-100">
        <Plus className="h-3 w-3" /> Создать
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreatePlanDialog({
  open,
  onClose,
  directionId,
  quarterId,
  directionName,
  quarterLabel,
}: {
  open: boolean;
  onClose: () => void;
  directionId: string;
  quarterId: string;
  directionName: string;
  quarterLabel: string;
}) {
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [description, setDescription] = useState("");

  const submit = async () => {
    const plan = await create
      .mutateAsync({
        direction_id: directionId,
        quarter_id: quarterId,
        description: description.trim() || null,
      })
      .catch(() => null);
    onClose();
    if (plan) navigate(`/plans/${plan.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый план — {directionName}, {quarterLabel}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="plan-direction">Отдел</Label>
            <Input id="plan-direction" value={directionName} readOnly disabled />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plan-quarter">Квартал</Label>
            <Input id="plan-quarter" value={quarterLabel} readOnly disabled />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plan-description">Описание / цели на квартал</Label>
            <Textarea
              id="plan-description"
              rows={5}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Какие задачи, инициативы или KPI будут в этом плане. Можно дополнить позже."
            />
            <p className="text-xs text-muted-foreground">
              План создаётся в статусе «{PLAN_STATUS_LABELS.draft}». Задачи, комментарии и
              согласование добавляются на детальной странице.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
