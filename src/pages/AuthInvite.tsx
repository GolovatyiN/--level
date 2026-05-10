import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * /auth/invite — лендинг для одноразовой magic-ссылки, которую генерирует
 * админ через `/management → Добавить пользователя`. К моменту попадания
 * сюда Supabase уже создал сессию по токенам из URL, нам остаётся:
 *   1. Спросить имя (если не задано) и пароль.
 *   2. Через `auth.updateUser` сохранить пароль и обновить display_name.
 *   3. Положить display_name в profiles.
 *   4. Отправить юзера в приложение.
 *
 * Если ссылка уже использована или просрочена — у нас нет user, показываем
 * понятное сообщение и кнопку «Перейти на страницу входа».
 */
export default function AuthInvite() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Если ссылка истекла или невалидна — у нас не будет user.
  // Покажем пользователю понятное сообщение.
  const expired = !loading && !user;

  // Pre-fill name from user metadata.
  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as any;
    if (meta.display_name && !name) setName(meta.display_name);
  }, [user, name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting) return;
    setError(null);

    if (!name.trim()) {
      setError("Введите имя");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    setSubmitting(true);
    try {
      // Ставим пароль и обновляем metadata.display_name.
      const { error: updErr } = await supabase.auth.updateUser({
        password,
        data: { display_name: name.trim() },
      });
      if (updErr) throw updErr;

      // Profiles.display_name тоже синхронизируем — handle_new_user trigger
      // его уже создал при invite, обновим на финальное значение.
      await supabase
        .from("profiles" as any)
        .update({ display_name: name.trim() } as any)
        .eq("user_id", user.id);

      toast.success("Аккаунт настроен. Добро пожаловать!");
      navigate("/", { replace: true });
    } catch (err: any) {
      const msg = err?.message ?? "Не удалось завершить регистрацию";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, hsl(var(--primary) / 0.08), transparent 50%), radial-gradient(circle at 70% 80%, hsl(var(--primary) / 0.06), transparent 50%)",
        }}
      />

      <div className="absolute right-4 top-4">
        <ThemeToggle className="w-auto" variant="outline" />
      </div>

      <div className="w-full max-w-sm animate-scale-in rounded-xl border border-border bg-card p-8 shadow-elegant">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground">
            <span className="text-sm font-bold text-background">CH</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold">Company Hub</h1>
            <p className="text-xs text-muted-foreground">Завершение регистрации</p>
          </div>
        </div>

        {expired ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ссылка-приглашение недействительна или уже использована.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
              Перейти на страницу входа
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled readOnly />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite_name">Имя</Label>
              <Input
                id="invite_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Петров"
                autoComplete="name"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite_pwd">Пароль</Label>
              <Input
                id="invite_pwd"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite_pwd2">Повторите пароль</Label>
              <Input
                id="invite_pwd2"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? "Подождите..." : "Завершить регистрацию"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
