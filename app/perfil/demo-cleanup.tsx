"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { eliminarDatosDemo } from "./demo-actions";

/**
 * Sección "Datos de demostración" en /perfil. Muestra cuántos pacientes
 * demo hay y permite borrarlos de un click (con confirmación). Los
 * pacientes reales nunca se tocan.
 */
export function DemoCleanup({ demoCount }: { demoCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await eliminarDatosDemo();
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(res.deleted);
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <section
      id="datos-demo"
      className="mt-8 scroll-mt-20 rounded-lg border border-neutral-200 p-4 dark:border-white/10"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300">
        Datos de demostración
      </h2>

      {done !== null ? (
        <p className="mt-2 text-sm text-emerald-700">
          ✓ Listo. Se eliminaron {done} paciente{done === 1 ? "" : "s"} de
          demostración y todos sus registros.
        </p>
      ) : demoCount === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          No tienes datos de demostración. Tu expediente está limpio. ✓
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Tienes <strong>{demoCount}</strong> paciente
            {demoCount === 1 ? "" : "s"} de demostración (creados para que
            exploraras la app). Bórralos cuando empieces a usar DERMA INTEL con
            pacientes reales. Esto elimina sus consultas, fotos, récipes y
            recordatorios. <strong>No afecta a tus pacientes reales.</strong>
          </p>

          {!confirming ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(true)}
              className="mt-3 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Eliminar datos demo
            </Button>
          ) : (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-400/40 dark:bg-red-400/10">
              <p className="text-sm text-red-800 dark:text-red-200">
                ¿Seguro? Esto borra permanentemente los {demoCount} paciente
                {demoCount === 1 ? "" : "s"} demo y todo su historial.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {pending ? "Eliminando…" : "Sí, eliminar"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
