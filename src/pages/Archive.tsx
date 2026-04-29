import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { useTasks, Task } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { EmptyState, PageLoader } from "@/components/UiState";
import { Archive as ArchiveIcon } from "lucide-react";

export default function Archive() {
  const { data: tasks = [], isLoading } = useTasks(true);
  const { data: directions = [] } = useDirections();
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [editing, setEditing] = useState<Task | null>(null);

  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);
  const archived = useMemo(() => applyFilters(tasks.filter((t) => t.archived), filters), [tasks, filters]);

  return (
    <>
      <PageHeader title="Архив" description="Завершённые и убранные в архив задачи" />
      <TaskFilters value={filters} onChange={setFilters} />
      <div className="p-4 sm:p-8">
        {isLoading && tasks.length === 0 ? (
          <PageLoader />
        ) : archived.length === 0 ? (
          <EmptyState
            icon={<ArchiveIcon className="h-5 w-5" />}
            title="Архив пуст"
            description="Завершённые или вручную перенесённые в архив задачи появятся здесь."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {archived.map((t) => (
              <TaskCard key={t.id} task={t} direction={directionsMap.get(t.direction_id ?? "")} onClick={() => setEditing(t)} />
            ))}
          </div>
        )}
      </div>
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}