import { Loader2, ShieldOff } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isActive, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  // Аккаунт отключён или удалён — показываем заглушку вместо приложения.
  // RLS на бэке уже отрезает запросы; UI просто не должен показывать
  // пустые экраны и сбивать пользователя с толку.
  if (!isActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-elegant">
          <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldOff className="h-5 w-5" />
          </div>
          <h1 className="mb-1 text-lg font-semibold">Аккаунт отключён</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Ваш аккаунт был отключён или удалён администратором.
            Обратитесь к администратору, если считаете это ошибкой.
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={signOut}>
            Выйти
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
