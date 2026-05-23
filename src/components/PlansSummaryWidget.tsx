import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  RefreshCcw,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useDirections } from "@/hooks/useDirections";
import { useQuarters } from "@/hooks/useTaxonomies";
import { usePlans, type PlanStatus } from "@/hooks/usePlans";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { cn } from "@/lib/utils";

interface Props {
  /**
   * Quarter selected on the dashboard. Когда выбран конкретный квартал
   * (например, «Q2 2026») — статистика считается только по нему.
   * Когда не передан или === "all", агрегируем по всем кварталам.
   *
   * NB: direction-фильтр дашборда виджет намеренно игнорирует —
   * по ТЗ блок «Квартальные планы» показывает картину **по всем отделам**.
   */
  quarter?: string;
}

/**
 * Сводка квартальных планов по всем отделам.
 *
 * Карточки:
 *   • Бэклог            — отделы без плана на выбранный квартал.
 *   • В процессе        — планы со статусом `draft`.
 *   • На согласовании   — статус `on_review`.
 *   • Нужны правки      — статус `changes_requested`.
 *   • Готов             — статус `approved` плюс пост-апрувные `in_progress`,
 *                          `at_risk`, `blocked` (план уже одобрен и идёт).
 *   • Завершён          — статус `completed`.
 *
 * Средний прогресс = (готовые планы) / (всего планов/отделов) × 100,
 * где «готовые» = карточки «Готов» + «Завершён».
 *
 * Ниже карточек — два actionable-списка: планы на согласовании и планы,
 * по которым запрошены правки. Пустое состояние показываем явно.
 */
const TONE_CLS = {
  neutral: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
  destructive: "text-destructive",
} as const;

// Статусы, которые «обёрнуты» в карточку «Готов» — план одобрен и идёт.
const READY_STATUSES: PlanStatus[] = ["approved", "in_progress", "at_risk", "blocked"];

