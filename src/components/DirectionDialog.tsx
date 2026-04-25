import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Direction, useDeleteDirection, useUpsertDirection } from "@/hooks/useDirections";
import { DIRECTION_COLORS } from "@/lib/constants";
import { Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction?: Direction | null;
}

export function DirectionDialog({ open, onOpenChange, direction }: Props) {
  const upsert = useUpsertDirection();
  const del = useDeleteDirection();
  const [form, setForm] = useState<Partial<Direction>>({});

  useEffect(() => {
    if (open) {
      setForm(direction ?? { name: "", description: "", color: DIRECTION_COLORS[0], owner: "" });
    }
  }, [open, direction]);

  const submit = async () => {
    if (!form.name?.trim()) return;
    await upsert.mutateAsync(form as any);
    onOpenChange(false);
  };

  const remove = async () => {
    if (!direction) return;
    if (!confirm("Удалить отдел? Задачи останутся, но без отделы.")) return;
    await del.mutateAsync(direction.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{direction ? "Редактировать отдел" : "Новое отдел"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PBN" />
          </div>
          <div className="grid gap-1.5">
            <Label>Описание</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid gap-1.5">
            <Label>Ответственный</Label>
            <Input value={form.owner ?? ""} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Head of SEO" />
          </div>
          <div className="grid gap-1.5">
            <Label>Цвет</Label>
            <div className="flex flex-wrap gap-2">
              {DIRECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-8 w-8 rounded-md border-2 transition ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {direction && (
              <Button variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1.5 h-4 w-4" /> Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={submit} disabled={!form.name?.trim()}>Сохранить</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}