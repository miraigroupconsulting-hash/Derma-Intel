"use client";

import { useEffect, useState } from "react";

/**
 * Reactive online/offline state for client components.
 *
 * Returns `true` when the browser believes there's network access,
 * `false` otherwise. SSR-safe: defaults to `true` on the server so we
 * don't flash an "offline" banner during hydration.
 *
 * Note: `navigator.onLine` is a hint, not a guarantee. The browser can
 * report `online: true` while DNS or our backend are unreachable. For
 * that case, individual fetch sites still need to handle network errors.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    // Sync once on mount in case the prop initialized stale.
    setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
