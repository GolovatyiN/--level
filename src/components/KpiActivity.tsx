import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, MessageSquare, ListChecks, TrendingUp, CheckCircle2, Circle, Loader2 } from "lucide-react";
import {
  useAddKpiComment,
  useDeleteKpiComment,
  useKpiComments,
  useKpiLinkedTasks,
  useUnlinkKpiTask,
  useUpdateKpiTaskLink,
  useKpiProgressLog,
  useAddKpiProgress,
  useDeleteKpiProgress,
} from "@/hooks/useKpiActivity";
import { format, parseISO } from "date-fns";
import { STATUSES } from "@/lib/constants";

export function KpiActivity({ kpiId, unit }: { kpiId: string; unit: string }) {
  return (
    <Tabs defaultValue="tasks" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="tasks" className="gap-1.5">
          <ListChecks className="h-3.5 w-3.5" /> Задачи
        </TabsTrigger>
        <TabsTrigger value="progress" className="gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" /> Прогресс
        </TabsTrigger>
        <TabsTrigger value="comments" className="gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> Чат
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tasks" className="mt-3">
        <LinkedTasks kpiId={kpiId} unit={unit} />
      </TabsContent>
      <TabsContent value="progress" className="mt-3">
        <ProgressLog kpiId={kpiId} unit={unit} />
      </TabsContent>
      <TabsContent value="comments" className="mt-3">
        <Comments kpiId={kpiId} />
      </TabsContent>
    </Tabs>
  );
}

function LinkedTasks({ kpiId, unit }: { kpiId: string; unit: string }) {
  const { data: links = [] } = useKpiLinkedTasks(kpiId);
  const update = useUpdateKpiTaskLink();
  const unlink = useUnlinkKpiTask();

  const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Привязывайте задачи к KPI в карточке задачи. Завершённая задача автоматически прибавляет свой «вклад» к факту KPI.
      </p>
      {links.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Нет связанных задач</p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
          {links.map((l) => {
            const done = l.task?.status === "completed";
            return (
              <li key={l.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${done ? "" : "text-foreground"}`}>
                      {l.task?.title ?? "— задача удалена —"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {l.task && <span>{statusLabel(l.task.status)}</span>}
                      {l.task?.assignee && <span>· {l.task.assignee}</span>}
                      {l.task?.deadline && <span>· до {format(parseISO(l.task.deadline), "dd.MM.yyyy")}</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Вклад:</span>
                      <Input
                        type="number"
                        defaultValue={l.contribution}
                        className="h-7 w-24 text-xs"
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v !== l.contribution) {
                            update.mutate({ id: l.id, contribution: v, kpi_id: kpiId });
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">{unit}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => unlink.mutate({ id: l.id, kpi_id: kpiId, task_id: l.task_id })}
                    disabled={unlink.isPending}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    title="Отвязать задачу"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProgressLog({ kpiId, unit }: { kpiId: string; unit: string }) {
  const { data: items = [] } = useKpiProgressLog(kpiId);
  const add = useAddKpiProgress();
  const del = useDeleteKpiProgress();

  const [delta, setDelta] = useState<string>("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const submit = async () => {
    const d = parseFloat(delta);
    if (isNaN(d) || d === 0) return;
    await add.mutateAsync({
      kpi_id: kpiId,
      delta: d,
      note: note.trim() || null,
      log_date: date,
    });
    setDelta("");
    setNote("");
    setDate(format(new Date(), "yyyy-MM-dd"));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder={`+ N (${unit || "—"})`}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Textarea
          rows={2}
          placeholder="Комментарий (⌘+Enter — отправить)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button size="sm" onClick={submit} disabled={!delta || add.isPending} className="w-full">
          {add.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          Добавить прогресс
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Нет записей прогресса</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-base font-semibold ${c.delta >= 0 ? "text-foreground" : "text-destructive"}`}>
                      {c.delta > 0 ? "+" : ""}
                      {c.delta} {unit}
                    </span>
                    <span className="text-xs text-muted-foreground">{format(parseISO(c.log_date), "dd.MM.yyyy")}</span>
                  </div>
                  {c.note && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{c.note}</p>}
                  {c.author_name && (
                    <p className="mt-1 text-xs text-muted-foreground/70">— {c.author_name}</p>
                  )}
                </div>
                <button
                  onClick={() => del.mutate({ id: c.id, kpi_id: kpiId })}
                  disabled={del.isPending}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Удалить запись"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comments({ kpiId }: { kpiId: string }) {
  const { data: items = [] } = useKpiComments(kpiId);
  const add = useAddKpiComment();
  const del = useDeleteKpiComment();
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    await add.mutateAsync({ kpi_id: kpiId, content: text.trim() });
    setText("");
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <Textarea
          rows={3}
          placeholder="Комментарий, решение, контекст... (⌘+Enter — отправить)"
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

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Нет комментариев</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author_name ?? "—"}</span>
                    <span>·</span>
                    <span>{format(parseISO(c.created_at), "dd.MM.yyyy HH:mm")}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                </div>
                <button
                  onClick={() => del.mutate({ id: c.id, kpi_id: kpiId })}
                  disabled={del.isPending}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Удалить комментарий"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
