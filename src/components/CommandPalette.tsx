import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Plus,
  ShieldCheck,
  Target,
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
import { useKpis, type Kpi } from "@/hooks/useKpis";
import { useDirections } from "@/hooks/useDirections";
import { useCanManage } from "@/hooks/useUserRole";
import { TaskDialog } from "@/components/TaskDialog";
import { KpiDialog } from "@/components/KpiDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Universal ⌘K command palette: search tasks/KPIs/directions, jump to pages,
 * fire quick actions. Mounted once globally; all callers just toggle `open`.
 */
export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const canManage = useCanManage();
  const { data: tasks = [] } = useTasks(true);
  const { data: kpis = [] } = useKpis();
  const { data: directions = [] } = useDirections();

  const [taskOpen, setTaskOpen] = useState(false);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingKpi, setEditingKpi] = useState<Kpi | null>(null);

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
  const recentKpis = useMemo(
    () =>
      [...kpis].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).slice(0, 8),
    [kpis],
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput placeholder="Поиск задач, целей, отделов или команд..." />
        <CommandList>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>

          <CommandGroup heading="Быстрые действия">
            <CommandItem onSelect={() => run(() => setTaskOpen(true))}>
              <Plus className="mr-2 h-4 w-4" />
              Новая задача
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setKpiOpen(true))}>
              <Target className="mr-2 h-4 w-4" />
              Новая цель
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
            <CommandItem onSelect={() => run(() => navigate("/tasks"))}>
              <ListChecks className="mr-2 h-4 w-4" />
              Планы и задачи
              <CommandShortcut>G T</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate("/kpi"))}>
              <Target className="mr-2 h-4 w-4" />
              Цели
              <CommandShortcut>G P</CommandShortcut>
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
                      value={`${t.title} ${t.assignee ?? ""} ${t.customer ?? ""} ${dir?.name ?? ""} ${t.id}`}
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

          {recentKpis.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Цели">
                {recentKpis.map((k) => (
                  <CommandItem
                    key={k.id}
                    value={`${k.name} ${k.owner ?? ""} ${k.id}`}
                    onSelect={() => run(() => setEditingKpi(k))}
                  >
                    <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{k.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {k.current_value}/{k.target_value} {k.unit}
                    </span>
                  </CommandItem>
                ))}
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
      <KpiDialog open={kpiOpen} onOpenChange={setKpiOpen} />
      <KpiDialog
        open={!!editingKpi}
        onOpenChange={(v) => !v && setEditingKpi(null)}
        kpi={editingKpi}
      />
    </>
  );
}
