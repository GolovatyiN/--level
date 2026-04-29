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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kpi, useDeleteKpi, useUpsertKpi } from "@/hooks/useKpis";
import { useDirections } from "@/hooks/useDirections";
import { Trash2, Loader2 } from "lucide-react";
import { KpiActivity } from "@/components/KpiActivity";
import { useQuarters, useCreateQuarter, useDeleteQuarter, useKpiUnits, useCreateKpiUnit, useDeleteKpiUnit } from "@/hooks/useTaxonomies";
import { EditableSelect } from "@/components/EditableSelect";
import { TagPicker } from "@/components/TagPicker";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kpi?: Kpi | null;
}

export function KpiDialog({ open, onOpenChange, kpi }: Props) {
  const upsert = useUpsertKpi();
  const del = useDeleteKpi();
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: units = [] } = useKpiUnits();
  const createQuarter = useCreateQuarter();
  const deleteQuarter = useDeleteQuarter();
  const createUnit = useCreateKpiUnit();
  const deleteUnit = useDeleteKpiUnit();
  const [form, setForm] = useState<Partial<Kpi>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(kpi ?? { name: "", target_value: 100, current_value: 0, unit: "%" });
      setConfirmDelete(false);
    }
  }, [open, kpi]);

  const set = (k: keyof Kpi, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name?.trim()) return;
    await upsert.mutateAsync(form as any);
    onOpenChange(false);
  };

  const remove = async () => {
    if (!kpi) return;
    await del.mutateAsync(kpi.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  const isSaving = upsert.isPending;
  const isDeleting = del.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={kpi ? "max-w-3xl" : "max-w-xl"}>
        <DialogHeader><DialogTitle>{kpi ? "Редактировать KPI" : "Новый KPI"}</DialogTitle></DialogHeader>
        <div className={kpi ? "grid gap-6 md:grid-cols-2" : "grid gap-4"}>
          <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Рост органического трафика" />
          </div>
          <div className="grid gap-1.5">
            <Label>Описание</Label>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Отдел</Label>
              <Select value={form.direction_id ?? "none"} onValueChange={(v) => set("direction_id", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— без отдела —</SelectItem>
                  {directions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Квартал</Label>
              <EditableSelect
                value={form.quarter ?? "none"}
                onValueChange={(v) => set("quarter", v === "none" ? null : v)}
                options={quarters.map((q) => ({ value: q.label, label: q.label }))}
                emptyOption={{ value: "none", label: "— любой —" }}
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
              <Label>План (цель)</Label>
              <Input type="number" value={form.target_value ?? 0} onChange={(e) => set("target_value", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Факт (текущее)</Label>
              <Input type="number" value={form.current_value ?? 0} onChange={(e) => set("current_value", parseFloat(e.target.value) || 0)} />
            </div>

            <div className="grid gap-1.5">
              <Label>Единица</Label>
              <EditableSelect
                value={form.unit ?? ""}
                onValueChange={(v) => set("unit", v)}
                options={units.map((u) => ({ value: u.symbol, label: u.symbol + (u.description ? ` — ${u.description}` : "") }))}
                placeholder="%, шт, $..."
                createLabel="Новая единица (например: clicks)"
                onCreate={async (symbol) => {
                  const u = await createUnit.mutateAsync(symbol);
                  return u?.symbol;
                }}
                onDelete={async (symbol) => {
                  const u = units.find((x) => x.symbol === symbol);
                  if (u) await deleteUnit.mutateAsync(u.id);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ответственный</Label>
              <Input value={form.owner ?? ""} onChange={(e) => set("owner", e.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <Label>Дедлайн</Label>
              <Input type="date" value={form.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
            </div>
          </div>
          {kpi && (
            <div className="grid gap-1.5">
              <Label>Теги</Label>
              <TagPicker entity="kpi" entityId={kpi.id} />
            </div>
          )}
          </div>
          {kpi && (
            <div className="border-t border-border pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <KpiActivity kpiId={kpi.id} unit={form.unit ?? kpi.unit ?? ""} />
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {kpi && (
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
            <AlertDialogTitle>Удалить KPI?</AlertDialogTitle>
            <AlertDialogDescription>
              KPI «{kpi?.name}» будет удалён вместе с историей прогресса и связями. Это действие нельзя отменить.
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