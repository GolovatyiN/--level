import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "ghost" | "outline";
}

export function ThemeToggle({ className, variant = "ghost" }: Props) {
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
      className={cn("group w-full justify-start gap-2 text-muted-foreground", className)}
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
      <span>{current === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
    </Button>
  );
}
