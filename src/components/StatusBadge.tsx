import { STATUSES, TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const s = STATUSES.find((x) => x.value === status)!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        backgroundColor: `hsl(var(--${s.colorVar}) / 0.15)`,
        color: `hsl(var(--${s.colorVar}))`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `hsl(var(--${s.colorVar}))` }}
      />
      {s.label}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: import("@/lib/constants").TaskPriority; className?: string }) {
  const map = {
    low: { label: "Low", color: "priority-low" },
    medium: { label: "Medium", color: "priority-medium" },
    high: { label: "High", color: "priority-high" },
    critical: { label: "Critical", color: "priority-critical" },
  } as const;
  const p = map[priority];
  return (
    <span
      className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}
      style={{
        backgroundColor: `hsl(var(--${p.color}) / 0.15)`,
        color: `hsl(var(--${p.color}))`,
      }}
    >
      {p.label}
    </span>
  );
}