import { Calendar, ExternalLink, GripVertical } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { Task } from "@/hooks/useTasks";
import { Direction } from "@/hooks/useDirections";
import { PriorityBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface Props {
  task: Task;
  direction?: Direction;
  onClick?: () => void;
  dragHandle?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
}

export function TaskCard({ task, direction, onClick, dragHandle, isDragging }: Props) {
  const overdue = task.deadline && isPast(parseISO(task.deadline)) && task.status !== "completed";
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
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{task.title}</h4>
            {dragHandle && (
              <button
                {...dragHandle}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 transition group-hover:opacity-100 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {direction && (
            <p className="mt-0.5 text-xs text-muted-foreground">{direction.name}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={task.priority} />
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {task.quarter}
            </span>
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
          {task.assignee && (
            <p className="mt-2 truncate text-[11px] text-muted-foreground">@ {task.assignee}</p>
          )}
        </div>
      </div>
    </div>
  );
}