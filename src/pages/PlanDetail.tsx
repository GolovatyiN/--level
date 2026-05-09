import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import {
  PLAN_STATUS_LABELS,
  type PlanStatus,
  useAddPlanComment,
  useDeletePlanComment,
  usePlan,
  usePlanActivity,
  usePlanComments,
  usePlanStats,
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

        {/* Stats strip */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell label="Прогресс"   value={`${planStats?.progress_pct ?? 0}%`} bar={planStats?.progress_pct ?? 0} />
          <StatCell label="Всего"      value={planStats?.total_tasks ?? 0} />
          <StatCell label="Завершено"  value={planStats?.completed_tasks ?? 0}  tone="success" />
          <StatCell label="В работе"   value={planStats?.in_progress_tasks ?? 0} tone="info" />
          <StatCell label="Под риском" value={planStats?.at_risk_tasks ?? 0}    tone="warning" />
          <StatCell label="Просрочено" value={planStats?.overdue_tasks ?? 0}    tone="destructive" />
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
            <SummaryTab plan={plan} canEdit={canEdit || canManage} />
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

function TasksTab({
  plan,
  tasks,
  direction,
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
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={onCreate} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Добавить задачу
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} direction={direction} onClick={() => onEdit(t)} />
        ))}
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

function SummaryTab({ plan, canEdit }: { plan: { id: string }; canEdit: boolean }) {
  const { data: items = [] } = usePlanComments(plan.id);
  const add = useAddPlanComment();
  const [text, setText] = useState("");

  const summaries = items.filter((c) => c.kind === "final_review" || c.is_final);

  const submit = async () => {
    if (!text.trim()) return;
    await add.mutateAsync({
      plan_id: plan.id,
      content: text.trim(),
      kind: "final_review",
      is_final: true,
    });
    setText("");
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <Textarea
            rows={4}
            placeholder="Итог квартала: что выполнено, что не получилось, выводы для следующего планирования..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button size="sm" onClick={submit} disabled={!text.trim() || add.isPending} className="w-full">
            {add.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trophy className="mr-1 h-3.5 w-3.5" />}
            Добавить итог
          </Button>
        </div>
      )}

      {summaries.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Итогов пока нет. Они добавляются автоматически при завершении плана.
        </p>
      ) : (
        <ul className="space-y-2">
          {summaries.map((c) => (
            <li key={c.id} className="rounded-lg border border-foreground/30 bg-foreground/5 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <Trophy className="h-3.5 w-3.5 text-foreground" />
                <span className="font-medium">{c.author_name ?? "—"}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {format(parseISO(c.created_at), "dd.MM.yyyy HH:mm")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
