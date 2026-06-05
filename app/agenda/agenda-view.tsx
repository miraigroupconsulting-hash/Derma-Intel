"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { colorPrioridad } from "@/lib/recordatorios";

interface Evento {
  id: string;
  pacienteId: string | null;
  pacienteNombre: string;
  fecha: string; // ISO
  tipo: string;
  prioridad: "baja" | "media" | "alta";
  mensaje: string | null;
}

type ViewMode = "semana" | "lista";

function formatDay(iso: string, tz: string): { num: string; mes: string; weekday: string } {
  const d = new Date(`${iso}T12:00:00Z`); // noon to avoid edge tz cases
  return {
    num: d.toLocaleDateString("es-VE", { day: "numeric", timeZone: tz }),
    mes: d.toLocaleDateString("es-VE", { month: "short", timeZone: tz }),
    weekday: d.toLocaleDateString("es-VE", { weekday: "short", timeZone: tz }),
  };
}

function formatHora(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hour12: false,
  });
}

function ymdInTz(iso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AgendaView({
  weekStart,
  tz,
  eventos,
}: {
  weekStart: string;
  tz: string;
  eventos: Evento[];
}) {
  const [view, setView] = useState<ViewMode>("semana");

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  }, [weekStart]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const day of days) map.set(day, []);
    for (const e of eventos) {
      const dayKey = ymdInTz(e.fecha, tz);
      if (map.has(dayKey)) map.get(dayKey)!.push(e);
    }
    return map;
  }, [eventos, days, tz]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-0.5 self-end w-fit ml-auto">
        <button
          type="button"
          onClick={() => setView("semana")}
          className={
            "h-8 rounded px-2 text-xs " +
            (view === "semana"
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-50")
          }
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => setView("lista")}
          className={
            "h-8 rounded px-2 text-xs " +
            (view === "lista"
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-50")
          }
        >
          Lista
        </button>
      </div>

      {view === "semana" ? (
        <div className="grid grid-cols-7 gap-2 overflow-x-auto">
          {days.map((d) => {
            const f = formatDay(d, tz);
            const items = eventsByDay.get(d) ?? [];
            return (
              <div
                key={d}
                className="min-w-[110px] rounded-md border border-neutral-200 bg-white"
              >
                <div className="border-b border-neutral-200 p-2 text-center">
                  <p className="text-[0.65rem] uppercase text-neutral-500">
                    {f.weekday}
                  </p>
                  <p className="text-lg font-semibold">{f.num}</p>
                  <p className="text-[0.6rem] text-neutral-500">{f.mes}</p>
                </div>
                <ul className="space-y-1 p-1.5">
                  {items.length === 0 ? (
                    <li className="px-1 py-1 text-center text-[0.65rem] text-neutral-400">
                      —
                    </li>
                  ) : (
                    items.map((e) => (
                      <AgendaCard key={e.id} ev={e} tz={tz} />
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-2">
          {eventos.length === 0 ? (
            <li className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
              Sin eventos esta semana.
            </li>
          ) : (
            eventos.map((e) => (
              <li key={e.id}>
                <AgendaCard ev={e} tz={tz} variant="row" />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function AgendaCard({
  ev,
  tz,
  variant = "block",
}: {
  ev: Evento;
  tz: string;
  variant?: "block" | "row";
}) {
  const color = colorPrioridad(ev.prioridad);
  const hora = formatHora(ev.fecha, tz);
  // Propagamos ?from=/agenda&fromLabel=Agenda para que el BackLink
  // de la ficha del paciente regrese a Agenda (no al dashboard).
  const href = ev.pacienteId
    ? `/pacientes/${ev.pacienteId}?from=%2Fagenda&fromLabel=Agenda`
    : "#";

  if (variant === "row") {
    return (
      <Link
        href={href}
        className={`flex items-center justify-between rounded-md border p-3 text-sm hover:opacity-90 ${color.bg} ${color.border}`}
      >
        <div>
          <p className={`font-medium ${color.text}`}>
            {color.icon} {ev.pacienteNombre}
          </p>
          {ev.mensaje && (
            <p className="mt-0.5 text-xs opacity-80">{ev.mensaje}</p>
          )}
        </div>
        <span className={`text-sm ${color.text}`}>{hora}</span>
      </Link>
    );
  }

  return (
    <li className={`rounded p-1.5 text-[0.65rem] ${color.bg} ${color.border} border`}>
      <Link href={href} className={`block ${color.text}`}>
        <p className="font-medium">{hora}</p>
        <p className="truncate">{ev.pacienteNombre}</p>
      </Link>
    </li>
  );
}
