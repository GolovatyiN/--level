import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleDashed, GripVertical, Loader2, Plus } from "lucide-react";
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
import { Spinner } from "@/components/UiState";
import { PlanStatusBadge } from "@/components/PlanStatusBadge";
import { MultiSelectPopover, type MultiSelectOption } from "@/components/MultiSelectPopover";
import { useDirections, useReorderDirections, type Direction } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import {
  BACKLOG_LABEL,
  PLAN_STATUS_LABELS,
  type DepartmentPlan,
  type DepartmentPlanStats,
  type PlanStatus,
  useCreatePlan,
  usePlans,
  usePlanStats,
} from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";
import { quarterLabelRu } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Filter configuration
// ---------------------------------------------------------------------------

// Псевдо-статус «backlog» в фильтре означает «нет плана на ячейке».
// Реальные значения в БД для одной кнопки могут раскрываться в несколько
// (например, «Готов» включает все пост-апрувные статусы — план одобрен и идёт).
const STATUS_FILTERS: { key: string; label: string; matches: (planStatus: PlanStatus | null) => boolean }[] = [
  {
    key: "backlog",
    label: BACKLOG_LABEL,
    matches: (s) => s === null,
  },
  {
    key: "draft",
    label: "В процессе",
    matches: (s) => s === "draft",
  },
  {
    key: "on_review",
    label: "На согласовании",
    matches: (s) => s === "on_review",
  },
  {
    key: "approved",
    label: "Готов",
    matches: (s) => s === "approved" || s === "in_progress" || s === "at_risk" || s === "blocked",
  },
  {
    key: "completed",
    label: "Завершён",
    matches: (s) => s === "completed",
  },
];

const QUARTER_NUMBERS = ["Q1", "Q2", "Q3", "Q4"] as const;

