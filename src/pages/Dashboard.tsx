import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useTasks } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { QUARTERS, currentQuarter } from "@/lib/constants";
import { useQuarters } from "@/hooks/useTaxonomies";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import type { Task } from "@/hooks/useTasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, ListTodo, Zap } from "lucide-react";
import { isPast, parseISO } from "date-fns";

type StatusFilter = "all" | "active" | "in_progress" | "at_risk" | "blocked" | "completed" | "overdue";

export default function Dashboard() {
  const { data: tasks = [] } = useTasks();
  const { data: directions = [] } = useDirections();
  const { data: dynamicQuarters = [] } = useQuarters();
  const quarterList = useMemo(() => {
    const set = new Set<string>(QUARTERS);
    dynamicQuarters.forEach((q) => set.add(q.label));
    return Array.from(set).sort();
  }, [dynamicQuarters]);
  const [editing, setEditing] = useState<Task | null>(null);

  const [quarter, setQuarter] = useState<string>("all");
  const [direction, setDirection] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (quarter !== "all" && t.quarter !== quarter) return false;
      if (direction !== "all" && t.direction_id !== direction) return false;
      if (statusFilter === "active" && t.status === "completed") return false;
      if (statusFilter === "overdue" && !(t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed")) return false;
      if (["in_progress", "at_risk", "blocked", "completed"].includes(statusFilter) && t.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, quarter, direction, statusFilter]);

  const total = filtered.length;
  const inProgress = filtered.filter((t) => t.status === "in_progress").length;
  const atRisk = filtered.filter((t) => t.status === "at_risk").length;
  const blocked = filtered.filter((t) => t.status === "blocked").length;
  const completed = filtered.filter((t) => t.status === "completed").length;
  const overdue = filtered.filter((t) => t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed").length;

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
                {quarterList.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
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
      <div className="space-y-8 p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {stats.map((s) => {
            const active = statusFilter === s.key;
            return (
              <button
                key={s.label}
                onClick={() => setStatusFilter(active ? "all" : s.key)}
                className={`text-left rounded-xl border bg-card p-4 shadow-card transition hover:border-foreground/40 ${active ? "border-foreground/60 ring-1 ring-foreground/40" : "border-border"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div className={`mt-2 text-3xl font-semibold ${s.color}`}>{s.value}</div>
              </button>
            );
          })}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">По отделам</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {directions.map((d) => {
              const t = filtered.filter((x) => x.direction_id === d.id);
              const done = t.filter((x) => x.status === "completed").length;
              const pct = t.length ? Math.round((done / t.length) * 100) : 0;
              return (
                <div key={d.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="font-medium">{d.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t.length} задач</span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{done} из {t.length} завершено</p>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.slice(0, 12).map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                direction={directions.find((d) => d.id === t.direction_id)}
                onClick={() => setEditing(t)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет задач под выбранный фильтр.</p>
            )}
          </div>
        </div>
      </div>
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}
