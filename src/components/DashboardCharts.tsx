import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTasks } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { usePlans, PLAN_STATUS_LABELS, type PlanStatus } from "@/hooks/usePlans";
import { cn, isOverdue } from "@/lib/utils";

/** Static palette so chart colours stay stable across themes. */
const COLOURS = {
  status_in_progress: "hsl(var(--info))",
  status_at_risk:     "hsl(var(--warning))",
  status_blocked:     "hsl(var(--destructive))",
  status_completed:   "hsl(var(--success))",
  status_overdue:     "hsl(var(--destructive))",
  prio_critical:      "hsl(var(--destructive))",
  prio_high:          "hsl(var(--warning))",
  prio_medium:        "hsl(var(--info))",
  prio_low:           "hsl(var(--muted-foreground))",
  bar:                "hsl(var(--foreground))",
};

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
};

interface Props {
  /** Optional quarter scope from the dashboard header. */
  quarter?: string;
  /** Optional direction scope from the dashboard header. */
  direction?: string;
}

/**
 * Four compact charts that answer "where do we stand?":
 *   1. Task statuses (donut) — what state is work in.
 *   2. Task priorities (donut) — how heavy is the load.
 *   3. Department progress (horizontal bar) — who's lagging.
 *   4. Quarterly plan statuses (vertical bar) — readiness of planning.
 *
 * All chart datasets respect the dashboard-level quarter and direction
 * scope so the charts stay in sync with the status cards above.
 */
