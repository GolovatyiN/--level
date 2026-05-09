import { useMemo } from "react";
import { Eye, Pencil, ShieldCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDirections } from "@/hooks/useDirections";
import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  type AccessLevel,
  useDepartmentAccess,
  useManagementUsers,
  useSetDepartmentAccess,
} from "@/hooks/useManagement";
import { effectiveRole } from "@/hooks/useUserRole";
import { Spinner } from "@/components/UiState";
import { cn } from "@/lib/utils";

const NO_ACCESS = "__none__";

const ICONS: Record<AccessLevel, { Icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  view: { Icon: Eye, cls: "text-muted-foreground" },
  edit: { Icon: Pencil, cls: "text-info" },
  full: { Icon: ShieldCheck, cls: "text-success" },
};

export function ManagementAccessMatrixTab() {
  const { data: users = [], isLoading: usersLoading } = useManagementUsers();
  const { data: directions = [] } = useDirections();
  const { data: access = [] } = useDepartmentAccess();
  const setAccess = useSetDepartmentAccess();

  // (user_id, direction_id) → access_level for O(1) cell lookup.
  const cellMap = useMemo(() => {
    const m = new Map<string, AccessLevel>();
    access.forEach((a) => m.set(`${a.user_id}::${a.direction_id}`, a.access_level));
    return m;
  }, [access]);

  if (usersLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          Каждая ячейка — уровень доступа пользователя к отделу. Super Admin и Admin видят все
          отделы по умолчанию (ячейки серые / неактивные). Изменения сохраняются мгновенно.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Пользователь
                </th>
                {directions.map((d) => (
                  <th key={d.id} className="px-2 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="truncate" title={d.name}>{d.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={directions.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                    Нет пользователей
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const role = effectiveRole(u.roles);
                const isUnrestricted = role === "superadmin" || role === "admin";
                return (
                  <tr key={u.user_id} className="border-b border-border/50 last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2.5">
                      <div className="font-medium">{u.display_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                    </td>
                    {directions.map((d) => {
                      const lvl = cellMap.get(`${u.user_id}::${d.id}`) ?? null;
                      if (isUnrestricted) {
                        return (
                          <td key={d.id} className="px-2 py-2.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                              <ShieldCheck className="h-3 w-3" /> Полный
                            </span>
                          </td>
                        );
                      }
                      const Icon = lvl ? ICONS[lvl].Icon : null;
                      const iconCls = lvl ? ICONS[lvl].cls : "";
                      return (
                        <td key={d.id} className="px-2 py-2.5">
                          <Select
                            value={lvl ?? NO_ACCESS}
                            onValueChange={(v) =>
                              setAccess.mutate({
                                user_id: u.user_id,
                                direction_id: d.id,
                                access_level: v === NO_ACCESS ? null : (v as AccessLevel),
                              })
                            }
                          >
                            <SelectTrigger className="h-7 min-w-[90px] gap-1 border-border bg-background px-2 text-[11px]">
                              <SelectValue>
                                {lvl ? (
                                  <span className={cn("inline-flex items-center gap-1", iconCls)}>
                                    {Icon && <Icon className="h-3 w-3" />}
                                    {ACCESS_LABELS[lvl].split(" ")[0]}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/60">—</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_ACCESS}>— Нет доступа —</SelectItem>
                              {ACCESS_LEVELS.map((al) => (
                                <SelectItem key={al} value={al}>{ACCESS_LABELS[al]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
