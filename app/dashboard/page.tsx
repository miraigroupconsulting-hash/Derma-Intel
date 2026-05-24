import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "../(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Protected dashboard.
 *
 * Middleware already redirects unauthenticated users to /login,
 * but we re-check here defensively in case the middleware matcher
 * misses a future route or someone removes the guard.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const greeting = user.email ?? "Bienvenido";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">DERMA INTEL Pro</p>
          <h1 className="text-2xl font-semibold tracking-tight">Hola, doctor/a</h1>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Salir
          </Button>
        </form>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sesión activa</CardTitle>
          <CardDescription>{greeting}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-neutral-600">
          Tu cuenta está lista. Pronto verás aquí tu lista de pacientes, las
          consultas del día, y el digest semanal de actualizaciones médicas.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximos pasos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-600">
          <p>· Crear tu primer paciente (próxima entrega)</p>
          <p>· Lanzar una nueva consulta con análisis IA (próxima entrega)</p>
          <p>· Subir tu biblioteca personal para RAG (Capa 2)</p>
        </CardContent>
      </Card>

      <p className="mt-8 text-xs text-neutral-500">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante.
      </p>
    </main>
  );
}