export function DashboardCharts({ quarter, direction }: Props = {}) {
  const { data: tasks = [] } = useTasks();
  const { data: directions = [] } = useDirections();
  const { data: plans = [] } = usePlans();
  const navigate = useNavigate();

  const active = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.archived) return false;
        if (quarter && quarter !== "all" && t.quarter !== quarter) return false;
        if (direction && direction !== "all" && t.direction_id !== direction) return false;
        return true;
      }),
    [tasks, quarter, direction],
  );

  // ---------------------------------------------------------------------
  // 1. Task statuses
  // ---------------------------------------------------------------------
  const statusData = useMemo(() => {
    const inProgress = active.filter((t) => t.status === "in_progress").length;
    const atRisk     = active.filter((t) => t.status === "at_risk").length;
    const blocked    = active.filter((t) => t.status === "blocked").length;
    const completed  = active.filter((t) => t.status === "completed").length;
    const overdue    = active.filter(isOverdue).length;
    return [
      { name: "В работе",   value: inProgress, fill: COLOURS.status_in_progress },
      { name: "Под риском", value: atRisk,     fill: COLOURS.status_at_risk },
      { name: "Блокеры",    value: blocked,    fill: COLOURS.status_blocked },
      { name: "Завершено",  value: completed,  fill: COLOURS.status_completed },
      { name: "Просрочено", value: overdue,    fill: COLOURS.status_overdue },
    ].filter((d) => d.value > 0);
  }, [active]);

  // ---------------------------------------------------------------------
  // 2. Priorities
  // ---------------------------------------------------------------------
  const prioData = useMemo(() => {
    const open = active.filter((t) => t.status !== "completed");
    const c = open.filter((t) => t.priority === "critical").length;
    const h = open.filter((t) => t.priority === "high").length;
    const m = open.filter((t) => t.priority === "medium").length;
    const l = open.filter((t) => t.priority === "low").length;
    return [
      { name: "Критические", value: c, fill: COLOURS.prio_critical },
      { name: "Высокие",     value: h, fill: COLOURS.prio_high },
      { name: "Средние",     value: m, fill: COLOURS.prio_medium },
      { name: "Низкие",      value: l, fill: COLOURS.prio_low },
    ].filter((d) => d.value > 0);
  }, [active]);

  // ---------------------------------------------------------------------
  // 3. Department progress
  // ---------------------------------------------------------------------
  const deptData = useMemo(() => {
    return directions
      .map((d) => {
        const t = active.filter((x) => x.direction_id === d.id);
        const done = t.filter((x) => x.status === "completed").length;
        const pct = t.length ? Math.round((done / t.length) * 100) : 0;
        return { id: d.id, name: d.name, color: d.color, pct, total: t.length };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [directions, active]);

  // ---------------------------------------------------------------------
  // 4. Quarterly plan statuses — drop empty buckets so the chart focuses
  //    on what's actually in the system.
  // ---------------------------------------------------------------------
  const planStatusData = useMemo(() => {
    const buckets: PlanStatus[] = [
      "draft", "on_review", "changes_requested", "approved", "in_progress", "completed",
    ];
    return buckets
      .map((s) => ({
        name: PLAN_STATUS_LABELS[s],
        value: plans.filter((p) => p.status === s).length,
        key: s,
      }))
      .filter((d) => d.value > 0);
  }, [plans]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Аналитика</h2>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Задачи по статусам" subtitle="Где сейчас основная нагрузка">
          {statusData.length === 0 ? (
            <Empty />
          ) : (
            <div className="mx-auto h-56 max-w-[280px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {statusData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <Legend items={statusData} />
        </ChartCard>

        <ChartCard title="Задачи по приоритетам" subtitle="Сколько срочного на руках">
          {prioData.length === 0 ? (
            <Empty />
          ) : (
            <div className="mx-auto h-56 max-w-[280px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={prioData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {prioData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <Legend items={prioData} />
        </ChartCard>

        <ChartCard
          title="Прогресс по отделам"
          subtitle="Кто двигается, кто отстаёт"
        >
          {deptData.length === 0 ? (
            <Empty />
          ) : (
            // Кастомный список вместо recharts'a — он плохо рендерит
            // горизонтальный bar-chart при 1-2 элементах и при 0% значениях
            // (бар нулевой ширины невидим, остаётся одинокая ось).
            <ul className="space-y-2.5 py-1">
              {deptData.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/tasks?direction=${d.id}`)}
                    className="group block w-full text-left transition-opacity hover:opacity-90"
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="font-medium">{d.name}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums">
                        {d.pct}% · {d.total} {d.total === 1 ? "задача" : d.total < 5 ? "задачи" : "задач"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{
                          width: `${Math.max(d.pct, d.total > 0 ? 2 : 0)}%`,
                          backgroundColor: d.color,
                        }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="Квартальные планы по статусам"
          subtitle="Готовность планирования"
        >
          {planStatusData.length === 0 ? (
            <Empty />
          ) : (
            // Список чипов вместо bar-chart — для 1-3 значений выглядит
            // читабельнее, плюс цвет каждого столбца берётся из
            // соответствующего тона статуса.
            <ul className="space-y-2 py-1">
              {planStatusData.map((s) => {
                const tone =
                  s.key === "approved" || s.key === "completed" ? "bg-success" :
                  s.key === "on_review" ? "bg-warning" :
                  s.key === "changes_requested" ? "bg-destructive" :
                  s.key === "in_progress" || s.key === "draft" ? "bg-info" :
                  "bg-foreground";
                const max = Math.max(...planStatusData.map((x) => x.value));
                const ratio = max > 0 ? (s.value / max) * 100 : 0;
                return (
                  <li key={s.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground tabular-nums">{s.value}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-[width] duration-700", tone)}
                        style={{ width: `${Math.max(ratio, 2)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Legend({ items }: { items: Array<{ name: string; value: number; fill: string }> }) {
  if (items.length === 0) return null;
  // flex-wrap chips: каждый элемент остаётся компактным, значение прилипает
  // прямо к своему лейблу, без пустых пространств от ml-auto в широкой
  // grid-колонке.
  return (
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
      {items.map((d) => (
        <li
          key={d.name}
          className="inline-flex items-center gap-1.5 text-muted-foreground"
        >
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: d.fill }} />
          <span>{d.name}</span>
          <span className="tabular-nums font-medium text-foreground">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return (
    <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
      Нет данных
    </div>
  );
}
