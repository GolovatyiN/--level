import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Tasks from "./pages/Tasks.tsx";
import Plans from "./pages/Plans.tsx";
import PlanDetail from "./pages/PlanDetail.tsx";
import DirectionsPage from "./pages/Directions.tsx";
import Archive from "./pages/Archive.tsx";
import KpiPage from "./pages/Kpi.tsx";
import Admin from "./pages/Admin.tsx";
import Management from "./pages/Management.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="company-hub-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/plans/:id" element={<PlanDetail />} />
                {/* Redirects from old paths to keep deep links alive. */}
                <Route path="/roadmap" element={<Tasks />} />
                <Route path="/kanban" element={<Tasks />} />
                <Route path="/table" element={<Tasks />} />
                <Route path="/kpi" element={<KpiPage />} />
                <Route path="/directions" element={<DirectionsPage />} />
                <Route path="/archive" element={<Archive />} />
                <Route path="/management" element={<Management />} />
                <Route path="/admin" element={<Admin />} />
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