/** Парсит "Q3 2026" → "Q3", "Q1 2027" → "Q1". */
function quarterNumberPrefix(label: string): string | null {
  const m = label.match(/^(Q[1-4])/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Quarterly plans matrix. Each (department × quarter) cell is either a
 * full status card (PlanCell) or a Backlog placeholder with a "Создать"
 * button that opens a richer creation form.
 *
 * Сверху — блок фильтров (отдел / статус / квартал). Состояние пишем в
 * URL search params, чтобы фильтры переживали обновление страницы и
 * могли быть скопированы коллеге.
 *
 * Строки таблицы можно перетаскивать (drag handle слева) — порядок
 * сохраняется в БД (`directions.sort_order`).
 */
export default function Plans() {
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [], isLoading } = usePlans();
  const { data: stats = [] } = usePlanStats();
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
  const planByCell = useMemo(() => {
    const m = new Map<string, DepartmentPlan>();
    plans.forEach((p) => m.set(`${p.direction_id}::${p.quarter_id}`, p));
    return m;
  }, [plans]);

  const statsByPlan = useMemo(() => {
    const m = new Map<string, DepartmentPlanStats>();
    stats.forEach((s) => m.set(s.plan_id, s));
    return m;
  }, [stats]);

  const sortedQuarters = useMemo(
    () =>
      [...quarters].sort((a, b) =>
        (a.sort_key ?? a.label).localeCompare(b.sort_key ?? b.label),
      ),
    [quarters],
  );

  // ---------- Apply filters ----------
  // 1. Quarters — оставляем только те, чей Q-префикс попал в фильтр.
  const visibleQuarters = useMemo(() => {
    if (filterQuarters.length === 0) return sortedQuarters;
    return sortedQuarters.filter((q) => {
      const prefix = quarterNumberPrefix(q.label);
      return prefix !== null && filterQuarters.includes(prefix);
    });
  }, [sortedQuarters, filterQuarters]);

  // 2. Departments — выбранные напрямую + статус-фильтр пропускает строку,
  // если в видимых кварталах есть хотя бы одна ячейка с подходящим статусом.
  const visibleDirections = useMemo(() => {
    let rows: Direction[] =
      filterDirs.length === 0
        ? directions
        : directions.filter((d) => filterDirs.includes(d.id));

    if (filterStatuses.length > 0) {
      const matchers = STATUS_FILTERS.filter((s) => filterStatuses.includes(s.key)).map((s) => s.matches);
      rows = rows.filter((d) =>
        visibleQuarters.some((q) => {
          const plan = planByCell.get(`${d.id}::${q.id}`);
          const status = plan?.status ?? null;
          return matchers.some((m) => m(status));
        }),
      );
    }

    return rows;
  }, [directions, filterDirs, filterStatuses, visibleQuarters, planByCell]);

  // ---------- DnD ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const directionIds = useMemo(() => directions.map((d) => d.id), [directions]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      // Перетаскивание идёт по полному (не отфильтрованному) списку —
      // фильтр визуальный, порядок мы храним для всех отделов.
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
        description="Планы отделов на каждый квартал — статус, прогресс, согласование"
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
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Сначала создайте хотя бы один отдел и один квартал.
            </p>
          </div>
        ) : sortedQuarters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              В системе нет видимых кварталов. Создайте их в разделе «Управление → Кварталы».
            </p>
          </div>
        ) : visibleQuarters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              По выбранному фильтру кварталов ничего нет.
            </p>
          </div>
        ) : visibleDirections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Под текущие фильтры ни один отдел не подходит.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {/* Пустая ячейка для drag-handle столбца */}
                  <th className="sticky left-0 z-10 w-6 bg-muted/30 px-1" aria-hidden />
                  <th className="sticky left-6 z-10 bg-muted/30 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Отдел
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Руководитель
                  </th>
                  {visibleQuarters.map((q) => (
                    <th
                      key={q.id}
                      className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
                      style={{ minWidth: 200 }}
                    >
                      {quarterLabelRu(q.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={visibleDirections.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {visibleDirections.map((d) => {
                      const head = d.head_user_id ? userMap.get(d.head_user_id) : null;
                      return (
                        <DirectionRow
                          key={d.id}
                          direction={d}
                          head={head}
                          quarters={visibleQuarters}
                          planByCell={planByCell}
                          statsByPlan={statsByPlan}
                          onCreate={(quarter_id) =>
                            setCreatingFor({ direction_id: d.id, quarter_id })
                          }
                        />
                      );
                    })}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>
        )}
      </div>

      {creatingFor && (
        <CreatePlanDialog
          open
          onClose={() => setCreatingFor(null)}
          directionId={creatingFor.direction_id}
          quarterId={creatingFor.quarter_id}
          directionName={directions.find((d) => d.id === creatingFor.direction_id)?.name ?? "—"}
          quarterLabel={quarterLabelRu(quarters.find((q) => q.id === creatingFor.quarter_id)?.label ?? "—")}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Row (sortable)
// ---------------------------------------------------------------------------

function DirectionRow({
  direction,
  head,
  quarters,
  planByCell,
  statsByPlan,
  onCreate,
}: {
  direction: Direction;
  head: string | null;
  quarters: { id: string; label: string }[];
  planByCell: Map<string, DepartmentPlan>;
  statsByPlan: Map<string, DepartmentPlanStats>;
  onCreate: (quarter_id: string) => void;
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

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-border/50 align-top last:border-0",
        isDragging && "z-20 bg-muted shadow-lg",
      )}
    >
      <td className="sticky left-0 z-10 w-6 bg-card px-1 align-middle">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-7 w-6 cursor-grab items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Перетащить отдел"
          title="Перетащить, чтобы изменить порядок"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="sticky left-6 z-10 bg-card px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: direction.color }}
          />
          <span className="font-medium">{direction.name}</span>
        </div>
      </td>
      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">
        {head ?? "— не назначен —"}
      </td>
      {quarters.map((q) => {
        const plan = planByCell.get(`${direction.id}::${q.id}`);
        return (
          <td key={q.id} className="px-3 py-3">
            {plan ? (
              <PlanCell plan={plan} stats={statsByPlan.get(plan.id)} />
            ) : (
              <BacklogCell onCreate={() => onCreate(q.id)} />
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function PlanCell({ plan, stats }: { plan: DepartmentPlan; stats?: DepartmentPlanStats }) {
  const navigate = useNavigate();
  const pct = stats?.progress_pct ?? 0;
  const total = stats?.total_tasks ?? 0;
  const done = stats?.completed_tasks ?? 0;

  // Tone-driven progress bar fill — reuses the same colour palette the
  // status pill uses, so the row tells one consistent story at a glance.
  const fillCls =
    plan.status === "approved" || plan.status === "completed"
      ? "bg-success"
      : plan.status === "changes_requested" || plan.status === "blocked"
        ? "bg-destructive"
        : plan.status === "on_review" || plan.status === "at_risk"
          ? "bg-warning"
          : "bg-info";

  return (
    <button
      type="button"
      onClick={() => navigate(`/plans/${plan.id}`)}
      className="group block w-full rounded-lg border border-border bg-background p-2.5 text-left transition-all hover:-translate-y-px hover:border-foreground/30 hover:shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <PlanStatusBadge status={plan.status} />
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{pct}%</span>
        <span className="text-[10px] text-muted-foreground">выполнено</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fillCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(stats?.overdue_tasks || stats?.blocked_tasks || stats?.at_risk_tasks) ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          {stats.overdue_tasks ? (
            <span className="text-destructive">{stats.overdue_tasks} просроч.</span>
          ) : null}
          {stats.blocked_tasks ? (
            <span className="text-destructive">{stats.blocked_tasks} блок.</span>
          ) : null}
          {stats.at_risk_tasks ? (
            <span className="text-warning">{stats.at_risk_tasks} риск</span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function BacklogCell({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group flex w-full flex-col items-start gap-1.5 rounded-lg border border-dashed border-border bg-background/40 p-2.5 text-left transition-all hover:border-foreground/40 hover:bg-background"
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <CircleDashed className="h-3 w-3" /> {BACKLOG_LABEL}
      </span>
      <span className="text-[11px] text-muted-foreground/80">План ещё не создан</span>
      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground transition-opacity opacity-70 group-hover:opacity-100">
        <Plus className="h-3 w-3" /> Создать
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
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
