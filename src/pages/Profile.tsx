import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Mail, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * /profile — личный кабинет.
 *
 * Содержит три формы:
 *   * Имя (display_name на profile)
 *   * Email (auth.users) — Supabase сам отправит письмо для подтверждения
 *     если включена валидация email
 *   * Пароль — три поля, проверка минимальной длины 6
 */
export default function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Заполняем форму актуальными значениями при загрузке.
  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    (async () => {
      const { data } = await supabase
        .from("profiles" as any)
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      setDisplayName((data as any)?.display_name ?? "");
    })();
  }, [user]);

  if (loading) return null;
  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  const saveName = async () => {
    if (!displayName.trim()) {
      toast.error("Имя не может быть пустым");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles" as any)
        .update({ display_name: displayName.trim() } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      // Обновим все queries которые читают profiles или management_users.
      qc.invalidateQueries({ queryKey: ["app_users"] });
      qc.invalidateQueries({ queryKey: ["management_users"] });
      toast.success("Имя обновлено");
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось обновить имя");
    } finally {
      setSavingName(false);
    }
  };

  const saveEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Введите корректный email");
      return;
    }
    if (trimmed === user.email?.toLowerCase()) {
      toast("Email не изменился");
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      toast.success(
        "Письмо для подтверждения отправлено. Перейдите по ссылке из письма, чтобы завершить смену email.",
      );
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось обновить email");
    } finally {
      setSavingEmail(false);
    }
  };

  const savePassword = async () => {
    if (newPwd.length < 6) {
      toast.error("Пароль должен быть не короче 6 символов");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (!currentPwd) {
      toast.error("Введите текущий пароль");
      return;
    }
    setSavingPwd(true);
    try {
      // Проверяем текущий пароль через signInWithPassword. Если успех —
      // меняем пароль. Это покрывает требование "проверить current_password".
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPwd,
      });
      if (signErr) {
        toast.error("Текущий пароль введён неверно");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      toast.success("Пароль обновлён");
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось обновить пароль");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <>
      <PageHeader title="Мой профиль" description="Управление личными данными и безопасностью" />
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
        <FormCard
          icon={UserIcon}
          title="Имя"
          description="Отображается во всех местах системы — карточках задач, комментариях, истории."
        >
          <div className="grid gap-1.5">
            <Label htmlFor="display_name">Имя</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Иван Петров"
              maxLength={64}
            />
          </div>
          <Button onClick={saveName} disabled={savingName} className="self-start">
            {savingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </FormCard>

        <FormCard
          icon={Mail}
          title="Email"
          description="Используется для входа в систему. После смены придёт письмо для подтверждения."
        >
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <Button onClick={saveEmail} disabled={savingEmail} className="self-start">
            {savingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сменить email
          </Button>
        </FormCard>

        <FormCard
          icon={Lock}
          title="Пароль"
          description="Минимум 6 символов. Подтвердите текущий пароль, чтобы сменить его."
        >
          <div className="grid gap-1.5">
            <Label htmlFor="current_pwd">Текущий пароль</Label>
            <Input
              id="current_pwd"
              type="password"
              autoComplete="current-password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new_pwd">Новый пароль</Label>
            <Input
              id="new_pwd"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm_pwd">Подтверждение нового пароля</Label>
            <Input
              id="confirm_pwd"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
            />
          </div>
          <Button onClick={savePassword} disabled={savingPwd} className="self-start">
            {savingPwd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сменить пароль
          </Button>
        </FormCard>
      </div>
    </>
  );
}

function FormCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 shadow-card")}>
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}
