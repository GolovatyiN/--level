import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isPast, parseISO } from "date-fns";
import type { TaskStatus } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Один источник правды для понятия «просрочена». Задача считается
 * просроченной если:
 *   * у неё есть дедлайн,
 *   * дедлайн уже в прошлом,
 *   * она НЕ завершена и НЕ отменена.
 *
 * Раньше это правило было размножено по 5 файлам и в плашке сайдбара
 * «1 просрочено» болтались отменённые задачи.
 */
export function isOverdue(task: {
  deadline: string | null;
  status: TaskStatus;
}): boolean {
  if (!task.deadline) return false;
  if (task.status === "completed" || task.status === "cancelled") return false;
  return isPast(parseISO(task.deadline));
}
