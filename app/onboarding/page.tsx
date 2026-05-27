import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";
import { skipOnboarding } from "./actions";
import { LogoLockup } from "@/components/logo";

export const metadata = {
  title: "Bienvenida",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "nombre, apellido, especialidad, cedula_profesional, pais_cedula, telefono, onboarding_completed",
    )
    .eq("id", user.id)
    .single();

  if (medico?.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-dvh bg-brand-cream dark:bg-[#0F1419]">
      <div className="mx-auto flex w-full max-w-xl flex-col px-5 py-10">
        <header className="mb-8 text-center">
          <LogoLockup orientation="vertical" size="lg" className="mb-6" />

          <h1 className="font-display text-3xl text-brand-primary dark:text-brand-cream">
            Bienvenida, Doctora.
          </h1>
          <p className="mx-auto mt-3 max-w-md font-display text-base leading-relaxed text-brand-ink/80 dark:text-brand-cream/80">
            La asistente clínica que su práctica siempre mereció tener.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-brand-primary/15 bg-white p-5 shadow-sm dark:bg-[#1A1F26] dark:border-brand-cream/10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
            Comenzar configuración
          </h2>
          <p className="mt-1 text-sm text-brand-ink/80 dark:text-brand-cream/70">
            Confirmemos su identidad profesional. Esto aparece en cada récipe
            que firme. Toma menos de un minuto.
          </p>

          <div className="mt-4">
            <OnboardingForm
              defaultValues={{
                nombre: medico?.nombre ?? "",
                apellido: medico?.apellido ?? "",
                especialidad: medico?.especialidad ?? "",
                cedula_profesional: medico?.cedula_profesional ?? "",
                pais_cedula: medico?.pais_cedula ?? "",
                telefono: medico?.telefono ?? "",
              }}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-brand-gray/30 bg-white/50 p-4 text-center dark:bg-transparent">
          <p className="text-sm text-brand-ink/70 dark:text-brand-cream/70">
            ¿Quiere echar un vistazo primero?
          </p>
          <form action={skipOnboarding} className="mt-2">
            <button
              type="submit"
              className="text-sm font-medium text-brand-primary underline-offset-4 hover:underline dark:text-brand-secondary"
            >
              Saltar y explorar con datos de ejemplo →
            </button>
          </form>
          <p className="mt-2 text-[0.7rem] text-brand-gray">
            Puede completar su perfil después desde el menú de configuración.
          </p>
        </section>

        <footer className="mt-10 text-center text-xs text-brand-gray">
          <p>
            DERMA INTEL Pro es herramienta de apoyo clínico — no reemplaza el
            criterio médico ni la consulta presencial.
          </p>
        </footer>
      </div>
    </main>
  );
}
