"use client";

import { useEffect } from "react";
import { cachePaciente, type CachedPaciente } from "@/lib/offline-db";

/**
 * Tiny client island that snapshots the freshly-loaded paciente (and
 * its last consultas) into IndexedDB on mount. Renders nothing.
 *
 * Why client-side: the Server Component does the actual Supabase
 * fetch with proper RLS; we can't talk to IDB from the server. So
 * the server passes the snapshot down via props, and this island
 * mirrors it locally. Cost: one extra small JS bundle per patient
 * page (~1KB), but lets us survive a service-worker cache miss for
 * up to 7 days.
 */
export function CachePacienteOnMount({ entry }: { entry: CachedPaciente }) {
  useEffect(() => {
    void cachePaciente({ ...entry, cachedAt: new Date().toISOString() }).catch(
      (e) => {
        // Best-effort. IDB may be unavailable (private mode, etc.).
        console.warn("[offline-cache] paciente snapshot failed:", e);
      },
    );
  }, [entry]);
  return null;
}
