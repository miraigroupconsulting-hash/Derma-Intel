"use client";

import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Sticky banner at the top of the app shown only when the browser is
 * offline. Sits above the page content; routes lay themselves out
 * below it. Renders nothing when online (zero footprint).
 *
 * Copy intentionally calm — many of the médica's patients live in
 * areas with intermittent power/internet. "Estás sin conexión" is
 * neutral, not alarming.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 shadow-sm"
    >
      <span className="font-medium">Sin conexión.</span>{" "}
      Puedes seguir viendo pacientes ya cargados. Los récipes que firmes
      se guardarán localmente y se sincronizarán al regresar la señal.
    </div>
  );
}
