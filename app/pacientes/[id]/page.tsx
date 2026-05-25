import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { archivePaciente } from "../actions";

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

  const archiveAction = archivePaciente.bind(null, paciente.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
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
          <div className="flex gap-2">
            <Link
              href={`/pacientes/${paciente.id}/editar`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Editar
            </Link>
            <form action={archiveAction}>
              <Button type="submit" variant="ghost" size="sm">
                Archivar
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
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
              {paciente.notas}
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
