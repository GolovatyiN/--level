import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Plus, Search, X } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PriorityBadge } from "@/components/StatusBadge";
import { TaskStatusSelect } from "@/components/TaskStatusSelect";
import { TaskDialog } from "@/components/TaskDialog";
import { MultiSelectPopover, type MultiSelectOption } from "@/components/MultiSelectPopover";
import { useDirections } from "@/hooks/useDirections";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useUserMap, useUsers } from "@/hooks/useUsers";
import { useCanManage } from "@/hooks/useUserRole";
import { PRIORITIES, STATUSES, compareQuarters } from "@/lib/constants";
import { cn, isOverdue, taskTableClasses as tt } from "@/lib/utils";

/**
 * /tasks — единый реестр всех задач системы.
 *
 * Открывается:
 * - через табы из /plans
 * - через клики по карточкам на дашборде (с автоматически применёнными
 *   фильтрами в URL: ?status=in_progress, ?priority=critical, ?overdue=1
 *   и т.д.)
 *
 * Все фильтры пишутся в URL, чтобы можно было ссылку скопировать
 * коллеге и отрефрешить, не теряя выборку.
 */
type SortKey =
  | "title"
  | "direction"
  | "quarter"
  | "status"
  | "priority"
  | "assignee"
  | "deadline"
  | "created_at"
  | "updated_at";

