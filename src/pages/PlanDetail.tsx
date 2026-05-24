import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trophy,
  History as HistoryIcon,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { PriorityBadge } from "@/components/StatusBadge";
import { TaskStatusSelect } from "@/components/TaskStatusSelect";
import { isOverdue, taskTableClasses as tt } from "@/lib/utils";
import { STATUSES } from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageLoader, Spinner } from "@/components/UiState";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { Label } from "@/components/ui/label";
import { TaskDialog } from "@/components/TaskDialog";
import {
  PLAN_STATUS_LABELS,
  PLAN_OUTCOME_FIELDS,
  type PlanStatus,
  type PlanOutcomeField,
  type DepartmentPlan,
  useAddPlanComment,
  useDeletePlanComment,
  usePlan,
  usePlanActivity,
  usePlanComments,
  usePlanStats,
  useUpdatePlanOutcomes,
  useUpdatePlanStatus,
  COMMENT_KIND_LABELS,
} from "@/hooks/usePlans";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useUserMap } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useUserRole";
import { quarterLabelRu } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();

  const { data: plan, isLoading } = usePlan(id ?? null);
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: tasks = [] } = useTasks(true);
  const { data: stats = [] } = usePlanStats();
  const { map: userMap } = useUserMap();

  const direction = plan ? directions.find((d) => d.id === plan.direction_id) : null;
  const quarter   = plan ? quarters.find((q) => q.id === plan.quarter_id) : null;
  const planStats = plan ? stats.find((s) => s.plan_id === plan.id) : null;
  const author    = plan?.created_by ? userMap.get(plan.created_by) ?? null : null;
  const head      = direction?.head_user_id ? userMap.get(direction.head_user_id) ?? null : null;
  const planTasks = useMemo(
    () => (plan ? tasks.filter((t) => t.plan_id === plan.id) : []),
    [tasks, plan],
  );

  // Permissions: admin/superadmin do anything; the plan's author or the
  // department head can edit and submit; everyone else read-only.
  const canManage = isAdmin;
  const isOwner = !!user && (plan?.created_by === user.id || direction?.head_user_id === user.id);
  const canEdit = canManage || isOwner;

  const updateStatus = useUpdatePlanStatus();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const [actionDialog, setActionDialog] = useState<null | "submit" | "approve" | "request_changes" | "complete" | "to_progress">(null);
  const [actionComment, setActionComment] = useState("");

  if (isLoading) return <PageLoader />;
  if (!plan) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">План не найден.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/plans")}>
          ← К списку планов
        </Button>
      </div>
    );
  }

  // Основной сценарий теперь живёт на /departments/:id?quarter=Qx&tab=...
  // Старая страница /plans/:id используется только как переход
  // из легаси-уведомлений и закладок — редиректим на правильный URL,
  // сохраняя выбранную вкладку (?tab=...), если она была.
  if (direction) {
    const search = new URLSearchParams(location.search);
    const prefix = quarter?.label.match(/^(Q[1-4])/i)?.[1].toUpperCase();
    const tab = search.get("tab") ?? "tasks";
    const params = new URLSearchParams();
    if (prefix) params.set("quarter", prefix);
    if (tab !== "tasks") params.set("tab", tab);
    return (
      <Navigate
        to={`/departments/${direction.id}${params.toString() ? `?${params.toString()}` : ""}`}
        replace
      />
    );
  }

  const openAction = (kind: typeof actionDialog) => {
    setActionDialog(kind);
    setActionComment("");
  };

  const runAction = async () => {
    if (!actionDialog || !plan) return;
    const map: Record<NonNullable<typeof actionDialog>, { status: PlanStatus; kind?: any; is_final?: boolean; required?: boolean }> = {
      submit:           { status: "on_review",         kind: "submit" },
      approve:          { status: "approved",          kind: "approve" },
      request_changes:  { status: "changes_requested", kind: "request_changes", required: true },
      complete:         { status: "completed",         kind: "final_review",    is_final: true, required: true },
      to_progress:      { status: "in_progress",       kind: "comment" },
    };
    const cfg = map[actionDialog];
    if (cfg.required && actionComment.trim().length === 0) return;
    await updateStatus
      .mutateAsync({
        plan_id: plan.id,
        status: cfg.status,
        comment: actionComment.trim() || undefined,
        kind: cfg.kind,
        is_final: cfg.is_final,
      })
      .catch(() => {});
    setActionDialog(null);
  };

  return (
    <>
      <div className="border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
        <div className="flex flex-wrap items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-muted-foreground"
            onClick={() => navigate("/plans")}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> К списку
          </Button>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {direction && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: direction.color }} />
                  <span className="font-medium">{direction.name}</span>
                </span>
              )}
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {quarter ? quarterLabelRu(quarter.label) : "—"}
              </span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {direction?.name} — {quarter ? quarterLabelRu(quarter.label) : "—"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <PlanStatusBadge status={plan.status} />
              {head && <>· Руководитель: <span className="text-foreground">{head}</span></>}
              {author && head !== author && <>· Автор: {author}</>}
              <>· Обновлён {formatDistanceToNow(parseISO(plan.updated_at), { addSuffix: true, locale: ru })}</>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (plan.status === "draft" || plan.status === "changes_requested") && (
              <Button onClick={() => openAction("submit")} size="sm">
                <Send className="mr-1 h-4 w-4" /> Отправить на согласование
              </Button>
            )}
            {canManage && plan.status === "on_review" && (
              <>
                <Button onClick={() => openAction("approve")} size="sm">
                  <ShieldCheck className="mr-1 h-4 w-4" /> Утвердить
                </Button>
                <Button onClick={() => openAction("request_changes")} size="sm" variant="outline">
                  <RefreshCcw className="mr-1 h-4 w-4" /> Вернуть на доработку
                </Button>
              </>
            )}
            {canEdit && plan.status === "approved" && (
              <Button onClick={() => openAction("to_progress")} size="sm" variant="outline">
                В работу
              </Button>
            )}
            {canEdit && plan.status !== "completed" && plan.status !== "archived" && (
              <Button onClick={() => openAction("complete")} size="sm" variant="ghost">
                <Trophy className="mr-1 h-4 w-4" /> Завершить
              </Button>
            )}
          </div>
        </div>

        {/* Stats strip. `planStats` приходит от usePlanStats (view'ха в БД)
            и не содержит счётчиков «Не начато» / «На согласовании» /
            «На доработке», поэтому считаем их клиентом из `planTasks`. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          <StatCell label="Прогресс"        value={`${planStats?.progress_pct ?? 0}%`} bar={planStats?.progress_pct ?? 0} />
          <StatCell label="Всего"           value={planStats?.total_tasks ?? 0} />
          <StatCell label="Завершено"       value={planStats?.completed_tasks ?? 0}                                          tone="success" />
          <StatCell label="В работе"        value={planStats?.in_progress_tasks ?? 0}                                       tone="info" />
          <StatCell label="Не начато"       value={planTasks.filter((t) => t.status === "backlog" || t.status === "planned").length} />
          <StatCell label="На согласовании" value={planTasks.filter((t) => t.status === "in_review").length}                tone="info" />
          <StatCell label="На доработке"    value={planTasks.filter((t) => t.status === "needs_revision").length}           tone="warning" />
          <StatCell label="Под риском"      value={planStats?.at_risk_tasks ?? 0}                                            tone="warning" />
          <StatCell label="Просрочено"      value={planStats?.overdue_tasks ?? 0}                                            tone="destructive" />
        </div>
      </div>

      <div className="p-4 sm:p-8">
        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="mb-4 bg-transparent p-0 gap-1">
            <TabsTrigger value="tasks" className="gap-1.5 data-[state=active]:bg-muted">
              <CheckCircle2 className="h-3.5 w-3.5" /> Задачи
              <span className="ml-1 rounded-full bg-muted px-1 text-[10px] tabular-nums">{planTasks.length}</span>
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
              plan={plan}
              tasks={planTasks}
              direction={direction}
              canEdit={canEdit}
              onEdit={setEditingTask}
              onCreate={() => setCreatingTask(true)}
            />
          </TabsContent>
          <TabsContent value="comments" className="animate-fade-in">
            <CommentsTab plan={plan} canEdit={canEdit || canManage} />
          </TabsContent>
          <TabsContent value="history" className="animate-fade-in">
            <HistoryTab plan={plan} />
          </TabsContent>
          <TabsContent value="summary" className="animate-fade-in">
            <OutcomesTab plan={plan} canEdit={canEdit || canManage} />
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
          plan_id: plan.id,
          direction_id: plan.direction_id,
          quarter: quarter?.label ?? "",
        } as any}
      />

      {/* Action dialogs */}
      <AlertDialog open={!!actionDialog} onOpenChange={(v) => !v && setActionDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog === "submit" && "Отправить на согласование?"}
              {actionDialog === "approve" && "Утвердить план?"}
              {actionDialog === "request_changes" && "Вернуть на доработку"}
              {actionDialog === "complete" && "Завершить план"}
              {actionDialog === "to_progress" && "Перевести в работу?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog === "request_changes" && "Опишите, что нужно доработать. Комментарий обязателен."}
              {actionDialog === "complete" && "Добавьте итоговый комментарий по кварталу. Это поле обязательно."}
              {actionDialog === "submit" && "Супер-админ и админы получат уведомление о согласовании."}
              {actionDialog === "approve" && "Руководитель отдела получит уведомление об утверждении."}
              {actionDialog === "to_progress" && "План перейдёт в статус «В работе»."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(actionDialog === "request_changes" || actionDialog === "complete" ||
            actionDialog === "submit" || actionDialog === "approve" || actionDialog === "to_progress") && (
            <Textarea
              autoFocus
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              rows={4}
              placeholder={
                actionDialog === "request_changes"
                  ? "Что нужно доработать..."
                  : actionDialog === "complete"
                  ? "Итоги квартала: что выполнено, что не получилось, выводы..."
                  : "Комментарий (необязательно)..."
              }
              className="mt-2"
            />
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runAction();
              }}
              disabled={
                updateStatus.isPending ||
                ((actionDialog === "request_changes" || actionDialog === "complete") &&
                  actionComment.trim().length === 0)
              }
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
// Tabs
// ---------------------------------------------------------------------------

/**
 * Plan-level task list.
 *
 * Phase 1 редизайна: вместо карточек — полноценная таблица со всеми
 * колонками из ТЗ (Название, Статус, Приоритет, Ответственный, Дедлайн,
 * Комментарий, Итог, Дата создания, Дата обновления). Сверху — поиск и
 * multi-select по статусу; колонки кликабельны для сортировки. Клик по
 * строке открывает TaskDialog, где можно редактировать те же поля, плюс
 * latest_remark и outcome.
 *
 * Канбан-режим, скрытие/перестановка колонок и массовые действия —
 * в Phase 2.
 */
function TasksTab({
  tasks,
  canEdit,
  onEdit,
  onCreate,
}: {
  plan: { id: string };
  tasks: Task[];
  direction: any;
  canEdit: boolean;
  onEdit: (t: Task) => void;
  onCreate: () => void;
}) {
  const { map: userMap } = useUserMap();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  type SortKey =
    | "title"
    | "status"
    | "priority"
    | "assignee"
    | "deadline"
    | "remark"
    | "outcome"
    | "created_at"
    | "updated_at";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "updated_at",
    dir: "desc",
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
      <span
        className={cn(
          "inline-flex items-center gap-1",
          align === "center" && "justify-center",
        )}
      >
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
        <p className="mb-3 text-sm text-muted-foreground">В плане ещё нет задач</p>
        {canEdit && (
          <Button onClick={onCreate} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Добавить задачу
          </Button>
        )}
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
        {canEdit && (
          <Button onClick={onCreate} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Добавить задачу
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="title"      label="Название"     align="left" />
              <SortHead k="status"     label="Статус" />
              <SortHead k="priority"   label="Приоритет" />
              <SortHead k="assignee"   label="Ответственный" />
              <SortHead k="deadline"   label="Дедлайн" />
              <SortHead k="remark"     label="Комментарий"  align="left" />
              <SortHead k="outcome"    label="Итог"         align="left" />
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
                  <TableCell className={cn(tt.cellLeft, "min-w-[260px] max-w-[440px]")}>
                    <div className="whitespace-normal break-words font-medium" title={t.title}>
                      {t.title}
                    </div>
                    {t.description && (
                      <div
                        className="line-clamp-2 whitespace-normal break-words text-xs text-muted-foreground"
                        title={t.description}
                      >
                        {t.description}
                      </div>
                    )}
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
                  <TableCell className={cn(tt.cellCenter, "text-sm text-muted-foreground")}>
                    {assigneeName ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      tt.cellCenter,
                      "whitespace-nowrap text-sm text-muted-foreground",
                      overdue && "font-medium text-destructive",
                    )}
                  >
                    {t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}
                  </TableCell>
                  <TableCell className={cn(tt.cellLeft, "max-w-[200px] text-sm")}>
                    {t.latest_remark ? (
                      <span className="block truncate text-muted-foreground" title={t.latest_remark}>
                        {t.latest_remark}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className={cn(tt.cellLeft, "max-w-[200px] text-sm")}>
                    {t.outcome ? (
                      <span className="block truncate text-muted-foreground" title={t.outcome}>
                        {t.outcome}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
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
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Под текущие фильтры задач не найдено.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CommentsTab({ plan, canEdit }: { plan: { id: string }; canEdit: boolean }) {
  const { data: items = [], isLoading } = usePlanComments(plan.id);
  const add = useAddPlanComment();
  const del = useDeletePlanComment();
  const { user } = useAuth();
  const [text, setText] = useState("");

  // Hide raw status_change rows from the comments tab — they live in the
  // History tab. The user-facing stream is conversation only.
  const filtered = items.filter((c) => c.kind !== "status_change");

  const submit = async () => {
    if (!text.trim()) return;
    await add.mutateAsync({ plan_id: plan.id, content: text.trim(), kind: "comment" });
    setText("");
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <Textarea
            rows={3}
            placeholder="Комментарий, замечание, вопрос... (⌘+Enter — отправить)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button size="sm" onClick={submit} disabled={!text.trim() || add.isPending} className="w-full">
            {add.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            Добавить комментарий
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Комментариев пока нет</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const accent =
              c.kind === "request_changes" ? "border-warning/40 bg-warning/5" :
              c.kind === "approve"         ? "border-success/40 bg-success/5" :
              c.kind === "submit"          ? "border-info/40 bg-info/5" :
              c.kind === "final_review"    ? "border-foreground/30 bg-foreground/5" :
              "border-border bg-card";
            const mine = user?.id === c.author_id;
            return (
              <li key={c.id} className={cn("rounded-lg border p-3", accent)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="font-medium">{c.author_name ?? "—"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {format(parseISO(c.created_at), "dd.MM.yyyy HH:mm")}
                      </span>
                      {c.kind !== "comment" && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {COMMENT_KIND_LABELS[c.kind]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                  </div>
                  {(mine || canEdit) && (
                    <button
                      onClick={() => del.mutate({ id: c.id, plan_id: plan.id })}
                      className="text-muted-foreground hover:text-destructive"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({ plan }: { plan: { id: string } }) {
  const { data: comments = [] } = usePlanComments(plan.id);
  const { data: actions = [] } = usePlanActivity(plan.id);
  const { map: userMap } = useUserMap();

  // Merge status_change comments + audit log entries into one timeline.
  const events = useMemo(() => {
    const fromComments = comments
      .filter((c) => c.kind === "status_change" || c.kind === "approve" || c.kind === "request_changes" || c.kind === "submit")
      .map((c) => ({
        id: c.id,
        actor: c.author_id ? userMap.get(c.author_id) ?? null : c.author_name,
        text: c.content,
        kind: c.kind,
        created_at: c.created_at,
      }));
    const fromAudit = actions.map((a) => ({
      id: a.id,
      actor: a.actor_id ? userMap.get(a.actor_id) ?? null : null,
      text:
        a.action === "plan_status_changed"
          ? `Статус: ${PLAN_STATUS_LABELS[(a.details as any).from as PlanStatus] ?? (a.details as any).from} → ${PLAN_STATUS_LABELS[(a.details as any).to as PlanStatus] ?? (a.details as any).to}`
          : a.action,
      kind: "audit" as const,
      created_at: a.created_at,
    }));
    // De-dupe — both sources record the same status flip; prefer audit.
    const seen = new Set<string>();
    const all = [...fromAudit, ...fromComments]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return all.filter((e) => {
      const key = `${e.created_at.slice(0, 19)}::${e.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [comments, actions, userMap]);

  if (events.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">История пока пуста</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <HistoryIcon className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              <span className="font-medium">{e.actor ?? "—"}</span>{" "}
              <span className="text-muted-foreground">{e.text}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true, locale: ru })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Итоги» — структурированный пост-мортем квартала по 8 полям из ТЗ.
 * Сохраняется на самом плане (`department_plans.outcome_*`). Каждое
 * поле редактируется отдельно и сохраняется кнопкой «Сохранить итоги».
 *
 * Версионирование изменений вкладки — в Phase 2 (отдельная таблица
 * outcomes_history). Пока правки видны через стандартный updated_at
 * на плане и через события комментариев final_review.
 */
function OutcomesTab({ plan, canEdit }: { plan: DepartmentPlan; canEdit: boolean }) {
  const update = useUpdatePlanOutcomes();
  const [form, setForm] = useState<Record<PlanOutcomeField, string>>(() => {
    const acc = {} as Record<PlanOutcomeField, string>;
    PLAN_OUTCOME_FIELDS.forEach((f) => {
      acc[f.key] = (plan as any)[f.key] ?? "";
    });
    return acc;
  });
  const [savedSnapshot, setSavedSnapshot] = useState(form);

  const dirty = PLAN_OUTCOME_FIELDS.some((f) => form[f.key] !== savedSnapshot[f.key]);

  const save = async () => {
    const patch: Partial<Record<PlanOutcomeField, string | null>> = {};
    PLAN_OUTCOME_FIELDS.forEach((f) => {
      if (form[f.key] !== savedSnapshot[f.key]) {
        patch[f.key] = form[f.key].trim() || null;
      }
    });
    if (Object.keys(patch).length === 0) return;
    await update.mutateAsync({ plan_id: plan.id, patch });
    setSavedSnapshot({ ...form });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {PLAN_OUTCOME_FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5 rounded-lg border border-border bg-card p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </Label>
            <Textarea
              rows={4}
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              disabled={!canEdit}
              placeholder={canEdit ? "Заполните по итогам квартала..." : "—"}
            />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
          <span className="mr-auto text-xs text-muted-foreground">
            {dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
          </span>
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trophy className="mr-1 h-3.5 w-3.5" />
            )}
            Сохранить итоги
          </Button>
        </div>
      )}
    </div>
  );
}
