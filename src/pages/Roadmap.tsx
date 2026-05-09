import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { useTasks, Task } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import { EmptyState, PageLoader } from "@/components/UiState";
import { Map as MapIcon, Plus } from "lucide-react";

export default function Roadmap() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: directions = [] } = useDirections();
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [editing, setEditing] = useState<Task | null>(null);
  const [createForQuarter, setCreateForQuarter] = useState<string | null>(null);

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);

  const quarters = useMemo(() => {
    const set = new Set(filtered.map((t) => t.quarter));
    return Array.from(set).sort((a, b) => {
      const [qa, ya] = a.split(" ");
      const [qb, yb] = b.split(" ");
      return ya === yb ? qa.localeCompare(qb) : ya.localeCompare(yb);
    });
  }, [filtered]);

  return (
    <>
      <PageHeader title="Дорожная карта" description="Задачи по кварталам и отделам" />
      <TaskFilters value={filters} onChange={setFilters} />
      <div className="space-y-6 p-4 sm:p-8">
        {isLoading && tasks.length === 0 ? (
          <PageLoader />
        ) : quarters.length === 0 ? (
          <EmptyState
            icon={<MapIcon className="h-5 w-5" />}
            title={tasks.length === 0 ? "Roadmap пуст" : "Нет задач по выбранным фильтрам"}
            description={tasks.length === 0 ? "Создайте задачу — она появится в соответствующем квартале." : "Сбросьте фильтры выше или измените их."}
          />
        ) : (
          quarters.map((q) => (
            <section key={q} className="rounded-xl border border-border bg-card/40 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">{q}</h3>
                  <p className="text-xs text-muted-foreground">{filtered.filter((t) => t.quarter === q).length} задач</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCreateForQuarter(q)}>
                  <Plus className="mr-1 h-4 w-4" /> Добавить
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered
                  .filter((t) => t.quarter === q)
                  .map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      direction={directionsMap.get(t.direction_id ?? "")}
                      onClick={() => setEditing(t)}
                    />
                  ))}
              </div>
            </section>
          ))
        )}
      </div>
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
      <TaskDialog
        open={!!createForQuarter}
        onOpenChange={(v) => !v && setCreateForQuarter(null)}
        defaults={createForQuarter ? { quarter: createForQuarter } : undefined}
      />
    </>
  );
}