import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/PageHeader";
import { TaskFilters, applyFilters, initialFilters, FiltersState } from "@/components/TaskFilters";
import { currentQuarter } from "@/lib/constants";
import { TaskDialog } from "@/components/TaskDialog";
import { PriorityBadge } from "@/components/StatusBadge";
import { TaskStatusSelect } from "@/components/TaskStatusSelect";
import { Spinner } from "@/components/UiState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDirections } from "@/hooks/useDirections";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useUserMap } from "@/hooks/useUsers";

/**
 * «Планы и задачи» — единая таблица всех задач компании с фильтрами.
 *
 * Канбан-режим был удалён: смена статусов теперь делается через
 * dropdown прямо в ячейке таблицы (`TaskStatusSelect`).
 */
export default function Tasks() {
  const [params] = useSearchParams();
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

  return (
    <>
      <PageHeader
        title="Планы и задачи"
        description="Все задачи компании в едином представлении"
      />
      <TaskFilters value={filters} onChange={setFilters} />
      <TableView filters={filters} onEdit={setEditing} />
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
              <TableHead>Направление</TableHead>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {t.direction_tag ? (
                      <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                        {t.direction_tag}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.quarter}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.customer ?? "—"}</TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}
                  </TableCell>
                  <TableCell><TaskStatusSelect task={t} /></TableCell>
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
                <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
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
