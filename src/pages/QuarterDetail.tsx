import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  ListTodo,
  Loader2,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/UiState";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { TaskDialog } from "@/components/TaskDialog";
import { useDirections, type Direction } from "@/hooks/useDirections";
import { useAllQuarters } from "@/hooks/useTaxonomies";
import { useTasks } from "@/hooks/useTasks";
import { useUserMap } from "@/hooks/useUsers";
import {
  type DepartmentPlan,
  useCreatePlan,
  usePlans,
  usePlanStats,
} from "@/hooks/usePlans";
import { quarterLabelRu } from "@/lib/constants";
import { cn, isOverdue } from "@/lib/utils";

/**
 * "Рабочий" экран одного квартала. Показывает все отделы и их планы +
 * задачи строго в этом квартале. Из карточки отдела можно прыгнуть в
 * детальный план (`/plans/:id`); если плана ещё нет — в той же карточке
 * есть кнопка «Создать план».
 */
export default function QuarterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: quarters = [], isLoading: qLoading } = useAllQuarters();
  const { data: directions = [] } = useDirections();
  const { data: plans = [] } = usePlans();
  const { data: stats = [] } = usePlanStats();
  const { data: tasks = [] } = useTasks(true);
  const { map: userMap } = useUserMap();
  const create = useCreatePlan();

  const quarter = quarters.find((q) => q.id === id);

  const [creatingFor, setCreatingFor] = useState<Direction | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // Tasks scoped to this quarter — used for company-wide aggregates and for
  // per-department breakdown.
  const quarterTasks = useMemo(
    () => (quarter ? tasks.filter((t) => !t.archived && t.quarter === quarter.label) : []),
    [tasks, quarter],
  );

  const planByDir = useMemo(() => {
    const m = new Map<string, DepartmentPlan>();
    plans.forEach((p) => {
      if (p.quarter_id === id) m.set(p.direction_id, p);
    });
    return m;
  }, [plans, id]);

  const statsByPlan = useMemo(() => new Map(stats.map((s) => [s.plan_id, s])), [stats]);

  // Aggregate row across the whole company × this quarter.
  const totals = useMemo(() => {
    const total = quarterTasks.length;
    const done = quarterTasks.filter((t) => t.status === "completed").length;
    const overdue = quarterTasks.filter(
      isOverdue,
    ).length;
    const critical = quarterTasks.filter(
      (t) => t.priority === "critical" && t.status !== "completed",
    ).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, overdue, critical, pct };
  }, [quarterTasks]);

  if (qLoading) return <PageLoader />;
  if (!quarter) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Квартал не найден.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/management?tab=quarters")}>
          ← К управлению кварталами
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
        <div className="flex flex-wrap items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-muted-foreground"
            onClick={() => navigate("/plans")}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> К списку
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {quarterLabelRu(quarter.label)}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              {quarter.start_date && quarter.end_date && (
                <>
                  {format(parseISO(quarter.start_date), "dd.MM.yyyy")} —{" "}
                  {format(parseISO(quarter.end_date), "dd.MM.yyyy")}
                </>
              )}
            </p>
          </div>
          <Button size="sm" onClick={() => setCreatingTask(true)}>
            <Plus className="mr-1 h-4 w-4" /> Новая задача
          </Button>
        </div>

        {/* Aggregate strip. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Всего задач"   value={totals.total}    icon={ListTodo} />
          <Stat label="Прогресс"      value={`${totals.pct}%`} icon={CheckCircle2} bar={totals.pct} />
          <Stat label="Завершено"     value={totals.done}     icon={CheckCircle2} tone="success" />
          <Stat label="Просрочено"    value={totals.overdue}  icon={AlertTriangle} tone="destructive" />
          <Stat label="Критических"   value={totals.critical} icon={Flame}        tone="destructive" />
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-8">
        <h2 className="text-sm font-semibold text-muted-foreground">Отделы</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {directions.map((d) => {
            const plan = planByDir.get(d.id);
            const planStats = plan ? statsByPlan.get(plan.id) : null;
            const head = d.head_user_id ? userMap.get(d.head_user_id) : null;
            const dirTasks = quarterTasks.filter((t) => t.direction_id === d.id);
            const completed = dirTasks.filter((t) => t.status === "completed").length;
            const overdue = dirTasks.filter(
              isOverdue,
            ).length;
            const critical = dirTasks.filter(
              (t) => t.priority === "critical" && t.status !== "completed",
            ).length;
            const pct = planStats?.progress_pct ?? (
              dirTasks.length === 0 ? 0 : Math.round((completed / dirTasks.length) * 100)
            );

            return (
              <div
                key={d.id}
                className="hover-lift group rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{d.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {head ?? "— руководитель не назначен —"}
                      </div>
                    </div>
                  </div>
                  {plan ? (
                    <PlanStatusBadge status={plan.status} compact />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Нет плана
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums">{pct}%</span>
                  <span className="text-[11px] text-muted-foreground">
                    <AnimatedNumber value={completed} duration={300} />/<AnimatedNumber value={dirTasks.length} duration={300} /> задач
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700 ease-out",
                      plan?.status === "approved" || plan?.status === "completed"
                        ? "bg-success"
                        : plan?.status === "changes_requested" || plan?.status === "blocked"
                        ? "bg-destructive"
                        : plan?.status === "on_review" || plan?.status === "at_risk"
                        ? "bg-warning"
                        : "bg-foreground/80",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {(overdue > 0 || critical > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    {overdue > 0 && (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                        Просрочено: {overdue}
                      </span>
                    )}
                    {critical > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                        <Flame className="h-2.5 w-2.5" /> {critical}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  {plan ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => navigate(`/plans/${plan.id}`)}
                    >
                      <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Открыть план
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={create.isPending}
                      onClick={async () => {
                        setCreatingFor(d);
                        const plan = await create
                          .mutateAsync({ direction_id: d.id, quarter_id: quarter.id })
                          .catch(() => null);
                        setCreatingFor(null);
                        if (plan) navigate(`/plans/${plan.id}`);
                      }}
                    >
                      {create.isPending && creatingFor?.id === d.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-3.5 w-3.5" />
                      )}
                      Создать план
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/tasks?direction=${d.id}&quarter=${encodeURIComponent(quarter.label)}`)}
                  >
                    Задачи
                  </Button>
                </div>
              </div>
            );
          })}

          {directions.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              Нет ни одного отдела. Создайте отдел в разделе «Управление → Отделы».
            </p>
          )}
        </div>
      </div>

      {/* Создание задачи внутри текущего квартала — отдел остаётся пустым,
          пользователь выбирает в форме, но квартал уже подставлен. */}
      <TaskDialog
        open={creatingTask}
        onOpenChange={setCreatingTask}
        defaults={{ quarter: quarter.label } as any}
      />
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  bar,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  bar?: number;
  tone?: "success" | "info" | "warning" | "destructive";
}) {
  const cls =
    tone === "success" ? "text-success" :
    tone === "info"    ? "text-info" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", cls)} />
      </div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", cls)}>
        {typeof value === "number" ? <AnimatedNumber value={value} duration={400} /> : value}
      </div>
      {typeof bar === "number" && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground/80" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

