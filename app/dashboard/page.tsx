import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logout } from "../(auth)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PendingRecipesPill } from "@/components/pending-recipes-pill";
import { NotificationBell } from "@/components/notification-bell";
import { AlertasPanel } from "@/components/alertas-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/logo";
import { loadDashboardData } from "@/lib/dashboard-data";
import { SPECIALTY } from "@/config/specialty";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre, apellido, especialidad, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();
  if (medico && !medico.onboarding_completed) redirect("/onboarding");

  const { count: pacientesCount } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("archivado", false);

  const { data: ultimosPacientes } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido, updated_at")
    .eq("archivado", false)
    .order("updated_at", { ascending: false })
    .limit(5);

  const dashboard = await loadDashboardData(supabase, user.id);

  const greetingName = medico?.nombre ? `Dr/a. ${medico.nombre}` : "doctor/a";
  const hoyTxt = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: dashboard.tz,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 flex items-start justify-between gap-2">
        <div>
          <LogoLockup size="sm" className="mb-2" />
          <h1 className="font-display text-2xl tracking-tight text-brand-ink dark:text-brand-cream">
            Hola, {greetingName}
          </h1>
          <p className="mt-0.5 text-xs capitalize text-brand-gray">{hoyTxt}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell initialUnread={dashboard.unreadCount} />
          <ThemeToggle />
          <Link
            href="/perfil"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            aria-label="Mi perfil"
          >
            ⚙
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>

      <div className="mb-4">
        <PendingRecipesPill />
      </div>

      <section className="mb-6 rounded-md border border-neutral-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Resumen de hoy
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-neutral-50 p-2">
            <p className="text-2xl font-semibold">{dashboard.summary.citasHoy}</p>
            <p className="text-[0.7rem] text-neutral-600">📅 citas hoy</p>
          </div>
          <div className="rounded-md bg-neutral-50 p-2">
            <p className="text-2xl font-semibold">
              {dashboard.summary.controlesPendientes}
            </p>
            <p className="text-[0.7rem] text-neutral-600">🔄 controles (7d)</p>
          </div>
          <div className="rounded-md bg-neutral-50 p-2">
            <p className="text-2xl font-semibold">
              {dashboard.summary.recipesPorVencer}
            </p>
            <p className="text-[0.7rem] text-neutral-600">💊 récipes por vencer</p>
          </div>
        </div>
        {dashboard.summary.primerPacienteHoy && (
          <p className="mt-3 text-sm text-neutral-700">
            Tu primer recordatorio hoy:{" "}
            <span className="font-medium">
              {dashboard.summary.primerPacienteHoy.hora} —{" "}
              {dashboard.summary.primerPacienteHoy.nombre}
            </span>
          </p>
        )}
      </section>

      <div className="mb-6">
        <AlertasPanel alertasTop={dashboard.alertasTop} alertasMas={dashboard.alertasMas} />
      </div>

      <div
        className={
          SPECIALTY.features.consultaRapida
            ? "mb-6 grid gap-3 sm:grid-cols-[2fr_1fr]"
            : "mb-6"
        }
      >
        <Link
          href="/consulta/nueva"
          className={
            buttonVariants({ size: "lg" }) +
            " flex h-14 w-full items-center justify-center text-base"
          }
        >
          🎤 Nueva consulta
        </Link>
        {SPECIALTY.features.consultaRapida && (
          <Link
            href="/consulta-rapida"
            className={
              buttonVariants({ size: "lg", variant: "outline" }) +
              " flex h-14 items-center justify-center text-base"
            }
          >
            ⚡ Consulta rápida
          </Link>
        )}
      </div>

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
          <CardContent className="space-y-2">
            {ultimosPacientes && ultimosPacientes.length > 0 && (
              <ul className="space-y-1 text-sm">
                {ultimosPacientes.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/pacientes/${p.id}`}
                      className="block truncate rounded px-1 py-0.5 hover:bg-neutral-50"
                    >
                      {p.apellido}, {p.nombre}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Link
                href="/pacientes"
                className={buttonVariants({ size: "default" }) + " w-full"}
              >
                Ver todos
              </Link>
              <Link
                href="/pacientes/nuevo"
                className={
                  buttonVariants({ size: "default", variant: "outline" }) +
                  " w-full"
                }
              >
                + Nuevo paciente
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agenda</CardTitle>
            <CardDescription>
              Tu calendario semanal de citas y controles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/agenda"
              className={buttonVariants({ size: "default" }) + " w-full"}
            >
              📅 Ver agenda
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 text-xs text-brand-gray">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al médico
        tratante.
      </p>
      <p className="mt-2 text-center text-xs text-brand-gray">
        <Link href="/about" className="underline-offset-4 hover:underline">
          Acerca de DERMA INTEL Pro
        </Link>
      </p>
    </main>
  );
}
