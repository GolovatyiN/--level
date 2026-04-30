import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useTasks } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { QUARTERS, currentQuarter } from "@/lib/constants";
import { useQuarters } from "@/hooks/useTaxonomies";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { EmptyState, PageLoader } from "@/components/UiState";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import type { Task } from "@/hooks/useTasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, ListTodo, Plus, Zap } from "lucide-react";
import { isPast, parseISO } from "date-fns";

type StatusFilter = "all" | "active" | "in_progress" | "at_risk" | "blocked" | "completed" | "overdue";

export default function Dashboard() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: directions = [] } = useDirections();
  const { data: dynamicQuarters = [] } = useQuarters();
  const quarterList = useMemo(() => {
    const set = new Set<string>(QUARTERS);
    dynamicQuarters.forEach((q) => set.add(q.label));
    return Array.from(set).sort();
  }, [dynamicQuarters]);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const [quarter, setQuarter] = useState<string>("all");
  const [direction, setDirection] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // "Base" = quarter + direction filters only. Status counts are computed
  // off this so toggling a status card doesn't change the totals — clicking
  // "Блокеры" should narrow the task list below, but "Всего" must keep
  // showing the real total under the current quarter/direction.
  const baseFiltered = useMemo(() => {
    return tasks.filter((t) => {
      if (quarter !== "all" && t.quarter !== quarter) return false;
      if (direction !== "all" && t.direction_id !== direction) return false;
      return true;
    });
  }, [tasks, quarter, direction]);

  const filtered = useMemo(() => {
    return baseFiltered.filter((t) => {
      if (statusFilter === "active" && t.status === "completed") return false;
      if (statusFilter === "overdue" && !(t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed")) return false;
      if (["in_progress", "at_risk", "blocked", "completed"].includes(statusFilter) && t.status !== statusFilter) return false;
      return true;
    });
  }, [baseFiltered, statusFilter]);

  const total = baseFiltered.length;
  const inProgress = baseFiltered.filter((t) => t.status === "in_progress").length;
  const atRisk = baseFiltered.filter((t) => t.status === "at_risk").length;
  const blocked = baseFiltered.filter((t) => t.status === "blocked").length;
  const completed = baseFiltered.filter((t) => t.status === "completed").length;
  const overdue = baseFiltered.filter((t) => t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed").length;

  const stats = [
    { label: "Всего", value: total, icon: ListTodo, key: "all" as StatusFilter, color: "text-foreground" },
    { label: "В работе", value: inProgress, icon: Zap, key: "in_progress" as StatusFilter, color: "text-info" },
    { label: "Под риском", value: atRisk, icon: AlertTriangle, key: "at_risk" as StatusFilter, color: "text-warning" },
    { label: "Блокеры", value: blocked, icon: Clock, key: "blocked" as StatusFilter, color: "text-destructive" },
    { label: "Завершено", value: completed, icon: CheckCircle2, key: "completed" as StatusFilter, color: "text-success" },
    { label: "Просрочено", value: overdue, icon: AlertTriangle, key: "overdue" as StatusFilter, color: "text-destructive" },
  ];

  return (
    <>
      <PageHeader
        title="Дашборд"
        description="Общая картина по задачам компании"
        actions={
          <>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все кварталы</SelectItem>
                <SelectItem value={currentQuarter()}>Текущий ({currentQuarter()})</SelectItem>
                {quarterList.filter((q) => q !== currentQuarter()).map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="h-8 w-[170px] text-sm"><SelectValue placeholder="Отдел" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все отделы</SelectItem>
                {directions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {(quarter !== "all" || direction !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setQuarter("all"); setDirection("all"); setStatusFilter("all"); }}>
                Сброс
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-8 p-4 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {stats.map((s, idx) => {
            const active = statusFilter === s.key;
            return (
              <button
                key={s.label}
                onClick={() => setStatusFilter(active ? "all" : s.key)}
                style={{ animationDelay: `${idx * 40}ms` }}
                className={`group hover-lift animate-fade-in text-left rounded-xl border bg-card p-4 shadow-card hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-foreground/60 ring-1 ring-foreground/40" : "border-border"}`}
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
            );
          })}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">По отделам</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {directions.map((d) => {
              // Use baseFiltered (not status-filtered) so per-direction totals
              // stay stable when toggling a status card above.
              const t = baseFiltered.filter((x) => x.direction_id === d.id);
              const done = t.filter((x) => x.status === "completed").length;
              const pct = t.length ? Math.round((done / t.length) * 100) : 0;
              return (
                <div key={d.id} className="hover-lift group rounded-xl border border-border bg-card p-4 shadow-card">
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
                    <AnimatedNumber value={done} duration={400} /> из <AnimatedNumber value={t.length} duration={400} /> завершено
                  </p>
                </div>
              );
            })}
            {directions.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет отделов.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Задачи {filtered.length > 12 ? `(первые 12 из ${filtered.length})` : `(${filtered.length})`}
          </h2>
          {isLoading && tasks.length === 0 ? (
            <PageLoader />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ListTodo className="h-5 w-5" />}
              title={tasks.length === 0 ? "Пока нет задач" : "Нет задач под выбранный фильтр"}
              description={tasks.length === 0 ? "Создайте первую задачу — она появится здесь и в других разделах." : "Сбросьте фильтры или измените их."}
              action={
                tasks.length === 0 ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Новая задача
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => { setQuarter("all"); setDirection("all"); setStatusFilter("all"); }}>
                    Сбросить фильтры
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.slice(0, 12).map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  direction={directions.find((d) => d.id === t.direction_id)}
                  onClick={() => setEditing(t)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
      <TaskDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
