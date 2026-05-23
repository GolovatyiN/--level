import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ClipboardCheck,
  LayoutDashboard,
  ListTodo,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTasks, type Task } from "@/hooks/useTasks";
import { useDirections } from "@/hooks/useDirections";
import { useCanManage } from "@/hooks/useUserRole";
import { TaskDialog } from "@/components/TaskDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Universal ⌘K command palette: search tasks/directions, jump to pages,
 * fire quick actions. Mounted once globally; all callers just toggle `open`.
 */
export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const canManage = useCanManage();
  const { data: tasks = [] } = useTasks(true);
  const { data: directions = [] } = useDirections();

  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Reset internal state when the palette closes so search input doesn't
  // remember stale text on next open.
  useEffect(() => {
    if (!open) {
      // tiny delay so the closing animation doesn't flicker the input
      const t = setTimeout(() => {
        // no-op — kept for future cleanup hooks
      }, 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  // Sort by recency for nicer UX — newest first.
  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
        .slice(0, 12),
    [tasks],
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput placeholder="Поиск задач, отделов или команд..." />
        <CommandList>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>

          <CommandGroup heading="Быстрые действия">
            <CommandItem onSelect={() => run(() => setTaskOpen(true))}>
              <Plus className="mr-2 h-4 w-4" />
              Новая задача
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Навигация">
            <CommandItem onSelect={() => run(() => navigate("/"))}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Панель управления
              <CommandShortcut>G D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate("/plans"))}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Квартальные планы
              <CommandShortcut>G L</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate("/archive"))}>
              <Archive className="mr-2 h-4 w-4" />
              Архив
            </CommandItem>
            {canManage && (
              <CommandItem onSelect={() => run(() => navigate("/management"))}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Управление
              </CommandItem>
            )}
          </CommandGroup>

          {recentTasks.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Задачи">
                {recentTasks.map((t) => {
                  const dir = directions.find((d) => d.id === t.direction_id);
                  return (
                    <CommandItem
                      key={t.id}
                      // Prefix the value with the title and a short hash so cmdk
                      // can do good fuzzy matching even when titles repeat.
                      value={`${t.title} ${t.assignee ?? ""} ${dir?.name ?? ""} ${t.id}`}
                      onSelect={() => run(() => setEditingTask(t))}
                    >
                      <ListTodo className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{t.title}</span>
                      {dir && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: dir.color }}
                          />
                          {dir.name}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      <TaskDialog
        open={!!editingTask}
        onOpenChange={(v) => !v && setEditingTask(null)}
        task={editingTask}
      />
    </>
  );
}
