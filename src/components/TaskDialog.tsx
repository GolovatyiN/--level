import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDirections } from "@/hooks/useDirections";
import { Task, useCreateTask, useDeleteTask, useUpdateTask, useTaskHistory } from "@/hooks/useTasks";
import { PRIORITIES, STATUSES, currentQuarter } from "@/lib/constants";
import { format, parseISO } from "date-fns";
import { Trash2, Archive, ArchiveRestore, History, Loader2 } from "lucide-react";
import { useKpis } from "@/hooks/useKpis";
import { useTaskKpiLinks, useLinkKpiTask, useUnlinkKpiTask, useUpdateKpiTaskLink } from "@/hooks/useKpiActivity";
import { Target, Plus } from "lucide-react";
import { useQuarters, useCreateQuarter, useDeleteQuarter, useToggleEntityTag } from "@/hooks/useTaxonomies";
import { EditableSelect } from "@/components/EditableSelect";
import { TagPicker } from "@/components/TagPicker";
import { UserPicker } from "@/components/UserPicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  defaults?: Partial<Task>;
}

export function TaskDialog({ open, onOpenChange, task, defaults }: Props) {
  const { data: directions = [] } = useDirections();
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const { data: history = [] } = useTaskHistory(task?.id ?? null);
  const { data: kpis = [] } = useKpis();
  const { data: links = [] } = useTaskKpiLinks(task?.id ?? null);
  const linkKpi = useLinkKpiTask();
  const unlinkKpi = useUnlinkKpiTask();
  const updateLink = useUpdateKpiTaskLink();
  const { data: quarters = [] } = useQuarters();
  const createQuarter = useCreateQuarter();
  const deleteQuarter = useDeleteQuarter();
  const toggleTaskTag = useToggleEntityTag("task");
  const [newKpiId, setNewKpiId] = useState<string>("");
  const [newContribution, setNewContribution] = useState<string>("1");
  // Draft state for "create" mode (no task.id yet)
  const [draftLinks, setDraftLinks] = useState<{ kpi_id: string; contribution: number }[]>([]);
  const [draftTagIds, setDraftTagIds] = useState<string[]>([]);

  const [form, setForm] = useState<Partial<Task>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form when the dialog opens or the user switches to a different
  // task. We deliberately don't react to every `task` / `defaults` reference
  // change — those re-render frequently (inline `defaults={...}`, background
  // refetches of the tasks list) and would wipe whatever the user is typing.
  useEffect(() => {
    if (open) {
      setForm(
        task ?? {
          title: "",
          description: "",
          quarter: currentQuarter(),
          priority: "medium",
          status: "planned",
          ...defaults,
        }
      );
      setDraftLinks([]);
      setDraftTagIds([]);
      setNewKpiId("");
      setNewContribution("1");
      setConfirmDelete(false);
    }
  }, [open, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Task, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title?.trim()) return;
    // If the user typed a KPI link but didn't click "+", treat it as part of
    // their changes and persist it too. Same idea: "Сохранить" should commit
    // everything they touched in this dialog.
    const pendingLink = newKpiId
      ? { kpi_id: newKpiId, contribution: parseFloat(newContribution) || 0 }
      : null;

    if (task) {
      await update.mutateAsync({ id: task.id, patch: form, prev: task });
      if (pendingLink) {
        await linkKpi
          .mutateAsync({ kpi_id: pendingLink.kpi_id, task_id: task.id, contribution: pendingLink.contribution })
          .catch(() => {});
      }
    } else {
      const created: any = await create.mutateAsync(form as any);
      const newId: string | undefined = created?.id ?? created?.[0]?.id;
      if (newId) {
        const linksToPersist = pendingLink ? [...draftLinks, pendingLink] : draftLinks;
        // Buffered KPI links + tags. Individual failures surface via the
        // hook's onError toast — don't let one failure keep the dialog stuck
        // open with a phantom "unsaved" task that's actually already created.
        await Promise.allSettled([
          ...linksToPersist.map((l) =>
            linkKpi.mutateAsync({ kpi_id: l.kpi_id, task_id: newId, contribution: l.contribution }),
          ),
          ...draftTagIds.map((tagId) =>
            toggleTaskTag.mutateAsync({ entityId: newId, tagId, attach: true }),
          ),
        ]);
      }
    }
    onOpenChange(false);
  };

  const toggleArchive = async () => {
    if (!task) return;
    await update.mutateAsync({ id: task.id, patch: { archived: !task.archived }, prev: task });
    onOpenChange(false);
  };

  const remove = async () => {
    if (!task) return;
    await del.mutateAsync(task.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  const isSaving = create.isPending || update.isPending;
  const isDeleting = del.isPending;

  const linkedKpiIds = new Set(
    task ? links.map((l) => l.kpi_id) : draftLinks.map((l) => l.kpi_id)
  );
  const availableKpis = kpis.filter((k) => !linkedKpiIds.has(k.id));
  const addLink = async () => {
    if (!newKpiId) return;
    const c = parseFloat(newContribution);
    if (isNaN(c)) return;
    if (task) {
      await linkKpi.mutateAsync({ kpi_id: newKpiId, task_id: task.id, contribution: c });
    } else {
      setDraftLinks((prev) => [...prev, { kpi_id: newKpiId, contribution: c }]);
    }
    setNewKpiId("");
    setNewContribution("1");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{task ? "Редактировать задачу" : "Новая задача"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Название</Label>
            <Input
              id="task-title"
              autoFocus={!task}
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Например: Rank Tracker"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Описание</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Отдел</Label>
              <Select value={form.direction_id ?? "none"} onValueChange={(v) => set("direction_id", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— без отдела —</SelectItem>
                  {directions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Квартал</Label>
              <EditableSelect
                value={form.quarter ?? undefined}
                onValueChange={(v) => set("quarter", v)}
                options={quarters.map((q) => ({ value: q.label, label: q.label }))}
                placeholder="—"
                createLabel="Новый квартал (Q1 2027)"
                onCreate={async (label) => {
                  const q = await createQuarter.mutateAsync(label);
                  return q?.label;
                }}
                onDelete={async (label) => {
                  const q = quarters.find((x) => x.label === label);
                  if (q) await deleteQuarter.mutateAsync(q.id);
                }}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Статус</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Приоритет</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Дедлайн</Label>
              <Input
                type="date"
                value={form.deadline ? format(parseISO(form.deadline), "yyyy-MM-dd") : ""}
                onChange={(e) => set("deadline", e.target.value || null)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ответственный</Label>
              <UserPicker
                value={form.assignee_id ?? null}
                onChange={(id) => set("assignee_id", id)}
                placeholder="Не назначен"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Заказчик</Label>
              <Input value={form.customer ?? ""} onChange={(e) => set("customer", e.target.value)} placeholder="SEO Team" />
            </div>
            <div className="grid gap-1.5">
              <Label>Ссылка Asana</Label>
              <Input value={form.asana_url ?? ""} onChange={(e) => set("asana_url", e.target.value)} placeholder="https://app.asana.com/..." />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Заметки</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Контекст, договорённости..." />
          </div>

          <div className="grid gap-1.5">
            <Label>Теги</Label>
            {task ? (
              <TagPicker entity="task" entityId={task.id} />
            ) : (
              <TagPicker entity="task" selectedIds={draftTagIds} onChange={setDraftTagIds} />
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Target className="h-3.5 w-3.5" /> Связанные KPI
            </div>
            {task ? (
              links.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {links.map((l) => {
                    const k = kpis.find((x) => x.id === l.kpi_id);
                    return (
                      <li key={l.id} className="flex items-center gap-2 rounded bg-card px-2 py-1.5 text-xs">
                        <span className="flex-1 truncate font-medium">{k?.name ?? "—"}</span>
                        <span className="text-muted-foreground">вклад:</span>
                        <Input
                          type="number"
                          defaultValue={l.contribution}
                          className="h-6 w-20 text-xs"
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v !== l.contribution) {
                              updateLink.mutate({ id: l.id, contribution: v, kpi_id: l.kpi_id });
                            }
                          }}
                        />
                        <span className="text-muted-foreground">{k?.unit}</span>
                        <button
                          type="button"
                          onClick={() => unlinkKpi.mutate({ id: l.id, kpi_id: l.kpi_id, task_id: task.id })}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              draftLinks.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {draftLinks.map((l, idx) => {
                    const k = kpis.find((x) => x.id === l.kpi_id);
                    return (
                      <li key={idx} className="flex items-center gap-2 rounded bg-card px-2 py-1.5 text-xs">
                        <span className="flex-1 truncate font-medium">{k?.name ?? "—"}</span>
                        <span className="text-muted-foreground">вклад:</span>
                        <Input
                          type="number"
                          defaultValue={l.contribution}
                          className="h-6 w-20 text-xs"
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) {
                              setDraftLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, contribution: v } : x)));
                            }
                          }}
                        />
                        <span className="text-muted-foreground">{k?.unit}</span>
                        <button
                          type="button"
                          onClick={() => setDraftLinks((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
            {availableKpis.length > 0 ? (
              <div className="flex items-center gap-2">
                <Select value={newKpiId} onValueChange={setNewKpiId}>
                  <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="+ привязать KPI" /></SelectTrigger>
                  <SelectContent>
                    {availableKpis.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={newContribution}
                  onChange={(e) => setNewContribution(e.target.value)}
                  className="h-7 w-20 text-xs"
                  placeholder="вклад"
                />
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={addLink} disabled={!newKpiId}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Все KPI уже привязаны.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Когда статус задачи станет «Завершено», вклад автоматически прибавится к факту KPI.
            </p>
          </div>

          {task && history.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <History className="h-3.5 w-3.5" /> История
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {history.slice(0, 8).map((h: any) => (
                  <li key={h.id}>
                    <span className="text-foreground/60">{format(parseISO(h.created_at), "dd.MM HH:mm")}</span> — {h.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {task && (
              <>
                <Button variant="outline" size="sm" onClick={toggleArchive} disabled={isSaving || isDeleting}>
                  {task.archived ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                  {task.archived ? "Восстановить" : "В архив"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isSaving || isDeleting}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Удалить
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={!form.title?.trim() || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить задачу?</AlertDialogTitle>
            <AlertDialogDescription>
              Задача «{task?.title}» будет удалена безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}