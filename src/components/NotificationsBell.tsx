import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellOff,
  CheckCheck,
  ClipboardCheck,
  Flag,
  ListTodo,
  MessageSquare,
  PauseCircle,
  RefreshCcw,
  Send,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Notification,
  NotificationType,
  useClearAllNotifications,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import { useUserMap } from "@/hooks/useUsers";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  task_assigned: ListTodo,
  kpi_assigned: Target,
  kpi_mention: MessageSquare,
  kpi_progress: Target,
  kpi_comment: MessageSquare,
  plan_on_review:         Send,
  plan_approved:          ShieldCheck,
  plan_changes_requested: RefreshCcw,
  plan_at_risk:           Flag,
  plan_blocked:           PauseCircle,
  plan_completed:         Trophy,
  plan_comment:           ClipboardCheck,
};

function entityLink(n: Notification): string | null {
  if (n.entity_type === "task") return `/tasks?task=${n.entity_id}`;
  if (n.entity_type === "kpi") return `/kpi?kpi=${n.entity_id}`;
  if (n.entity_type === "kpi_comment") return `/kpi`;
  if (n.entity_type === "department_plan") return `/plans/${n.entity_id}`;
  return null;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data: items = [], isLoading } = useNotifications();
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();
  const clearAll = useClearAllNotifications();
  const { map: userMap } = useUserMap();
  const navigate = useNavigate();

  const handleClick = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    const link = entityLink(n);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative w-full justify-start gap-2 text-muted-foreground"
          aria-label={unread > 0 ? `${unread} непрочитанных уведомлений` : "Уведомления"}
        >
          <span className="relative inline-flex">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-3 min-w-[12px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-destructive-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
          <span>Уведомления</span>
          {unread > 0 && (
            <span className="ml-auto rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-0"
        align="start"
        side="right"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Уведомления</span>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                title="Прочитать все"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Прочитать
              </Button>
            )}
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => clearAll.mutate()}
                disabled={clearAll.isPending}
                title="Очистить все"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Загрузка...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Тут пусто</p>
              <p className="text-xs text-muted-foreground">
                Уведомления появятся, когда вам назначат задачу, цель или упомянут в чате.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                const actor = n.actor_id ? userMap.get(n.actor_id) ?? null : null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                        !n.read_at && "bg-accent/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          n.read_at ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{n.title}</span>
                          {!n.read_at && (
                            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          )}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                          {actor && <span className="truncate">{actor}</span>}
                          {actor && <span>·</span>}
                          <time
                            dateTime={n.created_at}
                            title={format(parseISO(n.created_at), "dd.MM.yyyy HH:mm")}
                          >
                            {formatDistanceToNow(parseISO(n.created_at), {
                              addSuffix: true,
                              locale: ru,
                            })}
                          </time>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
