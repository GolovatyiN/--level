import { ReactNode } from "react";
import { Loader2, AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-card/40 p-10 text-center",
        className,
      )}
    >
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Не удалось загрузить",
  description,
  action,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-destructive">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
