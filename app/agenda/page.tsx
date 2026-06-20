import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgendaView } from "./agenda-view";
import { NuevaCita } from "./nueva-cita";
import { BackLink } from "@/components/back-link";

export const metadata = { title: "Agenda" };

interface PageProps {
  searchParams: Promise<{ semana?: string }>;
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
  const { semana } = await searchParams;
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

  // Pacientes para el selector de "Nueva cita" (no archivados, no demo).
  const { data: pacientesData } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("medico_id", user.id)
    .eq("archivado", false)
    .eq("is_demo", false)
    .order("apellido", { ascending: true });
  const pacientesCita = pacientesData ?? [];

  const eventos = (recs ?? []).map((r) => ({
    id: r.id,
    pacienteId: r.paciente_id,
    pacienteNombre: r.paciente
      ? `${r.paciente.apellido}, ${r.paciente.nombre}`
      : "Paciente",
    fecha: r.fecha_objetivo,
    tipo: r.tipo,
    prioridad: r.prioridad,
    mensaje: r.mensaje,
  }));

  const prev = addDaysIso(weekStart, -7);
  const next = addDaysIso(weekStart, 7);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <BackLink href="/dashboard" label="Dashboard" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Agenda</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm">
            <Link
              href={`/agenda?semana=${prev}`}
              className="rounded-md border border-neutral-200 px-2 py-1 hover:bg-neutral-50"
              aria-label="Semana anterior"
            >
              ←
            </Link>
            <Link
              href="/agenda"
              className="rounded-md border border-neutral-200 px-2 py-1 hover:bg-neutral-50"
            >
              Hoy
            </Link>
            <Link
              href={`/agenda?semana=${next}`}
              className="rounded-md border border-neutral-200 px-2 py-1 hover:bg-neutral-50"
              aria-label="Semana siguiente"
            >
              →
            </Link>
          </div>
          <NuevaCita pacientes={pacientesCita} />
        </div>
      </header>

      <AgendaView weekStart={weekStart} tz={tz} eventos={eventos} />
    </main>
  );
}
