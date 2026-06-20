import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgendaView } from "./agenda-view";
import { NuevaCita } from "./nueva-cita";
import { BackLink } from "@/components/back-link";
import { wallClockToUtc } from "@/lib/recordatorios";

export const metadata = { title: "Agenda" };

interface PageProps {
  searchParams: Promise<{ semana?: string; vista?: string }>;
}

/**
 * Compute the Monday of the week containing `at`, in the médico's TZ.
 * Returns ISO date "YYYY-MM-DD".
 */
function mondayOf(at: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(at);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const wd =
    parts.find((p) => p.type === "weekday")?.value.toLowerCase() ?? "mon";
  const wdIdx = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(
    wd.slice(0, 3),
  );
  // Get diff so Monday is start (ISO week)
  const diff = wdIdx === 0 ? -6 : 1 - wdIdx;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function AgendaPage({ searchParams }: PageProps) {
  const { semana, vista } = await searchParams;
  const initialView = vista === "semana" ? "semana" : "proximas";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("zona_horaria")
    .eq("id", user.id)
    .maybeSingle();
  const tz = medico?.zona_horaria ?? "America/Caracas";

  const today = new Date();
  const weekStart = semana ?? mondayOf(today, tz);
  const weekEnd = addDaysIso(weekStart, 7);

  const { data: recs } = await supabase
    .from("recordatorios")
    .select(
      `id, paciente_id, fecha_objetivo, tipo, prioridad, mensaje, estado,
       paciente:pacientes ( nombre, apellido )`,
    )
    .eq("medico_id", user.id)
    .eq("estado", "pendiente")
    .gte("fecha_objetivo", `${weekStart}T00:00:00Z`)
    .lt("fecha_objetivo", `${weekEnd}T00:00:00Z`)
    .order("fecha_objetivo", { ascending: true });

  // Vista "Próximas": TODAS las citas pendientes de hoy en adelante
  // (no solo la semana visible), ordenadas por fecha. Es la vista por
  // defecto: de un vistazo, todo lo que viene.
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  const startTodayUtc = wallClockToUtc(`${todayYmd}T00:00`, tz) ?? today;

  const { data: proxRecs } = await supabase
    .from("recordatorios")
    .select(
      `id, paciente_id, fecha_objetivo, tipo, prioridad, mensaje, estado,
       paciente:pacientes ( nombre, apellido )`,
    )
    .eq("medico_id", user.id)
    .eq("estado", "pendiente")
    .gte("fecha_objetivo", startTodayUtc.toISOString())
    .order("fecha_objetivo", { ascending: true })
    .limit(80);

  // Pacientes para el selector de "Nueva cita" (no archivados, no demo).
  const { data: pacientesData } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("medico_id", user.id)
    .eq("archivado", false)
    .eq("is_demo", false)
    .order("apellido", { ascending: true });
  const pacientesCita = pacientesData ?? [];

  const toEvento = (r: {
    id: string;
    paciente_id: string | null;
    fecha_objetivo: string;
    tipo: string;
    prioridad: "baja" | "media" | "alta";
    mensaje: string | null;
    paciente: { nombre: string; apellido: string } | null;
  }) => ({
    id: r.id,
    pacienteId: r.paciente_id,
    pacienteNombre: r.paciente
      ? `${r.paciente.apellido}, ${r.paciente.nombre}`
      : "Paciente",
    fecha: r.fecha_objetivo,
    tipo: r.tipo,
    prioridad: r.prioridad,
    mensaje: r.mensaje,
  });

  const eventos = (recs ?? []).map(toEvento);
  const proximas = (proxRecs ?? []).map(toEvento);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <BackLink href="/dashboard" label="Dashboard" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Agenda</h1>
        </div>
        <NuevaCita pacientes={pacientesCita} />
      </header>

      <AgendaView
        weekStart={weekStart}
        tz={tz}
        eventos={eventos}
        proximas={proximas}
        todayYmd={todayYmd}
        initialView={initialView}
      />
    </main>
  );
}
