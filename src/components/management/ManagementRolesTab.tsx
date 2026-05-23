import { Check, Minus } from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { RoleBadge } from "./RoleBadge";
import { cn } from "@/lib/utils";

/**
 * Permission matrix lives in code (not the DB) — roles map to a fixed set
 * of capabilities. Adding a custom permission means editing this file
 * AND the corresponding RLS policy / hook guard. Showing it in-app gives
 * Super Admins a single source of truth without inventing a separate
 * permissions table.
 */
type Capability = {
  key: string;
  label: string;
  description?: string;
};

const CAPS: Capability[] = [
  { key: "view",             label: "Просмотр данных",       description: "Дашборд, Roadmap, Таблица, KPI" },
  { key: "create",           label: "Создание",              description: "Задачи, KPI, отделы, теги" },
  { key: "edit",             label: "Редактирование",        description: "Изменение задач и KPI, в т.ч. чужих" },
  { key: "delete",           label: "Удаление",              description: "Удаление задач, KPI, тегов" },
  { key: "manage_users",     label: "Управление пользователями" },
  { key: "manage_departments", label: "Управление отделами" },
  { key: "manage_roles",     label: "Назначение ролей" },
  { key: "department_scope", label: "Доступ ограничен отделами" },
  { key: "audit_log",        label: "Журнал действий" },
];

const MATRIX: Record<AppRole, Set<string>> = {
  superadmin: new Set([
    "view", "create", "edit", "delete",
    "manage_users", "manage_departments", "manage_roles", "audit_log",
  ]),
  admin: new Set([
    "view", "create", "edit", "delete",
    "manage_users", "manage_departments", "audit_log",
  ]),
  department_head: new Set([
    "view", "create", "edit", "department_scope",
  ]),
  manager: new Set([
    "view", "create", "edit", "department_scope",
  ]),
  viewer: new Set([
    "view", "department_scope",
  ]),
  user: new Set([
    "view", "create", "edit",
  ]),
};

const DESCRIPTIONS: Record<AppRole, string> = {
  superadmin: "Полный доступ ко всей системе. Видит все отделы. Может назначать любые роли, в т.ч. других Super Admin'ов. Единственная роль, которая может изменять глобальные настройки.",
  admin: "Широкий доступ. Управляет пользователями и отделами. Может назначать любые роли кроме Super Admin. Не может удалить или ограничить Super Admin.",
  department_head: "Видит только свои отделы. Может редактировать данные внутри них. Не имеет доступа к управлению глобальными настройками. Может быть назначен на один или несколько отделов.",
  manager: "Видит только те отделы, к которым ему дан доступ. Может создавать/редактировать данные в рамках доступных отделов. Не управляет ролями и пользователями.",
  viewer: "Только чтение. Может видеть данные доступных отделов, но не может ничего создавать, редактировать или удалять.",
  user: "Базовая роль по умолчанию. Все аутентифицированные действия без department-scope ограничений.",
};

const ROLES: AppRole[] = ["superadmin", "admin", "department_head", "manager", "viewer", "user"];

export function ManagementRolesTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Описание ролей</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Доступы определяются комбинацией роли (базовый уровень прав), членства в отделах
          (область видимости данных) и явных permission'ов на отдел.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-1.5">
                <RoleBadge role={r} />
              </div>
              <p className="text-xs text-muted-foreground">{DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Матрица возможностей</h3>
          <p className="text-xs text-muted-foreground">
            Что именно может каждая роль на уровне приложения.
          </p>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Возможность</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
                    <RoleBadge role={r} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPS.map((c) => (
                <tr key={c.key} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{c.label}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground">{c.description}</div>
                    )}
                  </td>
                  {ROLES.map((r) => {
                    const ok = MATRIX[r].has(c.key);
                    return (
                      <td key={r} className="px-3 py-3 text-center">
                        {ok ? (
                          <Check className={cn("mx-auto h-4 w-4", c.key === "department_scope" ? "text-warning" : "text-success")} />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3 w-3 text-warning" /> «Доступ ограничен отделами» означает, что роль видит только те отделы, к которым ей явно дан доступ.
          </span>
        </div>
      </div>
    </div>
  );
}
