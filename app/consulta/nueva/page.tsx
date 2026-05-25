import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NuevaConsultaForm } from "./form";

export const metadata = {
  title: "Nueva consulta",
};

interface PageProps {
  searchParams: Promise<{ paciente?: string }>;
}

export default async function NuevaConsultaPage({ searchParams }: PageProps) {
  const { paciente: preselectedPacienteId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch active pacientes for the selector. RLS limits to the médico's own.
  const { data: pacientes, error } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido, fecha_nacimiento, sexo, tipo_piel_fitzpatrick")
    .eq("archivado", false)
    .order("apellido", { ascending: true });

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6">
        <h1 className="text-2xl font-semibold">Nueva consulta</h1>
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No pudimos cargar tu lista de pacientes. Recarga la página.
        </p>
      </main>
    );
  }

  if (!pacientes || pacientes.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6">
        <header className="mb-6">
          <Link
            href="/dashboard"
            className="text-xs text-neutral-500 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nueva consulta
          </h1>
        </header>
        <p className="mb-6 text-sm text-neutral-600">
          Aún no tienes pacientes registrados. Crea uno primero para poder
          abrir una consulta clínica.
        </p>
        <Link
          href="/pacientes/nuevo"
          className="inline-flex w-fit items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          + Crear primer paciente
        </Link>
      </main>
    );
  }

  return (
    <NuevaConsultaForm
      pacientes={pacientes}
      preselectedPacienteId={preselectedPacienteId}
    />
  );
}
