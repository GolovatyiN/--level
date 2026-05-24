import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageTabItem {
  label: string;
  to: string;
  /** Точное совпадение пути (для root-маршрутов вроде "/"). */
  end?: boolean;
}

/**
 * Tab-bar под PageHeader, который переключает между связанными страницами
 * раздела. Использует react-router NavLink — активная вкладка определяется
 * текущим URL, не требует state.
 *
 * Сейчас используется в разделе «Квартальные планы» для переключения
 * между /plans (список отделов) и /tasks (глобальная таблица задач).
 */
export function PageTabs({ items }: { items: PageTabItem[] }) {
  return (
    <div className="border-b border-border bg-background/60 px-4 sm:px-8">
      <div className="inline-flex gap-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              cn(
                "relative -mb-px inline-flex h-10 items-center px-3 text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {it.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
