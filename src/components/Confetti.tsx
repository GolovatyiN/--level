import { useEffect, useMemo, useState } from "react";

interface Props {
  /** Increment to fire a fresh burst. */
  trigger: number;
  pieces?: number;
}

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#ec4899",
  "#8b5cf6",
];

/**
 * One-shot confetti burst, no canvas / no library.
 *
 * Renders a fixed-position overlay with N absolutely-positioned pieces, each
 * with a randomised CSS animation. Auto-cleans itself after 1.6s. Bumping
 * `trigger` re-spawns a fresh batch.
 *
 * Skipped entirely when the user prefers reduced motion.
 */
export function Confetti({ trigger, pieces = 60 }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), 1600);
    return () => clearTimeout(t);
  }, [trigger]);

  // Memoise the per-piece random parameters so they don't reroll on parent
  // re-renders mid-flight.
  const items = useMemo(() => {
    return Array.from({ length: pieces }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 200,
      duration: 1100 + Math.random() * 500,
      drift: -40 + Math.random() * 80,
      spin: 360 + Math.random() * 540,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
      shape: Math.random() > 0.5 ? "circle" : "square",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, pieces]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {items.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              top: "-12px",
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              borderRadius: p.shape === "circle" ? "9999px" : "2px",
              "--drift": `${p.drift}vw`,
              "--spin": `${p.spin}deg`,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
