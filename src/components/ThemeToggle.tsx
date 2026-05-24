import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "ghost" | "outline";
  /**
   * Когда true — рендерим без текстовой подписи, только Sun/Moon иконку.
   * Используется в свёрнутом сайдбаре, чтобы не вытекать за w-14.
   */
  compact?: boolean;
}

export function ThemeToggle({ className, variant = "ghost", compact = false }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme === "system" ? resolvedTheme : theme) : "dark";
  const next = current === "dark" ? "light" : "dark";

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={() => setTheme(next)}
      aria-label={`Переключить тему на ${next === "dark" ? "тёмную" : "светлую"}`}
      title={`Тема: ${current === "dark" ? "Тёмная" : "Светлая"}`}
      className={cn(
        "group w-full text-muted-foreground",
        compact ? "justify-center px-0" : "justify-start gap-2",
        className,
      )}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        {/* Cross-fade + rotate between Sun and Moon */}
        <Sun
          className={cn(
            "absolute h-4 w-4 transition-all duration-500",
            current === "dark"
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0",
          )}
        />
        <Moon
          className={cn(
            "absolute h-4 w-4 transition-all duration-500",
            current === "dark"
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100",
          )}
        />
      </span>
      {!compact && (
        <span>{current === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
      )}
    </Button>
  );
}