export default function AllTasks() {
  const canEdit = useCanManage();
  const [params, setParams] = useSearchParams();

  const { data: tasks = [] } = useTasks(false);
  const { data: directions = [] } = useDirections();
  const { data: users = [] } = useUsers();
  const { map: userMap } = useUserMap();

  // URL → state
  const search = params.get("search") ?? "";
  const filterDirs = params.get("direction")?.split(",").filter(Boolean) ?? [];
  const filterQuarters = params.get("quarter")?.split(",").filter(Boolean) ?? [];
  const filterStatuses = params.get("status")?.split(",").filter(Boolean) ?? [];
  const filterPriorities = params.get("priority")?.split(",").filter(Boolean) ?? [];
  const filterAssignees = params.get("assignee")?.split(",").filter(Boolean) ?? [];
  const onlyOverdue = params.get("overdue") === "1";
  const onlyWithRemark = params.get("with_comments") === "1";
  const onlyWithOutcome = params.get("with_outcome") === "1";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "" || value === "0") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const setMulti = (key: string, value: string[]) =>
    setParam(key, value.length === 0 ? null : value.join(","));
  const setBool = (key: string, value: boolean) =>
    setParam(key, value ? "1" : null);

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "updated_at",
    dir: "desc",
  });

  // Maps
  const dirById = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);

  // ---------- Apply filters ----------
  const filtered = useMemo(() => {
    let r = tasks;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((t) =>
        `${t.title} ${t.description ?? ""} ${t.latest_remark ?? ""} ${t.outcome ?? ""} ${
          userMap.get(t.assignee_id ?? "") ?? t.assignee ?? ""
        }`
          .toLowerCase()
          .includes(q),
      );
    }
    if (filterDirs.length > 0) {
      r = r.filter((t) => t.direction_id && filterDirs.includes(t.direction_id));
    }
    if (filterQuarters.length > 0) {
      // Сравниваем по префиксу (Q1/Q2/Q3/Q4), а не по полному label.
      r = r.filter((t) => {
        const prefix = t.quarter?.match(/^(Q[1-4])/i)?.[1].toUpperCase();
        return prefix !== undefined && filterQuarters.includes(prefix);
      });
    }
    if (filterStatuses.length > 0) {
      r = r.filter((t) => filterStatuses.includes(t.status));
    }
    if (filterPriorities.length > 0) {
      r = r.filter((t) => filterPriorities.includes(t.priority));
    }
    if (filterAssignees.length > 0) {
      r = r.filter((t) => t.assignee_id && filterAssignees.includes(t.assignee_id));
    }
    if (onlyOverdue) {
      r = r.filter(isOverdue);
    }
    if (onlyWithRemark) {
      r = r.filter((t) => !!t.latest_remark?.trim());
    }
    if (onlyWithOutcome) {
      r = r.filter((t) => !!t.outcome?.trim());
    }

    // Sort
    const dir = sort.dir === "asc" ? 1 : -1;
    const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
    const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
      title:      (a, b) => a.title.localeCompare(b.title) * dir,
      direction:  (a, b) =>
        ((dirById.get(a.direction_id ?? "")?.name ?? "").localeCompare(
          dirById.get(b.direction_id ?? "")?.name ?? "",
        )) * dir,
      quarter:    (a, b) => compareQuarters(a.quarter ?? "", b.quarter ?? "") * dir,
      status:     (a, b) => a.status.localeCompare(b.status) * dir,
      priority:   (a, b) => a.priority.localeCompare(b.priority) * dir,
      assignee:   (a, b) =>
        ((userMap.get(a.assignee_id ?? "") ?? a.assignee ?? "").localeCompare(
          userMap.get(b.assignee_id ?? "") ?? b.assignee ?? "",
        )) * dir,
      deadline:   (a, b) => (ts(a.deadline) - ts(b.deadline)) * dir,
      created_at: (a, b) => (ts(a.created_at) - ts(b.created_at)) * dir,
      updated_at: (a, b) => (ts(a.updated_at) - ts(b.updated_at)) * dir,
    };
    return [...r].sort(cmp[sort.key]);
  }, [tasks, search, filterDirs, filterQuarters, filterStatuses, filterPriorities, filterAssignees, onlyOverdue, onlyWithRemark, onlyWithOutcome, sort, userMap, dirById]);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  // Active filters chips
  const activeFilters: { label: string; clear: () => void }[] = [];
  if (search) activeFilters.push({ label: `Поиск: «${search}»`, clear: () => setParam("search", null) });
  filterDirs.forEach((id) =>
    activeFilters.push({
      label: `Отдел: ${dirById.get(id)?.name ?? id}`,
      clear: () => setMulti("direction", filterDirs.filter((x) => x !== id)),
    }),
  );
  filterQuarters.forEach((q) =>
    activeFilters.push({
      label: `Квартал: ${q}`,
      clear: () => setMulti("quarter", filterQuarters.filter((x) => x !== q)),
    }),
  );
  filterStatuses.forEach((s) =>
    activeFilters.push({
      label: `Статус: ${STATUSES.find((x) => x.value === s)?.label ?? s}`,
      clear: () => setMulti("status", filterStatuses.filter((x) => x !== s)),
    }),
  );
  filterPriorities.forEach((p) =>
    activeFilters.push({
      label: `Приоритет: ${PRIORITIES.find((x) => x.value === p)?.label ?? p}`,
      clear: () => setMulti("priority", filterPriorities.filter((x) => x !== p)),
    }),
  );
  filterAssignees.forEach((id) =>
    activeFilters.push({
      label: `Ответственный: ${userMap.get(id) ?? id}`,
      clear: () => setMulti("assignee", filterAssignees.filter((x) => x !== id)),
    }),
  );
  if (onlyOverdue) activeFilters.push({ label: "Только просроченные", clear: () => setBool("overdue", false) });
  if (onlyWithRemark) activeFilters.push({ label: "С комментариями", clear: () => setBool("with_comments", false) });
  if (onlyWithOutcome) activeFilters.push({ label: "С итогом", clear: () => setBool("with_outcome", false) });

  // Multi-select options
  const directionOptions: MultiSelectOption[] = directions.map((d) => ({
    value: d.id,
    label: d.name,
    colorHex: d.color,
  }));
  const quarterOptions: MultiSelectOption[] = ["Q1", "Q2", "Q3", "Q4"].map((q) => ({
    value: q,
    label: q,
  }));
  const statusOptions: MultiSelectOption[] = STATUSES.map((s) => ({ value: s.value, label: s.label }));
  const priorityOptions: MultiSelectOption[] = PRIORITIES.map((p) => ({ value: p.value, label: p.label }));
  const assigneeOptions: MultiSelectOption[] = users.map((u) => ({
    value: u.user_id,
    label: u.display_name ?? u.email ?? "—",
  }));

  const SortHead = ({
    k,
    label,
    align = "center",
  }: {
    k: SortKey;
    label: string;
    align?: "left" | "center";
  }) => (
    <TableHead
      onClick={() => toggleSort(k)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap hover:text-foreground",
        align === "center" ? tt.headCenter : tt.headLeft,
      )}
    >
      <span className={cn("inline-flex items-center gap-1", align === "center" && "justify-center")}>
        {label}
        {sort.key === k && (
          <span className="text-[10px] text-muted-foreground">{sort.dir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </TableHead>
  );

  return (
    <>
      <PageHeader
        title="Квартальные планы"
        description="Список задач по компании с фильтрами и поиском"
        actions={
          <Button size="sm" onClick={() => setCreatingTask(true)}>
            <Plus className="mr-1 h-4 w-4" /> Создать задачу
          </Button>
        }
      />

      <PageTabs
        items={[
          { label: "Квартальные планы", to: "/plans" },
          { label: "Все задачи", to: "/tasks" },
        ]}
      />

      <div className="space-y-3 p-4 sm:p-8">
        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setParam("search", e.target.value || null)}
              placeholder="Поиск..."
              className="h-8 w-64 pl-8 text-sm"
            />
          </div>
          <MultiSelectPopover
            placeholder="Отдел"
            options={directionOptions}
            selected={filterDirs}
            onChange={(v) => setMulti("direction", v)}
            searchable
            triggerClassName="min-w-[140px]"
          />
          <MultiSelectPopover
            placeholder="Квартал"
            options={quarterOptions}
            selected={filterQuarters}
            onChange={(v) => setMulti("quarter", v)}
            triggerClassName="min-w-[120px]"
          />
          <MultiSelectPopover
            placeholder="Статус"
            options={statusOptions}
            selected={filterStatuses}
            onChange={(v) => setMulti("status", v)}
            triggerClassName="min-w-[140px]"
          />
          <MultiSelectPopover
            placeholder="Приоритет"
            options={priorityOptions}
            selected={filterPriorities}
            onChange={(v) => setMulti("priority", v)}
            triggerClassName="min-w-[140px]"
          />
          <MultiSelectPopover
            placeholder="Ответственный"
            options={assigneeOptions}
            selected={filterAssignees}
            onChange={(v) => setMulti("assignee", v)}
            searchable
            triggerClassName="min-w-[160px]"
          />

          <FilterToggle label="Просроч." active={onlyOverdue} onToggle={() => setBool("overdue", !onlyOverdue)} />
          <FilterToggle label="С коммент." active={onlyWithRemark} onToggle={() => setBool("with_comments", !onlyWithRemark)} />
          <FilterToggle label="С итогом" active={onlyWithOutcome} onToggle={() => setBool("with_outcome", !onlyWithOutcome)} />

          {activeFilters.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-8 text-xs text-muted-foreground"
            >
              Сбросить
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground">
            Найдено: {filtered.length} из {tasks.length}
          </span>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map((f, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground"
              >
                {f.label}
                <button
                  type="button"
                  onClick={f.clear}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Убрать фильтр"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {tasks.length === 0
                ? "В системе пока нет задач."
                : "По выбранным фильтрам задачи не найдены."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="title"      label="Название"     align="left" />
                  <SortHead k="direction"  label="Отдел" />
                  <SortHead k="quarter"    label="Квартал" />
                  <SortHead k="status"     label="Статус" />
                  <SortHead k="priority"   label="Приоритет" />
                  <SortHead k="assignee"   label="Ответственный" />
                  <SortHead k="deadline"   label="Дедлайн" />
                  <TableHead className={tt.headLeft}>Комментарий</TableHead>
                  <TableHead className={tt.headLeft}>Итог</TableHead>
                  <SortHead k="created_at" label="Создана" />
                  <SortHead k="updated_at" label="Обновлена" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const dir = dirById.get(t.direction_id ?? "");
                  const assigneeName = t.assignee_id
                    ? userMap.get(t.assignee_id) ?? null
                    : t.assignee;
                  const overdue = isOverdue(t);
                  return (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setEditingTask(t)}
                    >
                      <TableCell className={cn(tt.cellLeft, "max-w-[260px]")}>
                        <div className="truncate font-medium" title={t.title}>{t.title}</div>
                        {t.description && (
                          <div className="truncate text-xs text-muted-foreground" title={t.description}>
                            {t.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={cn(tt.cellCenter, "whitespace-nowrap text-xs")}>
                        {dir ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: dir.color }}
                            />
                            {dir.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className={cn(tt.cellCenter, "whitespace-nowrap text-xs text-muted-foreground tabular-nums")}>
                        {t.quarter ?? "—"}
                      </TableCell>
                      <TableCell className={tt.cellCenter}>
                        <div className="inline-flex">
                          <TaskStatusSelect task={t} disabled={!canEdit} />
                        </div>
                      </TableCell>
                      <TableCell className={tt.cellCenter}>
                        <div className="inline-flex justify-center">
                          <PriorityBadge priority={t.priority} />
                        </div>
                      </TableCell>
                      <TableCell className={cn(tt.cellCenter, "whitespace-nowrap text-xs text-muted-foreground")}>
                        {assigneeName ?? "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tt.cellCenter,
                          "whitespace-nowrap text-xs tabular-nums",
                          overdue ? "font-medium text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(tt.cellLeft, "max-w-[200px] text-xs text-muted-foreground")}
                        title={t.latest_remark ?? undefined}
                      >
                        <div className="truncate">{t.latest_remark ?? "—"}</div>
                      </TableCell>
                      <TableCell
                        className={cn(tt.cellLeft, "max-w-[200px] text-xs text-muted-foreground")}
                        title={t.outcome ?? undefined}
                      >
                        <div className="truncate">{t.outcome ?? "—"}</div>
                      </TableCell>
                      <TableCell className={cn(tt.cellCenter, "whitespace-nowrap text-xs text-muted-foreground tabular-nums")}>
                        {format(parseISO(t.created_at), "dd.MM.yyyy")}
                      </TableCell>
                      <TableCell className={cn(tt.cellCenter, "whitespace-nowrap text-xs text-muted-foreground tabular-nums")}>
                        {format(parseISO(t.updated_at), "dd.MM.yyyy")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <TaskDialog
        open={!!editingTask}
        onOpenChange={(v) => !v && setEditingTask(null)}
        task={editingTask}
      />
      <TaskDialog
        open={creatingTask}
        onOpenChange={setCreatingTask}
        defaults={(() => {
          const d: Partial<Task> = {};
          // Если в фильтрах ровно один отдел выбран — подставляем его
          // по умолчанию (пользователь явно работает в этом скоупе).
          if (filterDirs.length === 1) d.direction_id = filterDirs[0];
          return d;
        })()}
      />
    </>
  );
}

function FilterToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-foreground/30 bg-foreground/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
