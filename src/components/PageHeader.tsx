interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
      <div className="min-w-0 animate-fade-in">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex animate-slide-in-right flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
