import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Task, useUpdateTask, useTasks } from "@/hooks/useTasks";
import { useUsers, useUserMap } from "@/hooks/useUsers";
import { cn } from "@/lib/utils";

/**
 * Inline-редактор «Ответственный» прямо в ячейке таблицы. Открывается
 * по клику на текстовом представлении (избегаем глобального `onClick`
 * строки, который открывает диалог). Поддерживает очистку — отправляет
 * `assignee_id: null`, чтобы `stripUnreadyTaskFields` не выкинул поле.
 */
export function InlineAssigneeEditor({
  task,
  disabled,
}: {
  task: Task;
  disabled: boolean;
}) {
  const update = useUpdateTask();
  const { data: users = [], isLoading } = useUsers();
  const { map: userMap } = useUserMap();
  const [open, setOpen] = useState(false);

  const currentName = task.assignee_id
    ? userMap.get(task.assignee_id) ?? null
    : task.assignee ?? null;

  const pick = (userId: string | null) => {
    if (userId === (task.assignee_id ?? null)) {
      setOpen(false);
      return;
    }
    update.mutate({
      id: task.id,
      patch: { assignee_id: userId },
      prev: task,
    });
    setOpen(false);
  };

  if (disabled) {
    return (
      <span className="text-xs text-muted-foreground">{currentName ?? "—"}</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            currentName ? "text-foreground" : "text-muted-foreground",
          )}
          title={currentName ?? "Назначить ответственного"}
        >
          <span className="truncate">{currentName ?? "—"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Поиск по имени или email..." />
          <CommandList>
            <CommandEmpty>{isLoading ? "Загрузка..." : "Никого не найдено."}</CommandEmpty>
            {task.assignee_id && (
              <CommandGroup>
                <CommandItem
                  value="__clear"
                  onSelect={() => pick(null)}
                  className="text-muted-foreground"
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  Очистить
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {users.map((u) => {
                const active = u.user_id === task.assignee_id;
                return (
                  <CommandItem
                    key={u.user_id}
                    value={`${u.display_name ?? ""} ${u.email ?? ""} ${u.user_id}`}
                    onSelect={() => pick(u.user_id)}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate leading-tight">
                        {u.display_name ?? u.email ?? "—"}
                      </span>
                      {u.display_name && u.email && (
                        <span className="truncate text-[10px] leading-tight text-muted-foreground">
                          {u.email}
                        </span>
                      )}
                    </div>
                    {active && <Check className="ml-2 h-4 w-4 shrink-0" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Inline-редактор «Направление» (свободный текст). Снизу popover собираем
 * подсказки из direction_tag всех задач — пользователь может выбрать ранее
 * введённый ярлык или вписать новый. Сохранение по Enter / blur / Сохранить.
 */
export function InlineDirectionTagEditor({
  task,
  disabled,
}: {
  task: Task;
  disabled: boolean;
}) {
  const update = useUpdateTask();
  const { data: allTasks = [] } = useTasks();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(task.direction_tag ?? "");

  useEffect(() => {
    if (!open) setValue(task.direction_tag ?? "");
  }, [task.direction_tag, open]);

  // Собираем уникальные направления из задач — самые частые показываем выше.
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of allTasks) {
      const tag = t.direction_tag?.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [allTasks]);

  const save = (next: string | null) => {
    const trimmed = next?.trim() || null;
    const current = task.direction_tag ?? null;
    if (trimmed === current) {
      setOpen(false);
      return;
    }
    update.mutate({
      id: task.id,
      patch: { direction_tag: trimmed },
      prev: task,
    });
    setOpen(false);
  };

  if (disabled) {
    return task.direction_tag ? (
      <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground">
        {task.direction_tag}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          title={task.direction_tag ?? "Указать направление"}
        >
          {task.direction_tag ? (
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground">
              {task.direction_tag}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[240px] p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={value}
            maxLength={64}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save(value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="ИИ, HR, Процессы..."
            className="h-8 text-sm"
          />
          {suggestions.length > 0 && (
            <div className="flex max-h-[160px] flex-col gap-0.5 overflow-y-auto scrollbar-thin">
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Из других задач
              </div>
              {suggestions
                .filter((s) =>
                  value.trim() ? s.toLowerCase().includes(value.trim().toLowerCase()) : true,
                )
                .slice(0, 12)
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => save(tag)}
                    className={cn(
                      "rounded px-2 py-1 text-left text-xs hover:bg-muted",
                      task.direction_tag === tag && "bg-muted font-medium",
                    )}
                  >
                    {tag}
                  </button>
                ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {task.direction_tag ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => save(null)}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3" /> Очистить
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => save(value)}
              className="h-7 px-3 text-xs"
            >
              Сохранить
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
