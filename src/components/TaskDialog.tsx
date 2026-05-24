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
import { useQuarters, useCreateQuarter, useDeleteQuarter } from "@/hooks/useTaxonomies";
import { EditableSelect } from "@/components/EditableSelect";
import { UserPicker } from "@/components/UserPicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  defaults?: Partial<Task>;
}

/**
 * Подсказка для поля «Новый квартал» — предлагает первый
 * НЕДОСТАЮЩИЙ квартал. Если в системе уже есть Q2 / Q3 / Q4 2026,
 * но нет Q1 2026 — подскажет именно его. Если все 4 квартала года
 * есть — подскажет Q1 следующего года. Это полезнее, чем хардкод
 * «Q1 2027» — пользователь часто заносит исторические периоды.
 */
function nextSuggestedQuarter(existing: string[]): string {
  const set = new Set(existing.map((l) => l.trim().toUpperCase()));
  const now = new Date();
  const currentYear = now.getFullYear();
  // Сначала проверим текущий год — недостающие Q.
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    for (let q = 1; q <= 4; q++) {
      const label = `Q${q} ${y}`;
      if (!set.has(label.toUpperCase())) return label;
    }
  }
  return `Q1 ${currentYear + 1}`;
}

export function TaskDialog({ open, onOpenChange, task, defaults }: Props) {
  const { data: directions = [] } = useDirections();
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const { data: history = [] } = useTaskHistory(task?.id ?? null);
  const { data: quarters = [] } = useQuarters();
  const createQuarter = useCreateQuarter();
  const deleteQuarter = useDeleteQuarter();

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
      setConfirmDelete(false);
    }
  }, [open, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Task, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title?.trim()) return;
    if (task) {
      await update.mutateAsync({ id: task.id, patch: form, prev: task });
    } else {
      await create.mutateAsync(form as any);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{task ? "Редактировать задачу" : "Новая задача"}</DialogTitle>
        </DialogHeader>

        {/* Оборачиваем форму в <form> → Enter в обычных input'ах
            автоматически вызывает submit. Внутри Textarea Enter
            создаёт перенос строки, как и положено. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title?.trim() || isSaving) return;
            submit();
          }}
          className="grid gap-4"
        >
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
                createLabel={`Новый квартал (например ${nextSuggestedQuarter(quarters.map((q) => q.label))})`}
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

          {/* Поля «Комментарий» и «Итог» добавлены в Phase 1 редизайна
              страницы квартального плана. latest_remark — последнее
              замечание руководителя (обязательно при статусе
              «На доработке»), outcome — краткий итог выполнения. */}
          <div className="grid gap-1.5">
            <Label>
              Комментарий руководителя
              {form.status === "needs_revision" && (
                <span className="ml-1 text-destructive">*</span>
              )}
            </Label>
            <Textarea
              value={form.latest_remark ?? ""}
              onChange={(e) => set("latest_remark", e.target.value)}
              rows={2}
              placeholder="Что нужно доработать, замечания по содержанию..."
            />
            {form.status === "needs_revision" && !form.latest_remark?.trim() && (
              <p className="text-[11px] text-destructive">
                При переводе в «На доработке» комментарий обязателен.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Итог выполнения</Label>
            <Textarea
              value={form.outcome ?? ""}
              onChange={(e) => set("outcome", e.target.value)}
              rows={2}
              placeholder="Краткий результат: статья опубликована, регламент утверждён..."
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-direction-tag">Направление</Label>
            <Input
              id="task-direction-tag"
              value={form.direction_tag ?? ""}
              onChange={(e) => set("direction_tag", e.target.value)}
              placeholder="ИИ, HR, Процессы, Отчётность..."
              maxLength={64}
            />
            <p className="text-[11px] text-muted-foreground">
              Свободный текст. Сохраняется только в этой задаче — не попадает
              в общий справочник.
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

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {task && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={toggleArchive} disabled={isSaving || isDeleting}>
                    {task.archived ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                    {task.archived ? "Восстановить" : "В архив"}
                  </Button>
                  <Button
                    type="button"
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
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Отмена
              </Button>
              <Button type="submit" disabled={!form.title?.trim() || isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </form>
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