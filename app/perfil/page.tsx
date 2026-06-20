import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PerfilForm } from "./form";
import { DemoCleanup } from "./demo-cleanup";
import { BackLink } from "@/components/back-link";

export const metadata = { title: "Mi perfil" };

const SIGNED_URL_TTL = 60 * 60;

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "nombre, apellido, especialidad, cedula_profesional, pais_cedula, telefono, direccion, logo_storage_path, firma_digital_path",
    )
    .eq("id", user.id)
    .single();

  const { count: demoCount } = await supabase
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", user.id)
    .eq("is_demo", true);

  let logoUrl: string | null = null;
  let firmaUrl: string | null = null;
  if (medico?.logo_storage_path) {
    const { data: s } = await supabase.storage
      .from("medico-assets")
      .createSignedUrl(medico.logo_storage_path, SIGNED_URL_TTL);
    logoUrl = s?.signedUrl ?? null;
  }
  if (medico?.firma_digital_path) {
    const { data: s } = await supabase.storage
      .from("medico-assets")
      .createSignedUrl(medico.firma_digital_path, SIGNED_URL_TTL);
    firmaUrl = s?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6">
      <header className="mb-6">
        <BackLink href="/dashboard" label="Dashboard" />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Mi perfil
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Datos profesionales que aparecen en récipes y la cuenta. Las
          imágenes (logo y firma) son opcionales pero recomendadas para
          récipes con apariencia profesional.
        </p>
      </header>

      <PerfilForm
        defaultValues={{
          nombre: medico?.nombre ?? "",
          apellido: medico?.apellido ?? "",
          especialidad: medico?.especialidad ?? "",
          cedula_profesional: medico?.cedula_profesional ?? "",
          pais_cedula: medico?.pais_cedula ?? "",
          telefono: medico?.telefono ?? "",
          direccion: medico?.direccion ?? "",
          logo_storage_path: medico?.logo_storage_path ?? null,
          firma_digital_path: medico?.firma_digital_path ?? null,
        }}
        initialLogoUrl={logoUrl}
        initialFirmaUrl={firmaUrl}
      />

      <DemoCleanup demoCount={demoCount ?? 0} />
    </main>
  );
}
