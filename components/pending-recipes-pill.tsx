"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { listOutboxRecipes } from "@/lib/offline-db";
import { syncOutbox } from "@/lib/recipe-sync";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Pill shown on the dashboard when there are récipes queued in the
 * IndexedDB outbox (firmados offline, upload pending). Lets the
 * médica trigger a manual sync attempt; otherwise auto-retries on
 * 'online' event.
 *
 * Renders nothing when the outbox is empty (zero-footprint).
 */
export function PendingRecipesPill() {
  const router = useRouter();
  const { online } = useOnlineStatus();
  const [count, setCount] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Refresh the count whenever we mount or come back online.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const entries = await listOutboxRecipes(user.id);
        if (cancelled) return;
        setCount(entries.length);
        const lastErr = entries
          .map((e) => e.lastError)
          .filter((m): m is string => !!m)
          .pop();
        setLastError(lastErr ?? null);
      } catch {
        // Silent: best-effort, IDB may not be available in private mode.
      }
    };
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("online", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handler);
    };
  }, []);

  const handleSync = () => {
    setLastError(null);
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const result = await syncOutbox(user.id);
      setCount(result.remaining);
      if (result.drained > 0) {
        router.refresh();
      }
      if (result.failed > 0) {
        setLastError(
          `${result.failed} ${result.failed === 1 ? "récipe quedó" : "récipes quedaron"} pendiente${result.failed === 1 ? "" : "s"} — reintenta cuando haya señal estable.`,
        );
      }
    });
  };

  if (count === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
      <p>
        <span className="font-medium">
          {count} récipe{count === 1 ? "" : "s"} pendiente
          {count === 1 ? "" : "s"} de subir.
        </span>{" "}
        Firmado{count === 1 ? "" : "s"} sin conexión.{" "}
        {online
          ? "Conexión restablecida — puedes sincronizar ahora."
          : "Esperando conexión a internet."}
      </p>
      {lastError && (
        <p className="text-xs text-amber-800/80">Último error: {lastError}</p>
      )}
      <Button
        type="button"
        size="sm"
        onClick={handleSync}
        disabled={pending || !online}
        className="bg-amber-600 hover:bg-amber-700"
      >
        {pending ? "Sincronizando…" : "Sincronizar ahora"}
      </Button>
    </div>
  );
}
