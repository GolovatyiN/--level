import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isOverdue } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  ListTodo,
  Zap,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { PlansSummaryWidget } from "@/components/PlansSummaryWidget";
import { PrioritiesSummaryWidget } from "@/components/PrioritiesSummaryWidget";
import { DashboardCharts } from "@/components/DashboardCharts";
import { RiskZonesWidget } from "@/components/RiskZonesWidget";
import { DepartmentTasksDialog } from "@/components/DepartmentTasksDialog";
import { useTasks } from "@/hooks/useTasks";
import { useDirections, type Direction } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import { QUARTERS, compareQuarters, currentQuarter, quarterLabelRu } from "@/lib/constants";

type StatusKey = "all" | "in_progress" | "at_risk" | "blocked" | "completed" | "overdue";

/**
 * Главная — аналитическая панель, не таск-менеджер. Сами задачи живут в
 * /tasks и в модалке отдела (см. DepartmentTasksDialog).
 *
 * Композиция:
 *  1. Шесть сверху — статусы задач (включая «Просрочено»). Клик =
 *     deep-link в /tasks с применённым фильтром.
 *  2. Виджет приоритетов с дельтой за неделю
 *  3. Виджет квартальных планов
 *  4. По отделам — компактные карточки (клик → модалка)
 *  5. Аналитика — 4 графика
 *  6. Зоны внимания — самое срочное
 */
