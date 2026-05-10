import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Columns3, ExternalLink, Table2 } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { currentQuarter } from "@/lib/constants";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/UiState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDirections } from "@/hooks/useDirections";
import { useTasks, useUpdateTask, type Task } from "@/hooks/useTasks";
import { useUserMap } from "@/hooks/useUsers";
import { STATUSES, TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

type ViewMode = "table" | "kanban";

/**
 * Unified «Планы и задачи» page. Same data, two views: table (analysis,
 * filters, sort) and kanban (status flow). The view choice is reflected
 * in the URL (`?view=...`) so it survives refresh and is shareable.
 */
export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get("view") as ViewMode) === "kanban" ? "kanban" : "table";
  const [view, setView] = useState<ViewMode>(initial);
  // Seed filters from URL once on mount so deep links from the dashboard
  // (e.g. /tasks?priority=critical) land on a pre-filtered table.
  // Default quarter = current — keeps Q1/Q2/Q3/Q4 task lists from mixing.
  const [filters, setFilters] = useState<FiltersState>(() => ({
    ...initialFilters,
    priority: params.get("priority") ?? initialFilters.priority,
    status: params.get("status") ?? initialFilters.status,
    direction: params.get("direction") ?? initialFilters.direction,
    quarter: params.get("quarter") ?? currentQuarter(),
    assignee: params.get("assignee") ?? initialFilters.assignee,
  }));
  const [editing, setEditing] = useState<Task | null>(null);

  // Persist view in the URL so deep links remember it.
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set("view", view);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return (
    <>
      <PageHeader
        title="Планы и задачи"
        description="Все задачи компании в едином представлении"
        actions={
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "table"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={view === "table"}
            >
              <Table2 className="h-3.5 w-3.5" /> Таблица
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                view === "kanban"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={view === "kanban"}
            >
              <Columns3 className="h-3.5 w-3.5" /> Канбан
            </button>
          </div>
        }
      />

      <TaskFilters value={filters} onChange={setFilters} hideStatus={view === "kanban"} />

      {view === "table" ? (
        <TableView filters={filters} onEdit={setEditing} />
      ) : (
        <KanbanView filters={filters} onEdit={setEditing} />
      )}

      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

function TableView({ filters, onEdit }: { filters: FiltersState; onEdit: (t: Task) => void }) {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: directions = [] } = useDirections();
  const { map: userMap } = useUserMap();

  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);
  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  return (
    <div className="overflow-auto p-4 scrollbar-thin sm:p-8">
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Отдел</TableHead>
              <TableHead>Задача</TableHead>
              <TableHead>Квартал</TableHead>
              <TableHead>Заказчик</TableHead>
              <TableHead>Приоритет</TableHead>
              <TableHead>Дедлайн</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Исполнитель</TableHead>
              <TableHead>Asana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => {
              const d = directionsMap.get(t.direction_id ?? "");
              return (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => onEdit(t)}>
                  <TableCell>
                    {d ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="font-medium">{t.title}</div>
                    {t.description && (
                      <div className="truncate text-xs text-muted-foreground">{t.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.quarter}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.customer ?? "—"}</TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(t.assignee_id ? userMap.get(t.assignee_id) : null) ?? t.assignee ?? "—"}
                  </TableCell>
                  <TableCell>
                    {t.asana_url ? (
                      <a
                        href={t.asana_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center text-primary hover:text-primary-glow"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                  {isLoading && tasks.length === 0 ? (
                    <span className="inline-flex items-center gap-2"><Spinner /> Загрузка...</span>
                  ) : tasks.length === 0 ? (
                    "Задач ещё нет — создайте первую через кнопку «Новая задача»."
                  ) : (
                    "Задач под выбранные фильтры не найдено."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban view
// ---------------------------------------------------------------------------

function KanbanColumn({
  status,
  tasks,
  directionsMap,
  onCardClick,
}: {
  status: typeof STATUSES[number];
  tasks: Task[];
  directionsMap: Map<string, any>;
  onCardClick: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="h-2 w-2 rounded-full transition-transform duration-300"
          style={{
            backgroundColor: `hsl(var(--${status.colorVar}))`,
            boxShadow: isOver ? `0 0 12px hsl(var(--${status.colorVar}))` : undefined,
            transform: isOver ? "scale(1.4)" : "scale(1)",
          }}
        />
        <h3 className="text-sm font-medium">{status.label}</h3>
        <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-all duration-200",
          isOver ? "scale-[1.01] border-primary bg-primary/5 shadow-elegant" : "border-border bg-card/30",
        )}
      >
        {tasks.length === 0 ? (
          <p
            className={cn(
              "py-6 text-center text-xs transition-colors",
              isOver ? "animate-pulse-soft font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {isOver ? "Отпустите здесь" : "Перетащите задачу сюда"}
          </p>
        ) : (
          tasks.map((t) => (
            <DraggableCard
              key={t.id}
              task={t}
              direction={directionsMap.get(t.direction_id ?? "")}
              onClick={() => onCardClick(t)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task, direction, onClick }: { task: Task; direction: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
      className="cursor-grab active:cursor-grabbing"
    >
      <TaskCard task={task} direction={direction} onClick={onClick} />
    </div>
  );
}

function KanbanView({ filters, onEdit }: { filters: FiltersState; onEdit: (t: Task) => void }) {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: directions = [] } = useDirections();
  const update = useUpdateTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);
  const filtered = useMemo(
    () => applyFilters(tasks, { ...filters, status: "all" }),
    [tasks, filters],
  );

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const newStatus = e.over?.id as TaskStatus | undefined;
    if (!newStatus) return;
    const t = tasks.find((x) => x.id === e.active.id);
    if (!t || t.status === newStatus) return;
    update.mutate({ id: t.id, patch: { status: newStatus }, prev: t });
  };

  const activeTask = tasks.find((t) => t.id === activeId);

  return (
    <>
      {isLoading && tasks.length === 0 && (
        <p className="px-4 pt-3 text-xs text-muted-foreground sm:px-8">Загрузка...</p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragEnd={onDragEnd}
      >
        <div
          className="flex gap-4 overflow-x-auto p-4 scrollbar-thin sm:p-8"
          style={{ minHeight: "calc(100vh - 220px)" }}
        >
          {STATUSES.map((s) => (
            <KanbanColumn
              key={s.value}
              status={s}
              tasks={filtered.filter((t) => t.status === s.value)}
              directionsMap={directionsMap}
              onCardClick={onEdit}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <TaskCard task={activeTask} direction={directionsMap.get(activeTask.direction_id ?? "")} />
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
}
