import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Plans from "./pages/Plans.tsx";
import PlanDetail from "./pages/PlanDetail.tsx";
import DepartmentDetail from "./pages/DepartmentDetail.tsx";
import AllTasks from "./pages/AllTasks.tsx";
import QuarterDetail from "./pages/QuarterDetail.tsx";
import Archive from "./pages/Archive.tsx";
import Management from "./pages/Management.tsx";
import Profile from "./pages/Profile.tsx";
import AuthInvite from "./pages/AuthInvite.tsx";
import { Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";

/**
 * QueryClient defaults:
 * - refetchOnMount: "always" — каждый раз когда компонент монтируется
 *   (например, переход на /), данные перезапрашиваются. Иначе плашки в
 *   сайдбаре ("N просрочено", "N непрочитанных") могут зависать на
 *   stale-кэше прошлой сессии после удаления сущностей.
 * - staleTime: 30s — внутри одной сессии запросы не дёргаются на каждый
 *   re-render, только когда данные действительно устарели.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: "always",
      staleTime: 30_000,
    },
  },
});

/**
 * Если Supabase отдал ошибку auth в URL hash (#error=access_denied&...) и при
 * этом «срезал» путь до `/` — это значит redirect URL не в allowlist проекта.
 * Чтобы не показывать пустой Dashboard / редирект на /auth без объяснений,
 * перебрасываем на /auth/invite с сохранённым hash — там есть UI для разбора
 * ошибок (otp_expired и т.д.).
 */
const AuthHashRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === "/auth/invite") return;
    const h = window.location.hash;
    if (h && /[#&]error(_code)?=/.test(h)) {
      navigate({ pathname: "/auth/invite", hash: h }, { replace: true });
    }
  }, [location.pathname, navigate]);
  return null;
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="company-hub-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AuthHashRedirect />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/invite" element={<AuthInvite />} />
              {/* На случай если ссылку мангнули в /auth/invite/<token> или
                  в /invite?invite=<token> — всё равно сводим к AuthInvite. */}
              <Route path="/auth/invite/:fallback" element={<AuthInvite />} />
              <Route path="/invite" element={<AuthInvite />} />
              <Route path="/invite/:fallback" element={<AuthInvite />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/plans/:id" element={<PlanDetail />} />
                {/* Годовой обзор отдела — основная точка входа в работу
                    конкретного отдела (страница per-quarter теперь
                    вторична). См. DepartmentDetail. */}
                <Route path="/departments/:id" element={<DepartmentDetail />} />
                <Route path="/quarters/:id" element={<QuarterDetail />} />
                {/* /tasks — глобальный реестр всех задач компании с
                    фильтрами и поиском. Открывается из табов на /plans
                    и по deep-link'ам с дашборда (?status=..., ?priority=...). */}
                <Route path="/tasks" element={<AllTasks />} />
                {/* /roadmap, /kanban, /table — старые алиасы. */}
                <Route path="/roadmap" element={<Navigate to="/tasks" replace />} />
                <Route path="/kanban" element={<Navigate to="/tasks" replace />} />
                <Route path="/table" element={<Navigate to="/tasks" replace />} />
                {/* /kpi — раздел «Цели» расформирован. Сохраняем редирект,
                    чтобы старые закладки и уведомления не падали в 404. */}
                <Route path="/kpi" element={<Navigate to="/plans" replace />} />
                {/* /directions расформирован — функция отделов перенесена
                    в раздел «Квартальные планы». Сохраняем редирект, чтобы
                    старые закладки и уведомления продолжали работать. */}
                <Route path="/directions" element={<Navigate to="/plans" replace />} />
                <Route path="/archive" element={<Archive />} />
                <Route path="/management" element={<Management />} />
                <Route path="/profile" element={<Profile />} />
                {/* Старая «Админка» расформирована — её функции перенесены
                    в раздел «Управление». Сохраняем редирект, чтобы старые
                    закладки и нотификации продолжали работать. */}
                <Route path="/admin" element={<Navigate to="/management" replace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
