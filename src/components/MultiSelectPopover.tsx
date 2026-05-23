import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional small swatch — например, цвет отдела. */
  colorHex?: string;
}

interface Props {
  /** Подпись на кнопке-триггере, когда ничего не выбрано. */
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Если true — показывается поиск над списком (фильтрует по label). */
  searchable?: boolean;
  /** Ширина триггера — иначе кнопка тянется по тексту. */
  triggerClassName?: string;
}

/**
 * Универсальный multi-select на popover + чекбоксы.
 *
 * Используем там, где shadcn'овский Select с одиночным выбором не
 * подходит (фильтры на /plans). Поиск по подстроке в label.
 */
export function MultiSelectPopover({
  placeholder,
  options,
  selected,
  onChange,
  searchable = false,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
    setQuery("");
  };

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? placeholder
        : `${placeholder}: ${selected.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs font-normal",
            selected.length > 0 && "border-foreground/30",
            triggerClassName,
          )}
        >
          <span className="truncate">{label}</span>
          {selected.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") clear(e as any);
              }}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
              aria-label="Очистить"
            >
              <X className="h-3 w-3" />
            </span>
          ) : (
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {searchable && (
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск..."
              className="h-8 pl-7 text-sm"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-64 space-y-0.5 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Ничего не найдено
            </p>
          ) : (
            filtered.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    checked && "bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-foreground bg-foreground text-background"
                        : "border-border",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  {o.colorHex && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: o.colorHex }}
                    />
                  )}
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Очистить выбор
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
