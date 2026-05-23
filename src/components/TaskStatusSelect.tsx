import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUSES, type TaskStatus } from "@/lib/constants";
import { useUpdateTask, type Task } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

interface Props {
  task: Task;
  /** Размер триггера. compact (h-7) для таблиц, regular для форм. */
  size?: "compact" | "regular";
  /** Отключить — например, если у пользователя нет прав. */
  disabled?: boolean;
}

/**
 * Инлайн-смена статуса задачи через dropdown.
 *
 * Заменяет drag-n-drop канбан, которого больше нет в проекте. Используется
 * в табличных представлениях задач (страница плана + /tasks): пользователь
 * меняет статус прямо в ячейке без открытия TaskDialog.
 *
 * Спец-кейс — `needs_revision` («На доработке»): при выборе показываем
 * модалку с обязательным комментарием. Комментарий сохраняем в
 * `latest_remark`, и история правки летит в task_history через хук
 * useUpdateTask.
 *
 * Останавливаем propagation на клике/нажатии — иначе клик по селекту
 * пробрасывается на `<TableRow onClick={openTaskDialog}>`.
 */
export function TaskStatusSelect({ task, size = "compact", disabled }: Props) {
  const update = useUpdateTask();
  const [pendingRevision, setPendingRevision] = useState(false);
  const [remark, setRemark] = useState("");

  const handleChange = (next: string) => {
    if (next === task.status) return;
    if (next === "needs_revision") {
      setRemark(task.latest_remark ?? "");
      setPendingRevision(true);
      return;
    }
    update.mutate({ id: task.id, patch: { status: next as TaskStatus }, prev: task });
  };

  const confirmRevision = () => {
    if (!remark.trim()) return;
    update.mutate({
      id: task.id,
      patch: { status: "needs_revision", latest_remark: remark.trim() },
      prev: task,
    });
    setPendingRevision(false);
  };

  return (
    <>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Select value={task.status} onValueChange={handleChange} disabled={disabled || update.isPending}>
          <SelectTrigger
            className={cn(
              "border-transparent bg-transparent px-1 hover:border-border hover:bg-background focus:ring-1",
              size === "compact" ? "h-7 w-auto min-w-[140px] gap-1.5 text-xs" : "h-9",
            )}
          >
            <SelectValue>
              <StatusBadge status={task.status} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: `hsl(var(--${s.colorVar}))` }}
                  />
                  {s.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Перевод в «На доработке» требует обязательный комментарий-причину. */}
      <Dialog
        open={pendingRevision}
        onOpenChange={(v) => {
          if (!v) setPendingRevision(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Вернуть на доработку</DialogTitle>
            <DialogDescription>
              Укажите, что нужно поправить. Комментарий обязателен и сохранится в
              истории задачи.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="revision-remark">Комментарий руководителя *</Label>
            <Textarea
              id="revision-remark"
              autoFocus
              rows={4}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Что нужно доработать..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRevision(false)} disabled={update.isPending}>
              Отмена
            </Button>
            <Button onClick={confirmRevision} disabled={!remark.trim() || update.isPending}>
              {update.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Вернуть на доработку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
