"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { colorPrioridad } from "@/lib/recordatorios";
import {
  resolverNotificacion,
  markNotificacionLeida,
} from "./notificaciones-actions";
import type { DashboardAlerta } from "@/lib/dashboard-data";

const PRIORIDAD_CRITICA: DashboardAlerta["prioridad"] = "alta";

export function AlertasPanel({
  alertasTop,
  alertasMas,
}: {
  alertasTop: DashboardAlerta[];
  alertasMas: number;
}) {
  const [expanded, setExpanded] = useState(false);
  void expanded; // todo: lazy-load más alertas

  if (alertasTop.length === 0) {
    return (
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        ✓ Sin alertas activas. Todo al día.
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        ⚠ Atención ({alertasTop.length + alertasMas})
      </h2>
      <ul className="space-y-2">
        {alertasTop.map((a) => (
          <AlertaItem key={a.id} alerta={a} />
        ))}
      </ul>
      {alertasMas > 0 && (
        <Link
          href="/agenda"
          className="block text-xs text-neutral-600 underline hover:no-underline"
        >
          ▾ Ver todas las alertas ({alertasMas} más)
        </Link>
      )}
    </section>
  );
}

function AlertaItem({ alerta }: { alerta: DashboardAlerta }) {
  const router = useRouter();
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [pending, startTransition] = useTransition();
  const color = colorPrioridad(alerta.prioridad);

  const handleResolver = () => {
    if (alerta.prioridad === PRIORIDAD_CRITICA && !confirmDismiss) {
      setConfirmDismiss(true);
      return;
    }
    startTransition(async () => {
      await resolverNotificacion(alerta.id);
      router.refresh();
    });
  };

  const handleMarcarLeida = () => {
    startTransition(async () => {
      await markNotificacionLeida(alerta.id);
      router.refresh();
    });
  };

  return (
    <li
      className={`rounded-md border p-3 text-sm ${color.bg} ${color.border} ${color.text}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-medium">
          {color.icon} {alerta.titulo}
        </p>
      </div>
      {alerta.pacienteNombre && (
        <p className="text-xs opacity-80">{alerta.pacienteNombre}</p>
      )}
      {alerta.mensaje && (
        <p className="mt-1 text-xs opacity-90">{alerta.mensaje}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {alerta.accionUrl && (
          <Link
            href={alerta.accionUrl}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Ver
          </Link>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleMarcarLeida}
          disabled={pending}
        >
          Marcar leída
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleResolver}
          disabled={pending}
          className={
            alerta.prioridad === PRIORIDAD_CRITICA && !confirmDismiss
              ? "text-red-700"
              : ""
          }
        >
          {confirmDismiss && alerta.prioridad === PRIORIDAD_CRITICA
            ? "Confirmar — descartar"
            : "Descartar"}
        </Button>
        {confirmDismiss && (
          <button
            type="button"
            onClick={() => setConfirmDismiss(false)}
            className="text-xs underline hover:no-underline"
          >
            Cancelar
          </button>
        )}
      </div>
      {confirmDismiss && (
        <p className="mt-2 rounded bg-red-100 px-2 py-1 text-[0.7rem] text-red-800">
          ⚠ Alerta crítica. Confirmá si querés descartar. La acción no genera
          eliminación de paciente ni récipe — solo cierra esta notificación.
        </p>
      )}
    </li>
  );
}
