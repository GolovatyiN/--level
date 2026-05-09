import { useMemo, useState } from "react";
import { Pencil, Plus, Users as UsersIcon, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/UiState";
import { useDirections, type Direction } from "@/hooks/useDirections";
import { useTasks } from "@/hooks/useTasks";
import { useDepartmentAccess, useManagementUsers, useSetDepartmentHead } from "@/hooks/useManagement";
import { DirectionDialog } from "@/components/DirectionDialog";
import { UserPicker } from "@/components/UserPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ManagementDepartmentsTab() {
  const { data: directions = [], isLoading } = useDirections();
  const { data: tasks = [] } = useTasks(true);
  const { data: users = [] } = useManagementUsers();
  const { data: access = [] } = useDepartmentAccess();
  const setHead = useSetDepartmentHead();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Direction | null>(null);

  const userMap = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);

  // Per-department: how many users currently have explicit access.
  const userCountByDept = useMemo(() => {
    const m = new Map<string, number>();
    access.forEach((a) => m.set(a.direction_id, (m.get(a.direction_id) ?? 0) + 1));
    return m;
  }, [access]);

  // Per-department: how many tasks live there.
  const taskCountByDept = useMemo(() => {
    const m = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.direction_id) return;
      m.set(t.direction_id, (m.get(t.direction_id) ?? 0) + 1);
    });
    return m;
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {directions.length} {directions.length === 1 ? "отдел" : "отделов"}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Новый отдел
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="col-span-full flex justify-center py-8"><Spinner /></div>
        )}
        {!isLoading && directions.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
            <p className="mb-3 text-sm text-muted-foreground">В системе ещё нет отделов</p>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> Создать первый
            </Button>
          </div>
        )}
        {directions.map((d) => {
          const head = d.head_user_id ? userMap.get(d.head_user_id) : null;
          const taskCount = taskCountByDept.get(d.id) ?? 0;
          const userCount = userCountByDept.get(d.id) ?? 0;
          return (
            <div
              key={d.id}
              className="hover-lift group rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full transition-transform duration-300 group-hover:scale-125"
                    style={{ backgroundColor: d.color }}
                  />
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold">{d.name}</h4>
                    {d.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditing(d)}
                  title="Редактировать"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-2 text-xs">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left hover:border-foreground/30"
                    >
                      <UserCog className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">Руководитель:</span>
                      <span className="ml-auto truncate font-medium">
                        {head?.display_name ?? head?.email ?? "— не назначен —"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2" align="end">
                    <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">
                      Назначить руководителя
                    </p>
                    <UserPicker
                      value={d.head_user_id ?? null}
                      onChange={(id) => setHead.mutate({ direction_id: d.id, head_user_id: id })}
                    />
                  </PopoverContent>
                </Popover>

                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon className="h-3 w-3" />
                    {userCount} с доступом
                  </span>
                  <span>·</span>
                  <span>{taskCount} задач</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <DirectionDialog open={creating} onOpenChange={setCreating} />
      <DirectionDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        direction={editing}
      />
    </div>
  );
}
