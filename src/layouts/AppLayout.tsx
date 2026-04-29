import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Map,
  Columns3,
  Table2,
  Layers,
  Archive,
  LogOut,
  Plus,
  Target,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperadmin } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { TaskDialog } from "@/components/TaskDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  const location = useLocation();
  const [openCreate, setOpenCreate] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSuper = useIsSuperadmin();
  const nav = isSuper ? [...NAV, { to: "/admin", label: "Админка", icon: ShieldCheck }] : NAV;

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-5 py-5 lg:justify-start lg:gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
            <span className="text-sm font-bold text-background">CH</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-sidebar-foreground">Company Hub</span>
            <span className="text-[10px] text-muted-foreground">Roadmap & Tasks</span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Закрыть меню"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-3">
        <Button onClick={() => setOpenCreate(true)} className="w-full justify-start gap-2" size="sm">
          <Plus className="h-4 w-4" /> Новая задача
        </Button>
      </div>

      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 scrollbar-thin">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={(item as any).end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <ThemeToggle />
        <div className="mt-1 truncate px-2 pt-1 text-xs text-muted-foreground" title={user?.email ?? undefined}>
          {user?.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" /> Выйти
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-elegant">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
              <span className="text-xs font-bold text-background">CH</span>
            </div>
            <span className="text-sm font-semibold">Company Hub</span>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <TaskDialog open={openCreate} onOpenChange={setOpenCreate} />
    </div>
  );
}