export default function Dashboard() {
  const { data: tasks = [] } = useTasks();
  const { data: directions = [] } = useDirections();
  const { data: dynamicQuarters = [] } = useQuarters();
  const navigate = useNavigate();

  const quarterList = useMemo(() => {
    const set = new Set<string>(QUARTERS);
    dynamicQuarters.forEach((q) => set.add(q.label));
    // Сортируем хронологически: Q1 2026 → Q2 2026 → Q3 2026 → Q4 2026 →
    // Q1 2027 → ..., а не лексикографически (Q1 2026 → Q1 2027 → Q2 2026).
    return Array.from(set).sort(compareQuarters);
  }, [dynamicQuarters]);

  // Дашборд по умолчанию показывает текущий активный квартал, чтобы
  // данные разных периодов не смешивались.
  const [quarter, setQuarter] = useState<string>(currentQuarter());
  const [direction, setDirection] = useState<string>("all");
  const [departmentDialog, setDepartmentDialog] = useState<Direction | null>(null);

  // baseFiltered respects quarter+direction.
  const baseFiltered = useMemo(() => {
    return tasks.filter((t) => {
      if (t.archived) return false;
      if (quarter !== "all" && t.quarter !== quarter) return false;
      if (direction !== "all" && t.direction_id !== direction) return false;
      return true;
    });
  }, [tasks, quarter, direction]);

  /**
   * Клик по статусной карточке — переход в /tasks с пред-применённым
   * фильтром по статусу + текущими квартал/отдел из шапки дашборда.
   */
  const goToTasks = (key: StatusKey) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("status", key);
    if (quarter !== "all") params.set("quarter", quarter);
    if (direction !== "all") params.set("direction", direction);
    navigate(`/tasks${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const total = baseFiltered.length;
  const inProgress = baseFiltered.filter((t) => t.status === "in_progress").length;
  const atRisk = baseFiltered.filter((t) => t.status === "at_risk").length;
  const blocked = baseFiltered.filter((t) => t.status === "blocked").length;
  const completed = baseFiltered.filter((t) => t.status === "completed").length;
  const overdue = baseFiltered.filter(
    isOverdue,
  ).length;

  const stats = [
    { label: "Всего", value: total, icon: ListTodo, key: "all" as StatusKey, color: "text-foreground" },
    { label: "В работе", value: inProgress, icon: Zap, key: "in_progress" as StatusKey, color: "text-info" },
    { label: "Под риском", value: atRisk, icon: AlertTriangle, key: "at_risk" as StatusKey, color: "text-warning" },
    { label: "Блокеры", value: blocked, icon: Clock, key: "blocked" as StatusKey, color: "text-destructive" },
    { label: "Завершено", value: completed, icon: CheckCircle2, key: "completed" as StatusKey, color: "text-success" },
    { label: "Просрочено", value: overdue, icon: AlertTriangle, key: "overdue" as StatusKey, color: "text-destructive" },
  ];

  return (
    <>
      <PageHeader
        title="Панель управления"
        description="Общая картина по задачам компании"
        actions={
          <>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все кварталы</SelectItem>
                <SelectItem value={currentQuarter()}>Текущий ({quarterLabelRu(currentQuarter())})</SelectItem>
                {quarterList.filter((q) => q !== currentQuarter()).map((q) => (
                  <SelectItem key={q} value={q}>{quarterLabelRu(q)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="h-8 w-[170px] text-sm"><SelectValue placeholder="Отдел" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все отделы</SelectItem>
                {directions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {(quarter !== currentQuarter() || direction !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setQuarter(currentQuarter()); setDirection("all"); }}
              >
                Сброс
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-8 p-4 sm:p-8">
        {/* 1. Six status cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {stats.map((s, idx) => (
            <button
              key={s.label}
              onClick={() => goToTasks(s.key)}
              style={{ animationDelay: `${idx * 40}ms` }}
              className="group hover-lift animate-fade-in text-left rounded-xl border border-border bg-card p-4 shadow-card hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={s.key === "all" ? "Открыть все задачи" : `Открыть задачи: ${s.label.toLowerCase()}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 ${s.color}`} />
              </div>
              <AnimatedNumber
                value={typeof s.value === "number" ? s.value : 0}
                className={`mt-2 block text-3xl font-semibold tabular-nums ${s.color}`}
              />
            </button>
          ))}
        </div>

        {/* 2. Priorities — scoped to the dashboard's quarter+direction. */}
        <PrioritiesSummaryWidget quarter={quarter} direction={direction} />

        {/* 3. Quarterly plans */}
        <PlansSummaryWidget />

        {/* 4. По отделам — каждая карточка кликабельна и открывает модалку */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">По отделам</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {directions.map((d) => {
              const t = baseFiltered.filter((x) => x.direction_id === d.id);
              const done = t.filter((x) => x.status === "completed").length;
              const pct = t.length ? Math.round((done / t.length) * 100) : 0;
              const dirOverdue = t.filter(
                isOverdue,
              ).length;
              const open = t.filter((x) => x.status !== "completed");
              const critical = open.filter((x) => x.priority === "critical").length;
              const high     = open.filter((x) => x.priority === "high").length;
              const medium   = open.filter((x) => x.priority === "medium").length;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDepartmentDialog(d)}
                  className="hover-lift group rounded-xl border border-border bg-card p-4 text-left shadow-card transition-all hover:border-foreground/30"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full transition-transform duration-300 group-hover:scale-125"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="font-medium">{d.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      <AnimatedNumber value={t.length} duration={400} /> задач
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/80 transition-[width] duration-700 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <AnimatedNumber value={done} duration={400} /> из{" "}
                    <AnimatedNumber value={t.length} duration={400} /> завершено
                  </p>
                  {(dirOverdue > 0 || critical > 0 || high > 0 || medium > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      {dirOverdue > 0 && (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                          Просрочено: {dirOverdue}
                        </span>
                      )}
                      {critical > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                          <Flame className="h-2.5 w-2.5" /> {critical}
                        </span>
                      )}
                      {high > 0 && (
                        <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                          Высокие: {high}
                        </span>
                      )}
                      {medium > 0 && (
                        <span className="rounded bg-info/10 px-1.5 py-0.5 font-medium text-info">
                          Средние: {medium}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
            {directions.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет отделов.</p>
            )}
          </div>
        </div>

        {/* 5. Аналитика — 4 графика. */}
        <DashboardCharts quarter={quarter} direction={direction} />

        {/* 6. Зоны внимания. */}
        <RiskZonesWidget />
      </div>

      {/* Modal with the selected department's tasks. */}
      <DepartmentTasksDialog
        open={!!departmentDialog}
        onOpenChange={(v) => !v && setDepartmentDialog(null)}
        direction={departmentDialog}
      />
    </>
  );
}
