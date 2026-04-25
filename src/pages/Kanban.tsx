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

function Column({ status, tasks, directionsMap, onCardClick }: { status: typeof STATUSES[number]; tasks: Task[]; directionsMap: Map<string, any>; onCardClick: (t: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${status.colorVar}))` }} />
        <h3 className="text-sm font-medium">{status.label}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border bg-card/30"}`}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} direction={directionsMap.get(t.direction_id ?? "")} onClick={() => onCardClick(t)} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, direction, onClick }: { task: Task; direction: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <TaskCard
        task={task}
        direction={direction}
        onClick={onClick}
        dragHandle={{ ...listeners, ...attributes } as any}
      />
    </div>
  );
}

export default function Kanban() {
  const { data: tasks = [] } = useTasks();
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
      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto p-8 scrollbar-thin" style={{ minHeight: "calc(100vh - 180px)" }}>
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