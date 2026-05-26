import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeForm } from "./recipe-form";
import { suggestMedicamentosFromPlan } from "./schema";

export const metadata = { title: "Generar récipe" };

interface PageProps {
  params: Promise<{ id: string }>;
}

function calcEdad(fechaNac: string | null): number | null {
  if (!fechaNac) return null;
  const b = new Date(fechaNac);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export default async function RecipePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      `id, plan_terapeutico,
       paciente:pacientes ( nombre, apellido, fecha_nacimiento )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!consulta || !consulta.paciente) notFound();

  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "nombre, apellido, especialidad, cedula_profesional, pais_cedula, telefono, direccion, logo_storage_path, firma_digital_path",
    )
    .eq("id", user.id)
    .maybeSingle();

  // Sign 1-hour URLs for the assets so react-pdf can fetch them when
  // rendering the document (both preview and final blob).
  const SIGNED_URL_TTL = 60 * 60;
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
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <header className="mb-6">
        <Link
          href={`/consulta/${id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← Consulta
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Generar récipe
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Edita los medicamentos sugeridos a partir del plan terapéutico,
          revisa la vista previa, y genera el PDF. El archivo queda guardado
          en el expediente del paciente.
        </p>
      </header>

      <RecipeForm
        consultaId={consulta.id}
        medico={{
          nombre: medico?.nombre ?? null,
          apellido: medico?.apellido ?? null,
          especialidad: medico?.especialidad ?? null,
          cedula_profesional: medico?.cedula_profesional ?? null,
          pais_cedula: medico?.pais_cedula ?? null,
          telefono: medico?.telefono ?? null,
          direccion: medico?.direccion ?? null,
          logoUrl,
          firmaUrl,
        }}
        paciente={{
          nombre: consulta.paciente.nombre,
          apellido: consulta.paciente.apellido,
          edad: calcEdad(consulta.paciente.fecha_nacimiento),
        }}
        initialMedicamentos={suggestMedicamentosFromPlan(
          consulta.plan_terapeutico,
        )}
      />
    </main>
  );
}
