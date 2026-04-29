import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Target, AlertTriangle, Users, TrendingUp, X } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { Kpi, useKpis } from "@/hooks/useKpis";
import { KpiDialog } from "@/components/KpiDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUARTERS, currentQuarter } from "@/lib/constants";
import { useQuarters } from "@/hooks/useTaxonomies";
import { isPast, parseISO, eachDayOfInterval, startOfQuarter, endOfQuarter, format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";

export default function KpiPage() {
  const { data: tasks = [] } = useTasks(true);
  const { data: directions = [] } = useDirections();
  const { data: kpis = [] } = useKpis();
  const { data: dynamicQuarters = [] } = useQuarters();
  const quarterList = useMemo(() => {
    const s = new Set<string>(QUARTERS);
    dynamicQuarters.forEach((q) => s.add(q.label));
    return Array.from(s).sort();
  }, [dynamicQuarters]);

  const [quarter, setQuarter] = useState<string>(currentQuarter());
  const [editingKpi, setEditingKpi] = useState<Kpi | null>(null);
  const [creating, setCreating] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  const baseTasks = tasks.filter((t) => !t.archived);

  // Список значений для фильтров строим до фильтрации, чтобы не «схлопывались»
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    baseTasks.forEach((t) => {
      const v = t.assignee?.trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [baseTasks]);

  const matchesStatus = useCallback(
    (t: typeof baseTasks[number]) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "completed") return t.status === "completed";
      if (statusFilter === "active") return t.status !== "completed";
      if (statusFilter === "overdue")
        return !!t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed";
      return t.status === statusFilter;
    },
    [statusFilter],
  );

  const activeTasks = useMemo(
    () =>
      baseTasks.filter((t) => {
        if (directionFilter !== "all" && t.direction_id !== directionFilter) return false;
        if (assigneeFilter !== "all") {
          const a = t.assignee?.trim() || "";
          if (assigneeFilter === "__none__" ? a !== "" : a !== assigneeFilter) return false;
        }
        if (!matchesStatus(t)) return false;
        return true;
      }),
    [baseTasks, directionFilter, assigneeFilter, matchesStatus],
  );
  const inQuarter = activeTasks.filter((t) => t.quarter === quarter);

  const filteredKpis = useMemo(
    () =>
      kpis.filter((k) => {
        if (directionFilter !== "all" && k.direction_id !== directionFilter) return false;
        if (assigneeFilter !== "all") {
          const o = k.owner?.trim() || "";
          if (assigneeFilter === "__none__" ? o !== "" : o !== assigneeFilter) return false;
        }
        return true;
      }),
    [kpis, directionFilter, assigneeFilter],
  );

  const filtersActive =
    directionFilter !== "all" || statusFilter !== "all" || assigneeFilter !== "all";
  const resetFilters = () => {
    setDirectionFilter("all");
    setStatusFilter("all");
    setAssigneeFilter("all");
  };

  // ── Авто-метрики ────────────────────────────────────────────────
  const total = activeTasks.length;
  const completed = activeTasks.filter((t) => t.status === "completed").length;
  const overdue = activeTasks.filter(
    (t) => t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed"
  ).length;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;

  const byDirection = useMemo(() => {
    return directions.map((d) => {
      const items = activeTasks.filter((t) => t.direction_id === d.id);
      const done = items.filter((t) => t.status === "completed").length;
      const overdueD = items.filter((t) => t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed").length;
      return {
        id: d.id,
        name: d.name,
        color: d.color,
        total: items.length,
        done,
        overdue: overdueD,
        pct: items.length ? Math.round((done / items.length) * 100) : 0,
      };
    });
  }, [directions, activeTasks]);

  const byQuarter = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    activeTasks.forEach((t) => {
      const e = map.get(t.quarter) ?? { total: 0, done: 0 };
      e.total += 1;
      if (t.status === "completed") e.done += 1;
      map.set(t.quarter, e);
    });
    return Array.from(map.entries())
      .map(([q, v]) => ({ quarter: q, total: v.total, done: v.done, pct: Math.round((v.done / v.total) * 100) }))
      .sort((a, b) => {
        const [qa, ya] = a.quarter.split(" ");
        const [qb, yb] = b.quarter.split(" ");
        return ya === yb ? qa.localeCompare(qb) : ya.localeCompare(yb);
      });
  }, [activeTasks]);

  const byAssignee = useMemo(() => {
    const map = new Map<string, { total: number; done: number; overdue: number }>();
    activeTasks.forEach((t) => {
      const key = t.assignee?.trim() || "— не назначен —";
      const e = map.get(key) ?? { total: 0, done: 0, overdue: 0 };
      e.total += 1;
      if (t.status === "completed") e.done += 1;
      if (t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed") e.overdue += 1;
      map.set(key, e);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [activeTasks]);

  // ── Burn-down по выбранному кварталу ────────────────────────────
  const burnDown = useMemo(() => {
    if (!inQuarter.length) return [];
    const [qStr, yStr] = quarter.split(" ");
    const qNum = parseInt(qStr.slice(1));
    const year = parseInt(yStr);
    const refDate = new Date(year, (qNum - 1) * 3, 1);
    const start = startOfQuarter(refDate);
    const end = endOfQuarter(refDate);
    const days = eachDayOfInterval({ start, end });
    const totalScope = inQuarter.length;
    const today = new Date();

    return days
      .filter((_, i) => i % 3 === 0 || i === days.length - 1)
      .map((day) => {
        const idealLeft = Math.max(
          0,
          Math.round(totalScope - (totalScope * (day.getTime() - start.getTime())) / (end.getTime() - start.getTime()))
        );
        const isFuture = day > today;
        const completedByDay = inQuarter.filter(
          (t) => t.status === "completed" && t.updated_at && new Date(t.updated_at) <= day
        ).length;
        const actualLeft = totalScope - completedByDay;
        return {
          date: format(day, "dd.MM"),
          ideal: idealLeft,
          actual: isFuture ? null : actualLeft,
        };
      });
  }, [inQuarter, quarter]);

  const kpiProgress = (k: Kpi) => {
    if (!k.target_value) return 0;
    return Math.min(999, Math.round((k.current_value / k.target_value) * 100));
  };

  const kpiStatus = (k: Kpi) => {
    const pct = kpiProgress(k);
    if (pct >= 100) return { label: "Достигнуто", color: "status-completed" };
    if (pct >= 70) return { label: "On track", color: "status-progress" };
    if (pct >= 40) return { label: "At risk", color: "status-risk" };
    return { label: "Off track", color: "status-blocked" };
  };

  const stats = [
    { label: "Всего задач", value: total, icon: Target },
    { label: "% выполнения", value: `${completionPct}%`, icon: TrendingUp },
    { label: "Просрочено", value: overdue, icon: AlertTriangle, danger: overdue > 0 },
    { label: "Сотрудников", value: byAssignee.filter((a) => a.name !== "— не назначен —").length, icon: Users },
  ];

  return (
    <>
      <PageHeader
        title="KPI"
        description="Метрики, цели и прогресс компании"
        actions={
          <>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {quarterList.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> KPI</Button>
          </>
        }
      />
      <div className="space-y-8 p-8">
        {/* Фильтры */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
            Фильтры
          </span>
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Отдел" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все отделы</SelectItem>
              {directions.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[170px] text-sm">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="active">Активные</SelectItem>
              <SelectItem value="completed">Завершённые</SelectItem>
              <SelectItem value="overdue">Просроченные</SelectItem>
              <SelectItem value="planned">Запланировано</SelectItem>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="at_risk">Под угрозой</SelectItem>
              <SelectItem value="blocked">Заблокировано</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Ответственный" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              <SelectItem value="__none__">— не назначен —</SelectItem>
              {assigneeOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8">
              <X className="mr-1 h-3.5 w-3.5" /> Сбросить
            </Button>
          )}
        </div>

        {/* Авто-метрики верх */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.danger ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <div className={`mt-2 text-3xl font-semibold ${s.danger ? "text-destructive" : "text-foreground"}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Burn-down */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Burn-down — {quarter}</h3>
            <p className="text-xs text-muted-foreground">Идеальный темп vs фактически осталось задач</p>
          </div>
          {burnDown.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burnDown} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="ideal" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} name="Идеал" />
                  <Line type="monotone" dataKey="actual" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} name="Факт" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Нет задач в этом квартале</p>
          )}
        </section>

        {/* % выполнения по отделам */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">% выполнения по отделам</h3>
          {byDirection.length ? (
            <div className="space-y-3">
              {byDirection.map((d) => (
                <div key={d.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="font-medium">{d.name}</span>
                      {d.overdue > 0 && (
                        <span className="text-xs text-destructive">{d.overdue} просрочено</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {d.done}/{d.total} · <span className="text-foreground font-medium">{d.pct}%</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-foreground/80" style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет отделов.</p>
          )}
        </section>

        {/* По кварталам */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">% выполнения по кварталам</h3>
          {byQuarter.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byQuarter} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="quarter" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="hsl(var(--muted-foreground))" name="Всего" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="done" fill="hsl(var(--foreground))" name="Завершено" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет данных.</p>
          )}
        </section>

        {/* Загрузка по сотрудникам */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Загрузка по сотрудникам</h3>
          {byAssignee.length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Сотрудник</th>
                    <th className="pb-2 font-medium">Всего</th>
                    <th className="pb-2 font-medium">Завершено</th>
                    <th className="pb-2 font-medium">Просрочено</th>
                    <th className="pb-2 font-medium">% выполнения</th>
                  </tr>
                </thead>
                <tbody>
                  {byAssignee.map((a) => {
                    const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
                    return (
                      <tr key={a.name} className="border-b border-border/50">
                        <td className="py-2.5">{a.name}</td>
                        <td className="py-2.5 text-muted-foreground">{a.total}</td>
                        <td className="py-2.5 text-muted-foreground">{a.done}</td>
                        <td className={`py-2.5 ${a.overdue > 0 ? "text-destructive" : "text-muted-foreground"}`}>{a.overdue}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                              <div className="h-full bg-foreground/80" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет данных.</p>
          )}
        </section>

        {/* Ручные KPI */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Цели (план vs факт)</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredKpis.map((k) => {
              const pct = kpiProgress(k);
              const st = kpiStatus(k);
              const dir = directions.find((d) => d.id === k.direction_id);
              return (
                <div
                  key={k.id}
                  onClick={() => setEditingKpi(k)}
                  className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-card transition hover:border-foreground/30"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium leading-snug">{k.name}</h4>
                    <button className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {(dir || k.quarter || k.owner) && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {[dir?.name, k.quarter, k.owner].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold">{k.current_value}</span>
                    <span className="text-sm text-muted-foreground">/ {k.target_value} {k.unit}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: `hsl(var(--${st.color}))` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span style={{ color: `hsl(var(--${st.color}))` }} className="font-medium">{st.label}</span>
                    <span className="text-muted-foreground">{pct}%</span>
                  </div>
                </div>
              );
            })}
            {filteredKpis.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  {kpis.length === 0
                    ? "Создайте первую цель — задайте план и факт"
                    : "Под выбранные фильтры KPI не найдены"}
                </p>
                {kpis.length === 0 ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Создать KPI
                  </Button>
                ) : (
                  <Button variant="outline" onClick={resetFilters}>
                    <X className="mr-1 h-4 w-4" /> Сбросить фильтры
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      <KpiDialog open={creating} onOpenChange={setCreating} />
      <KpiDialog open={!!editingKpi} onOpenChange={(v) => !v && setEditingKpi(null)} kpi={editingKpi} />
    </>
  );
}