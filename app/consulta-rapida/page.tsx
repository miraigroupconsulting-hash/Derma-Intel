import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoLockup } from "@/components/logo";
import { ConsultaRapidaForm } from "./consulta-rapida-form";

export const metadata = { title: "Consulta rápida" };

export default async function ConsultaRapidaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-xs text-brand-gray hover:underline"
        >
          ← Dashboard
        </Link>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl tracking-tight">
            Consulta rápida
          </h1>
          <LogoLockup size="sm" />
        </div>
        <p className="mt-2 text-sm text-brand-gray">
          Análisis IA sin crear paciente. Adjunta hasta 5 imágenes, dale
          contexto si quieres, y recibe lectura clínica preliminar. Las
          imágenes son efímeras: no se guardan en el expediente.
        </p>
      </header>

      <ConsultaRapidaForm />

      <p className="mt-8 text-xs text-brand-gray">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al
        médico tratante.
      </p>
    </main>
  );
}
