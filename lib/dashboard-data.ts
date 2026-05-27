/**
 * lib/dashboard-data.ts
 *
 * Server-side helpers to load the dashboard's at-a-glance data:
 *   - Resumen del día (citas, controles pendientes, récipes por vencer)
 *   - Alertas activas ordenadas por prioridad
 *   - Conteo de notificaciones no leídas (campana)
 *
 * Todas las queries usan RLS por defecto (createClient server) y la
 * zona horaria del médico para calcular "hoy" / "próximas 24h".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { diasDesde } from "@/lib/recordatorios";

type SC = SupabaseClient<Database>;

export interface DashboardAlerta {
  id: string;
  tipo: "recordatorio" | "alerta" | "sistema";
  prioridad: "baja" | "media" | "alta";
  titulo: string;
  mensaje: string | null;
  accionUrl: string | null;
  pacienteId: string | null;
  pacienteNombre: string | null;
  fechaCreacion: string;
  fechaObjetivo: string | null;
  recordatorioId: string | null;
}

export interface DashboardSummary {
  citasHoy: number;
  controlesPendientes: number;
  recipesPorVencer: number;
  primerPacienteHoy: { nombre: string; hora: string } | null;
}

export interface DashboardData {
  summary: DashboardSummary;
  alertasTop: DashboardAlerta[];
  alertasMas: number; // count beyond top 3
  unreadCount: number;
  tz: string;
}

const TOP_ALERTAS = 3;

/**
 * Date helpers using médico's TZ to compute "today" boundaries.
 */
function startOfTodayInTz(tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(new Date()); // YYYY-MM-DD in tz
  // Build as UTC midnight then shift back by tz offset
  const utcMidnight = new Date(`${today}T00:00:00Z`);
  const offsetMin = getTzOffsetMinutes(utcMidnight, tz);
  utcMidnight.setUTCMinutes(utcMidnight.getUTCMinutes() - offsetMin);
  return utcMidnight;
}

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

export async function loadDashboardData(
  supabase: SC,
  medicoId: string,
): Promise<DashboardData> {
  // Fetch médico TZ
  const { data: medico } = await supabase
    .from("medicos")
    .select("zona_horaria")
    .eq("id", medicoId)
    .maybeSingle();
  const tz = medico?.zona_horaria ?? "America/Caracas";

  const startToday = startOfTodayInTz(tz);
  const startTomorrow = new Date(startToday);
  startTomorrow.setUTCDate(startTomorrow.getUTCDate() + 1);

  // Citas/controles hoy
  const { data: hoyRecs } = await supabase
    .from("recordatorios")
    .select(
      `id, paciente_id, fecha_objetivo, mensaje, tipo,
       paciente:pacientes ( nombre, apellido )`,
    )
    .eq("medico_id", medicoId)
    .eq("estado", "pendiente")
    .gte("fecha_objetivo", startToday.toISOString())
    .lt("fecha_objetivo", startTomorrow.toISOString())
    .order("fecha_objetivo", { ascending: true });

  const citasHoy = hoyRecs?.length ?? 0;
  let primerPacienteHoy: { nombre: string; hora: string } | null = null;
  if (hoyRecs && hoyRecs.length > 0) {
    const first = hoyRecs[0]!;
    primerPacienteHoy = {
      nombre: first.paciente
        ? `${first.paciente.nombre} ${first.paciente.apellido}`
        : "Paciente",
      hora: new Date(first.fecha_objetivo).toLocaleTimeString("es-VE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
        hour12: false,
      }),
    };
  }

  // Controles pendientes (futuros, hasta 7 días)
  const en7d = new Date(startToday);
  en7d.setUTCDate(en7d.getUTCDate() + 7);
  const { count: controlesCount } = await supabase
    .from("recordatorios")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId)
    .eq("estado", "pendiente")
    .eq("tipo", "control")
    .lt("fecha_objetivo", en7d.toISOString());

  // Récipes por vencer: por ahora 0 (depende de duracion_dias en récipes,
  // que aún no tenemos como columna). El stub se rellena en Día 8+.
  const recipesPorVencer = 0;

  // Top alertas: notificaciones no resueltas, ordenadas por prioridad desc
  const { data: alertasRaw } = await supabase
    .from("notificaciones")
    .select(
      `id, tipo, prioridad, titulo, mensaje, accion_url, paciente_id,
       fecha_creacion, fecha_objetivo, recordatorio_id,
       paciente:pacientes ( nombre, apellido )`,
    )
    .eq("medico_id", medicoId)
    .eq("resuelta", false)
    .order("prioridad", { ascending: false })
    .order("fecha_creacion", { ascending: false })
    .limit(20);

  const all: DashboardAlerta[] = (alertasRaw ?? []).map((a) => ({
    id: a.id,
    tipo: a.tipo,
    prioridad: a.prioridad,
    titulo: a.titulo,
    mensaje: a.mensaje,
    accionUrl: a.accion_url,
    pacienteId: a.paciente_id,
    pacienteNombre: a.paciente
      ? `${a.paciente.nombre} ${a.paciente.apellido}`
      : null,
    fechaCreacion: a.fecha_creacion,
    fechaObjetivo: a.fecha_objetivo,
    recordatorioId: a.recordatorio_id,
  }));

  const alertasTop = all.slice(0, TOP_ALERTAS);
  const alertasMas = Math.max(0, all.length - TOP_ALERTAS);

  // Unread count
  const { count: unreadCount } = await supabase
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId)
    .eq("leida", false);

  return {
    summary: {
      citasHoy,
      controlesPendientes: controlesCount ?? 0,
      recipesPorVencer,
      primerPacienteHoy,
    },
    alertasTop,
    alertasMas,
    unreadCount: unreadCount ?? 0,
    tz,
  };
}

/** Compute "X días" relative label using médico TZ. */
export function relativoDesde(fechaIso: string, tz: string): string {
  const dias = diasDesde(fechaIso, tz);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
