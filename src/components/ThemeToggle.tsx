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
      className={cn("w-full justify-start gap-2 text-muted-foreground", className)}
    >
      {current === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{current === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
    </Button>
  );
}
