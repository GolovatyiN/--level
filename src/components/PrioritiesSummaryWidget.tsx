import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Signal } from "lucide-react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useTasks, type Task } from "@/hooks/useTasks";
import type { TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Card = {
  value: TaskPriority;
  label: string;
  cls: string;
  iconCls: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const CARDS: Card[] = [
  {
    value: "critical",
    label: "Срочные задачи",
    cls: "border-destructive/40 bg-destructive/5 hover:border-destructive/60",
    iconCls: "text-destructive",
    Icon: Flame,
  },
  {
    value: "high",
    label: "Важные задачи",
    cls: "border-warning/40 bg-warning/5 hover:border-warning/60",
    iconCls: "text-warning",
    Icon: Signal,
  },
  {
    value: "medium",
    label: "Средние задачи",
    cls: "border-info/40 bg-info/5 hover:border-info/60",
    iconCls: "text-info",
    Icon: Signal,
  },
  {
    value: "low",
    label: "Несрочные задачи",
    cls: "border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50",
    iconCls: "text-muted-foreground",
    Icon: Signal,
  },
];

interface Props {
  /** Optional quarter scope — narrows counts to this quarter only. */
  quarter?: string;
  /** Optional direction scope — narrows counts to this direction only. */
  direction?: string;
}

/**
 * Priority workload widget. Counts open tasks per priority — это значит
 * без архивных и без задач со статусом «Завершена» или «Отменена»
 * (виджет показывает текущую нагрузку, а не отчётность по сделанному).
 *
 * Respects the dashboard's quarter and direction scope so the numbers here
 * agree with the status cards above.
 *
 * Each card linked to /tasks ранее — теперь страница задач удалена,
 * клик просто ведёт в раздел «Квартальные планы». Глубокий фильтр по
 * приоритету можно вернуть, если появится глобальный task-table.
 *
 * The "weekly delta" is the count of tasks of this priority created in the
 * last 7 days minus those created the 7 days before — a simple "is workload
 * growing or shrinking" signal that doesn't require a separate history log.
 */
export function PrioritiesSummaryWidget({ quarter, direction }: Props = {}) {
  const { data: tasks = [] } = useTasks();
  const navigate = useNavigate();

  const visible = useMemo<Task[]>(
    () =>
      tasks.filter((t) => {
        if (t.archived) return false;
        // Завершённые и отменённые считаем «закрытыми» — они не должны
        // светиться в счётчике текущей нагрузки.
        if (t.status === "completed" || t.status === "cancelled") return false;
        if (quarter && quarter !== "all" && t.quarter !== quarter) return false;
        if (direction && direction !== "all" && t.direction_id !== direction) return false;
        return true;
      }),
    [tasks, quarter, direction],
  );

  // Pre-compute counts per priority in one pass.
  const counts = useMemo(() => {
    const map = new Map<TaskPriority, number>();
    CARDS.forEach((c) => map.set(c.value, 0));
    visible.forEach((t) => {
      map.set(t.priority, (map.get(t.priority) ?? 0) + 1);
    });
    return map;
  }, [visible]);

  const goToList = (_priority: TaskPriority) => {
    // Глобальной страницы задач больше нет — ведём в матрицу планов.
    navigate("/plans");
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">По приоритетам</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c, idx) => {
          const total = counts.get(c.value) ?? 0;
          const Icon = c.Icon;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => goToList(c.value)}
              style={{ animationDelay: `${idx * 35}ms` }}
              className={cn(
                "hover-lift animate-fade-in text-left rounded-xl border p-4 shadow-card transition-all",
                c.cls,
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <Icon className={cn("h-4 w-4", c.iconCls)} />
              </div>
              <div className={cn("text-3xl font-semibold tabular-nums", c.iconCls)}>
                <AnimatedNumber value={total} duration={500} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