export function PlansSummaryWidget({ quarter }: Props = {}) {
  const { data: directions = [] } = useDirections();
  const { data: quarters = [] } = useQuarters();
  const { data: plans = [] } = usePlans();
  const navigate = useNavigate();

  // 1. Сужаем по выбранному кварталу (если выбран).
  const scopedPlans = useMemo(() => {
    if (!quarter || quarter === "all") return plans;
    const q = quarters.find((qq) => qq.label === quarter);
    if (!q) return [] as typeof plans;
    return plans.filter((p) => p.quarter_id === q.id);
  }, [plans, quarter, quarters]);

  // 2. Общее число «слотов» = отделы × кварталы (или просто отделы,
  // если выбран конкретный квартал). Это число, к которому будут
  // суммироваться все карточки, чтобы (Готов + Завершён) / total
  // дал понятный процент готовности.
  const totalSlots = useMemo(() => {
    if (!quarter || quarter === "all") return directions.length * quarters.length;
    return directions.length;
  }, [directions, quarters, quarter]);

  // 3. Считаем по статусам.
  const counts = useMemo(() => {
    const acc = { draft: 0, on_review: 0, changes_requested: 0, ready: 0, completed: 0 };
    scopedPlans.forEach((p) => {
      if (p.status === "archived") return; // архив не учитываем
      if (p.status === "draft") acc.draft += 1;
      else if (p.status === "on_review") acc.on_review += 1;
      else if (p.status === "changes_requested") acc.changes_requested += 1;
      else if (p.status === "completed") acc.completed += 1;
      else if (READY_STATUSES.includes(p.status)) acc.ready += 1;
    });
    const knownPlans = acc.draft + acc.on_review + acc.changes_requested + acc.ready + acc.completed;
    const backlog = Math.max(0, totalSlots - knownPlans);
    return { ...acc, backlog };
  }, [scopedPlans, totalSlots]);

  // 4. Готовые = Готов + Завершён. Делим на общее число слотов.
  const readyCount = counts.ready + counts.completed;
  const avgProgress = totalSlots > 0 ? Math.round((readyCount / totalSlots) * 100) : 0;

  // 5. Actionable-списки.
  const onReview = useMemo(
    () =>
      scopedPlans
        .filter((p) => p.status === "on_review")
        .map((p) => ({
          plan: p,
          dir: directions.find((d) => d.id === p.direction_id),
          q: quarters.find((qq) => qq.id === p.quarter_id),
        })),
    [scopedPlans, directions, quarters],
  );

  const changesRequested = useMemo(
    () =>
      scopedPlans
        .filter((p) => p.status === "changes_requested")
        .map((p) => ({
          plan: p,
          dir: directions.find((d) => d.id === p.direction_id),
          q: quarters.find((qq) => qq.id === p.quarter_id),
        })),
    [scopedPlans, directions, quarters],
  );

  const cards = [
    { key: "backlog",           label: "Бэклог",          value: counts.backlog,           icon: CircleDashed, tone: "neutral"     as const },
    { key: "draft",             label: "В процессе",      value: counts.draft,             icon: CircleDot,    tone: "info"        as const },
    { key: "on_review",         label: "На согласовании", value: counts.on_review,         icon: Send,         tone: "warning"     as const },
    { key: "changes_requested", label: "Нужны правки",    value: counts.changes_requested, icon: RefreshCcw,   tone: "destructive" as const },
    { key: "approved",          label: "Готов",           value: counts.ready,             icon: ShieldCheck,  tone: "success"     as const },
    { key: "completed",         label: "Завершён",        value: counts.completed,         icon: CheckCircle2, tone: "success"     as const },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Квартальные планы</h2>
        <button
          type="button"
          onClick={() => navigate("/plans")}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Открыть раздел →
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => navigate("/plans")}
              style={{ animationDelay: `${idx * 30}ms` }}
              className="hover-lift animate-fade-in rounded-xl border border-border bg-card p-3 text-left shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <Icon className={cn("h-3.5 w-3.5", TONE_CLS[c.tone])} />
              </div>
              <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", TONE_CLS[c.tone])}>
                <AnimatedNumber value={c.value} duration={500} />
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => navigate("/plans")}
          className="hover-lift animate-fade-in rounded-xl border border-border bg-card p-3 text-left shadow-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Средний прогресс</span>
            <TrendingUp className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums">
            <AnimatedNumber value={avgProgress} duration={500} />%
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80 transition-[width] duration-700"
              style={{ width: `${avgProgress}%` }}
            />
          </div>
        </button>
      </div>

      {onReview.length === 0 && changesRequested.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
          Нет планов, требующих внимания
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {onReview.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <p className="mb-2 text-xs font-medium text-warning">
                Ожидают согласования ({onReview.length})
              </p>
              <ul className="space-y-1.5">
                {onReview.slice(0, 6).map(({ plan, dir, q }) => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/plans/${plan.id}`)}
                      className="flex w-full items-center gap-2 rounded text-left text-xs transition-colors hover:text-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dir?.color ?? "#888" }} />
                      <span className="font-medium">{dir?.name ?? "—"}</span>
                      <span className="text-muted-foreground">— {q?.label ?? "—"}</span>
                    </button>
                  </li>
                ))}
                {onReview.length > 6 && (
                  <li className="text-[10px] text-muted-foreground">+{onReview.length - 6}</li>
                )}
              </ul>
            </div>
          )}

          {changesRequested.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="mb-2 text-xs font-medium text-destructive">
                Нужны правки ({changesRequested.length})
              </p>
              <ul className="space-y-1.5">
                {changesRequested.slice(0, 6).map(({ plan, dir, q }) => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/plans/${plan.id}`)}
                      className="flex w-full items-center gap-2 rounded text-left text-xs transition-colors hover:text-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dir?.color ?? "#888" }} />
                      <span className="font-medium">{dir?.name ?? "—"}</span>
                      <span className="text-muted-foreground">— {q?.label ?? "—"}</span>
                    </button>
                  </li>
                ))}
                {changesRequested.length > 6 && (
                  <li className="text-[10px] text-muted-foreground">+{changesRequested.length - 6}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
