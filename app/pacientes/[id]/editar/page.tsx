import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PacienteForm } from "../../paciente-form";
import type { PacienteFormDefaults } from "../../schema";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Editar paciente",
};

export default async function EditarPacientePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select(
      "id, nombre, apellido, fecha_nacimiento, sexo, tipo_piel_fitzpatrick, alergias, antecedentes, medicacion_actual, telefono, cedula, email, notas",
    )
    .eq("id", id)
    .maybeSingle();

  if (!paciente) notFound();

  const defaults: PacienteFormDefaults = {
    nombre: paciente.nombre,
    apellido: paciente.apellido,
    fecha_nacimiento: paciente.fecha_nacimiento ?? "",
    sexo: paciente.sexo ?? "",
    tipo_piel_fitzpatrick:
      paciente.tipo_piel_fitzpatrick !== null
        ? String(paciente.tipo_piel_fitzpatrick)
        : "",
    alergias: paciente.alergias ?? "",
    antecedentes: paciente.antecedentes ?? "",
    medicacion_actual: paciente.medicacion_actual ?? "",
    telefono: paciente.telefono ?? "",
    cedula: paciente.cedula ?? "",
    email: paciente.email ?? "",
    notas: paciente.notas ?? "",
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6">
        <Link
          href={`/pacientes/${paciente.id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {paciente.apellido}, {paciente.nombre}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Editar paciente</h1>
      </header>

      <PacienteForm
        mode={{ mode: "edit", pacienteId: paciente.id }}
        defaultValues={defaults}
        cancelHref={`/pacientes/${paciente.id}`}
      />
    </main>
  );
}
