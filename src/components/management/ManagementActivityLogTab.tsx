import { useMemo } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Activity,
  Layers,
  Power,
  PowerOff,
  Shield,
  ShieldCheck,
  ShieldX,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Spinner } from "@/components/UiState";
import { useDirections } from "@/hooks/useDirections";
import { useAuditLog, useManagementUsers, type AuditLogEntry } from "@/hooks/useManagement";
import { ROLE_LABELS, type AppRole } from "@/hooks/useUserRole";
import { ACCESS_LABELS, type AccessLevel } from "@/hooks/useManagement";
import { cn } from "@/lib/utils";

const ACTION_META: Record<string, { Icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  role_granted:                { Icon: ShieldCheck, cls: "text-info",        label: "Назначена роль" },
  role_revoked:                { Icon: ShieldX,     cls: "text-muted-foreground", label: "Отозвана роль" },
  department_access_granted:   { Icon: UserPlus,    cls: "text-success",     label: "Выдан доступ к отделу" },
  department_access_changed:   { Icon: UserCog,     cls: "text-info",        label: "Изменён доступ к отделу" },
  department_access_revoked:   { Icon: UserMinus,   cls: "text-warning",     label: "Отозван доступ к отделу" },
  department_head_changed:     { Icon: Layers,      cls: "text-foreground",  label: "Изменён руководитель" },
  user_deactivated:            { Icon: PowerOff,    cls: "text-destructive", label: "Пользователь деактивирован" },
  user_reactivated:            { Icon: Power,       cls: "text-success",     label: "Пользователь активирован" },
};

function ActionIcon({ action }: { action: string }) {
  const m = ACTION_META[action];
  const Icon = m?.Icon ?? Activity;
  const cls = m?.cls ?? "text-muted-foreground";
  return (
    <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted", cls)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function summarize(
  entry: AuditLogEntry,
  userName: (id: string | null | undefined) => string,
  deptName: (id: string | null | undefined) => string,
): string {
  const d = entry.details ?? {};
  switch (entry.action) {
    case "role_granted":
      return `Роль ${ROLE_LABELS[d.role as AppRole] ?? d.role}`;
    case "role_revoked":
      return `Снята роль ${ROLE_LABELS[d.role as AppRole] ?? d.role}`;
    case "department_access_granted":
      return `${deptName(d.direction_id as string)} — ${ACCESS_LABELS[d.access_level as AccessLevel] ?? d.access_level}`;
    case "department_access_changed":
      return `${deptName(d.direction_id as string)}: ${ACCESS_LABELS[d.from as AccessLevel] ?? d.from} → ${ACCESS_LABELS[d.to as AccessLevel] ?? d.to}`;
    case "department_access_revoked":
      return `${deptName(d.direction_id as string)} — доступ отозван`;
    case "department_head_changed":
      return `${d.department_name ?? "—"}: ${userName(d.from as string) || "—"} → ${userName(d.to as string) || "—"}`;
    default:
      return "";
  }
}

export function ManagementActivityLogTab() {
  const { data: items = [], isLoading } = useAuditLog(150);
  const { data: users = [] } = useManagementUsers();
  const { data: directions = [] } = useDirections();

  const userMap = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);
  const dirMap = useMemo(() => new Map(directions.map((d) => [d.id, d])), [directions]);

  const userName = (id: string | null | undefined) => {
    if (!id) return "";
    const u = userMap.get(id);
    return u?.display_name ?? u?.email ?? id.slice(0, 8);
  };
  const deptName = (id: string | null | undefined) => {
    if (!id) return "";
    return dirMap.get(id)?.name ?? id.slice(0, 8);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Activity className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">История пуста</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Действия по управлению ролями и доступами будут появляться здесь.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {items.map((e) => {
          const meta = ACTION_META[e.action];
          const actor = userName(e.actor_id);
          const targetUser = e.target_type === "user" ? userName(e.target_id) : null;
          const targetDept = e.target_type === "department" ? deptName(e.target_id) : null;
          const summary = summarize(e, userName, deptName);
          return (
            <li key={e.id} className="flex gap-3 px-4 py-3">
              <ActionIcon action={e.action} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5 text-sm">
                  <span className="font-medium">{actor || "Система"}</span>
                  <span className="text-muted-foreground">{meta?.label ?? e.action}</span>
                  {targetUser && <span className="font-medium">{targetUser}</span>}
                  {targetDept && <span className="font-medium">{targetDept}</span>}
                </div>
                {summary && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>
                )}
                <div
                  className="mt-1 text-[11px] text-muted-foreground/80"
                  title={format(parseISO(e.created_at), "dd.MM.yyyy HH:mm:ss")}
                >
                  {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true, locale: ru })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
