import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Flag,
  PauseCircle,
  RefreshCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  PLAN_STATUS_LABELS,
  PLAN_STATUS_TONE,
  type PlanStatus,
} from "@/hooks/usePlans";
import { cn } from "@/lib/utils";

const TONE_CLS: Record<NonNullable<ReturnType<typeof PLAN_STATUS_TONE.draft>>, string> = {} as any;

const TONE_TO_CLS: Record<"neutral" | "info" | "warning" | "success" | "destructive", string> = {
  neutral:     "border-muted-foreground/30 bg-muted text-muted-foreground",
  info:        "border-info/40 bg-info/10 text-info",
  warning:     "border-warning/40 bg-warning/10 text-warning",
  success:     "border-success/40 bg-success/10 text-success",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

const ICONS: Record<PlanStatus, React.ComponentType<{ className?: string }>> = {
  draft:             CircleDashed,
  on_review:         Send,
  changes_requested: RefreshCcw,
  approved:          ShieldCheck,
  in_progress:       CircleDot,
  at_risk:           Flag,
  blocked:           PauseCircle,
  completed:         CheckCircle2,
  archived:          Clock,
};

interface Props {
  status: PlanStatus;
  className?: string;
  compact?: boolean;
}

/**
 * Plan status pill — semantic icon + colour + label. Reused on the plans
 * matrix, the plan detail header, and the activity feed.
 */
export function PlanStatusBadge({ status, className, compact }: Props) {
  const Icon = ICONS[status];
  const tone = PLAN_STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE_TO_CLS[tone],
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {!compact && PLAN_STATUS_LABELS[status]}
    </span>
  );
}
