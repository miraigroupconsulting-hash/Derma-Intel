"use client";

import { useState, useTransition } from "react";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Sticky banner mostrado solo cuando realmente NO hay conexión.
 *
 * useOnlineStatus ya hace verificación con ping al server al recibir
 * un evento 'offline', así que si este banner aparece es porque el
 * ping también falló — alta confianza.
 *
 * Aun así, incluimos un botón "Verificar conexión" que dispara un
 * ping manual. Esto cubre el caso edge de cambios de red rápidos
 * (Android cambia de WiFi a 4G) donde el ping inicial pudo haber
 * llegado tarde.
 *
 * Copy intencionalmente calma — Caracas tiene cortes; "Sin conexión"
 * es neutral, no alarmista.
 */
export function OfflineBanner() {
  const { online, verify } = useOnlineStatus();
  const [checking, startChecking] = useTransition();
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  if (online) return null;

  const handleVerify = () => {
    setLastCheck(null);
    startChecking(async () => {
      const ok = await verify();
      if (!ok) {
        setLastCheck("Sigue sin conexión.");
      }
      // Si ok=true, useOnlineStatus.online ya se actualizó → banner
      // desaparece sin necesidad de setLastCheck
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span>
          <span className="font-medium">Sin conexión.</span> Puedes seguir
          viendo pacientes ya cargados. Tu trabajo se guardará localmente y
          se sincronizará al regresar la señal.
        </span>
        <button
          type="button"
          onClick={handleVerify}
          disabled={checking}
          className="ml-2 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-amber-900 hover:bg-amber-200 disabled:opacity-60"
        >
          {checking ? "Verificando…" : "Verificar conexión"}
        </button>
      </div>
      {lastCheck && (
        <p className="mt-1 text-[0.7rem] text-amber-800/80">{lastCheck}</p>
      )}
    </div>
  );
}
