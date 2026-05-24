import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { Spinner } from "@/components/UiState";
import { DirectionDialog } from "@/components/DirectionDialog";
import { MultiSelectPopover, type MultiSelectOption } from "@/components/MultiSelectPopover";
import { useDirections, useReorderDirections, type Direction } from "@/hooks/useDirections";
import { useCanManage } from "@/hooks/useUserRole";
import { useQuarters } from "@/hooks/useTaxonomies";
import {
  PLAN_STATUS_LABELS,
  type DepartmentPlan,
  type DepartmentPlanStats,
  type PlanStatus,
  useCreatePlan,
  usePlans,
  usePlanStats,
} from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";
import { useTasks } from "@/hooks/useTasks";
import { cn, isOverdue } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Filter configuration
// ---------------------------------------------------------------------------

// Псевдо-статус «backlog» в фильтре — у отдела нет плана на выбранный квартал.
// Реальные значения в БД для одной кнопки могут раскрываться в несколько
// (например, «Готов» включает все пост-апрувные статусы).
const STATUS_FILTERS: { key: string; label: string; matches: (s: PlanStatus | null) => boolean }[] = [
  { key: "backlog",           label: "Бэклог",          matches: (s) => s === null },
  { key: "draft",             label: "В процессе",      matches: (s) => s === "draft" },
  { key: "on_review",         label: "На согласовании", matches: (s) => s === "on_review" },
  { key: "changes_requested", label: "Нужны правки",    matches: (s) => s === "changes_requested" },
  { key: "approved",          label: "Готов",           matches: (s) => s === "approved" || s === "in_progress" || s === "at_risk" || s === "blocked" },
  { key: "completed",         label: "Завершён",        matches: (s) => s === "completed" },
];

const QUARTER_NUMBERS = ["Q1", "Q2", "Q3", "Q4"] as const;

