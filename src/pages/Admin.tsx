import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, Shield, ShieldCheck, User as UserIcon, ArrowUpDown, Loader2 } from "lucide-react";
import { useAdminUsers, useDeleteAdminUser } from "@/hooks/useAdminUsers";
import { useIsSuperadmin } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import { Navigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortKey = "created_desc" | "created_asc" | "lastlogin_desc" | "email_asc";

export default function Admin() {
  const isSuper = useIsSuperadmin();
  const { user } = useAuth();
  const { data: users = [], isLoading } = useAdminUsers(isSuper);
  const del = useDeleteAdminUser();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const list = useMemo(() => {
    let r = users.filter((u) => {
      if (roleFilter !== "all") {
        if (roleFilter === "no_role" ? u.roles.length > 0 : !u.roles.includes(roleFilter)) return false;
      }
      if (search.trim()) {
        const s = search.toLowerCase();
        const hay = `${u.email ?? ""} ${u.display_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const ts = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    switch (sort) {
      case "created_asc": r = r.sort((a, b) => ts(a.created_at) - ts(b.created_at)); break;
      case "lastlogin_desc": r = r.sort((a, b) => ts(b.last_sign_in_at) - ts(a.last_sign_in_at)); break;
      case "email_asc": r = r.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")); break;
      default: r = r.sort((a, b) => ts(b.created_at) - ts(a.created_at));
    }
    return r;
  }, [users, search, roleFilter, sort]);

  if (!isSuper) return <Navigate to="/" replace />;

  const target = users.find((u) => u.id === confirmDelete);

  return (
    <>
      <PageHeader title="Администрирование" description="Пользователи, роли и доступ" />
      <div className="space-y-4 p-4 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по email или имени..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-72 pl-8 text-sm"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-[170px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все роли</SelectItem>
              <SelectItem value="superadmin">Суперадмин</SelectItem>
              <SelectItem value="admin">Админ</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="no_role">Без роли</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-8 w-[200px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Сначала новые</SelectItem>
                <SelectItem value="created_asc">Сначала старые</SelectItem>
                <SelectItem value="lastlogin_desc">Последний вход</SelectItem>
                <SelectItem value="email_asc">По email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Пользователь</th>
                <th className="px-4 py-2.5 font-medium">Роль</th>
                <th className="px-4 py-2.5 font-medium">Регистрация</th>
                <th className="px-4 py-2.5 font-medium">Последний вход</th>
                <th className="px-4 py-2.5 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Загрузка...</td></tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Пользователи не найдены</td></tr>
              )}
              {list.map((u) => {
                const isMe = u.id === user?.id;
                const role = u.roles.includes("superadmin") ? "superadmin"
                  : u.roles.includes("admin") ? "admin"
                  : u.roles.includes("user") ? "user" : null;
                return (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.display_name ?? "—"} {isMe && <span className="text-xs text-muted-foreground">(вы)</span>}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={role} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {u.created_at ? format(parseISO(u.created_at), "dd.MM.yyyy HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {u.last_sign_in_at ? format(parseISO(u.last_sign_in_at), "dd.MM.yyyy HH:mm") : "никогда"}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(u.id)}
                        disabled={isMe}
                        title={isMe ? "Нельзя удалить себя" : "Удалить пользователя"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Всего: {users.length} · Показано: {list.length}
        </p>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.email ?? "—"} будет удалён вместе со своими ролями. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                await del.mutateAsync(confirmDelete);
                setConfirmDelete(null);
              }}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RoleBadge({ role }: { role: string | null }) {
  if (role === "superadmin")
    return <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium"><ShieldCheck className="h-3 w-3" /> Суперадмин</span>;
  if (role === "admin")
    return <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"><Shield className="h-3 w-3" /> Админ</span>;
  if (role === "user")
    return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><UserIcon className="h-3 w-3" /> User</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}
