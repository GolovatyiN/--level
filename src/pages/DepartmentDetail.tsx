import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  History as HistoryIcon,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trophy,
} from "lucide-react";

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
import { PageLoader } from "@/components/UiState";
import { PriorityBadge } from "@/components/StatusBadge";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { PlanOutcomesForm } from "@/components/PlanOutcomesForm";
import { PlanHistoryTimeline } from "@/components/PlanHistoryTimeline";
import { TaskStatusSelect } from "@/components/TaskStatusSelect";
import { TaskDialog } from "@/components/TaskDialog";
import { InlineAssigneeEditor, InlineDirectionTagEditor } from "@/components/InlineTaskEditors";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import { useTasks, useUpdateTask, type Task } from "@/hooks/useTasks";
import { toast } from "sonner";
import {
  type DepartmentPlan,
  type DepartmentPlanStats,
  type PlanStatus,
  useCreatePlan,
  usePlans,
  usePlanStats,
  useUpdatePlanStatus,
} from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";
import { useCanEditDirection, useCanManage } from "@/hooks/useUserRole";
import { compareQuarters, STATUSES, quarterLabelRu } from "@/lib/constants";
import { cn, isOverdue, taskTableClasses as tt } from "@/lib/utils";

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
  const [searchParams, setSearchParams] = useSearchParams();
  // canManage — admin/superadmin. Только они утверждают планы,
  // возвращают на доработку, завершают и управляют отделом целиком.
  const canManage = useCanManage();
  // canEdit — может ли пользователь редактировать данные внутри
  // выбранного отдела (создавать планы, задачи, отправлять план на
  // согласование). Включает admin + dept head + user_department_access
  // edit/full.
  const canEdit = useCanEditDirection(id);

  const { data: directions = [], isLoading: dirLoading } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [] } = usePlans();
  const { data: planStats = [] } = usePlanStats();
  const { data: allTasks = [] } = useTasks(true);
  const { map: userMap } = useUserMap();

  // Q1 / Q2 / Q3 / Q4 (по префиксу label) для фильтра. Год хранить не
  // нужно — пользователь выбирает «квартал по номеру».
  // Квартал и активная вкладка — синхронизируются с URL, чтобы дашборд
  // мог глубоко линковаться, например /departments/<id>?quarter=Q3&tab=tasks.
  const quarterFilter = useMemo<"all" | "Q1" | "Q2" | "Q3" | "Q4">(() => {
    const raw = searchParams.get("quarter")?.toUpperCase() ?? "all";
    return (["Q1", "Q2", "Q3", "Q4"].includes(raw) ? raw : "all") as any;
  }, [searchParams]);
  const tab = useMemo(() => {
    const raw = searchParams.get("tab") ?? "tasks";
    return ["tasks", "comments", "history", "summary"].includes(raw) ? raw : "tasks";
  }, [searchParams]);

  const setUrlParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === "" || value === "all" || value === "tasks") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const setQuarterFilter = (v: "all" | "Q1" | "Q2" | "Q3" | "Q4") => setUrlParam("quarter", v);
  const setTab = (v: string) => setUrlParam("tab", v);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  // Plan action: модалка с подтверждением + (опционально) обязательный
  // комментарий-замечание. См. блок PlanControls ниже.
  const [planAction, setPlanAction] = useState<null | "submit" | "approve" | "request_changes" | "complete">(null);
  const [actionComment, setActionComment] = useState("");

  const createPlan = useCreatePlan();
  const updateStatus = useUpdatePlanStatus();

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

  // Если выбран конкретный квартал — находим план отдела для этого квартала,
  // чтобы показать рядом статус и кнопки действий (отправить на согласование,
  // утвердить и т.д.). Если планов несколько (например Q1 2025 и Q1 2026) —
  // берём самый свежий по created_at.
  const selectedPlan = useMemo<DepartmentPlan | null>(() => {
    if (quarterFilter === "all") return null;
    const matchingQuarterIds = new Set(
      quarters
        .filter((q) => q.label.toUpperCase().startsWith(quarterFilter + " "))
        .map((q) => q.id),
    );
    const candidates = deptPlans.filter((p) => matchingQuarterIds.has(p.quarter_id));
    if (candidates.length === 0) return null;
    return [...candidates].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [quarterFilter, quarters, deptPlans]);

  // Если плана для выбранного Q ещё нет — на какой именно quarter_id
  // (год) создать новый. Берём первый квартал по сортировке, у которого
  // префикс совпадает и для отдела нет плана.
  const targetQuarterForCreate = useMemo(() => {
    if (quarterFilter === "all") return null;
    const candidates = quarters
      .filter((q) => q.label.toUpperCase().startsWith(quarterFilter + " "))
      .sort((a, b) => (a.sort_key ?? a.label).localeCompare(b.sort_key ?? b.label));
    return (
      candidates.find((q) => !deptPlans.some((p) => p.quarter_id === q.id)) ??
      candidates[0] ??
      null
    );
  }, [quarterFilter, quarters, deptPlans]);

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

  // Создание плана «Взять в работу» — пишет план в статус draft и
  // обновляет deptPlans через инвалидацию useQuery.
  const onTakeToWork = async () => {
    if (!targetQuarterForCreate || !direction) return;
    await createPlan
      .mutateAsync({
        direction_id: direction.id,
        quarter_id: targetQuarterForCreate.id,
        description: null,
      })
      .catch(() => null);
  };

  // Сколько задач в этом плане имеют замечание-комментарий.
  // Используется для валидации «На доработку».
  const tasksWithRemark = useMemo(
    () => filteredTasks.filter((t) => !!t.latest_remark?.trim()).length,
    [filteredTasks],
  );

  // Есть ли заполненные итоги. Если хоть одно поле непустое — считаем
  // что итоги есть; для confirmation modal при «Завершить».
  const hasFilledOutcomes = useMemo(() => {
    if (!selectedPlan) return false;
    return [
      selectedPlan.outcome_planned,
      selectedPlan.outcome_done,
      selectedPlan.outcome_not_done,
      selectedPlan.outcome_not_done_reason,
      selectedPlan.outcome_achievements,
      selectedPlan.outcome_problems,
      selectedPlan.outcome_conclusions,
      selectedPlan.outcome_next_quarter,
    ].some((v) => !!v?.trim());
  }, [selectedPlan]);

  // Открыть модалку нужного действия. «На доработку» сначала проверяет,
  // есть ли замечания по задачам — без них отправка лишена смысла.
  const openAction = (kind: NonNullable<typeof planAction>) => {
    if (kind === "request_changes" && tasksWithRemark === 0) {
      toast.error(
        "Добавьте замечание хотя бы к одной задаче (колонка «Комментарий»), чтобы отправить план на доработку.",
      );
      return;
    }
    setPlanAction(kind);
    setActionComment("");
  };

  const runAction = async () => {
    if (!planAction || !selectedPlan) return;
    const map: Record<NonNullable<typeof planAction>, {
      status: PlanStatus;
      kind?: any;
      is_final?: boolean;
    }> = {
      submit:          { status: "on_review",         kind: "submit" },
      approve:         { status: "approved",          kind: "approve" },
      request_changes: { status: "changes_requested", kind: "request_changes" },
      complete:        { status: "completed",         kind: "final_review",   is_final: true },
    };
    const cfg = map[planAction];
    await updateStatus
      .mutateAsync({
        plan_id: selectedPlan.id,
        status: cfg.status,
        comment: actionComment.trim() || undefined,
        kind: cfg.kind,
        is_final: cfg.is_final,
      })
      .catch(() => {});
    setPlanAction(null);
  };

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

          {canEdit && (
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

        {/* Quarter filter + plan controls для выбранного квартала */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
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

          {/* Plan controls — действия по выбранному кварталу */}
          {quarterFilter !== "all" && (
            <PlanControls
              plan={selectedPlan}
              canEdit={canEdit}
              canManage={canManage}
              targetQuarterLabel={targetQuarterForCreate?.label ?? quarterFilter}
              onTakeToWork={onTakeToWork}
              takingToWork={createPlan.isPending}
              onSubmit={() => openAction("submit")}
              onApprove={() => openAction("approve")}
              onRequestChanges={() => openAction("request_changes")}
              onComplete={() => openAction("complete")}
            />
          )}
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
              canEdit={canEdit}
              onEdit={setEditingTask}
              quarterFilter={quarterFilter}
            />
          </TabsContent>
          <TabsContent value="comments" className="animate-fade-in">
            <DeptCommentsTab plans={deptPlans} />
          </TabsContent>
          <TabsContent value="history" className="animate-fade-in">
            {/* Конкретный квартал → встроенный timeline только по нему.
                «Все кварталы» → карточки с переходом в per-plan историю. */}
            {quarterFilter !== "all" && selectedPlan ? (
              <PlanHistoryTimeline planId={selectedPlan.id} />
            ) : (
              <DeptHistoryTab plans={deptPlans} />
            )}
          </TabsContent>
          <TabsContent value="summary" className="animate-fade-in">
            {/* Если выбран конкретный квартал и план существует —
                рендерим 8-блочную форму итогов прямо здесь.
                Иначе — список итогов по кварталам. */}
            {quarterFilter !== "all" && selectedPlan ? (
              <PlanOutcomesForm plan={selectedPlan} canEdit={canEdit} />
            ) : (
              <DeptSummaryTab
                plans={deptPlans}
                quarters={deptQuarters}
                statsByPlan={planStats}
                direction={direction}
              />
            )}
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

      {/* Plan-action dialog. Лёгкий confirmation с опциональным
          комментарием. Итоги квартала редактируются на вкладке «Итоги»,
          а не в этом модале. После submit useUpdatePlanStatus сам
          разошлёт уведомления, обновит history и инвалидирует кэш. */}
      <AlertDialog open={!!planAction} onOpenChange={(v) => !v && setPlanAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {planAction === "submit" && "Отправить на согласование?"}
              {planAction === "approve" && "Утвердить квартал?"}
              {planAction === "request_changes" && "Вернуть на доработку?"}
              {planAction === "complete" && "Завершить квартал?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {planAction === "submit" && "Супер-админ и админы получат уведомление о согласовании."}
              {planAction === "approve" && "Руководитель отдела получит уведомление об утверждении."}
              {planAction === "request_changes" && (
                <>
                  Замечания по задачам уже сохранены ({tasksWithRemark}{" "}
                  {tasksWithRemark === 1 ? "задача" : tasksWithRemark < 5 ? "задачи" : "задач"}).
                  Они станут видны руководителю отдела, и план получит статус «На доработке».
                </>
              )}
              {planAction === "complete" &&
                (hasFilledOutcomes
                  ? "Итоги уже заполнены на вкладке «Итоги». План будет помечен как завершённый."
                  : "Итоги квартала ещё не заполнены. Можно завершить план без них или сначала перейти к вкладке «Итоги».")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Короткий комментарий-подтверждение — необязательный, только
              для «Submit» / «Approve». Для «Request changes» и «Complete»
              комментарий не нужен — данные уже на вкладках «Задачи» /
              «Итоги» соответственно. */}
          {(planAction === "submit" || planAction === "approve") && (
            <Textarea
              autoFocus
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              rows={3}
              placeholder="Комментарий (необязательно)..."
              className="mt-2"
            />
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Отмена</AlertDialogCancel>
            {planAction === "complete" && !hasFilledOutcomes && (
              <Button
                variant="outline"
                onClick={() => {
                  setPlanAction(null);
                  setTab("summary");
                }}
                disabled={updateStatus.isPending}
              >
                Перейти к итогам
              </Button>
            )}
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runAction();
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {planAction === "complete" && !hasFilledOutcomes
                ? "Завершить без итогов"
                : "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Plan controls — кнопки действий по выбранному кварталу
// ---------------------------------------------------------------------------

function PlanControls({
  plan,
  canEdit,
  canManage,
  targetQuarterLabel,
  onTakeToWork,
  takingToWork,
  onSubmit,
  onApprove,
  onRequestChanges,
  onComplete,
}: {
  plan: DepartmentPlan | null;
  /** Может редактировать (admin OR head of dept OR edit-access). */
  canEdit: boolean;
  /** Только admin/superadmin — утверждение, доработка, завершение. */
  canManage: boolean;
  targetQuarterLabel: string;
  onTakeToWork: () => void;
  takingToWork: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
  onComplete: () => void;
}) {
  // Нет плана для выбранного квартала — кнопка «Взять в работу»
  // создаёт новый план в статусе draft. Доступна руководителю отдела
  // и админу (canEdit).
  if (!plan) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">
          Плана на {targetQuarterLabel} пока нет.
        </span>
        {canEdit && (
          <Button size="sm" onClick={onTakeToWork} disabled={takingToWork}>
            {takingToWork && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Взять в работу
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
      <span className="text-xs text-muted-foreground">Статус плана:</span>
      <PlanStatusBadge status={plan.status} />

      {/* «Отправить на согласование» / «Отправить повторно» — это
          действие руководителя отдела. Доступно canEdit. */}
      {canEdit && (plan.status === "draft" || plan.status === "changes_requested") && (
        <Button size="sm" onClick={onSubmit}>
          <Send className="mr-1 h-3.5 w-3.5" />
          {plan.status === "changes_requested"
            ? "Отправить повторно"
            : "Отправить на согласование"}
        </Button>
      )}

      {/* «Утвердить» и «На доработку» — только админ. */}
      {canManage && plan.status === "on_review" && (
        <>
          <Button size="sm" onClick={onApprove}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Утвердить
          </Button>
          <Button size="sm" variant="outline" onClick={onRequestChanges}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> На доработку
          </Button>
        </>
      )}

      {/* «Завершить» — только админ; руководитель отдела не завершает. */}
      {canManage &&
        (plan.status === "approved" ||
          plan.status === "in_progress" ||
          plan.status === "at_risk" ||
          plan.status === "blocked") && (
          <Button size="sm" variant="outline" onClick={onComplete}>
            <Trophy className="mr-1 h-3.5 w-3.5" /> Завершить
          </Button>
        )}

      {plan.status === "completed" && (
        <span className="text-xs text-muted-foreground">только просмотр</span>
      )}
    </div>
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
              <SortHead k="title"      label="Название"     align="left" />
              <TableHead className={tt.headLeft}>Направление</TableHead>
              <SortHead k="quarter"    label="Квартал" />
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
              const overdue = isOverdue(t);
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onEdit(t)}
                >
                  <TableCell className={cn(tt.cellLeft, "min-w-[260px] max-w-[440px]")}>
                    {/* Длинные названия задач теперь переносятся по словам,
                        а не обрезаются (раньше truncate скрывал хвост). */}
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
                  <TableCell
                    className={cn(tt.cellLeft, "whitespace-nowrap text-xs")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InlineDirectionTagEditor task={t} disabled={!canEdit} />
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
                  <TableCell
                    className={cn(tt.cellCenter, "whitespace-nowrap text-xs text-muted-foreground")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InlineAssigneeEditor task={t} disabled={!canEdit} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      tt.cellCenter,
                      "whitespace-nowrap text-xs tabular-nums",
                      overdue ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {t.deadline ? format(parseISO(t.deadline), "dd.MM.yyyy") : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(tt.cellLeft, "max-w-[200px] text-xs text-muted-foreground")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RemarkEditor task={t} disabled={!canEdit} />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// RemarkEditor — инлайн-edit поля latest_remark прямо в таблице
// ---------------------------------------------------------------------------

function RemarkEditor({ task, disabled }: { task: Task; disabled: boolean }) {
  const update = useUpdateTask();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(task.latest_remark ?? "");

  // Если кто-то меняет задачу из другого места (модалка, статус-смена) —
  // подтягиваем актуальное значение, когда popover закрыт.
  useEffect(() => {
    if (!open) setValue(task.latest_remark ?? "");
  }, [task.latest_remark, open]);

  const save = () => {
    const trimmed = value.trim();
    const current = task.latest_remark ?? "";
    if (trimmed !== current) {
      update.mutate({
        id: task.id,
        patch: { latest_remark: trimmed || null },
        prev: task,
      });
    }
    setOpen(false);
  };

  if (disabled) {
    return (
      <div className="truncate" title={task.latest_remark ?? undefined}>
        {task.latest_remark ?? "—"}
      </div>
    );
  }

  // Триггер — узкая строка в ячейке (truncate с tooltip). Popover открывает
  // полноразмерный textarea с кнопками «Сохранить» / «Отмена».
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full min-w-0 truncate rounded text-left transition-colors hover:bg-muted/60 hover:text-foreground"
          title={task.latest_remark ?? "Кликните, чтобы добавить замечание"}
        >
          {task.latest_remark || (
            <span className="text-muted-foreground/60 italic">добавить замечание</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-[420px] p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">
            Замечание руководителя
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            Cmd/Ctrl+Enter — сохранить · Esc — отмена
          </span>
        </div>
        <Textarea
          autoFocus
          rows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setValue(task.latest_remark ?? "");
              setOpen(false);
            }
          }}
          placeholder="Что нужно поправить, на что обратить внимание..."
          className="text-sm"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {task.latest_remark && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                update.mutate({
                  id: task.id,
                  patch: { latest_remark: null },
                  prev: task,
                });
                setOpen(false);
              }}
              className="text-muted-foreground"
            >
              Удалить
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(task.latest_remark ?? "");
              setOpen(false);
            }}
          >
            Отмена
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={update.isPending}>
            Сохранить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
