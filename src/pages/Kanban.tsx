import { useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { useTasks, useUpdateTask, Task } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { STATUSES, TaskStatus } from "@/lib/constants";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { cn } from "@/lib/utils";

function Column({ status, tasks, directionsMap, onCardClick }: { status: typeof STATUSES[number]; tasks: Task[]; directionsMap: Map<string, any>; onCardClick: (t: Task) => void }) {
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
          isOver
            ? "scale-[1.01] border-primary bg-primary/5 shadow-elegant"
            : "border-border bg-card/30",
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
            <DraggableCard key={t.id} task={t} direction={directionsMap.get(t.direction_id ?? "")} onClick={() => onCardClick(t)} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task, direction, onClick }: { task: Task; direction: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  // Attach drag listeners/attributes to the whole wrapper so the user can
  // grab the card from any spot. PointerSensor's activationConstraint
  // (distance: 5px) keeps plain clicks from registering as drags, so the
  // existing onClick that opens the task dialog still works.
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

export default function Kanban() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: directions = [] } = useDirections();
  const update = useUpdateTask();
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [editing, setEditing] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);
  const filtered = useMemo(() => applyFilters(tasks, { ...filters, status: "all" }), [tasks, filters]);

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
      <PageHeader title="Kanban" description="Перемещайте задачи между колонками" />
      <TaskFilters value={filters} onChange={setFilters} hideStatus />
      {isLoading && tasks.length === 0 && (
        <p className="px-4 pt-3 text-xs text-muted-foreground sm:px-8">Загрузка...</p>
      )}
      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto p-4 scrollbar-thin sm:p-8" style={{ minHeight: "calc(100vh - 180px)" }}>
          {STATUSES.map((s) => (
            <Column
              key={s.value}
              status={s}
              tasks={filtered.filter((t) => t.status === s.value)}
              directionsMap={directionsMap}
              onCardClick={setEditing}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} direction={directionsMap.get(activeTask.direction_id ?? "")} />}
        </DragOverlay>
      </DndContext>
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}