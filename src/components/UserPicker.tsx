import { Check, ChevronsUpDown, User as UserIcon, X } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useUsers } from "@/hooks/useUsers";
import { cn } from "@/lib/utils";

interface Props {
  value?: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Combobox that picks a registered user from `profiles`. Used for task
 * assignees and KPI owners. Returns null when cleared so a partially-filled
 * form can omit the field.
 */
export function UserPicker({ value, onChange, placeholder = "Выберите пользователя", className }: Props) {
  const { data: users = [], isLoading } = useUsers();
  const [open, setOpen] = useState(false);
  const selected = value ? users.find((u) => u.user_id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {selected ? (
              <span className="flex min-w-0 flex-col text-left">
                <span className="truncate leading-tight">
                  {selected.display_name ?? selected.email ?? "—"}
                </span>
                {selected.display_name && selected.email && (
                  <span className="truncate text-[10px] leading-tight text-muted-foreground">
                    {selected.email}
                  </span>
                )}
              </span>
            ) : (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Очистить"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(null);
                  }
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск по имени или email..." />
          <CommandList>
            <CommandEmpty>{isLoading ? "Загрузка..." : "Никого не найдено."}</CommandEmpty>
            <CommandGroup>
              {users.map((u) => {
                const active = u.user_id === value;
                return (
                  <CommandItem
                    key={u.user_id}
                    // cmdk фильтрует по `value`. Конкатенируем display_name +
                    // email + id, чтобы поиск работал по обоим полям.
                    value={`${u.display_name ?? ""} ${u.email ?? ""} ${u.user_id}`}
                    onSelect={() => {
                      onChange(u.user_id);
                      setOpen(false);
                    }}
                  >
                    <UserIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate leading-tight">
                        {u.display_name ?? u.email ?? "—"}
                      </span>
                      {u.display_name && u.email && (
                        <span className="truncate text-[10px] leading-tight text-muted-foreground">
                          {u.email}
                        </span>
                      )}
                    </div>
                    {active && <Check className="ml-2 h-4 w-4 shrink-0" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
