import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Grid3x3, Layers, Shield, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useCanManage } from "@/hooks/useUserRole";
import { ManagementUsersTab } from "@/components/management/ManagementUsersTab";
import { ManagementRolesTab } from "@/components/management/ManagementRolesTab";
import { ManagementDepartmentsTab } from "@/components/management/ManagementDepartmentsTab";
import { ManagementAccessMatrixTab } from "@/components/management/ManagementAccessMatrixTab";
import { ManagementActivityLogTab } from "@/components/management/ManagementActivityLogTab";

const TABS = ["users", "roles", "departments", "matrix", "activity"] as const;
type Tab = (typeof TABS)[number];

export default function Management() {
  const canManage = useCanManage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = (params.get("tab") as Tab | null) ?? "users";

  if (!canManage) return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader
        title="Менеджмент"
        description="Пользователи, роли, отделы и доступы"
      />
      <div className="p-4 sm:p-8">
        <Tabs
          defaultValue={initial}
          onValueChange={(t) => navigate(`/management?tab=${t}`, { replace: true })}
          className="w-full"
        >
          <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="users" className="gap-1.5 data-[state=active]:bg-muted">
              <Users className="h-3.5 w-3.5" /> Пользователи
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5 data-[state=active]:bg-muted">
              <Shield className="h-3.5 w-3.5" /> Роли и права
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-1.5 data-[state=active]:bg-muted">
              <Layers className="h-3.5 w-3.5" /> Отделы
            </TabsTrigger>
            <TabsTrigger value="matrix" className="gap-1.5 data-[state=active]:bg-muted">
              <Grid3x3 className="h-3.5 w-3.5" /> Матрица доступов
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5 data-[state=active]:bg-muted">
              <Activity className="h-3.5 w-3.5" /> История
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-2 animate-fade-in">
            <ManagementUsersTab />
          </TabsContent>
          <TabsContent value="roles" className="mt-2 animate-fade-in">
            <ManagementRolesTab />
          </TabsContent>
          <TabsContent value="departments" className="mt-2 animate-fade-in">
            <ManagementDepartmentsTab />
          </TabsContent>
          <TabsContent value="matrix" className="mt-2 animate-fade-in">
            <ManagementAccessMatrixTab />
          </TabsContent>
          <TabsContent value="activity" className="mt-2 animate-fade-in">
            <ManagementActivityLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
