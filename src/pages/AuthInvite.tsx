import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * /auth/invite?invite=<uuid> — лендинг для собственной системы инвайтов.
 *
 * Поток:
 *   1. URL содержит invite-токен (?invite=...). Запоминаем его.
 *   2. Пользователь вводит имя + пароль.
 *   3. Отправляем {invite, password, display_name} в edge accept-invite.
 *      Edge через service_role ставит пароль и помечает токен использованным.
 *   4. На клиенте делаем signInWithPassword({email, password}) — теперь
 *      пользователь залогинен обычной парой email/пароль.
 *   5. Редиректим в корень приложения.
 *
 * Если в URL нет токена — показываем сообщение и кнопку перейти на /auth.
 */
export default function AuthInvite() {
  const [params] = useSearchParams();
  const routeParams = useParams();
  const navigate = useNavigate();

  // Принимаем токен и из query (?invite=...), и из path-сегмента
  // (/auth/invite/<token>) — чтобы переживать случаи когда ссылку
  // мангнули в мессенджере или в почтовом клиенте.
  const inviteToken = params.get("invite") ?? routeParams.fallback ?? null;

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken || submitting) return;
    setError(null);

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
      const { data, error: fnErr } = await supabase.functions.invoke("accept-invite", {
        body: {
          invite: inviteToken,
          password,
          display_name: name.trim() || undefined,
        },
      });

      // FunctionsHttpError прячет тело non-2xx в context — достанем
      // реальное сообщение.
      if (fnErr) {
        let detail: string | null = null;
        const ctx = (fnErr as any)?.context;
        if (ctx?.json) {
          try {
            const j = await ctx.json();
            detail = j?.error ?? null;
          } catch {/* ignore */}
        }
        throw new Error(detail ?? fnErr.message ?? "Не удалось активировать ссылку");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      const email = (data as any)?.email as string;
      if (!email) throw new Error("Сервер не вернул email пользователя");

      // Логинимся обычным email/паролем — это самый надёжный способ.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        throw new Error(
          `Пароль установлен, но автоматический вход не сработал: ${signErr.message}. Попробуйте войти через /auth.`,
        );
      }

      setDone(true);
      toast.success("Аккаунт активирован. Добро пожаловать!");
      navigate("/", { replace: true });
    } catch (err: any) {
      const msg = err?.message ?? "Не удалось завершить регистрацию";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

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

        {!inviteToken ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              В ссылке нет invite-токена. Возможно, она устарела или была
              скопирована неполностью. Попросите администратора создать новую.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
              Перейти на страницу входа
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="invite_name">Имя</Label>
              <Input
                id="invite_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Петров"
                autoComplete="name"
                disabled={submitting || done}
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
                disabled={submitting || done}
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
                disabled={submitting || done}
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

            <Button type="submit" disabled={submitting || done}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {done ? "Готово" : submitting ? "Подождите..." : "Завершить регистрацию"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
