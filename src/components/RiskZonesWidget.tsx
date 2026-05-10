import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { isPast, parseISO } from "date-fns";
import { AlertCircle, AlertTriangle, FileWarning, Flame } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { usePlans } from "@/hooks/usePlans";
import { useQuarters } from "@/hooks/useTaxonomies";
import { quarterLabelRu } from "@/lib/constants";
import { cn } from "@/lib/utils";

type ZoneItem = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  iconCls: string;
  title: string;
  href: string;
};

/**
 * Compact "Зоны внимания" — surfaces only the things that need eyes.
 * Pulls from tasks (overdue, critical), directions (low progress) and
 * plans (changes_requested, on_review). Capped at 5 items so it stays
 * a quick-scan widget rather than a noise stream.
 */
export function RiskZonesWidget() {
  const { data: tasks = [] } = useTasks();
  const { data: directions = [] } = useDirections();
  const { data: plans = [] } = usePlans();
  const { data: quarters = [] } = useQuarters();
  const navigate = useNavigate();

  const items = useMemo<ZoneItem[]>(() => {
    const dirById = new Map(directions.map((d) => [d.id, d]));
    const qById   = new Map(quarters.map((q) => [q.id, q]));

    const list: ZoneItem[] = [];

    // 1. Departments with overdue tasks.
    const overdueByDir = new Map<string, number>();
    tasks.forEach((t) => {
      if (t.archived) return;
      if (!t.direction_id) return;
      if (t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed") {
        overdueByDir.set(t.direction_id, (overdueByDir.get(t.direction_id) ?? 0) + 1);
      }
    });
    Array.from(overdueByDir.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([dirId, n]) => {
        const d = dirById.get(dirId);
        if (!d) return;
        list.push({
          key: `overdue:${dirId}`,
          icon: AlertCircle,
          iconCls: "text-destructive",
          title: `${d.name}: ${n} ${plural(n, "просроченная задача", "просроченные задачи", "просроченных задач")}`,
          href: `/tasks?direction=${dirId}&status=overdue`,
        });
      });

    // 2. Departments with critical tasks.
    const critByDir = new Map<string, number>();
    tasks.forEach((t) => {
      if (t.archived) return;
      if (t.status === "completed") return;
      if (!t.direction_id) return;
      if (t.priority === "critical") {
        critByDir.set(t.direction_id, (critByDir.get(t.direction_id) ?? 0) + 1);
      }
    });
    Array.from(critByDir.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([dirId, n]) => {
        const d = dirById.get(dirId);
        if (!d) return;
        list.push({
          key: `critical:${dirId}`,
          icon: Flame,
          iconCls: "text-destructive",
          title: `${d.name}: ${n} ${plural(n, "критическая задача", "критические задачи", "критических задач")}`,
          href: `/tasks?direction=${dirId}&priority=critical`,
        });
      });

    // 3. Plans needing attention — changes_requested first, then on_review.
    plans
      .filter((p) => p.status === "changes_requested")
      .forEach((p) => {
        const d = dirById.get(p.direction_id);
        const q = qById.get(p.quarter_id);
        list.push({
          key: `plan-changes:${p.id}`,
          icon: FileWarning,
          iconCls: "text-destructive",
          title: `${d?.name ?? "—"}, ${q ? quarterLabelRu(q.label) : "—"}: план нужно доработать`,
          href: `/plans/${p.id}`,
        });
      });
    plans
      .filter((p) => p.status === "on_review")
      .forEach((p) => {
        const d = dirById.get(p.direction_id);
        const q = qById.get(p.quarter_id);
        list.push({
          key: `plan-review:${p.id}`,
          icon: AlertTriangle,
          iconCls: "text-warning",
          title: `${d?.name ?? "—"}, ${q ? quarterLabelRu(q.label) : "—"}: ждёт согласования`,
          href: `/plans/${p.id}`,
        });
      });

    // De-duplicate (same dept could land here for both overdue + critical
    // — that's OK, two separate pings) and cap at 5.
    return list.slice(0, 5);
  }, [tasks, directions, plans, quarters]);

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-success/30 bg-success/5 p-4">
        <h2 className="mb-1 text-sm font-semibold">Зоны внимания</h2>
        <p className="text-xs text-success">Сейчас всё спокойно — критических точек нет.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-3 text-sm font-semibold">Зоны внимания</h2>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => navigate(it.href)}
                className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <Icon className={cn("h-4 w-4 shrink-0", it.iconCls)} />
                <span className="truncate">{it.title}</span>
                <span className="ml-auto text-xs text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100">
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Russian numeric form: 1 → ед., 2-4 → мн. неск., 5+ → мн. много. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
