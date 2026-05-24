import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Calendar, ExternalLink, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { TaskDialog } from "@/components/TaskDialog";
import type { Direction } from "@/hooks/useDirections";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useUserMap } from "@/hooks/useUsers";
import { quarterLabelRu } from "@/lib/constants";
import { cn, isOverdue } from "@/lib/utils";

type Filter =
  | "all"
  | "critical"
  | "high"
  | "medium"
  | "overdue"
  | "in_progress"
  | "completed"
  // direction-tag filter rendered as `dir:<value>` so we can mix it with
  // the static set above.
  | `dir:${string}`;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: Direction | null;
}

/**
 * Side-panel-style dialog showing every task of a single department with
 * quick-filter chips (priority / status / overdue) and search. Clicking a
 * row opens the existing TaskDialog for editing.
 */
export function DepartmentTasksDialog({ open, onOpenChange, direction }: Props) {
  const { data: allTasks = [] } = useTasks();
  const { map: userMap } = useUserMap();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);

  const tasks = useMemo(
    () => (direction ? allTasks.filter((t) => t.direction_id === direction.id) : []),
    [allTasks, direction],
  );

  // Aggregates surfaced in the header — one pass.
  const stats = useMemo(() => {
    const s = {
      total: tasks.length,
      completed: 0,
      in_progress: 0,
      overdue: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    tasks.forEach((t) => {
      if (t.status === "completed") s.completed++;
      if (t.status === "in_progress") s.in_progress++;
      if (isOverdue(t)) s.overdue++;
      if (t.priority === "critical") s.critical++;
      else if (t.priority === "high") s.high++;
      else if (t.priority === "medium") s.medium++;
      else if (t.priority === "low") s.low++;
    });
    return s;
  }, [tasks]);

  // Уникальные направления только в текущей выборке задач отдела.
  // Никакого глобального справочника — фильтр живёт ровно по тому, что есть.
  const uniqueDirections = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      const v = t.direction_tag?.trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const filtered = useMemo(() => {
    let r = tasks;
    if (filter === "critical") r = r.filter((t) => t.priority === "critical");
    else if (filter === "high") r = r.filter((t) => t.priority === "high");
    else if (filter === "medium") r = r.filter((t) => t.priority === "medium");
    else if (filter === "overdue")
      r = r.filter(isOverdue);
    else if (filter === "in_progress") r = r.filter((t) => t.status === "in_progress");
    else if (filter === "completed") r = r.filter((t) => t.status === "completed");
    else if (filter.startsWith("dir:")) {
      const want = filter.slice(4);
      r = r.filter((t) => (t.direction_tag ?? "").trim() === want);
    }

    const s = search.trim().toLowerCase();
    if (s) {
      r = r.filter((t) => {
        const hay = `${t.title} ${t.description ?? ""} ${t.assignee ?? ""} ${t.direction_tag ?? ""}`.toLowerCase();
        return hay.includes(s);
      });
    }
    return r;
  }, [tasks, filter, search]);

  if (!direction) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          {/* Header — rounded, sticky, with stats strip. */}
          <div className="border-b border-border bg-muted/20 px-6 py-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: direction.color }} />
                {direction.name} — задачи отдела
              </DialogTitle>
            </DialogHeader>

            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-7">
              <Stat label="Всего" value={stats.total} />
              <Stat label="Завершено" value={stats.completed} tone="success" />
              <Stat label="В работе" value={stats.in_progress} tone="info" />
              <Stat label="Просрочено" value={stats.overdue} tone="destructive" />
              <Stat label="Критические" value={stats.critical} tone="destructive" />
              <Stat label="Высокие" value={stats.high} tone="warning" />
              <Stat label="Средние" value={stats.medium} tone="info" />
            </div>
          </div>

          {/* Filter chips + search. */}
          <div className="border-b border-border px-6 py-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>Все</Chip>
              <Chip active={filter === "critical"} onClick={() => setFilter("critical")} tone="destructive">
                Критические · {stats.critical}
              </Chip>
              <Chip active={filter === "high"} onClick={() => setFilter("high")} tone="warning">
                Высокие · {stats.high}
              </Chip>
              <Chip active={filter === "medium"} onClick={() => setFilter("medium")} tone="info">
                Средние · {stats.medium}
              </Chip>
              <Chip active={filter === "overdue"} onClick={() => setFilter("overdue")} tone="destructive">
                Просроченные · {stats.overdue}
              </Chip>
              <Chip active={filter === "in_progress"} onClick={() => setFilter("in_progress")} tone="info">
                В работе · {stats.in_progress}
              </Chip>
              <Chip active={filter === "completed"} onClick={() => setFilter("completed")} tone="success">
                Завершённые · {stats.completed}
              </Chip>
            </div>
            {uniqueDirections.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                <span className="self-center text-[10px] uppercase tracking-wide text-muted-foreground">
                  Направления:
                </span>
                {uniqueDirections.map((d) => (
                  <Chip
                    key={d}
                    active={filter === `dir:${d}`}
                    onClick={() => setFilter(filter === `dir:${d}` ? "all" : (`dir:${d}` as Filter))}
                  >
                    {d}
                  </Chip>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию, описанию или исполнителю..."
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Task list. */}
          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin px-6 py-3">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {tasks.length === 0
                  ? "У отдела пока нет задач"
                  : "Под этот фильтр задач не найдено"}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((t) => {
                  const overdue = isOverdue(t);
                  const assignee =
                    (t.assignee_id ? userMap.get(t.assignee_id) : null) ?? t.assignee ?? null;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(t)}
                        className="group flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-accent/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{t.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="rounded bg-secondary px-1.5 py-0.5">
                              {quarterLabelRu(t.quarter)}
                            </span>
                            {t.direction_tag && (
                              <span className="rounded border border-border bg-background px-1.5 py-0.5 font-medium text-foreground">
                                {t.direction_tag}
                              </span>
                            )}
                            {t.deadline && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1",
                                  overdue ? "text-destructive" : "",
                                )}
                              >
                                <Calendar className="h-3 w-3" />
                                {format(parseISO(t.deadline), "dd.MM")}
                              </span>
                            )}
                            {assignee && <span className="truncate">@ {assignee}</span>}
                            {t.asana_url && (
                              <span title="Asana">
                                <ExternalLink className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        </div>
                        <PriorityBadge priority={t.priority} />
                        <StatusBadge status={t.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Показано {filtered.length} из {tasks.length}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                navigate(`/tasks?direction=${direction.id}`);
              }}
            >
              Открыть в разделе «Планы и задачи»
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "info" | "warning" | "destructive";
}) {
  const cls =
    tone === "success" ? "text-success" :
    tone === "info"    ? "text-info" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-base font-semibold tabular-nums", cls)}>{value}</div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: "success" | "info" | "warning" | "destructive";
}) {
  const inactive =
    "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground";
  const activeCls =
    tone === "destructive" ? "border-destructive/50 bg-destructive/10 text-destructive" :
    tone === "warning"     ? "border-warning/50 bg-warning/10 text-warning" :
    tone === "info"        ? "border-info/50 bg-info/10 text-info" :
    tone === "success"     ? "border-success/50 bg-success/10 text-success" :
    "border-foreground bg-foreground text-background";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? activeCls : inactive,
      )}
    >
      {children}
    </button>
  );
}
