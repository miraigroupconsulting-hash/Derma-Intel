"use client";

import { useMemo, useState, type ReactNode } from "react";
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

type ViewMode = "proximas" | "semana";

const TIPO_LABEL: Record<string, string> = {
  control: "Control",
  seguimiento: "Seguimiento",
  biopsia_pendiente: "Biopsia pendiente",
  tratamiento_finaliza: "Fin de tratamiento",
  otro: "Cita",
};

function formatHora(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hour12: false,
  });
}

/** "YYYY-MM-DD" del evento en la TZ del médico. */
function ymdInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Encabezado de grupo: "Hoy", "Mañana" o "Miércoles 24 de junio". */
function dateHeader(ymd: string, todayYmd: string, tz: string): string {
  if (ymd === todayYmd) return "Hoy";
  if (ymd === addDaysIso(todayYmd, 1)) return "Mañana";
  const s = new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  });
  return cap(s);
}

/** Encabezado compacto para la vista Semana: "Lun 22 jun". */
function dayHeaderShort(ymd: string, tz: string): string {
  const s = new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-VE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  return cap(s.replace(/\./g, ""));
}

/** "15 – 21 jun" para el rango de la semana visible. */
function weekRangeLabel(weekStart: string, tz: string): string {
  const end = addDaysIso(weekStart, 6);
  const sd = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("es-VE", {
    day: "numeric",
    timeZone: tz,
  });
  const ed = new Date(`${end}T12:00:00Z`).toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  return `${sd} – ${cap(ed.replace(/\./g, ""))}`;
}

function groupByDay(eventos: Evento[], tz: string): { ymd: string; items: Evento[] }[] {
  const map = new Map<string, Evento[]>();
  for (const e of eventos) {
    const k = ymdInTz(e.fecha, tz);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  // proximas ya viene ordenado asc por fecha → los grupos salen en orden.
  return Array.from(map.entries()).map(([ymd, items]) => ({ ymd, items }));
}

export function AgendaView({
  weekStart,
  tz,
  eventos,
  proximas,
  todayYmd,
  initialView = "proximas",
}: {
  weekStart: string;
  tz: string;
  eventos: Evento[];
  proximas: Evento[];
  todayYmd: string;
  initialView?: ViewMode;
}) {
  const [view, setView] = useState<ViewMode>(initialView);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const day of days) map.set(day, []);
    for (const e of eventos) {
      const k = ymdInTz(e.fecha, tz);
      if (map.has(k)) map.get(k)!.push(e);
    }
    return map;
  }, [eventos, days, tz]);

  const proxGroups = useMemo(() => groupByDay(proximas, tz), [proximas, tz]);

  return (
    <div className="space-y-4">
      {/* Toggle de vista */}
      <div className="flex items-center gap-1 self-start rounded-lg border border-neutral-200 p-0.5 dark:border-white/10">
        <ToggleBtn active={view === "proximas"} onClick={() => setView("proximas")}>
          Próximas
        </ToggleBtn>
        <ToggleBtn active={view === "semana"} onClick={() => setView("semana")}>
          Semana
        </ToggleBtn>
      </div>

      {view === "proximas" ? (
        proxGroups.length === 0 ? (
          <EmptyState>
            No tienes citas próximas. Crea una con &ldquo;+ Nueva cita&rdquo;.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {proxGroups.map((g) => (
              <section key={g.ymd}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-brand-ink dark:text-brand-cream">
                    {dateHeader(g.ymd, todayYmd, tz)}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {g.items.length} cita{g.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.items.map((e) => (
                    <CitaCard key={e.id} ev={e} tz={tz} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {/* Navegación de semana (preserva la vista con &vista=semana) */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-1.5 dark:border-white/10">
            <Link
              href={`/agenda?semana=${addDaysIso(weekStart, -7)}&vista=semana`}
              aria-label="Semana anterior"
              className="flex h-10 w-10 items-center justify-center rounded-md text-lg hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              ←
            </Link>
            <div className="text-center">
              <p className="text-sm font-semibold">{weekRangeLabel(weekStart, tz)}</p>
              <Link
                href="/agenda?vista=semana"
                className="text-xs text-neutral-500 hover:underline"
              >
                Ir a esta semana
              </Link>
            </div>
            <Link
              href={`/agenda?semana=${addDaysIso(weekStart, 7)}&vista=semana`}
              aria-label="Semana siguiente"
              className="flex h-10 w-10 items-center justify-center rounded-md text-lg hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              →
            </Link>
          </div>

          {days.map((d) => {
            const items = eventsByDay.get(d) ?? [];
            const isToday = d === todayYmd;
            return (
              <section key={d}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3
                    className={
                      "text-sm font-semibold " +
                      (isToday
                        ? "text-brand-ink dark:text-brand-cream"
                        : "text-neutral-600 dark:text-neutral-400")
                    }
                  >
                    {dayHeaderShort(d, tz)}
                    {isToday && (
                      <span className="ml-2 rounded-full bg-brand-ink px-2 py-0.5 text-[0.6rem] font-medium text-white dark:bg-brand-cream dark:text-brand-ink">
                        Hoy
                      </span>
                    )}
                  </h3>
                </div>
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-neutral-200 px-3 py-2 text-xs text-neutral-400 dark:border-white/10">
                    Sin citas
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((e) => (
                      <CitaCard key={e.id} ev={e} tz={tz} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-9 rounded-md px-3 text-sm font-medium transition-colors " +
        (active
          ? "bg-brand-ink text-white dark:bg-brand-cream dark:text-brand-ink"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/5")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500 dark:border-white/10 dark:bg-white/5">
      {children}
    </div>
  );
}

/**
 * Tarjeta de cita — usada en ambas vistas. Hora grande a la izquierda,
 * nombre del paciente prominente, tipo + nota + prioridad debajo. Borde
 * y fondo según prioridad. Toda la tarjeta enlaza a la ficha del paciente.
 */
function CitaCard({ ev, tz }: { ev: Evento; tz: string }) {
  const color = colorPrioridad(ev.prioridad);
  const hora = formatHora(ev.fecha, tz);
  const href = ev.pacienteId
    ? `/pacientes/${ev.pacienteId}?from=%2Fagenda&fromLabel=Agenda`
    : "#";
  const sub = [TIPO_LABEL[ev.tipo] ?? "Cita", ev.mensaje]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={href}
      className={`flex items-stretch gap-3 rounded-lg border ${color.border} ${color.bg} p-3 transition hover:shadow-sm`}
    >
      <div
        className={`flex min-w-[3.25rem] flex-col items-center justify-center border-r ${color.border} pr-3`}
      >
        <span className={`text-lg font-bold leading-none tabular-nums ${color.text}`}>
          {hora}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${color.text}`}>
          {ev.pacienteNombre}
        </p>
        <p className={`mt-0.5 truncate text-xs ${color.text} opacity-80`}>
          {color.icon} {sub}
        </p>
      </div>
    </Link>
  );
}
