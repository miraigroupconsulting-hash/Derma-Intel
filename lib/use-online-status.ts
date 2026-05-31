"use client";

import { useEffect, useState } from "react";

/**
 * Reactive online/offline state robusto en Android/iOS mobile.
 *
 * Por qué no confiar en navigator.onLine:
 *   1. En Android Chrome con VPN, reporta false con conexión real
 *      durante minutos tras cambios de red.
 *   2. PEOR: cuando navigator.onLine es false, el browser REHÚSA
 *      mandar fetches (incluyendo un HEAD a /api/ping). Por eso un
 *      fix basado en fetch no rompe el círculo.
 *
 * Por qué Image ping funciona:
 *   Los browsers SIEMPRE permiten cargar <img>, incluso cuando
 *   navigator.onLine es false. Es una técnica de SRE de la era
 *   pre-fetch para verificar conectividad real.
 *
 * Estrategia:
 *   - Default: online=true (no confiamos en navigator.onLine inicial)
 *   - Si dispara evento 'offline': esperamos 2s y hacemos image ping
 *     a /favicon.svg con cache-buster. Si la imagen carga, ignoramos
 *     el evento (era falso positivo). Si falla, mostramos banner.
 *   - Si dispara evento 'online': trust inmediato, online=true
 *   - verify() expuesto para verificación manual desde el banner
 */
export function useOnlineStatus(): {
  online: boolean;
  verify: () => Promise<boolean>;
} {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const imagePing = (): Promise<boolean> =>
      new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          resolve(false);
        }, 8000);
        img.onload = () => {
          clearTimeout(timer);
          resolve(true);
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
        // Cache-buster + recurso pequeño que sabemos que existe
        img.src = `/favicon.svg?_=${Date.now()}`;
      });

    const verifyAndSet = async (): Promise<boolean> => {
      const ok = await imagePing();
      if (!cancelled) setOnline(ok);
      return ok;
    };

    // En mount: si navigator dice offline, NO confiamos — verificamos
    // con imagen. Si dice online, trust por default.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void verifyAndSet();
    }

    const handleOnline = () => {
      if (!cancelled) setOnline(true);
    };
    const handleOffline = () => {
      // Esperar 2s y verificar. El evento 'offline' es muchas veces
      // un falso positivo durante reconexión de VPN.
      setTimeout(() => {
        if (!cancelled) void verifyAndSet();
      }, 2000);
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
   * Verificación manual. Usado por el botón "Verificar conexión" del
   * banner offline. Dispara un image ping y actualiza el estado.
   */
  const verify = async (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        setOnline(false);
        resolve(false);
      }, 8000);
      img.onload = () => {
        clearTimeout(timer);
        setOnline(true);
        resolve(true);
      };
      img.onerror = () => {
        clearTimeout(timer);
        setOnline(false);
        resolve(false);
      };
      img.src = `/favicon.svg?_=${Date.now()}`;
    });
  };

  return { online, verify };
}
