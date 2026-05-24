import { useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useDirections } from "@/hooks/useDirections";
import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  type AccessLevel,
} from "@/hooks/useManagement";
import { ROLE_LABELS, useIsSuperadmin, type AppRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "superadmin", label: ROLE_LABELS.superadmin },
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "department_head", label: ROLE_LABELS.department_head },
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "viewer", label: ROLE_LABELS.viewer },
  { value: "user", label: ROLE_LABELS.user },
];

/**
 * /management → «Добавить пользователя».
 *
 * Вызывает edge-функцию `invite-user`: она через service_role создаёт
 * пользователя (без отправки письма), генерирует одноразовую magic-ссылку
 * и проставляет роль / доступы в обход RLS. Возвращаемый `action_link`
 * показываем админу — он сам передаёт ссылку пользователю удобным
 * способом (мессенджер, почта, и т.д.).
 */
export function InviteUserDialog({ open, onOpenChange }: Props) {
  const isSuper = useIsSuperadmin();
  const { data: directions = [] } = useDirections();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AppRole>("user");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("view");
  const [selectedDirs, setSelectedDirs] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setRole("user");
    setAccessLevel("view");
    setSelectedDirs(new Set());
    setLink(null);
    setCopied(false);
  };

  const handleClose = (v: boolean) => {
    if (submitting) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const toggleDir = (id: string) => {
    setSelectedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Введите корректный email");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: trimmedEmail,
          display_name: name.trim() || undefined,
          role,
          direction_ids: Array.from(selectedDirs),
          access_level: accessLevel,
          // app_url подскажет edge-функции, какой origin использовать в
          // ссылке. По умолчанию она берёт Origin из заголовка запроса,
          // но передаём явно — так предсказуемее.
          app_url: window.location.origin,
        },
      });
      // FunctionsHttpError часто прячет тело ответа в error.context. Достаём
      // оттуда настоящее сообщение от edge-функции.
      if (error) {
        let detail: string | null = null;
        const ctx = (error as any)?.context;
        if (ctx?.json) {
          try {
            const j = await ctx.json();
            detail = j?.error ?? null;
          } catch {/* ignore */}
        }
        throw new Error(detail ?? error.message ?? "Ошибка edge-функции");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      const generatedLink = (data as any)?.action_link as string | undefined;
      if (!generatedLink) {
        throw new Error("Ссылка не была сгенерирована");
      }
      toast.success("Ссылка для входа создана");
      setLink(generatedLink);
      // Обновляем список пользователей в фоне.
      qc.invalidateQueries({ queryKey: ["management_users"] });
      qc.invalidateQueries({ queryKey: ["app_users"] });
      qc.invalidateQueries({ queryKey: ["user_department_access"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось отправить приглашение");
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    // navigator.clipboard работает только в secure context (HTTPS или
    // localhost). На HTTP-сайте (например, на голом IP) API недоступен.
    // Падаем на legacy document.execCommand("copy") через скрытую textarea.
    const tryModern = async () => {
      if (typeof navigator === "undefined" || !navigator.clipboard) return false;
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch {
        return false;
      }
    };

    const tryLegacy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    const ok = (await tryModern()) || tryLegacy();
    if (ok) {
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Не удалось скопировать. Выделите ссылку вручную и скопируйте (Cmd+C).");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Добавить пользователя
          </DialogTitle>
          <DialogDescription>
            Создадим аккаунт и сгенерируем одноразовую ссылку для входа.
            Скопируйте её и передайте пользователю удобным способом — письма
            не отправляются.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
              Аккаунт для <span className="font-medium">{email}</span> создан.
              Передайте пользователю ссылку ниже — по ней он установит пароль
              и попадёт в систему.
            </div>
            <div className="grid gap-1.5">
              <Label>Одноразовая ссылка для входа</Label>
              <div className="flex gap-2">
                <Input value={link} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copy} title="Копировать">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ссылка одноразовая и ограничена по времени. После использования
                она перестанет работать.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => reset()}>
                Создать ещё
              </Button>
              <Button onClick={() => handleClose(false)}>Готово</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (submitting) return;
              submit();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="invite_email">Email *</Label>
              <Input
                id="invite_email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                autoComplete="email"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="invite_name">Имя</Label>
              <Input
                id="invite_name"
                placeholder="Иван Петров"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                maxLength={64}
              />
              <p className="text-xs text-muted-foreground">
                Пользователь сможет изменить имя при первом входе.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label>Роль</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)} disabled={submitting}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem
                      key={r.value}
                      value={r.value}
                      disabled={!isSuper && r.value === "superadmin"}
                    >
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Отделы</Label>
              {directions.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  Нет отделов. Создайте их во вкладке «Отделы».
                </p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2 scrollbar-thin">
                  {directions.map((d) => (
                    <label
                      key={d.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
                        selectedDirs.has(d.id) && "bg-muted/40",
                      )}
                    >
                      <Checkbox
                        checked={selectedDirs.has(d.id)}
                        onCheckedChange={() => toggleDir(d.id)}
                        disabled={submitting}
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="flex-1 truncate">{d.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedDirs.size > 0 && (
              <div className="grid gap-1.5">
                <Label>Уровень доступа к выбранным отделам</Label>
                <Select
                  value={accessLevel}
                  onValueChange={(v) => setAccessLevel(v as AccessLevel)}
                  disabled={submitting}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>{ACCESS_LABELS[lvl]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Создать ссылку
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
