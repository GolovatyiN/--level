import { useMemo } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { History as HistoryIcon } from "lucide-react";

import {
  PLAN_STATUS_LABELS,
  type PlanStatus,
  usePlanActivity,
  usePlanComments,
} from "@/hooks/usePlans";
import { useUserMap } from "@/hooks/useUsers";

/**
 * Хронологический timeline событий по конкретному квартальному плану.
 *
 * Объединяет события из двух источников:
 *  • department_plan_comments (записи типа status_change / approve /
 *    request_changes / submit), которые пишутся DB-триггерами;
 *  • audit_log (через usePlanActivity), который ловит plan_status_changed.
 *
 * Дубли (одинаковый actor + текст в одну секунду) убираются.
 *
 * Используется на /plans/:id (HistoryTab) и на /departments/:id, когда
 * выбран конкретный квартал и есть plan.
 */
export function PlanHistoryTimeline({ planId }: { planId: string }) {
  const { data: comments = [] } = usePlanComments(planId);
  const { data: actions = [] } = usePlanActivity(planId);
  const { map: userMap } = useUserMap();

  const events = useMemo(() => {
    const fromComments = comments
      .filter(
        (c) =>
          c.kind === "status_change" ||
          c.kind === "approve" ||
          c.kind === "request_changes" ||
          c.kind === "submit",
      )
      .map((c) => ({
        id: c.id,
        actor: c.author_id ? userMap.get(c.author_id) ?? null : c.author_name,
        text: c.content,
        kind: c.kind,
        created_at: c.created_at,
      }));
    const fromAudit = actions.map((a) => ({
      id: a.id,
      actor: a.actor_id ? userMap.get(a.actor_id) ?? null : null,
      text:
        a.action === "plan_status_changed"
          ? `Статус: ${
              PLAN_STATUS_LABELS[(a.details as any).from as PlanStatus] ??
              (a.details as any).from
            } → ${
              PLAN_STATUS_LABELS[(a.details as any).to as PlanStatus] ??
              (a.details as any).to
            }`
          : a.action,
      kind: "audit" as const,
      created_at: a.created_at,
    }));
    // De-dupe: comments и audit часто пишут одно и то же событие. Берём
    // первое появление по ключу «timestamp + текст».
    const seen = new Set<string>();
    const all = [...fromAudit, ...fromComments].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    return all.filter((e) => {
      const key = `${e.created_at.slice(0, 19)}::${e.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [comments, actions, userMap]);

  if (events.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">История пока пуста</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <HistoryIcon className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              <span className="font-medium">{e.actor ?? "—"}</span>{" "}
              <span className="text-muted-foreground">{e.text}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true, locale: ru })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
