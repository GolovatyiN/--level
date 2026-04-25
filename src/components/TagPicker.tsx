import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import { useTags, useCreateTag, useDeleteTag, useToggleEntityTag, useTaskTags, useKpiTags } from "@/hooks/useTaxonomies";

interface Props {
  entity: "task" | "kpi";
  /** When omitted, picker works in "draft" mode using selectedIds + onChange. */
  entityId?: string | null;
  selectedIds?: string[];
  onChange?: (ids: string[]) => void;
}

export function TagPicker({ entity, entityId, selectedIds, onChange }: Props) {
  const { data: allTags = [] } = useTags();
  const draftMode = !entityId;
  const taskTagsQ = useTaskTags(!draftMode && entity === "task" ? entityId : null);
  const kpiTagsQ = useKpiTags(!draftMode && entity === "kpi" ? entityId : null);
  const selected = draftMode
    ? selectedIds ?? []
    : ((entity === "task" ? taskTagsQ.data : kpiTagsQ.data) ?? []);
  const toggle = useToggleEntityTag(entity);
  const create = useCreateTag();
  const del = useDeleteTag();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const selectedSet = new Set(selected);
  const selectedTags = allTags.filter((t) => selectedSet.has(t.id));

  const flip = (tagId: string, attach: boolean) => {
    if (draftMode) {
      const next = attach ? [...selected, tagId] : selected.filter((x) => x !== tagId);
      onChange?.(next);
    } else {
      toggle.mutate({ entityId: entityId!, tagId, attach });
    }
  };

  const onCreate = async () => {
    if (!draft.trim()) return;
    const newTag = await create.mutateAsync({ name: draft.trim() });
    setDraft("");
    if (newTag?.id) {
      flip(newTag.id, true);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedTags.map((t) => (
        <Badge
          key={t.id}
          variant="secondary"
          className="gap-1 pr-1 text-xs"
          style={{ backgroundColor: `${t.color}22`, color: t.color, borderColor: `${t.color}44` }}
        >
          {t.name}
          <button
            type="button"
            onClick={() => flip(t.id, false)}
            className="ml-0.5 rounded-full opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <TagIcon className="h-3 w-3" /> Тег
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="max-h-56 space-y-0.5 overflow-y-auto scrollbar-thin">
            {allTags.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Нет тегов</p>
            ) : (
              allTags.map((t) => {
                const checked = selectedSet.has(t.id);
                return (
                  <div key={t.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => flip(t.id, !checked)}
                      className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="flex-1 truncate">{t.name}</span>
                      {checked && <Check className="h-3.5 w-3.5 text-foreground" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => del.mutate(t.id)}
                      className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                      title="Удалить тег"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Новый тег"
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCreate();
                }
              }}
            />
            <Button type="button" size="sm" className="h-7 px-2" onClick={onCreate} disabled={!draft.trim() || create.isPending}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}