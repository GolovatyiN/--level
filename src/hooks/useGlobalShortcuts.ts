import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Options {
  /** Fire when ⌘K / Ctrl+K is pressed (or "/"). */
  onOpenPalette: () => void;
  /** Fire when "n" is pressed (and no input is focused). */
  onNewTask: () => void;
}

/** Returns true if the user is currently typing in an editable element. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Wires up app-wide keyboard shortcuts:
 *   ⌘K / Ctrl+K / "/" — open command palette
 *   N                 — create new task
 *   G then D/R/T/P    — go to dashboard / roadmap / tasks / kpi
 *
 * Skips while the user is typing in any input/textarea/contenteditable so we
 * never steal text input.
 */
export function useGlobalShortcuts({ onOpenPalette, onNewTask }: Options) {
  const navigate = useNavigate();

  useEffect(() => {
    let gPrefix = false;
    let gPrefixTimer: ReturnType<typeof setTimeout> | null = null;

    const armG = () => {
      gPrefix = true;
      if (gPrefixTimer) clearTimeout(gPrefixTimer);
      gPrefixTimer = setTimeout(() => {
        gPrefix = false;
      }, 800);
    };

    const handler = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K is intentional even while typing — that's the canonical
      // global "open command bar" gesture and it overrides browser defaults.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // Everything else is suppressed while the user is typing.
      if (isTypingTarget(e.target)) return;
      // Don't fire when other modifiers are held — leaves Cmd/Alt + key for
      // browser & OS shortcuts.
      if (e.metaKey || e.altKey || e.ctrlKey) return;

      // "/" — also opens the palette (Linear / GitHub style).
      if (e.key === "/") {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // N — new task
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNewTask();
        return;
      }

      // G prefix → navigation. Two-step: press G, then a destination key.
      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        armG();
        return;
      }

      if (gPrefix) {
        const k = e.key.toLowerCase();
        const route =
          k === "d" ? "/" :
          k === "l" ? "/plans" :
          k === "t" ? "/tasks" :
          k === "p" ? "/kpi" :
          k === "a" ? "/archive" :
          null;
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        gPrefix = false;
        if (gPrefixTimer) clearTimeout(gPrefixTimer);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (gPrefixTimer) clearTimeout(gPrefixTimer);
    };
  }, [navigate, onOpenPalette, onNewTask]);
}
