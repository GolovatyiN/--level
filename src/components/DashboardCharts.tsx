import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isPast, parseISO } from "date-fns";
import { useTasks } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { usePlans, PLAN_STATUS_LABELS, type PlanStatus } from "@/hooks/usePlans";

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

/**
 * Four compact charts that answer "where do we stand?":
 *   1. Task statuses (donut) — what state is work in.
 *   2. Task priorities (donut) — how heavy is the load.
 *   3. Department progress (horizontal bar) — who's lagging.
 *   4. Quarterly plan statuses (vertical bar) — readiness of planning.
 */
export function DashboardCharts() {
  const { data: tasks = [] } = useTasks();
  const { data: directions = [] } = useDirections();
  const { data: plans = [] } = usePlans();
  const navigate = useNavigate();

  const active = useMemo(
    () => tasks.filter((t) => !t.archived),
    [tasks],
  );

  // ---------------------------------------------------------------------
  // 1. Task statuses
  // ---------------------------------------------------------------------
  const statusData = useMemo(() => {
    const inProgress = active.filter((t) => t.status === "in_progress").length;
    const atRisk     = active.filter((t) => t.status === "at_risk").length;
    const blocked    = active.filter((t) => t.status === "blocked").length;
    const completed  = active.filter((t) => t.status === "completed").length;
    const overdue    = active.filter(
      (t) => t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed",
    ).length;
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
  // 4. Quarterly plan statuses
  // ---------------------------------------------------------------------
  const planStatusData = useMemo(() => {
    const buckets: PlanStatus[] = [
      "draft", "on_review", "changes_requested", "approved", "in_progress", "completed",
    ];
    return buckets.map((s) => ({
      name: PLAN_STATUS_LABELS[s],
      value: plans.filter((p) => p.status === s).length,
      key: s,
    }));
  }, [plans]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Аналитика</h2>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Задачи по статусам" subtitle="Где сейчас основная нагрузка">
          {statusData.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-56">
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
            <div className="h-56">
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
            <div style={{ height: 32 + deptData.length * 28 }}>
              <ResponsiveContainer>
                <BarChart
                  data={deptData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                  barSize={16}
                  onClick={(d: any) => {
                    // Recharts puts the clicked datum in d.activePayload[0].payload.
                    const id = d?.activePayload?.[0]?.payload?.id;
                    if (id) navigate(`/tasks?direction=${id}`);
                  }}
                >
                  <XAxis type="number" hide domain={[0, 100]} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={110}
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [`${v}%`, "Прогресс"]}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {deptData.map((d) => (
                      <Cell key={d.id} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Квартальные планы по статусам"
          subtitle="Готовность планирования"
        >
          {plans.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart
                  data={planStatusData}
                  margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={28}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill={COLOURS.bar} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
  return (
    <ul className="mt-3 grid grid-cols-2 gap-1 text-xs">
      {items.map((d) => (
        <li key={d.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: d.fill }} />
          <span className="truncate">{d.name}</span>
          <span className="ml-auto tabular-nums text-foreground">{d.value}</span>
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
