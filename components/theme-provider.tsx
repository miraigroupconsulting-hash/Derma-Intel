"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps the app with next-themes so we can toggle light/dark via class
 * on <html>. defaultTheme="light" matches CLAUDE.md §9 default; the
 * user can opt-in to dark from /perfil. attribute="class" matches
 * Tailwind 4's @custom-variant dark (&:is(.dark *)).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
