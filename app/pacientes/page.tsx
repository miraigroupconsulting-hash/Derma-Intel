import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PacientesList } from "./pacientes-list";
import { BackLink } from "@/components/back-link";

export const metadata = {
  title: "Pacientes",
};

interface PageProps {
  searchParams: Promise<{ archivados?: string; demo?: string }>;
}

export default async function PacientesPage({ searchParams }: PageProps) {
  const { archivados, demo } = await searchParams;
  const showArchived = archivados === "1";
  // Por defecto las vistas de producción ocultan los datos demo. ?demo=1
  // los incluye (para que la médica pueda verlos antes de borrarlos).
  const showDemo = demo === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("pacientes")
    .select(
      "id, nombre, apellido, fecha_nacimiento, sexo, tipo_piel_fitzpatrick, telefono, updated_at, is_demo",
    )
    .eq("archivado", showArchived);
  if (!showDemo) query = query.eq("is_demo", false);
  const { data: pacientes, error } = await query.order("apellido", {
    ascending: true,
  });

  // Count of the OTHER bucket so we can show the toggle with context.
  const { count: otherCount } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("archivado", !showArchived);

  // Cuántos pacientes demo hay ocultos (para el banner).
  const { count: demoCount } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("archivado", false)
    .eq("is_demo", true);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <BackLink href="/dashboard" label="Dashboard" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {showArchived ? "Pacientes archivados" : "Pacientes"}
          </h1>
        </div>
        <Link
          href="/pacientes/nuevo"
          className={buttonVariants({ size: "default" })}
        >
          + Nuevo paciente
        </Link>
      </header>

      <div className="mb-4 flex items-center justify-between text-xs">
        {showArchived ? (
          <Link href="/pacientes" className="text-neutral-700 hover:underline">
            ← Volver a activos
          </Link>
        ) : (
          <Link
            href="/pacientes?archivados=1"
            className="text-neutral-500 hover:underline"
          >
            Ver archivados {otherCount ? `(${otherCount})` : ""}
          </Link>
        )}
      </div>

      {error && (
        <p
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          No pudimos cargar la lista de pacientes. Recarga la página.
        </p>
      )}

      {/* Banner de datos demo: nada se "pierde" silenciosamente — avisamos
          que hay demo oculto y damos cómo verlo o eliminarlo. */}
      {!showArchived && (demoCount ?? 0) > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
          <span>
            {showDemo
              ? `Mostrando ${demoCount} paciente${demoCount === 1 ? "" : "s"} de demostración.`
              : `Tienes ${demoCount} paciente${demoCount === 1 ? "" : "s"} de demostración ocultos.`}
          </span>
          <span className="flex items-center gap-3">
            {showDemo ? (
              <Link href="/pacientes" className="font-medium hover:underline">
                Ocultar demo
              </Link>
            ) : (
              <Link
                href="/pacientes?demo=1"
                className="font-medium hover:underline"
              >
                Ver demo
              </Link>
            )}
            <Link href="/perfil#datos-demo" className="font-medium hover:underline">
              Eliminar datos demo
            </Link>
          </span>
        </div>
      )}

      <PacientesList pacientes={pacientes ?? []} />
    </main>
  );
}
