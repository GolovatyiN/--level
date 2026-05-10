import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  RefreshCcw,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import { usePlans, usePlanStats, type PlanStatus } from "@/hooks/usePlans";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { currentQuarter } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Aggregated quarterly-plans status block for the dashboard. Counts plans
 * grouped by lifecycle bucket and surfaces the two most actionable lists:
 * departments without a plan for the current quarter, and plans currently
 * waiting for approval.
 */
export function PlansSummaryWidget() {
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [] } = usePlans();
  const { data: stats = [] } = usePlanStats();
  const navigate = useNavigate();

  const currentQ = quarters.find((q) => q.label === currentQuarter()) ?? null;

  // Counts per status bucket. "Бэклог" = synthetic count of (department,
  // quarter) pairs that don't have a row yet, scoped to visible quarters.
  const counts = useMemo(() => {
    const byStatus: Partial<Record<PlanStatus, number>> = {};
    plans.forEach((p) => {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    });
    const cells = directions.length * quarters.length;
    const backlog = Math.max(0, cells - plans.length);
    return { ...byStatus, backlog } as Record<PlanStatus | "backlog", number>;
  }, [plans, directions, quarters]);

  const avgProgress = useMemo(() => {
    if (stats.length === 0) return 0;
    const sum = stats.reduce((acc, s) => acc + (s.progress_pct ?? 0), 0);
    return Math.round(sum / stats.length);
  }, [stats]);

  // Departments with no plan for the current quarter — actionable list.
  const missingForCurrent = useMemo(() => {
    if (!currentQ) return [];
    const existing = new Set(
      plans.filter((p) => p.quarter_id === currentQ.id).map((p) => p.direction_id),
    );
    return directions.filter((d) => !existing.has(d.id));
  }, [directions, plans, currentQ]);

  const awaitingReview = useMemo(
    () =>
      plans
        .filter((p) => p.status === "on_review")
        .map((p) => ({
          plan: p,
          dir: directions.find((d) => d.id === p.direction_id),
          q: quarters.find((q) => q.id === p.quarter_id),
        })),
    [plans, directions, quarters],
  );

  const cards = [
    { key: "backlog",            label: "Бэклог",         value: counts.backlog,            icon: CircleDashed, tone: "neutral"  as const },
    { key: "draft",              label: "В процессе",     value: counts.draft ?? 0,         icon: CircleDot,    tone: "info"     as const },
    { key: "on_review",          label: "На согласовании",value: counts.on_review ?? 0,     icon: Send,         tone: "warning"  as const },
    { key: "changes_requested",  label: "Нужны правки",   value: counts.changes_requested ?? 0, icon: RefreshCcw, tone: "destructive" as const },
    { key: "approved",           label: "Готов",          value: counts.approved ?? 0,      icon: ShieldCheck,  tone: "success"  as const },
    { key: "completed",          label: "Завершён",       value: counts.completed ?? 0,     icon: CheckCircle2, tone: "success"  as const },
  ];

  const TONE_CLS = {
    neutral:     "text-muted-foreground",
    info:        "text-info",
    warning:     "text-warning",
    success:     "text-success",
    destructive: "text-destructive",
  } as const;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Квартальные планы</h2>
        <button
          type="button"
          onClick={() => navigate("/plans")}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Открыть раздел →
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => navigate("/plans")}
              style={{ animationDelay: `${idx * 30}ms` }}
              className="hover-lift animate-fade-in rounded-xl border border-border bg-card p-3 text-left shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <Icon className={cn("h-3.5 w-3.5", TONE_CLS[c.tone])} />
              </div>
              <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", TONE_CLS[c.tone])}>
                <AnimatedNumber value={c.value} duration={500} />
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => navigate("/plans")}
          className="hover-lift animate-fade-in rounded-xl border border-border bg-card p-3 text-left shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Средний прогресс</span>
            <TrendingUp className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums">
            <AnimatedNumber value={avgProgress} duration={500} />%
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80 transition-[width] duration-700"
              style={{ width: `${avgProgress}%` }}
            />
          </div>
        </button>
      </div>

      {(missingForCurrent.length > 0 || awaitingReview.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {currentQ && missingForCurrent.length > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Без плана на текущий квартал
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {missingForCurrent.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => navigate("/plans")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted-foreground/20"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {awaitingReview.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <p className="mb-2 text-xs font-medium text-warning">
                Ожидают согласования ({awaitingReview.length})
              </p>
              <ul className="space-y-1.5">
                {awaitingReview.slice(0, 6).map(({ plan, dir, q }) => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/plans/${plan.id}`)}
                      className="flex w-full items-center gap-2 rounded text-left text-xs transition-colors hover:text-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dir?.color ?? "#888" }} />
                      <span className="font-medium">{dir?.name ?? "—"}</span>
                      <span className="text-muted-foreground">— {q?.label ?? "—"}</span>
                    </button>
                  </li>
                ))}
                {awaitingReview.length > 6 && (
                  <li className="text-[10px] text-muted-foreground">+{awaitingReview.length - 6}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
