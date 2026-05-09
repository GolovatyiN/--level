import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/UiState";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import {
  useCreatePlan,
  usePlans,
  usePlanStats,
  type DepartmentPlan,
  type DepartmentPlanStats,
} from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";
import { quarterLabelRu } from "@/lib/constants";

/**
 * Quarterly plans matrix — one row per department, one column per visible
 * quarter. Empty cells expose a "Создать" button; populated cells show
 * status pill + progress bar + counts and link to /plans/:id.
 */
export default function Plans() {
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [], isLoading } = usePlans();
  const { data: stats = [] } = usePlanStats();
  const { map: userMap } = useUserMap();
  const create = useCreatePlan();
  const navigate = useNavigate();

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

  const [creatingFor, setCreatingFor] = useState<{ direction_id: string; quarter_id: string } | null>(null);
  const target = creatingFor
    ? {
        dirName: directions.find((d) => d.id === creatingFor.direction_id)?.name ?? "—",
        qLabel: quarterLabelRu(quarters.find((q) => q.id === creatingFor.quarter_id)?.label ?? "—"),
      }
    : null;

  const sortedQuarters = useMemo(
    () => [...quarters].sort((a, b) => (a.sort_key ?? a.label).localeCompare(b.sort_key ?? b.label)),
    [quarters],
  );

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
                    <th key={q.id} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                      {quarterLabelRu(q.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {directions.map((d) => {
                  const head = d.head_user_id ? userMap.get(d.head_user_id) : null;
                  return (
                    <tr key={d.id} className="border-b border-border/50 last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="font-medium">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {head ?? "— не назначен —"}
                      </td>
                      {sortedQuarters.map((q) => {
                        const plan = planByCell.get(`${d.id}::${q.id}`);
                        if (!plan) {
                          return (
                            <td key={q.id} className="px-3 py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setCreatingFor({ direction_id: d.id, quarter_id: q.id })}
                              >
                                <Plus className="h-3 w-3" /> Создать
                              </Button>
                            </td>
                          );
                        }
                        const s = statsByPlan.get(plan.id);
                        return (
                          <td key={q.id} className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/plans/${plan.id}`)}
                              className="group block w-full min-w-[160px] rounded-md border border-border bg-background px-2.5 py-2 text-left transition hover:border-foreground/30 hover:shadow-sm"
                            >
                              <div className="mb-1.5 flex items-center justify-between gap-1">
                                <PlanStatusBadge status={plan.status} compact />
                                <span className="text-[10px] tabular-nums text-muted-foreground">
                                  {s?.completed_tasks ?? 0}/{s?.total_tasks ?? 0}
                                </span>
                              </div>
                              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-foreground/80 transition-[width] duration-500"
                                  style={{ width: `${s?.progress_pct ?? 0}%` }}
                                />
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                {s?.overdue_tasks ? (
                                  <span className="text-destructive">{s.overdue_tasks} просроч.</span>
                                ) : null}
                                {s?.blocked_tasks ? (
                                  <span className="text-destructive">{s.blocked_tasks} блок.</span>
                                ) : null}
                                {s?.at_risk_tasks ? (
                                  <span className="text-warning">{s.at_risk_tasks} риск</span>
                                ) : null}
                              </div>
                            </button>
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

      <AlertDialog open={!!creatingFor} onOpenChange={(v) => !v && setCreatingFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать план</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.dirName} · {target?.qLabel}. План создастся в статусе «Черновик».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={create.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={create.isPending}
              onClick={async () => {
                if (!creatingFor) return;
                const plan = await create
                  .mutateAsync({ direction_id: creatingFor.direction_id, quarter_id: creatingFor.quarter_id })
                  .catch(() => null);
                setCreatingFor(null);
                if (plan) navigate(`/plans/${plan.id}`);
              }}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
