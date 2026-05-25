import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logout } from "../(auth)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Protected dashboard.
 *
 * Middleware already redirects unauthenticated users to /login and
 * users without completed onboarding to /onboarding, but we re-check
 * defensively in case the middleware matcher misses a future route.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre, apellido, especialidad, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (medico && !medico.onboarding_completed) {
    redirect("/onboarding");
  }

  // Counts to show on the dashboard (RLS-filtered automatically).
  const { count: pacientesCount } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("archivado", false);

  const greetingName = medico?.nombre ? `Dr/a. ${medico.nombre}` : "doctor/a";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">DERMA INTEL Pro</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola, {greetingName}
          </h1>
          {medico?.especialidad && (
            <p className="mt-1 text-xs text-neutral-500">{medico.especialidad}</p>
          )}
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Salir
          </Button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pacientes</CardTitle>
            <CardDescription>
              {pacientesCount === 0
                ? "Aún no tienes pacientes registrados."
                : `${pacientesCount} paciente${pacientesCount === 1 ? "" : "s"} activo${pacientesCount === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Link
              href="/pacientes"
              className={buttonVariants({ size: "default" }) + " w-full"}
            >
              Ver lista de pacientes
            </Link>
            <Link
              href="/pacientes/nuevo"
              className={buttonVariants({ size: "default", variant: "outline" }) + " w-full"}
            >
              + Nuevo paciente
            </Link>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximamente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-neutral-600">
            <p>· Nueva consulta con IA (Capa 1)</p>
            <p>· Récipes en PDF (Capa 1)</p>
            <p>· Biblioteca personal + RAG (Capa 2)</p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 text-xs text-neutral-500">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante.
      </p>
    </main>
  );
}
