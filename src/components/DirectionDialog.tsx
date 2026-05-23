import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Direction, useDeleteDirection, useUpsertDirection } from "@/hooks/useDirections";
import { UserPicker } from "@/components/UserPicker";
import { DIRECTION_COLORS } from "@/lib/constants";
import { Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction?: Direction | null;
}

export function DirectionDialog({ open, onOpenChange, direction }: Props) {
  const upsert = useUpsertDirection();
  const del = useDeleteDirection();
  const [form, setForm] = useState<Partial<Direction>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form on open / when switching to a different direction. Don't
  // react to every `direction` reference — background refetches would wipe
  // the user's in-progress edits.
  useEffect(() => {
    if (open) {
      setForm(
        direction ?? {
          name: "",
          description: "",
          color: DIRECTION_COLORS[0],
          head_user_id: null,
        },
      );
      setConfirmDelete(false);
    }
  }, [open, direction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!form.name?.trim()) return;
    await upsert.mutateAsync(form as any);
    onOpenChange(false);
  };

  const remove = async () => {
    if (!direction) return;
    await del.mutateAsync(direction.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  const isSaving = upsert.isPending;
  const isDeleting = del.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{direction ? "Редактировать отдел" : "Новый отдел"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="direction-name">Название</Label>
            <Input
              id="direction-name"
              autoFocus={!direction}
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="PBN"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Описание</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid gap-1.5">
            <Label>Руководитель отдела</Label>
            <UserPicker
              value={form.head_user_id ?? null}
              onChange={(id) => setForm({ ...form, head_user_id: id })}
              placeholder="Не назначен"
            />
            <p className="text-[11px] text-muted-foreground">
              Выбирается из списка зарегистрированных пользователей.
              Если человека ещё нет в системе — пригласите его в разделе
              «Управление → Пользователи».
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Цвет</Label>
            <div className="flex flex-wrap gap-2">
              {DIRECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  aria-label={`Выбрать цвет ${c}`}
                  className={cn(
                    "h-8 w-8 rounded-md border-2 transition-all duration-200 hover:scale-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                    form.color === c
                      ? "scale-110 border-foreground shadow-md ring-2 ring-foreground/20"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {direction && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={isSaving || isDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={!form.name?.trim() || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить отдел?</AlertDialogTitle>
            <AlertDialogDescription>
              Отдел «{direction?.name}» будет удалён. Связанные задачи останутся, но без привязки к отделу.
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