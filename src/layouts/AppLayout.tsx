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
  Search,
  AlertTriangle,
} from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperadmin } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { TaskDialog } from "@/components/TaskDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useNotificationsRealtime } from "@/hooks/useNotifications";
import { useTasks } from "@/hooks/useTasks";
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSuper = useIsSuperadmin();
  const nav = isSuper ? [...NAV, { to: "/admin", label: "Админка", icon: ShieldCheck }] : NAV;

  // Overdue task badge — visible reminder in the sidebar.
  const { data: tasks = [] } = useTasks();
  const overdueCount = useMemo(
    () =>
      tasks.filter(
        (t) => t.deadline && isPast(parseISO(t.deadline)) && t.status !== "completed",
      ).length,
    [tasks],
  );

  // Wire up app-wide keyboard shortcuts.
  useGlobalShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onNewTask: () => setOpenCreate(true),
  });

  // Single realtime subscription for the whole app — keeps `useNotifications`
  // (called by NotificationsBell + useUnreadCount) free of side effects.
  useNotificationsRealtime();

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

      <div className="space-y-1.5 px-3">
        <Button onClick={() => setOpenCreate(true)} className="w-full justify-start gap-2" size="sm">
          <Plus className="h-4 w-4" /> Новая задача
          <kbd className="ml-auto rounded border border-primary-foreground/20 bg-primary-foreground/10 px-1.5 py-px text-[10px] font-mono text-primary-foreground/70">
            N
          </kbd>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaletteOpen(true)}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Поиск...</span>
          <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-px text-[10px] font-mono">
            ⌘K
          </kbd>
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
                "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground hover:translate-x-0.5",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Left accent bar — slides in on hover, persists on active */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-foreground transition-all duration-200",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
                  )}
                />
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isActive ? "scale-110" : "group-hover:scale-110",
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        {overdueCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("/?status=overdue")}
            className="flex w-full animate-fade-in items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
            title={`${overdueCount} задач просрочено`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-medium">{overdueCount} просрочено</span>
          </button>
        )}
        <NotificationsBell />
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-9 w-9"
            onClick={() => setPaletteOpen(true)}
            aria-label="Поиск (⌘K)"
          >
            <Search className="h-4 w-4" />
          </Button>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <TaskDialog open={openCreate} onOpenChange={setOpenCreate} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
