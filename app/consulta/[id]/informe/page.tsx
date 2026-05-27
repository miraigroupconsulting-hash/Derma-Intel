import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InformeForm } from "./informe-form";

export const metadata = { title: "Informe médico" };

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

export default async function InformePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load consulta + paciente + médico
  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      `id, fecha, motivo, anamnesis, examen_fisico, diagnostico_diferencial,
       plan_terapeutico, estado,
       paciente:pacientes (
         id, nombre, apellido, fecha_nacimiento, sexo,
         tipo_piel_fitzpatrick, cedula
       )`,
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

  // Signed URLs for assets
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

  // Informes previos para esta consulta
  const { data: informesPrev } = await supabase
    .from("informes")
    .select("id, fecha, redactado_con_ia, pdf_storage_path")
    .eq("consulta_id", id)
    .order("fecha", { ascending: false });

  const informesRows: Array<{
    id: string;
    fecha: string;
    redactadoConIa: boolean;
    url: string | null;
  }> = [];
  for (const i of informesPrev ?? []) {
    let url: string | null = null;
    if (i.pdf_storage_path) {
      const { data: s } = await supabase.storage
        .from("informes-pdf")
        .createSignedUrl(i.pdf_storage_path, SIGNED_URL_TTL);
      url = s?.signedUrl ?? null;
    }
    informesRows.push({
      id: i.id,
      fecha: i.fecha,
      redactadoConIa: i.redactado_con_ia,
      url,
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <header className="mb-6">
        <Link
          href={`/consulta/${id}`}
          className="text-xs text-brand-gray hover:underline"
        >
          ← Consulta
        </Link>
        <h1 className="mt-2 font-display text-2xl tracking-tight">
          Informe médico
        </h1>
        <p className="mt-1 text-sm text-brand-gray">
          Documento formal con el resumen de la consulta. Opción de redacción
          con IA para pulir el lenguaje en estilo profesional. Se guarda en el
          expediente del paciente.
        </p>
      </header>

      <InformeForm
        consultaId={consulta.id}
        pacienteId={consulta.paciente.id}
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
          sexo: consulta.paciente.sexo ?? null,
          cedula: consulta.paciente.cedula ?? null,
          fitzpatrick: consulta.paciente.tipo_piel_fitzpatrick ?? null,
        }}
        consultaCampos={{
          motivo: consulta.motivo ?? "",
          anamnesis: consulta.anamnesis ?? "",
          examen_fisico: consulta.examen_fisico ?? "",
          diagnostico_diferencial: consulta.diagnostico_diferencial ?? "",
          plan_terapeutico: consulta.plan_terapeutico ?? "",
        }}
        fechaConsulta={consulta.fecha}
        informesPrevios={informesRows}
      />
    </main>
  );
}
