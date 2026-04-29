import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Roadmap from "./pages/Roadmap.tsx";
import Kanban from "./pages/Kanban.tsx";
import TasksTable from "./pages/TasksTable.tsx";
import DirectionsPage from "./pages/Directions.tsx";
import Archive from "./pages/Archive.tsx";
import KpiPage from "./pages/Kpi.tsx";
import Admin from "./pages/Admin.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";

const queryClient = new QueryClient();

const App = () => (
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
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/kanban" element={<Kanban />} />
              <Route path="/table" element={<TasksTable />} />
              <Route path="/kpi" element={<KpiPage />} />
              <Route path="/directions" element={<DirectionsPage />} />
              <Route path="/archive" element={<Archive />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
