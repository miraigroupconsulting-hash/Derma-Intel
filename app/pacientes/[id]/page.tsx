import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import {
  ArchivePacienteButton,
  UnarchivePacienteButton,
} from "./archive-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CachePacienteOnMount } from "./cache-on-mount";
import type { CachedPaciente } from "@/lib/offline-db";
import { SPECIALTY } from "@/config/specialty";

interface PageProps {
  params: Promise<{ id: string }>;
}

function calcEdad(fechaNac: string | null): string | null {
  if (!fechaNac) return null;
  const birth = new Date(fechaNac);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age} años`;
}

const SEXO_LABEL: Record<string, string> = {
  F: "Femenino",
  M: "Masculino",
  O: "Otro",
};

function formatFecha(fecha: string): string {
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return fecha;
  return d.toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Caracas",
  });
}

export default async function PacientePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: paciente, error } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !paciente) {
    notFound();
  }

  const { data: consultas } = await supabase
    .from("consultas")
    .select("id, fecha, motivo, estado")
    .eq("paciente_id", id)
    .order("fecha", { ascending: false })
    .limit(50);

  // Snapshot for the offline cache. We pick a minimal subset that the
  // UI actually needs to render this page so the IDB entry stays small.
  const cacheSnapshot: CachedPaciente = {
    id: paciente.id,
    medico_id: user.id,
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      fecha_nacimiento: paciente.fecha_nacimiento ?? null,
      sexo: paciente.sexo ?? null,
      tipo_piel_fitzpatrick: paciente.tipo_piel_fitzpatrick ?? null,
      cedula: paciente.cedula ?? null,
      telefono: paciente.telefono ?? null,
      email: paciente.email ?? null,
      alergias: paciente.alergias ?? null,
      antecedentes: paciente.antecedentes ?? null,
      medicacion_actual: paciente.medicacion_actual ?? null,
      notas: paciente.notas ?? null,
      archivado: paciente.archivado ?? false,
    },
    consultas: (consultas ?? []).slice(0, 3).map((c) => ({
      id: c.id,
      fecha: c.fecha,
      motivo: c.motivo,
      estado: c.estado,
    })),
    cachedAt: new Date().toISOString(),
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <CachePacienteOnMount entry={cacheSnapshot} />
      <header className="mb-6">
        <Link
          href="/pacientes"
          className="text-xs text-neutral-500 hover:underline"
        >
          ← Pacientes
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {paciente.apellido}, {paciente.nombre}
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              {[
                calcEdad(paciente.fecha_nacimiento),
                paciente.sexo ? SEXO_LABEL[paciente.sexo] : null,
                paciente.tipo_piel_fitzpatrick
                  ? `Fitzpatrick ${paciente.tipo_piel_fitzpatrick}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Sin datos demográficos completos."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!paciente.archivado && (
              <Link
                href={`/consulta/nueva?paciente=${paciente.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                🎤 Nueva consulta
              </Link>
            )}
            {SPECIALTY.features.fotoEvolucion && (
              <Link
                href={`/pacientes/${paciente.id}/evolucion`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                📷 Evolución
              </Link>
            )}
            <Link
              href={`/pacientes/${paciente.id}/editar`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Editar
            </Link>
            {paciente.archivado ? (
              <UnarchivePacienteButton id={paciente.id} />
            ) : (
              <ArchivePacienteButton
                id={paciente.id}
                pacienteLabel={`${paciente.nombre} ${paciente.apellido}`}
              />
            )}
          </div>
        </div>
      </header>

      {paciente.archivado && (
        <div
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Este paciente está <strong>archivado</strong>. No aparece en la lista
          principal. Puedes desarchivarlo cuando lo necesites.
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Consultas ({consultas?.length ?? 0})
              </CardTitle>
              {!paciente.archivado && (
                <Link
                  href={`/consulta/nueva?paciente=${paciente.id}`}
                  className={buttonVariants({ size: "sm" })}
                >
                  + Nueva
                </Link>
              )}
            </div>
            <CardDescription>
              Historial cronológico. La más reciente primero.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!consultas || consultas.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Aún no hay consultas registradas para este paciente.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {consultas.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/consulta/${c.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-neutral-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900">
                          {formatFecha(c.fecha)}
                        </p>
                        <p className="truncate text-xs text-neutral-600">
                          {c.motivo || "Sin motivo registrado"}
                        </p>
                      </div>
                      <span
                        className={
                          "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide " +
                          (c.estado === "completada"
                            ? "bg-emerald-100 text-emerald-800"
                            : c.estado === "borrador"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-neutral-100 text-neutral-600")
                        }
                      >
                        {c.estado}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Cédula" value={paciente.cedula} />
            <Row label="Teléfono" value={paciente.telefono} />
            <Row label="Correo" value={paciente.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos clínicos</CardTitle>
            <CardDescription>
              Información médica relevante para futuras consultas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Block label="Alergias" value={paciente.alergias} />
            <Block label="Antecedentes" value={paciente.antecedentes} />
            <Block label="Medicación actual" value={paciente.medicacion_actual} />
          </CardContent>
        </Card>

        {paciente.notas && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas del médico</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {/* Strip seed marker if present — internal identifier
                  used by scripts/seed-demo-patients.ts, never shown
                  to the médica. */}
              {paciente.notas
                .replace(/\s*\[MIRAI_DEMO_SEED_v1\]\s*/g, "")
                .trim()}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mt-8 text-xs text-neutral-500">
        Información clínica bajo responsabilidad del médico tratante.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-neutral-500">{label}</span>
      <span className="text-neutral-900">{value || "—"}</span>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-neutral-900">
        {value || <span className="text-neutral-400">Sin información.</span>}
      </p>
    </div>
  );
}
