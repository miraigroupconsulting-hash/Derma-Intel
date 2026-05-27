"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botón discreto para alternar claro/oscuro. Espera al mount del
 * cliente para evitar mismatch de hidratación con next-themes
 * (next-themes setea la clase en <html> via script inline, pero
 * useTheme() no devuelve el valor real hasta después de hidratar).
 */
export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted ? (resolvedTheme ?? theme) === "dark" : false;

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "gap-1.5",
        className,
      )}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      suppressHydrationWarning
    >
      <span aria-hidden>{mounted ? (isDark ? "☀" : "☾") : "☾"}</span>
      {showLabel && (
        <span suppressHydrationWarning>
          {mounted ? (isDark ? "Claro" : "Oscuro") : "Tema"}
        </span>
      )}
    </button>
  );
}
