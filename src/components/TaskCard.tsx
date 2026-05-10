import { Calendar, ExternalLink } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { Task } from "@/hooks/useTasks";
import { Direction } from "@/hooks/useDirections";
import { useUserMap } from "@/hooks/useUsers";
import { PriorityBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface Props {
  task: Task;
  direction?: Direction;
  onClick?: () => void;
  isDragging?: boolean;
}

export function TaskCard({ task, direction, onClick, isDragging }: Props) {
  const overdue = task.deadline && isPast(parseISO(task.deadline)) && task.status !== "completed";
  const { map: userMap } = useUserMap();
  const assigneeName = task.assignee_id ? userMap.get(task.assignee_id) ?? null : task.assignee;
  return (
    <div
      onClick={onClick}
      className={cn(
        "group hover-lift relative cursor-pointer rounded-lg border border-border bg-card p-3 shadow-card hover:border-primary/40",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        {direction && (
          <div
            className="mt-1 h-2 w-2 shrink-0 rounded-full transition-transform duration-300 group-hover:scale-125"
            style={{ backgroundColor: direction.color }}
            title={direction.name}
          />
        )}
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{task.title}</h4>
          {direction && (
            <p className="mt-0.5 text-xs text-muted-foreground">{direction.name}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {task.quarter}
            </span>
            {task.direction_tag && (
              <span
                className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                title="Направление"
              >
                {task.direction_tag}
              </span>
            )}
            {task.deadline && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px]",
                  overdue ? "animate-pulse-soft text-destructive" : "text-muted-foreground",
                )}
              >
                <Calendar className="h-3 w-3" />
                {format(parseISO(task.deadline), "dd.MM")}
              </span>
            )}
            {task.asana_url && (
              <a
                href={task.asana_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {assigneeName && (
            <p className="mt-2 truncate text-[11px] text-muted-foreground">@ {assigneeName}</p>
          )}
        </div>
      </div>
    </div>
  );
}