import type { Database } from "@/integrations/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export const STATUSES: { value: TaskStatus; label: string; colorVar: string }[] = [
  { value: "planned", label: "Запланировано", colorVar: "status-planned" },
  { value: "in_progress", label: "В работе", colorVar: "status-progress" },
  { value: "at_risk", label: "Под риском", colorVar: "status-risk" },
  { value: "blocked", label: "Блокер", colorVar: "status-blocked" },
  { value: "completed", label: "Завершено", colorVar: "status-completed" },
];

export const PRIORITIES: { value: TaskPriority; label: string; colorVar: string }[] = [
  { value: "low", label: "Низкий", colorVar: "priority-low" },
  { value: "medium", label: "Средний", colorVar: "priority-medium" },
  { value: "high", label: "Высокий", colorVar: "priority-high" },
  { value: "critical", label: "Критический", colorVar: "priority-critical" },
];

export const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;
export const priorityLabel = (p: TaskPriority) => PRIORITIES.find((x) => x.value === p)?.label ?? p;

export function generateQuarters(): string[] {
  const year = new Date().getFullYear();
  const list: string[] = [];
  for (let y = year - 1; y <= year + 2; y++) {
    for (let q = 1; q <= 4; q++) list.push(`Q${q} ${y}`);
  }
  return list;
}

export const QUARTERS = generateQuarters();

export function currentQuarter(): string {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

export const DIRECTION_COLORS = [
  "#6366f1", "#22c55e", "#f97316", "#ef4444", "#06b6d4",
  "#eab308", "#ec4899", "#8b5cf6", "#14b8a6", "#f59e0b",
];