import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Total tween duration in ms. */
  duration?: number;
  /** Optional formatter — defaults to integer formatting. */
  format?: (n: number) => string;
  className?: string;
}

/**
 * Tweens between consecutive `value`s with requestAnimationFrame.
 *
 * Cheap to use anywhere — the cost is one rAF loop per active instance,
 * and the loop only runs while the value is changing. Respects the
 * `prefers-reduced-motion` media query by snapping immediately.
 */
export function AnimatedNumber({ value, duration = 600, format, className }: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      setDisplay(value);
      return;
    }
    fromRef.current = display;
    startRef.current = null;

    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const fmt = format ?? ((n: number) => Math.round(n).toString());
  return <span className={className}>{fmt(display)}</span>;
}
