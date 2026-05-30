"use client";

import { useEffect, useState } from "react";

/**
 * Reactive online/offline state que NO confía ciegamente en
 * `navigator.onLine`.
 *
 * Por qué: en Android Chrome con VPN, y en algunos PWA modes,
 * navigator.onLine reporta false con conexión real. Esto causa que:
 *   1. El banner ámbar "Sin conexión" aparezca cuando no debe
 *   2. PEOR: algunos browsers REHÚSAN mandar fetches mientras
 *      navigator.onLine es false → la médica no puede usar la IA
 *      aunque tenga señal completa.
 *
 * Estrategia híbrida:
 *   - Inicio: trust navigator.onLine como hint
 *   - On mount: si dice offline, verificar con un ping real
 *   - On 'offline' event: verificar con ping antes de mostrar banner
 *     (delay 1s para evitar carrera con eventos de red)
 *   - On 'online' event: trust inmediato + cancelar verificaciones
 *   - verifyConnection: función pública que cualquier componente
 *     puede invocar (ej. desde un botón "Verificar conexión")
 *
 * El ping va a /api/ping (edge function, sin auth, sin cache). Se
 * usa HEAD para minimizar bandwidth.
 */
export function useOnlineStatus(): {
  online: boolean;
  verify: () => Promise<boolean>;
} {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    let cancelled = false;

    const ping = async (): Promise<boolean> => {
      try {
        // AbortController para no quedarnos colgados si el browser
        // realmente está offline y la promesa no resuelve.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch("/api/ping", {
          method: "HEAD",
          cache: "no-store",
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    };

    const verifyAndSet = async () => {
      const ok = await ping();
      if (!cancelled) setOnline(ok);
    };

    // En mount: si navigator dice offline, NO confiar — verificar.
    if (!navigator.onLine) {
      void verifyAndSet();
    }

    const handleOnline = () => {
      if (!cancelled) setOnline(true);
    };
    const handleOffline = () => {
      // Esperar 1s y verificar — el evento 'offline' puede ser
      // transitorio o falso.
      setTimeout(() => {
        if (!cancelled) void verifyAndSet();
      }, 1000);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /**
   * Verificación manual. Útil para botones "Verificar conexión" en
   * la UI del banner offline. Devuelve true si la red está REALMENTE
   * disponible (server responde al ping).
   */
  const verify = async (): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch("/api/ping", {
        method: "HEAD",
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const ok = res.ok;
      setOnline(ok);
      return ok;
    } catch {
      setOnline(false);
      return false;
    }
  };

  return { online, verify };
}