function quarterPrefix(label: string): string | null {
  const m = label.match(/^(Q[1-4])/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * /plans — список отделов с короткой годовой статистикой.
 *
 * Раньше здесь была матрица «отдел × квартал», и пользователю
 * приходилось кликать в каждую ячейку, чтобы провалиться в конкретный
 * план. Теперь основной сценарий другой:
 *
 *   /plans → клик по отделу → /departments/:id → внутри отдела
 *   фильтр по кварталам, таблица задач, дашборд и т.д.
 *
 * Поэтому страница превратилась в простой кликабельный список карточек
 * отделов. Фильтры (отдел / статус / квартал) остались — они помогают
 * найти нужные отделы, а не показывают per-cell ячейки.
 */
export default function Plans() {
  const navigate = useNavigate();
  const canManage = useCanManage();
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [], isLoading } = usePlans();
  const { data: stats = [] } = usePlanStats();
  const { data: allTasks = [] } = useTasks(true);
  const { map: userMap } = useUserMap();
  const reorder = useReorderDirections();

  // ---------- URL filters ----------
  const [searchParams, setSearchParams] = useSearchParams();
  const filterDirs = useMemo(
    () => searchParams.get("dirs")?.split(",").filter(Boolean) ?? [],
    [searchParams],
  );
  const filterStatuses = useMemo(
    () => searchParams.get("statuses")?.split(",").filter(Boolean) ?? [],
    [searchParams],
  );
  const filterQuarters = useMemo(
    () => searchParams.get("quarters")?.split(",").filter(Boolean) ?? [],
    [searchParams],
  );

  const setMulti = (key: string, next: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (next.length === 0) params.delete(key);
    else params.set(key, next.join(","));
    setSearchParams(params, { replace: true });
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("dirs");
    params.delete("statuses");
    params.delete("quarters");
    setSearchParams(params, { replace: true });
  };

  // ---------- Indexes ----------
  const statsByPlan = useMemo(() => {
    const m = new Map<string, DepartmentPlanStats>();
    stats.forEach((s) => m.set(s.plan_id, s));
    return m;
  }, [stats]);

  // План для пары (direction, quarter).
  const planByCell = useMemo(() => {
    const m = new Map<string, DepartmentPlan>();
    plans.forEach((p) => m.set(`${p.direction_id}::${p.quarter_id}`, p));
    return m;
  }, [plans]);

  // Список кварталов с учётом фильтра. Если выбран Q3 — берём только
  // те квартал-записи в БД, у которых label начинается с "Q3".
  const visibleQuarters = useMemo(() => {
    if (filterQuarters.length === 0) return quarters;
    return quarters.filter((q) => {
      const p = quarterPrefix(q.label);
      return p !== null && filterQuarters.includes(p);
    });
  }, [quarters, filterQuarters]);

  const visibleQuarterIds = useMemo(
    () => new Set(visibleQuarters.map((q) => q.id)),
    [visibleQuarters],
  );

  // ---------- Per-department aggregation ----------
  // Для каждого отдела считаем агрегированные показатели по видимым
  // кварталам: planы, задачи, процент выполнения, просроченные.
  type DeptAggregate = {
    direction: Direction;
    plansForDept: DepartmentPlan[];
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    progressPct: number;
    planStatuses: Set<PlanStatus>;
    hasBacklogCell: boolean; // хотя бы один видимый квартал без плана
  };

  const aggregateByDept = useMemo(() => {
    const map = new Map<string, DeptAggregate>();
    directions.forEach((d) => {
      const plansForDept = plans.filter(
        (p) => p.direction_id === d.id && visibleQuarterIds.has(p.quarter_id),
      );
      const tasksForDept = allTasks.filter((t) => {
        if (t.archived) return false;
        if (t.direction_id !== d.id) return false;
        if (filterQuarters.length === 0) return true;
        return t.quarter
          ? filterQuarters.includes(quarterPrefix(t.quarter) ?? "")
          : false;
      });
      const completed = tasksForDept.filter((t) => t.status === "completed").length;
      const overdue = tasksForDept.filter(isOverdue).length;
      const total = tasksForDept.length;
      const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const hasBacklogCell = visibleQuarters.some(
        (q) => !planByCell.has(`${d.id}::${q.id}`),
      );
      const planStatuses = new Set<PlanStatus>(plansForDept.map((p) => p.status));
      map.set(d.id, {
        direction: d,
        plansForDept,
        totalTasks: total,
        completedTasks: completed,
        overdueTasks: overdue,
        progressPct,
        planStatuses,
        hasBacklogCell,
      });
    });
    return map;
  }, [directions, plans, allTasks, visibleQuarterIds, visibleQuarters, planByCell, filterQuarters]);

  // ---------- Apply dept/status filter ----------
  const visibleDirections = useMemo(() => {
    let rows: Direction[] =
      filterDirs.length === 0
        ? directions
        : directions.filter((d) => filterDirs.includes(d.id));

    if (filterStatuses.length > 0) {
      const matchers = STATUS_FILTERS.filter((s) => filterStatuses.includes(s.key)).map((s) => s.matches);
      rows = rows.filter((d) => {
        const agg = aggregateByDept.get(d.id);
        if (!agg) return false;
        // Бэклог = есть видимая ячейка без плана.
        if (matchers.some((m) => m(null)) && agg.hasBacklogCell) return true;
        for (const status of agg.planStatuses) {
          if (matchers.some((m) => m(status))) return true;
        }
        return false;
      });
    }

    return rows;
  }, [directions, filterDirs, filterStatuses, aggregateByDept]);

  // ---------- DnD ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const directionIds = useMemo(() => directions.map((d) => d.id), [directions]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIndex = directionIds.indexOf(String(active.id));
      const newIndex = directionIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(directionIds, oldIndex, newIndex);
      reorder.mutate(next);
    },
    [directionIds, reorder],
  );

  // ---------- Misc ----------
  const [creatingFor, setCreatingFor] = useState<{ direction_id: string; quarter_id: string } | null>(null);
  const [creatingDir, setCreatingDir] = useState(false);
  const [editingDir, setEditingDir] = useState<Direction | null>(null);

  const anyFilterActive = filterDirs.length > 0 || filterStatuses.length > 0 || filterQuarters.length > 0;

  const directionOptions: MultiSelectOption[] = directions.map((d) => ({
    value: d.id,
    label: d.name,
    colorHex: d.color,
  }));
  const statusOptions: MultiSelectOption[] = STATUS_FILTERS.map((s) => ({
    value: s.key,
    label: s.label,
  }));
  const quarterOptions: MultiSelectOption[] = QUARTER_NUMBERS.map((q) => ({
    value: q,
    label: q,
  }));

  return (
    <>
      <PageHeader
        title="Квартальные планы"
        description="Отделы и их годовая статистика — кликните, чтобы открыть планы отдела"
        actions={
          canManage ? (
            <Button onClick={() => setCreatingDir(true)} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Отдел
            </Button>
          ) : null
        }
      />
      <PageTabs
        items={[
          { label: "Квартальные планы", to: "/plans" },
          { label: "Все задачи", to: "/tasks" },
        ]}
      />
      <div className="p-4 sm:p-8">
        {/* Фильтры */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MultiSelectPopover
            placeholder="Отдел"
            options={directionOptions}
            selected={filterDirs}
            onChange={(v) => setMulti("dirs", v)}
            searchable
            triggerClassName="min-w-[140px]"
          />
          <MultiSelectPopover
            placeholder="Статус"
            options={statusOptions}
            selected={filterStatuses}
            onChange={(v) => setMulti("statuses", v)}
            triggerClassName="min-w-[140px]"
          />
          <MultiSelectPopover
            placeholder="Квартал"
            options={quarterOptions}
            selected={filterQuarters}
            onChange={(v) => setMulti("quarters", v)}
            triggerClassName="min-w-[120px]"
          />
          {anyFilterActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-8 text-xs text-muted-foreground"
            >
              Сбросить фильтры
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            Показано отделов: {visibleDirections.length} из {directions.length}
          </span>
        </div>

        {isLoading && plans.length === 0 ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : directions.length === 0 ? (
          <EmptyState text="Сначала создайте хотя бы один отдел." />
        ) : visibleDirections.length === 0 ? (
          <EmptyState text="Под текущие фильтры ни один отдел не подходит." />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={visibleDirections.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {visibleDirections.map((d) => {
                  const agg = aggregateByDept.get(d.id);
                  if (!agg) return null;
                  return (
                    <DepartmentRow
                      key={d.id}
                      direction={d}
                      head={d.head_user_id ? userMap.get(d.head_user_id) ?? null : null}
                      agg={agg}
                      statsByPlan={statsByPlan}
                      canManage={canManage}
                      onOpen={() => navigate(`/departments/${d.id}`)}
                      onEdit={() => setEditingDir(d)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {creatingFor && (
        <CreatePlanDialog
          open
          onClose={() => setCreatingFor(null)}
          directionId={creatingFor.direction_id}
          quarterId={creatingFor.quarter_id}
          directionName={directions.find((d) => d.id === creatingFor.direction_id)?.name ?? "—"}
          quarterLabel={quarters.find((q) => q.id === creatingFor.quarter_id)?.label ?? "—"}
        />
      )}

      <DirectionDialog open={creatingDir} onOpenChange={setCreatingDir} />
      <DirectionDialog
        open={!!editingDir}
        onOpenChange={(v) => !v && setEditingDir(null)}
        direction={editingDir}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// DepartmentRow — карточка отдела в общем списке
// ---------------------------------------------------------------------------

function DepartmentRow({
  direction,
  head,
  agg,
  statsByPlan,
  canManage,
  onOpen,
  onEdit,
}: {
  direction: Direction;
  head: string | null;
  agg: {
    plansForDept: DepartmentPlan[];
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    progressPct: number;
  };
  statsByPlan: Map<string, DepartmentPlanStats>;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: direction.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Дополнительные счётчики поверх агрегата: на согласовании / готовы /
  // завершены (по статусам планов в скоупе фильтра).
  const reviewCount = agg.plansForDept.filter((p) => p.status === "on_review").length;
  const readyCount = agg.plansForDept.filter(
    (p) => p.status === "approved" || p.status === "in_progress" || p.status === "at_risk" || p.status === "blocked",
  ).length;
  const completedCount = agg.plansForDept.filter((p) => p.status === "completed").length;

  // Tone для прогресс-бара — единая палитра как у PlanStatusBadge.
  const fillCls =
    agg.progressPct >= 80
      ? "bg-success"
      : agg.progressPct >= 40
        ? "bg-info"
        : agg.progressPct > 0
          ? "bg-warning"
          : "bg-muted-foreground/40";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-stretch overflow-hidden rounded-xl border border-border bg-card transition-all",
        "hover:border-foreground/30 hover:shadow-sm",
        isDragging && "z-20 shadow-lg ring-2 ring-foreground/20",
      )}
    >
      {/* Drag handle / цветовая полоса слева */}
      <div className="flex w-1.5 shrink-0" style={{ backgroundColor: direction.color }} />
      {canManage && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground/30 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Перетащить отдел"
          title="Перетащить, чтобы изменить порядок"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="grid flex-1 grid-cols-1 items-center gap-4 px-4 py-3 text-left lg:grid-cols-[1.4fr_2fr_1fr_auto]"
      >
        {/* 1. Название + руководитель */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold">{direction.name}</span>
            {canManage && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit();
                  }
                }}
                className="text-muted-foreground/40 transition-colors hover:text-foreground"
                aria-label="Редактировать отдел"
                title="Редактировать отдел"
              >
                <Pencil className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {head ? `Руководитель: ${head}` : "Руководитель не назначен"}
          </div>
        </div>

        {/* 2. Прогресс */}
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
            <span>
              {agg.completedTasks}/{agg.totalTasks} задач
            </span>
            <span className="text-foreground">{agg.progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fillCls)}
              style={{ width: `${agg.progressPct}%` }}
            />
          </div>
        </div>

        {/* 3. Бейджи */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
          <Badge label="Планы" value={agg.plansForDept.length} tone="neutral" />
          {reviewCount > 0 && (
            <Badge label="На согл." value={reviewCount} tone="warning" />
          )}
          {readyCount > 0 && (
            <Badge label="Готов" value={readyCount} tone="success" />
          )}
          {completedCount > 0 && (
            <Badge label="Завер." value={completedCount} tone="success" />
          )}
          {agg.overdueTasks > 0 && (
            <Badge label="Просроч." value={agg.overdueTasks} tone="destructive" />
          )}
        </div>

        {/* 4. CTA */}
        <div className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Открыть планы <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </button>
    </div>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "success" | "destructive";
}) {
  const toneCls =
    tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : tone === "success"
        ? "border-success/30 bg-success/10 text-success"
        : tone === "destructive"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium tabular-nums",
        toneCls,
      )}
    >
      {label}: {value}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-plan dialog (используется только программно, не из таблицы)
// ---------------------------------------------------------------------------

function CreatePlanDialog({
  open,
  onClose,
  directionId,
  quarterId,
  directionName,
  quarterLabel,
}: {
  open: boolean;
  onClose: () => void;
  directionId: string;
  quarterId: string;
  directionName: string;
  quarterLabel: string;
}) {
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [description, setDescription] = useState("");

  const submit = async () => {
    const plan = await create
      .mutateAsync({
        direction_id: directionId,
        quarter_id: quarterId,
        description: description.trim() || null,
      })
      .catch(() => null);
    onClose();
    if (plan) navigate(`/plans/${plan.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый план — {directionName}, {quarterLabel}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="plan-direction">Отдел</Label>
            <Input id="plan-direction" value={directionName} readOnly disabled />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plan-quarter">Квартал</Label>
            <Input id="plan-quarter" value={quarterLabel} readOnly disabled />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plan-description">Описание / цели на квартал</Label>
            <Textarea
              id="plan-description"
              rows={5}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Какие задачи, инициативы или KPI будут в этом плане. Можно дополнить позже."
            />
            <p className="text-xs text-muted-foreground">
              План создаётся в статусе «{PLAN_STATUS_LABELS.draft}». Задачи, комментарии и
              согласование добавляются на детальной странице.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
