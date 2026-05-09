import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Eye, EyeOff, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/UiState";
import {
  QUARTER_STATUS_LABELS,
  type QuarterStatus,
  useAllQuarters,
  useCreateQuarter,
  useDeleteQuarter,
  useUpdateQuarter,
} from "@/hooks/useTaxonomies";
import { quarterLabelRu } from "@/lib/constants";

const STATUS_OPTIONS: QuarterStatus[] = ["planned", "active", "closed", "archived"];

export function ManagementQuartersTab() {
  const { data: quarters = [], isLoading } = useAllQuarters();
  const create = useCreateQuarter();
  const update = useUpdateQuarter();
  const del = useDeleteQuarter();

  const [creating, setCreating] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  const submitNew = async () => {
    if (!draftLabel.trim()) return;
    await create.mutateAsync(draftLabel.trim()).catch(() => {});
    setDraftLabel("");
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {quarters.length} кварталов в системе. Невидимые скрыты от обычных юзеров,
          но остаются доступны в Управлении и Архиве.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Новый квартал
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Период</th>
                <th className="px-4 py-2.5 font-medium">Даты</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
                <th className="px-4 py-2.5 font-medium">Видимость</th>
                <th className="px-4 py-2.5 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="py-10 text-center"><Spinner /></td></tr>
              )}
              {!isLoading && quarters.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Нет кварталов</td></tr>
              )}
              {quarters.map((q) => (
                <tr key={q.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{quarterLabelRu(q.label)}</div>
                    <div className="text-xs text-muted-foreground">{q.label}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {q.start_date && q.end_date
                      ? `${format(parseISO(q.start_date), "dd.MM.yyyy")} — ${format(parseISO(q.end_date), "dd.MM.yyyy")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={q.status}
                      onValueChange={(v) => update.mutate({ id: q.id, patch: { status: v as QuarterStatus } })}
                    >
                      <SelectTrigger className="h-7 w-[150px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{QUARTER_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => update.mutate({ id: q.id, patch: { is_visible: !q.is_visible } })}
                    >
                      {q.is_visible ? (
                        <><Eye className="h-3.5 w-3.5 text-success" /> Виден</>
                      ) : (
                        <><EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> Скрыт</>
                      )}
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Удалить ${quarterLabelRu(q.label)}? Все связанные планы будут также удалены.`)) {
                          del.mutate(q.id);
                        }
                      }}
                    >
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новый квартал</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="q-label">Название</Label>
              <Input
                id="q-label"
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Например, Q1 2027"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitNew();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Формат: <code className="rounded bg-muted px-1">Q&lt;1-4&gt; ГГГГ</code>. Даты начала и
                конца проставятся автоматически.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={create.isPending}>
              Отмена
            </Button>
            <Button onClick={submitNew} disabled={!draftLabel.trim() || create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
