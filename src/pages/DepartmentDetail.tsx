import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  History as HistoryIcon,
  MessageSquare,
  Plus,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageLoader } from "@/components/UiState";
import { PriorityBadge } from "@/components/StatusBadge";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { TaskStatusSelect } from "@/components/TaskStatusSelect";
import { TaskDialog } from "@/components/TaskDialog";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import { useTasks, type Task } from "@/hooks/useTasks";
import { usePlans, usePlanStats, type DepartmentPlanStats } from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";
import { useCanManage } from "@/hooks/useUserRole";
import { compareQuarters, STATUSES, quarterLabelRu } from "@/lib/constants";
import { cn, isOverdue } from "@/lib/utils";

/**
 * /departments/:id — годовой обзор отдела.
 *
 * Логика: сверху агрегированный дашборд + фильтр кварталов
 * (Все / Q1 / Q2 / Q3 / Q4). Все колонки таблицы задач — в одном месте,
 * с дополнительной колонкой «Квартал». Когда выбран конкретный квартал,
 * статистика и таблица перестраиваются под него.
 *
 * Вкладки: Задачи / Комментарии / История / Итоги — все per-department.
 */
export default function DepartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canManage = useCanManage();

  const { data: directions = [], isLoading: dirLoading } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [] } = usePlans();
  const { data: planStats = [] } = usePlanStats();
  const { data: allTasks = [] } = useTasks(true);
  const { map: userMap } = useUserMap();

  // Q1 / Q2 / Q3 / Q4 (по префиксу label) для фильтра. Год хранить не
  // нужно — пользователь выбирает «квартал по номеру».
  const [quarterFilter, setQuarterFilter] = useState<"all" | "Q1" | "Q2" | "Q3" | "Q4">("all");
  const [tab, setTab] = useState("tasks");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const direction = useMemo(
    () => directions.find((d) => d.id === id) ?? null,
    [directions, id],
  );

  const head = direction?.head_user_id ? userMap.get(direction.head_user_id) ?? null : null;

  // Все планы этого отдела (по всем кварталам, по всем годам).
  const deptPlans = useMemo(
    () => plans.filter((p) => p.direction_id === id),
    [plans, id],
  );

  // Сортированный список кварталов, у которых есть план в этом отделе —
  // нужен для вкладки «Итоги», чтобы рендерить блоки в правильном порядке.
  const deptQuarters = useMemo(() => {
    const ids = new Set(deptPlans.map((p) => p.quarter_id));
    return quarters
      .filter((q) => ids.has(q.id))
      .sort((a, b) => compareQuarters(a.label, b.label));
  }, [quarters, deptPlans]);

  // Все задачи отдела с привязкой к кварталу. Архивные не показываем —
  // история по ним доступна через /archive.
  const deptTasks = useMemo(
    () =>
      allTasks.filter((t) => t.direction_id === id && !t.archived),
    [allTasks, id],
  );

  // Фильтр по выбранному кварталу (по префиксу Q1/Q2/Q3/Q4 в label).
  const filteredTasks = useMemo(() => {
    if (quarterFilter === "all") return deptTasks;
    return deptTasks.filter((t) => t.quarter?.startsWith(quarterFilter + " "));
  }, [deptTasks, quarterFilter]);

  // Stats по выбранному скоупу.
  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.status === "completed").length;
    const inProgress = filteredTasks.filter((t) => t.status === "in_progress").length;
    const atRisk = filteredTasks.filter((t) => t.status === "at_risk").length;
    const onReview = filteredTasks.filter((t) => t.status === "in_review").length;
    const needsRevision = filteredTasks.filter((t) => t.status === "needs_revision").length;
    const overdue = filteredTasks.filter(isOverdue).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, atRisk, onReview, needsRevision, overdue, progress };
  }, [filteredTasks]);

  if (dirLoading) return <PageLoader />;
  if (!direction) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Отдел не найден.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/plans")}>
          ← К списку отделов
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
        <div className="flex flex-wrap items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-muted-foreground"
            onClick={() => navigate("/plans")}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> К списку отделов
          </Button>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: direction.color }}
              />
              <span>Отдел</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{direction.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {head ? (
                <>Руководитель: <span className="text-foreground">{head}</span></>
              ) : (
                <span>Руководитель не назначен</span>
              )}
              <span>· Планов: {deptPlans.length}</span>
              <span>· Кварталов: {deptQuarters.length}</span>
            </div>
            {direction.description && (
              <p className="mt-2 text-sm text-muted-foreground">{direction.description}</p>
            )}
          </div>

          {canManage && (
            <Button size="sm" onClick={() => setCreatingTask(true)}>
              <Plus className="mr-1 h-4 w-4" /> Задача
            </Button>
          )}
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
          <StatCell label="Прогресс"        value={`${stats.progress}%`} bar={stats.progress} />
          <StatCell label="Всего"           value={stats.total} />
          <StatCell label="Завершено"       value={stats.completed}      tone="success" />
          <StatCell label="В работе"        value={stats.inProgress}     tone="info" />
          <StatCell label="Под риском"      value={stats.atRisk}         tone="warning" />
          <StatCell label="Просрочено"      value={stats.overdue}        tone="destructive" />
          <StatCell label="На согласовании" value={stats.onReview}       tone="info" />
          <StatCell label="На доработке"    value={stats.needsRevision}  tone="warning" />
          <StatCell
            label="Не начато"
            value={filteredTasks.filter((t) => t.status === "planned" || t.status === "backlog").length}
          />
        </div>

        {/* Quarter filter */}
        <div className="mt-4 inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["all", "Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuarterFilter(q)}
              className={cn(
                "h-7 rounded px-3 text-xs font-medium transition-colors",
                quarterFilter === q
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {q === "all" ? "Все кварталы" : q}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="p-4 sm:p-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-4 gap-1 bg-transparent p-0">
            <TabsTrigger value="tasks" className="gap-1.5 data-[state=active]:bg-muted">
              <CheckCircle2 className="h-3.5 w-3.5" /> Задачи
              <span className="ml-1 rounded-full bg-muted px-1 text-[10px] tabular-nums">
                {filteredTasks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="comments" className="gap-1.5 data-[state=active]:bg-muted">
              <MessageSquare className="h-3.5 w-3.5" /> Комментарии
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 data-[state=active]:bg-muted">
              <HistoryIcon className="h-3.5 w-3.5" /> История
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-1.5 data-[state=active]:bg-muted">
              <Trophy className="h-3.5 w-3.5" /> Итоги
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="animate-fade-in">
            <TasksTab
              tasks={filteredTasks}
              canEdit={canManage}
              onEdit={setEditingTask}
              quarterFilter={quarterFilter}
            />
          </TabsContent>
          <TabsContent value="comments" className="animate-fade-in">
            <DeptCommentsTab plans={deptPlans} />
          </TabsContent>
          <TabsContent value="history" className="animate-fade-in">
            <DeptHistoryTab plans={deptPlans} />
          </TabsContent>
          <TabsContent value="summary" className="animate-fade-in">
            <DeptSummaryTab
              plans={deptPlans}
              quarters={deptQuarters}
              statsByPlan={planStats}
              direction={direction}
            />
          </TabsContent>
        </Tabs>
      </div>

      <TaskDialog
        open={!!editingTask}
        onOpenChange={(v) => !v && setEditingTask(null)}
        task={editingTask}
      />
      <TaskDialog
        open={creatingTask}
        onOpenChange={setCreatingTask}
        defaults={{
          direction_id: direction.id,
        } as any}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Stat cell
// ---------------------------------------------------------------------------

function StatCell({
  label,
  value,
  bar,
  tone,
}: {
  label: string;
  value: string | number;
  bar?: number;
  tone?: "success" | "info" | "warning" | "destructive";
}) {
  const cls =
    tone === "success" ? "text-success" :
    tone === "info"    ? "text-info" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", cls)}>{value}</div>
      {typeof bar === "number" && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground/80" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks tab — таблица всех задач отдела с колонкой «Квартал»
// ---------------------------------------------------------------------------

type SortKey =
  | "title"
  | "quarter"
  | "status"
  | "priority"
  | "assignee"
  | "deadline"
  | "remark"
  | "outcome"
  | "created_at"
  | "updated_at";

function TasksTab({
  tasks,
  canEdit,
  onEdit,
  quarterFilter,
}: {
  tasks: Task[];
  canEdit: boolean;
  onEdit: (t: Task) => void;
  quarterFilter: string;
}) {
  const { map: userMap } = useUserMap();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "quarter",
    dir: "asc",
  });

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const filtered = useMemo(() => {
    let r = tasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((t) =>
        `${t.title} ${t.description ?? ""} ${t.latest_remark ?? ""} ${t.outcome ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (statusFilter.length > 0) {
      r = r.filter((t) => statusFilter.includes(t.status));
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
    const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
      title:      (a, b) => a.title.localeCompare(b.title) * dir,
      quarter:    (a, b) => compareQuarters(a.quarter ?? "", b.quarter ?? "") * dir,
      status:     (a, b) => a.status.localeCompare(b.status) * dir,
      priority:   (a, b) => a.priority.localeCompare(b.priority) * dir,
      assignee:   (a, b) => ((userMap.get(a.assignee_id ?? "") ?? a.assignee ?? "")
        .localeCompare(userMap.get(b.assignee_id ?? "") ?? b.assignee ?? "") * dir),
      deadline:   (a, b) => (ts(a.deadline) - ts(b.deadline)) * dir,
      remark:     (a, b) => (a.latest_remark ?? "").localeCompare(b.latest_remark ?? "") * dir,
      outcome:    (a, b) => (a.outcome ?? "").localeCompare(b.outcome ?? "") * dir,
      created_at: (a, b) => (ts(a.created_at) - ts(b.created_at)) * dir,
      updated_at: (a, b) => (ts(a.updated_at) - ts(b.updated_at)) * dir,
    };
    return [...r].sort(cmp[sort.key]);
  }, [tasks, search, statusFilter, sort, userMap]);

  const SortHead = ({ k, label }: { k: SortKey; label: string }) => (
    <TableHead
      onClick={() => toggleSort(k)}
      className="cursor-pointer select-none whitespace-nowrap hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.key === k && (
          <span className="text-[10px] text-muted-foreground">{sort.dir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </TableHead>
  );

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">
          {quarterFilter === "all"
            ? "У этого отдела пока нет задач."
            : `В выбранном квартале (${quarterFilter}) нет задач.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию, замечанию, итогу..."
          className="h-8 w-64 text-sm"
        />
        <MultiSelectPopover
          placeholder="Статус"
          options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          selected={statusFilter}
          onChange={setStatusFilter}
          triggerClassName="min-w-[140px]"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          Показано: {filtered.length} из {tasks.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="title"      label="Название" />
              <SortHead k="quarter"    label="Квартал" />
              <SortHead k="status"     label="Статус" />
              <SortHead k="priority"   label="Приоритет" />
              <SortHead k="assignee"   label="Ответственный" />
              <SortHead k="deadline"   label="Дедлайн" />
              <SortHead k="remark"     label="Комментарий" />
              <SortHead k="outcome"    label="Итог" />
              <SortHead k="created_at" label="Создана" />
              <SortHead k="updated_at" label="Обновлена" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => {
              const assigneeName = t.assignee_id
                ? userMap.get(t.assignee_id) ?? null
                : t.assignee;
              const overdue = isOverdue(t);
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onEdit(t)}
                >
                  <TableCell className="max-w-[260px]">
                    <div className="font-medium">{t.title}</div>
                    {t.description && (
                      <div className="truncate text-xs text-muted-foreground">{t.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {t.quarter ?? "—"}
                  </TableCell>
                  <TableCell>
                    <TaskStatusSelect task={t} disabled={!canEdit} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={t.priority} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {assigneeName ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-xs tabular-nums",
                      overdue ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {t.latest_remark ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {t.outcome ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {format(parseISO(t.created_at), "dd.MM.yyyy")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {format(parseISO(t.updated_at), "dd.MM.yyyy")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments tab — заглушка, ведёт на per-plan страницу
// ---------------------------------------------------------------------------

function DeptCommentsTab({ plans }: { plans: { id: string; quarter_id: string }[] }) {
  const navigate = useNavigate();
  const { data: quarters = [] } = useQuarters();
  const qById = new Map(quarters.map((q) => [q.id, q]));

  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        У отдела ещё нет планов — обсуждать пока нечего.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Комментарии хранятся внутри каждого квартального плана. Откройте нужный квартал,
        чтобы написать или прочитать обсуждение.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const q = qById.get(p.quarter_id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/plans/${p.id}?tab=comments`)}
              className="hover-lift rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Квартал
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {q ? quarterLabelRu(q.label) : "—"}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-foreground">
                <MessageSquare className="h-3 w-3" /> Открыть обсуждение
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab — аналогично, ссылки на per-plan history
// ---------------------------------------------------------------------------

function DeptHistoryTab({ plans }: { plans: { id: string; quarter_id: string }[] }) {
  const navigate = useNavigate();
  const { data: quarters = [] } = useQuarters();
  const qById = new Map(quarters.map((q) => [q.id, q]));

  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        Нет планов — нет и истории.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Подробная история изменений ведётся внутри каждого квартального плана.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const q = qById.get(p.quarter_id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/plans/${p.id}?tab=history`)}
              className="hover-lift rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Квартал
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {q ? quarterLabelRu(q.label) : "—"}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-foreground">
                <HistoryIcon className="h-3 w-3" /> Открыть историю
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary tab — итоги по каждому кварталу (с переходом на план)
// ---------------------------------------------------------------------------

function DeptSummaryTab({
  plans,
  quarters,
  statsByPlan,
  direction,
}: {
  plans: { id: string; quarter_id: string; status: string }[];
  quarters: { id: string; label: string }[];
  statsByPlan: DepartmentPlanStats[];
  direction: { name: string };
}) {
  const navigate = useNavigate();
  const statsMap = new Map(statsByPlan.map((s) => [s.plan_id, s]));

  if (quarters.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        У {direction.name} ещё нет планов с итогами.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {quarters.map((q) => {
        const plan = plans.find((p) => p.quarter_id === q.id);
        if (!plan) return null;
        const s = statsMap.get(plan.id);
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => navigate(`/plans/${plan.id}?tab=summary`)}
            className="hover-lift flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{quarterLabelRu(q.label)}</span>
                <PlanStatusBadge status={plan.status as any} />
              </div>
              {s && (
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {s.completed_tasks}/{s.total_tasks} задач · {s.progress_pct}%
                </div>
              )}
            </div>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
