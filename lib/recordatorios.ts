/**
 * lib/recordatorios.ts
 *
 * Helpers para crear recordatorios + derivar notificaciones desde
 * reglas de negocio. Lo usan:
 *   - El componente "ProgramarControl" en /consulta/[id] (server action)
 *   - El cron diario /api/cron/evaluar-alertas
 *   - El cron horario /api/cron/notificar-citas
 *
 * Se separa de actions.ts para que los crons puedan importarlo sin
 * cargar lógica de Next "use server".
 */

export const PACIENTE_PERDIDO_AMARILLO_DIAS = 60;
export const PACIENTE_PERDIDO_NARANJA_DIAS = 90;

export const RECIPE_EXPIRA_VERDE_DIAS = 7;
export const RECIPE_EXPIRA_AMARILLO_DIAS = 3;

export type RecordatorioTipo =
  | "control"
  | "seguimiento"
  | "biopsia_pendiente"
  | "tratamiento_finaliza"
  | "otro";

export type Prioridad = "baja" | "media" | "alta";

/**
 * Tratamientos críticos que requieren control mensual obligatorio.
 * El cron y el parser IA usan esta lista. Mantener en sync con el
 * system prompt de /api/ia/parsear-control.
 */
export const TRATAMIENTOS_CRITICOS_MENSUALES = [
  "isotretinoína",
  "isotretinoina",
  "metotrexato",
  "ciclosporina",
  "azatioprina",
  "micofenolato",
  "adalimumab",
  "infliximab",
] as const;

export function detectaTratamientoCritico(
  texto: string | null | undefined,
): string | null {
  if (!texto) return null;
  const lower = texto.toLowerCase();
  for (const med of TRATAMIENTOS_CRITICOS_MENSUALES) {
    if (lower.includes(med)) return med;
  }
  return null;
}

/**
 * Construye fecha_objetivo a partir de "X días desde ahora" en la
 * zona horaria del médico. Hora del recordatorio: 09:00 local del
 * médico (hora típica de inicio de consulta).
 */
export function buildFechaObjetivo(
  diasDesdeHoy: number,
  tz: string,
  horaLocal = 9,
): Date {
  // Calcular medianoche local del médico en el día objetivo, luego
  // sumar horaLocal. Usamos Intl para no depender de toLocaleString-
  // round-trip.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  // Construir Date como si fuera UTC para reusar setUTCDate sin saltos
  // por DST. Luego compensamos offset al final.
  const baseLocal = new Date(Date.UTC(y, mo - 1, d, horaLocal, 0, 0));
  baseLocal.setUTCDate(baseLocal.getUTCDate() + diasDesdeHoy);
  // Calcular offset de tz para el momento target. Aprox: usar el
  // offset al momento de "ahora" (Caracas no tiene DST → seguro).
  const offsetMin = getTzOffsetMinutes(now, tz);
  baseLocal.setUTCMinutes(baseLocal.getUTCMinutes() - offsetMin);
  return baseLocal;
}

/** Offset en minutos de la zona horaria respecto a UTC en `at`. */
function getTzOffsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const tzAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((tzAsUtc - at.getTime()) / 60000);
}

/** "Hace N días" calculado en la TZ del médico, no UTC. */
export function diasDesde(fechaIso: string, tz: string): number {
  const past = new Date(fechaIso);
  const now = new Date();
  // Comparar fechas-de-calendario locales para que "ayer 23:59" cuente
  // como 1 día, no 0.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dPast = fmt.format(past);
  const dNow = fmt.format(now);
  const pastMs = new Date(dPast + "T00:00:00Z").getTime();
  const nowMs = new Date(dNow + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((nowMs - pastMs) / (1000 * 60 * 60 * 24)));
}

export function colorPrioridad(p: Prioridad): {
  bg: string;
  border: string;
  text: string;
  icon: string;
} {
  if (p === "alta") {
    return {
      bg: "bg-red-50",
      border: "border-red-300",
      text: "text-red-900",
      icon: "🔴",
    };
  }
  if (p === "media") {
    return {
      bg: "bg-amber-50",
      border: "border-amber-300",
      text: "text-amber-900",
      icon: "🟠",
    };
  }
  return {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-900",
    icon: "🟢",
  };
}
