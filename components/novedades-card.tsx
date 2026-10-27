"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LATEST_RELEASE } from "@/lib/releases";

/**
 * Dismissible "✨ Novedades" surface for the dashboard.
 *
 * Shows the latest release so the médico actually SEES improvements
 * (perceived momentum) instead of them landing silently. Dismissal is
 * remembered per-version in localStorage, so the card re-appears for
 * everyone the next time we ship a new release in lib/releases.ts.
 *
 * localStorage is best-effort (private windows / blocked storage throw),
 * so every access is wrapped and the card simply shows if we can't read.
 */

const STORAGE_KEY = `derma_novedades_seen_v${LATEST_RELEASE.version}`;

export function NovedadesCard() {
  // Start hidden to avoid a hydration flash; decide on the client after mount.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true); // storage unavailable → still show once
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore — dismissal just won't persist this session */
    }
  }

  if (!visible) return null;

  return (
    <section
      aria-label="Novedades"
      className="relative mb-4 overflow-hidden rounded-xl border border-brand-accent bg-brand-cream p-4 dark:border-brand-secondary/40 dark:bg-brand-ink/40"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Entendido, ocultar novedades"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-brand-gray transition-colors hover:bg-black/5 hover:text-brand-ink dark:hover:bg-white/10 dark:hover:text-brand-cream"
      >
        ✕
      </button>

      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-secondary">
        ✨ Novedades · v{LATEST_RELEASE.version}
      </p>
      <h2 className="mt-1 font-display text-lg text-brand-primary dark:text-brand-cream">
        {LATEST_RELEASE.highlight}
      </h2>

      <ul className="mt-3 space-y-1.5 text-sm text-brand-ink dark:text-brand-cream/90">
        {LATEST_RELEASE.incluye.slice(0, 3).map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand-success">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <Link
          href="/about/changelog"
          className="font-medium text-brand-primary underline-offset-4 hover:underline dark:text-brand-secondary"
        >
          Ver todas las novedades →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-brand-gray underline-offset-4 hover:underline"
        >
          Entendido
        </button>
      </div>
    </section>
  );
}
