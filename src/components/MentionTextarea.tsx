import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useUsers } from "@/hooks/useUsers";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onMentionsChange?: (userIds: string[]) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export interface MentionTextareaHandle {
  focus: () => void;
}

interface MentionState {
  /** Position of the @ symbol in the textarea value. */
  start: number;
  /** Current query string (text after @, before any whitespace). */
  query: string;
}

/**
 * Textarea with @-mention autocomplete. The user types `@`, a popover lists
 * users matching the query; pressing Enter / clicking inserts the display
 * name. Internally the inserted text is tracked alongside its user_id, so
 * the parent gets a clean `mentioned_user_ids: string[]` separate from the
 * displayed string.
 */
export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { value, onChange, onMentionsChange, placeholder, rows = 3, className, onKeyDown },
  ref,
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlight, setHighlight] = useState(0);
  // Track user_ids whose display name has been inserted into `value`.
  // We do this by snapshot rather than parse-time lookup — display_name
  // collisions (two users with the same name) would otherwise be ambiguous.
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const { data: users = [] } = useUsers();

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }));

  // Notify the parent whenever the set of mentions actually present in the
  // current text changes. We re-derive: a tracked id only counts if its
  // display name still appears in the text.
  useEffect(() => {
    if (!onMentionsChange) return;
    const present: string[] = [];
    mentionedIds.forEach((id) => {
      const u = users.find((x) => x.user_id === id);
      const name = u?.display_name?.trim();
      if (name && value.includes(`@${name}`)) present.push(id);
    });
    onMentionsChange(present);
  }, [value, users, mentionedIds, onMentionsChange]);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return users
      .filter((u) => (u.display_name ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [mention, users]);

  // Reset highlight when the match list changes underneath us.
  useEffect(() => {
    setHighlight(0);
  }, [mention?.query]);

  const detectMention = (text: string, caret: number) => {
    // Walk back from the caret to find an unbroken @<word> pattern.
    let i = caret - 1;
    while (i >= 0 && !/\s/.test(text[i]) && text[i] !== "@") i--;
    if (i >= 0 && text[i] === "@") {
      // Make sure @ is at start or preceded by whitespace.
      if (i === 0 || /\s/.test(text[i - 1])) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const caret = e.target.selectionStart ?? text.length;
    onChange(text);
    setMention(detectMention(text, caret));
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setMention(detectMention(ta.value, ta.selectionStart ?? ta.value.length));
  };

  const insertMention = (userId: string, displayName: string) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const afterStart = mention.start + 1 + mention.query.length;
    const after = value.slice(afterStart);
    const inserted = `@${displayName} `;
    const next = before + inserted + after;
    onChange(next);
    setMentionedIds((s) => new Set(s).add(userId));
    setMention(null);
    // Restore caret after the inserted mention.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        const pos = before.length + inserted.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(matches.length - 1, h + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const m = matches[highlight];
        if (m) insertMention(m.user_id, m.display_name ?? "user");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Defer so a click on a list item still registers.
          setTimeout(() => setMention(null), 120);
        }}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {mention && matches.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-elegant scrollbar-thin"
          role="listbox"
        >
          {matches.map((u, i) => (
            <li
              key={u.user_id}
              role="option"
              aria-selected={i === highlight}
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown so blur doesn't close the menu first
                  e.preventDefault();
                  insertMention(u.user_id, u.display_name ?? "user");
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  i === highlight ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase">
                  {(u.display_name ?? "?").slice(0, 1)}
                </span>
                <span className="truncate">{u.display_name ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
