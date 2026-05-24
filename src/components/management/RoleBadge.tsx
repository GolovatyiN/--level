import { Crown, Shield, ShieldCheck, User as UserIcon, Users, Eye } from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { ROLE_LABELS } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

const STYLES: Record<AppRole, { icon: React.ComponentType<any>; cls: string }> = {
  superadmin:      { icon: Crown,       cls: "border-foreground/30 bg-foreground/10 text-foreground" },
  admin:           { icon: ShieldCheck, cls: "border-info/40 bg-info/10 text-info" },
  department_head: { icon: Shield,      cls: "border-warning/40 bg-warning/10 text-warning" },
  manager:         { icon: Users,       cls: "border-primary/30 bg-primary/10 text-primary" },
  viewer:          { icon: Eye,         cls: "border-muted-foreground/30 bg-muted text-muted-foreground" },
  user:            { icon: UserIcon,    cls: "border-muted-foreground/20 bg-muted text-muted-foreground" },
};

interface Props {
  role: AppRole | null;
  className?: string;
}

export function RoleBadge({ role, className }: Props) {
  if (!role) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground", className)}>
        Без роли
      </span>
    );
  }
  const s = STYLES[role];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        s.cls,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{ROLE_LABELS[role]}</span>
    </span>
  );
}
