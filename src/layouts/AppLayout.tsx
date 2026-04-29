import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Map, Columns3, Table2, Layers, Archive, LogOut, Plus, Target, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperadmin } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { TaskDialog } from "@/components/TaskDialog";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard, end: true },
  { to: "/roadmap", label: "Roadmap", icon: Map },
  { to: "/kanban", label: "Kanban", icon: Columns3 },
  { to: "/table", label: "Таблица", icon: Table2 },
  { to: "/kpi", label: "KPI", icon: Target },
  { to: "/directions", label: "Отделы", icon: Layers },
  { to: "/archive", label: "Архив", icon: Archive },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [openCreate, setOpenCreate] = useState(false);
  const isSuper = useIsSuperadmin();
  const nav = isSuper ? [...NAV, { to: "/admin", label: "Админка", icon: ShieldCheck }] : NAV;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
            <span className="text-sm font-bold text-background">CH</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-sidebar-foreground">Company Hub</span>
            <span className="text-[10px] text-muted-foreground">Roadmap & Tasks</span>
          </div>
        </div>

        <div className="px-3">
          <Button onClick={() => setOpenCreate(true)} className="w-full justify-start gap-2" size="sm">
            <Plus className="h-4 w-4" /> Новая задача
          </Button>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={(item as any).end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate px-2 text-xs text-muted-foreground">{user?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={async () => { await signOut(); navigate("/auth"); }}
          >
            <LogOut className="h-4 w-4" /> Выйти
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>

      <TaskDialog open={openCreate} onOpenChange={setOpenCreate} />
    </div>
  );
}