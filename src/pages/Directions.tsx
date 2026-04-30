import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, ArrowUpDown } from "lucide-react";
import { useDirections, Direction } from "@/hooks/useDirections";
import { useTasks, Task } from "@/hooks/useTasks";
import { DirectionDialog } from "@/components/DirectionDialog";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";

type Sort = "name_asc" | "tasks_desc" | "progress_desc" | "open_desc";

export default function DirectionsPage() {
  const { data: directions = [] } = useDirections();
  const { data: tasks = [] } = useTasks();
  const [editingDir, setEditingDir] = useState<Direction | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [createTaskFor, setCreateTaskFor] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name_asc");

  const enriched = useMemo(() => {
    return directions
      .filter((d) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return `${d.name} ${d.description ?? ""} ${d.owner ?? ""}`.toLowerCase().includes(s);
      })
      .map((d) => {
        const dt = tasks.filter((t) => t.direction_id === d.id);
        const done = dt.filter((t) => t.status === "completed").length;
        const open = dt.length - done;
        return { d, dt, done, open, pct: dt.length ? Math.round((done / dt.length) * 100) : 0 };
      })
      .sort((a, b) => {
        switch (sort) {
          case "tasks_desc": return b.dt.length - a.dt.length;
          case "progress_desc": return b.pct - a.pct;
          case "open_desc": return b.open - a.open;
          default: return a.d.name.localeCompare(b.d.name);
        }
      });
  }, [directions, tasks, search, sort]);

  return (
    <>
      <PageHeader
        title="Отделы"
        description="Крупные блоки работ компании"
        actions={<Button onClick={() => setCreating(true)} size="sm"><Plus className="mr-1 h-4 w-4" /> Отдел</Button>}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-4 py-3 sm:px-8">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск отделов..."
            className="h-8 w-72 pl-8 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-[200px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">По названию</SelectItem>
              <SelectItem value="tasks_desc">Больше задач</SelectItem>
              <SelectItem value="open_desc">Больше открытых</SelectItem>
              <SelectItem value="progress_desc">Лучший прогресс</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-6 p-4 sm:p-8">
        {enriched.map(({ d, dt, done, pct }, idx) => (
          <section
            key={d.id}
            style={{ animationDelay: `${idx * 50}ms` }}
            className="group animate-fade-in rounded-xl border border-border bg-card/40 p-5 transition-colors duration-200 hover:border-foreground/30"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 h-3 w-3 rounded-full transition-transform duration-300 group-hover:scale-125"
                  style={{
                    backgroundColor: d.color,
                    boxShadow: `0 0 0 0 ${d.color}33`,
                  }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{d.name}</h3>
                    <button
                      onClick={() => setEditingDir(d)}
                      className="text-muted-foreground transition-all duration-200 hover:text-foreground hover:rotate-12"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
                  {d.owner && <p className="mt-1 text-xs text-muted-foreground">Ответственный: {d.owner}</p>}
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">{done} из {dt.length} завершено · {pct}%</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCreateTaskFor(d.id)}>
                <Plus className="mr-1 h-4 w-4" /> Задача
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {dt.map((t) => (
                <TaskCard key={t.id} task={t} direction={d} onClick={() => setEditingTask(t)} />
              ))}
              {dt.length === 0 && <p className="text-sm text-muted-foreground">Нет задач.</p>}
            </div>
          </section>
        ))}
        {enriched.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {directions.length === 0 ? "Создайте первый отдел" : "Под фильтр ничего не найдено"}
            </p>
            {directions.length === 0 && (
              <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> Создать отдел</Button>
            )}
          </div>
        )}
      </div>
      <DirectionDialog open={creating} onOpenChange={setCreating} />
      <DirectionDialog open={!!editingDir} onOpenChange={(v) => !v && setEditingDir(null)} direction={editingDir} />
      <TaskDialog open={!!editingTask} onOpenChange={(v) => !v && setEditingTask(null)} task={editingTask} />
      <TaskDialog
        open={!!createTaskFor}
        onOpenChange={(v) => !v && setCreateTaskFor(null)}
        defaults={createTaskFor ? { direction_id: createTaskFor } : undefined}
      />
    </>
  );
}
