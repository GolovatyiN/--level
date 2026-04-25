import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { useTasks, Task } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";

export default function Archive() {
  const { data: tasks = [] } = useTasks(true);
  const { data: directions = [] } = useDirections();
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [editing, setEditing] = useState<Task | null>(null);

  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);
  const archived = useMemo(() => applyFilters(tasks.filter((t) => t.archived), filters), [tasks, filters]);

  return (
    <>
      <PageHeader title="Архив" description="Завершённые и убранные в архив задачи" />
      <TaskFilters value={filters} onChange={setFilters} />
      <div className="grid gap-3 p-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {archived.map((t) => (
          <TaskCard key={t.id} task={t} direction={directionsMap.get(t.direction_id ?? "")} onClick={() => setEditing(t)} />
        ))}
        {archived.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Архив пуст.</p>}
      </div>
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}