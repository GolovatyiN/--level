import { useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowUpDown,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperadmin, ROLE_LABELS, effectiveRole, type AppRole } from "@/hooks/useUserRole";
import { useDirections } from "@/hooks/useDirections";
import {
  useDepartmentAccess,
  useManagementUsers,
  useSetUserActive,
  useSetUserDepartmentHeads,
  useSetUserRole,
} from "@/hooks/useManagement";
import { useDeleteAdminUser } from "@/hooks/useAdminUsers";
import { Spinner } from "@/components/UiState";
import { MultiSelectPopover, type MultiSelectOption } from "@/components/MultiSelectPopover";
import { RoleBadge } from "./RoleBadge";
import { UserAccessEditor } from "./UserAccessEditor";
import { InviteUserDialog } from "./InviteUserDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RoleFilter = "all" | AppRole | "no_role";
type StatusFilter = "all" | "active" | "inactive";
type Sort = "created_desc" | "created_asc" | "name" | "last_active";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "superadmin", label: ROLE_LABELS.superadmin },
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "department_head", label: ROLE_LABELS.department_head },
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "viewer", label: ROLE_LABELS.viewer },
  { value: "user", label: ROLE_LABELS.user },
];

export function ManagementUsersTab() {
  const isSuper = useIsSuperadmin();
  const { user } = useAuth();
  const { data: users = [], isLoading } = useManagementUsers();
  const { data: directions = [] } = useDirections();
  const { data: access = [] } = useDepartmentAccess();
  const setRole = useSetUserRole();
  const setActive = useSetUserActive();
  const setHeads = useSetUserDepartmentHeads();
  const del = useDeleteAdminUser();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("created_desc");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Build per-user department-name list once.
  const accessByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    const dirNames = new Map(directions.map((d) => [d.id, d.name]));
    access.forEach((a) => {
      const arr = m.get(a.user_id) ?? [];
      const name = dirNames.get(a.direction_id);
      if (name) arr.push(name);
      m.set(a.user_id, arr);
    });
    return m;
  }, [access, directions]);

  // Какими отделами руководит каждый пользователь. Один человек может
  // возглавлять сразу несколько отделов — модели данных это уже
  // позволяет (UNIQUE-констрейнта на `directions.head_user_id` нет).
  const headsByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    directions.forEach((d) => {
      if (!d.head_user_id) return;
      const arr = m.get(d.head_user_id) ?? [];
      arr.push(d.id);
      m.set(d.head_user_id, arr);
    });
    return m;
  }, [directions]);

  const directionOptions: MultiSelectOption[] = useMemo(
    () =>
      directions.map((d) => ({
        value: d.id,
        label: d.name,
        colorHex: d.color,
      })),
    [directions],
  );

  const dirNameById = useMemo(
    () => new Map(directions.map((d) => [d.id, d])),
    [directions],
  );

  const list = useMemo(() => {
    let r = users.filter((u) => {
      if (search.trim()) {
        const s = search.toLowerCase();
        const hay = `${u.email ?? ""} ${u.display_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      const eff = effectiveRole(u.roles);
      if (roleFilter === "no_role" && eff) return false;
      if (roleFilter !== "all" && roleFilter !== "no_role" && eff !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      return true;
    });
    const ts = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    switch (sort) {
      case "created_asc":
        r = r.sort((a, b) => ts(a.created_at) - ts(b.created_at));
        break;
      case "name":
        r = r.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
        break;
      case "last_active":
        r = r.sort((a, b) => ts(b.last_active_at) - ts(a.last_active_at));
        break;
      default:
        r = r.sort((a, b) => ts(b.created_at) - ts(a.created_at));
    }
    return r;
  }, [users, search, roleFilter, statusFilter, sort]);

  const target = users.find((u) => u.user_id === confirmDelete);
  const editingUser = users.find((u) => u.user_id === editing);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или email..."
            className="h-8 w-72 pl-8 text-sm"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="h-8 w-[180px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
            <SelectItem value="no_role">Без роли</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[150px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="inactive">Неактивные</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">Сначала новые</SelectItem>
              <SelectItem value="created_asc">Сначала старые</SelectItem>
              <SelectItem value="name">По имени</SelectItem>
              <SelectItem value="last_active">По активности</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Добавить пользователя
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Пользователь</th>
                <th className="px-4 py-2.5 font-medium">Роль</th>
                <th className="px-4 py-2.5 font-medium">Доступ к отделам</th>
                <th className="px-4 py-2.5 font-medium">Руководит</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
                <th className="px-4 py-2.5 font-medium">Регистрация</th>
                <th className="px-4 py-2.5 font-medium">Последняя активность</th>
                <th className="px-4 py-2.5 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="py-10 text-center"><Spinner /> </td></tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Пользователи не найдены</td></tr>
              )}
              {list.map((u) => {
                const isMe = u.user_id === user?.id;
                const eff = effectiveRole(u.roles);
                const userDepts = accessByUser.get(u.user_id) ?? [];
                return (
                  <tr key={u.user_id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {u.display_name ?? "—"}
                        {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(вы)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={eff ?? "user"}
                        disabled={!isSuper && eff === "superadmin"}
                        onValueChange={(v) => setRole.mutate({ user_id: u.user_id, role: v as AppRole })}
                      >
                        <SelectTrigger className="h-7 w-[180px] text-xs">
                          <SelectValue>
                            <RoleBadge role={eff} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem
                              key={r.value}
                              value={r.value}
                              disabled={!isSuper && r.value === "superadmin"}
                            >
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {userDepts.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {userDepts.slice(0, 3).map((n) => (
                            <span key={n} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">{n}</span>
                          ))}
                          {userDepts.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{userDepts.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* Multi-select «Руководит». Один человек может
                          быть head'ом нескольких отделов. Под капотом —
                          батч UPDATE на directions через
                          useSetUserDepartmentHeads. */}
                      <MultiSelectPopover
                        placeholder="—"
                        options={directionOptions}
                        selected={headsByUser.get(u.user_id) ?? []}
                        onChange={(next) =>
                          setHeads.mutate({ user_id: u.user_id, direction_ids: next })
                        }
                        searchable
                        triggerClassName="min-w-[180px]"
                      />
                      {(headsByUser.get(u.user_id) ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(headsByUser.get(u.user_id) ?? []).slice(0, 3).map((id) => {
                            const d = dirNameById.get(id);
                            if (!d) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: d.color }}
                                />
                                {d.name}
                              </span>
                            );
                          })}
                          {(headsByUser.get(u.user_id) ?? []).length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{(headsByUser.get(u.user_id) ?? []).length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs ${u.is_active ? "text-success" : "text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-success" : "bg-muted-foreground"}`} />
                        {u.is_active ? "Активен" : "Неактивен"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.created_at ? format(parseISO(u.created_at), "dd.MM.yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.last_active_at
                        ? formatDistanceToNow(parseISO(u.last_active_at), { addSuffix: true, locale: ru })
                        : "никогда"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditing(u.user_id)}
                          title="Редактировать доступы"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={isMe || setActive.isPending}
                          onClick={() => setActive.mutate({ user_id: u.user_id, is_active: !u.is_active })}
                          title={u.is_active ? "Деактивировать" : "Активировать"}
                        >
                          {u.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-success" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={isMe}
                          onClick={() => setConfirmDelete(u.user_id)}
                          title={isMe ? "Нельзя удалить себя" : "Удалить пользователя"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Всего: {users.length} · Показано: {list.length}
      </p>

      {editingUser && (
        <UserAccessEditor
          open={!!editingUser}
          onOpenChange={(v) => !v && setEditing(null)}
          user={editingUser}
        />
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.email ?? "—"} будет удалён из auth и потеряет все роли и доступы. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                await del.mutateAsync(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
