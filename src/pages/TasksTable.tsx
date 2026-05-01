import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { useTasks, Task } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { useUserMap } from "@/hooks/useUsers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskDialog } from "@/components/TaskDialog";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/UiState";
import { ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function TasksTable() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: directions = [] } = useDirections();
  const { map: userMap } = useUserMap();
  const [filters, setFilters] = useState<FiltersState>(initialFilters);
  const [editing, setEditing] = useState<Task | null>(null);

  const directionsMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);
  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  return (
    <>
      <PageHeader title="Таблица задач" description="Все задачи в одном представлении" />
      <TaskFilters value={filters} onChange={setFilters} />
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
                <TableHead>Ответственный</TableHead>
                <TableHead>Asana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const d = directionsMap.get(t.direction_id ?? "");
                return (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setEditing(t)}>
                    <TableCell>
                      {d ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="font-medium">{t.title}</div>
                      {t.description && <div className="truncate text-xs text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.quarter}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.customer ?? "—"}</TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(t.assignee_id ? userMap.get(t.assignee_id) : null) ?? t.assignee ?? "—"}
                    </TableCell>
                    <TableCell>
                      {t.asana_url ? (
                        <a href={t.asana_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center text-primary hover:text-primary-glow">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
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
      <TaskDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} task={editing} />
    </>
  );
}