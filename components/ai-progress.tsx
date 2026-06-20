"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Indicador de progreso para llamadas IA largas (~30s).
 *
 * No tenemos progreso real del servidor (es un único fetch que devuelve
 * todo al final), así que mostramos un progreso HONESTO: una barra que
 * avanza hacia ~92% en `expectedMs` y ahí se queda hasta que el caller
 * desmonta el componente (análisis listo), + mensajes de etapa rotando
 * + segundos transcurridos. Nunca llega a 100% sola para no mentir.
 */
const DEFAULT_STAGES = [
  "Preparando las imágenes…",
  "Leyendo la lesión…",
  "Comparando patrones dermatoscópicos…",
  "Ordenando diagnósticos diferenciales…",
  "Redactando el plan sugerido…",
];

export function AiProgress({
  expectedMs = 40_000,
  stages = DEFAULT_STAGES,
}: {
  expectedMs?: number;
  stages?: string[];
}) {
  const [pct, setPct] = useState(4);
  const [elapsed, setElapsed] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const tick = setInterval(() => {
      const ms = Date.now() - startRef.current;
      setElapsed(Math.floor(ms / 1000));
      // Curva que se acerca asintóticamente a 92%.
      const target = 92 * (1 - Math.exp(-ms / (expectedMs * 0.6)));
      setPct(Math.max(4, Math.min(92, target)));
    }, 200);

    const stageTimer = setInterval(() => {
      setStageIdx((i) => (i + 1 < stages.length ? i + 1 : i));
    }, Math.max(2500, expectedMs / stages.length));

    return () => {
      clearInterval(tick);
      clearInterval(stageTimer);
    };
  }, [expectedMs, stages.length]);

  return (
    <div
      className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-brand-ink dark:text-brand-cream">
          {stages[stageIdx] ?? "Analizando…"}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
          {elapsed}s
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand-ink transition-[width] duration-200 ease-out dark:bg-brand-cream"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        El análisis con imágenes suele tomar entre 30 y 50 segundos. No
        cierres esta pantalla.
      </p>
    </div>
  );
}
