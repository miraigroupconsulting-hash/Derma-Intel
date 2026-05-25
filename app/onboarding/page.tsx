import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";

export const metadata = {
  title: "Completa tu perfil",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauth here, but belt-and-suspenders.
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
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6">
      <header className="mb-6">
        <p className="text-sm text-neutral-500">DERMA INTEL Pro</p>
        <h1 className="text-2xl font-semibold tracking-tight">Completa tu perfil</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Necesitamos confirmar tu identidad profesional antes de habilitar la
          consulta clínica. Toma menos de un minuto.
        </p>
      </header>

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

      <p className="mt-8 text-xs text-neutral-500">
        Tu cédula y especialidad quedan únicamente en tu expediente profesional.
        DERMA INTEL Pro es herramienta de apoyo clínico — no reemplaza criterio
        médico ni la consulta presencial.
      </p>
    </main>
  );
}
