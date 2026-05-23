import type { Database } from "@/integrations/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export const STATUSES: { value: TaskStatus; label: string; colorVar: string }[] = [
  { value: "backlog",     label: "Бэклог",        colorVar: "status-planned" },
  { value: "planned",     label: "Запланировано", colorVar: "status-planned" },
  { value: "in_progress", label: "В работе",      colorVar: "status-progress" },
  { value: "at_risk",     label: "Под риском",    colorVar: "status-risk" },
  { value: "blocked",     label: "Заблокирована", colorVar: "status-blocked" },
  { value: "in_review",   label: "На проверке",   colorVar: "status-progress" },
  { value: "completed",   label: "Завершена",     colorVar: "status-completed" },
  { value: "cancelled",   label: "Отменена",      colorVar: "status-planned" },
];

export const PRIORITIES: { value: TaskPriority; label: string; colorVar: string }[] = [
  { value: "low", label: "Низкий", colorVar: "priority-low" },
  { value: "medium", label: "Средний", colorVar: "priority-medium" },
  { value: "high", label: "Высокий", colorVar: "priority-high" },
  { value: "critical", label: "Критический", colorVar: "priority-critical" },
];

export const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;
export const priorityLabel = (p: TaskPriority) => PRIORITIES.find((x) => x.value === p)?.label ?? p;

/**
 * Fallback quarter labels — used only when the live `quarters` table is
 * unavailable. Starts from 2026 (per spec: 2025 is hidden by default).
 */
export function generateQuarters(): string[] {
  const start = Math.max(2026, new Date().getFullYear());
  const list: string[] = [];
  for (let y = start; y <= start + 2; y++) {
    for (let q = 1; q <= 4; q++) list.push(`Q${q} ${y}`);
  }
  return list;
}

export const QUARTERS = generateQuarters();

/** Convert a "Q3 2026" → "3 квартал 2026" for UI display. */
export function quarterLabelRu(label: string): string {
  const m = label.match(/Q([1-4])\s*(\d{4})/i);
  if (!m) return label;
  return `${m[1]} квартал ${m[2]}`;
}

export function currentQuarter(): string {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

/**
 * Хронологическое сравнение лейблов вида "Q3 2026".
 * Лексикографический `.sort()` ставит «Q1 2027» раньше «Q2 2026» — это
 * неправильно. Этот компаратор сортирует сначала по году, потом по
 * номеру квартала, как и ожидает пользователь.
 */
export function compareQuarters(a: string, b: string): number {
  const re = /Q([1-4])\s*(\d{4})/i;
  const ma = a.match(re);
  const mb = b.match(re);
  if (!ma || !mb) return a.localeCompare(b);
  const yearDiff = parseInt(ma[2], 10) - parseInt(mb[2], 10);
  if (yearDiff !== 0) return yearDiff;
  return parseInt(ma[1], 10) - parseInt(mb[1], 10);
}

export const DIRECTION_COLORS = [
  "#6366f1", "#22c55e", "#f97316", "#ef4444", "#06b6d4",
  "#eab308", "#ec4899", "#8b5cf6", "#14b8a6", "#f59e0b",
];