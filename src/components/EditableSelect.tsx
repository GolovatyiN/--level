import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, X } from "lucide-react";
import { useIsAdmin } from "@/hooks/useUserRole";

export interface EditableSelectOption {
  value: string;
  label: string;
}

interface Props {
  value?: string | null;
  onValueChange: (v: string) => void;
  options: EditableSelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  /** Returns the new option's value (after creation) */
  onCreate?: (label: string) => Promise<string | undefined>;
  onDelete?: (value: string) => Promise<void>;
  createLabel?: string;
  emptyOption?: { value: string; label: string };
}

/**
 * Select with inline "+ create new" footer for admins.
 * The created option's value is selected automatically.
 */
export function EditableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
  onCreate,
  onDelete,
  createLabel = "Добавить",
  emptyOption,
}: Props) {
  const isAdmin = useIsAdmin();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!onCreate || !draft.trim() || busy) return;
    setBusy(true);
    try {
      const newVal = await onCreate(draft.trim());
      setDraft("");
      setAdding(false);
      if (newVal) onValueChange(newVal);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select value={value ?? undefined} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyOption && <SelectItem value={emptyOption.value}>{emptyOption.label}</SelectItem>}
        {options.map((o) => (
          <div key={o.value} className="group relative flex items-center">
            <SelectItem value={o.value} className="flex-1 pr-8">
              {o.label}
            </SelectItem>
            {isAdmin && onDelete && o.value !== emptyOption?.value && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(o.value);
                }}
                className="absolute right-2 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                title="Удалить"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {isAdmin && onCreate && (
          <>
            <SelectSeparator />
            {adding ? (
              <div
                className="flex items-center gap-1 p-1.5"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    } else if (e.key === "Escape") {
                      setAdding(false);
                      setDraft("");
                    }
                  }}
                  placeholder={createLabel}
                  className="h-7 text-xs"
                />
                <Button type="button" size="sm" className="h-7 px-2" onClick={submit} disabled={!draft.trim() || busy}>
                  OK
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1"
                  onClick={() => {
                    setAdding(false);
                    setDraft("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdding(true);
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> {createLabel}
              </button>
            )}
          </>
        )}
      </SelectContent>
    </Select>
  );
}