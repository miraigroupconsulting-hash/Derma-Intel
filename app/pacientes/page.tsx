import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PacientesList } from "./pacientes-list";

export const metadata = {
  title: "Pacientes",
};

export default async function PacientesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pacientes, error } = await supabase
    .from("pacientes")
    .select(
      "id, nombre, apellido, fecha_nacimiento, sexo, tipo_piel_fitzpatrick, telefono, updated_at",
    )
    .eq("archivado", false)
    .order("apellido", { ascending: true });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-xs text-neutral-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
        </div>
        <Link
          href="/pacientes/nuevo"
          className={buttonVariants({ size: "default" })}
        >
          + Nuevo paciente
        </Link>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          No pudimos cargar la lista de pacientes. Recarga la página.
        </p>
      )}

      <PacientesList pacientes={pacientes ?? []} />
    </main>
  );
}
