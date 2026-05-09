import { useMemo } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useDirections } from "@/hooks/useDirections";
import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  type AccessLevel,
  type ManagementUser,
  useDepartmentAccess,
  useSetDepartmentAccess,
} from "@/hooks/useManagement";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: ManagementUser;
}

const NO_ACCESS = "__none__";

/**
 * Per-user view: list every department, show the current access level
 * (or "no access"), let the admin change/clear it inline. Effects are
 * persisted immediately — no Save button — because each row is its own
 * upsert.
 */
export function UserAccessEditor({ open, onOpenChange, user }: Props) {
  const { data: directions = [] } = useDirections();
  const { data: access = [] } = useDepartmentAccess();
  const setAccess = useSetDepartmentAccess();

  const userAccess = useMemo(() => {
    const m = new Map<string, AccessLevel>();
    access
      .filter((a) => a.user_id === user.user_id)
      .forEach((a) => m.set(a.direction_id, a.access_level));
    return m;
  }, [access, user.user_id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Доступы пользователя — {user.display_name ?? user.email ?? "—"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {directions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Нет отделов в системе</p>
          ) : (
            directions.map((d) => {
              const current = userAccess.get(d.id) ?? null;
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    {d.description && (
                      <p className="truncate text-xs text-muted-foreground">{d.description}</p>
                    )}
                  </div>
                  <Select
                    value={current ?? NO_ACCESS}
                    onValueChange={(v) =>
                      setAccess.mutate({
                        user_id: user.user_id,
                        direction_id: d.id,
                        access_level: v === NO_ACCESS ? null : (v as AccessLevel),
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[210px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ACCESS}>— Нет доступа —</SelectItem>
                      {ACCESS_LEVELS.map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>{ACCESS_LABELS[lvl]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {setAccess.isPending && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Сохранение...
              </span>
            )}
          </p>
          <Button onClick={() => onOpenChange(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
