import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EvolucionView } from "./evolucion-view";
import type {
  ComparacionRecord,
  ConsultaGroup,
  FotoEntry,
} from "./types";

export const metadata = { title: "Evolución" };

const SIGNED_URL_TTL = 60 * 60; // 1h

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EvolucionPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("id", id)
    .maybeSingle();
  if (!paciente) notFound();

  // Pull all fotos for this paciente plus the consulta they belong to.
  // RLS scopes by medico_id automatically.
  const { data: fotos } = await supabase
    .from("fotos")
    .select(
      `id, consulta_id, fecha, tipo, zona_anatomica, storage_path,
       consulta:consultas ( id, fecha, motivo )`,
    )
    .eq("paciente_id", id)
    .order("fecha", { ascending: false });

  const entries: FotoEntry[] = [];
  // Track consulta meta as we encounter it (avoids extra query).
  const consultaMeta = new Map<
    string,
    { fecha: string; motivo: string | null }
  >();

  for (const f of fotos ?? []) {
    let signedUrl: string | null = null;
    const { data: signed } = await supabase.storage
      .from("fotos-consultas")
      .createSignedUrl(f.storage_path, SIGNED_URL_TTL);
    signedUrl = signed?.signedUrl ?? null;

    entries.push({
      id: f.id,
      consultaId: f.consulta_id,
      fecha: f.fecha,
      tipo: f.tipo,
      zona: f.zona_anatomica,
      signedUrl,
    });

    if (f.consulta_id && f.consulta && !consultaMeta.has(f.consulta_id)) {
      consultaMeta.set(f.consulta_id, {
        fecha: f.consulta.fecha,
        motivo: f.consulta.motivo,
      });
    }
  }

  // Group by consulta_id for the timeline view. Fotos sin consulta_id
  // (huérfanas) caen en un grupo "Sin consulta".
  const groupsMap = new Map<string, ConsultaGroup>();
  for (const e of entries) {
    const key = e.consultaId ?? "__sin_consulta__";
    let group = groupsMap.get(key);
    if (!group) {
      const meta = e.consultaId ? consultaMeta.get(e.consultaId) : null;
      group = {
        consultaId: key,
        consultaFecha: meta?.fecha ?? e.fecha,
        motivo: meta?.motivo ?? null,
        fotos: [],
      };
      groupsMap.set(key, group);
    }
    group.fotos.push(e);
  }
  const groups = Array.from(groupsMap.values()).sort(
    (a, b) =>
      new Date(b.consultaFecha).getTime() - new Date(a.consultaFecha).getTime(),
  );

  // Comparaciones previamente guardadas, con thumbnails de ambas fotos.
  const { data: comps } = await supabase
    .from("comparaciones")
    .select(
      `id, foto_antes_id, foto_despues_id, notas, fecha_creacion,
       antes:fotos!comparaciones_foto_antes_id_fkey ( storage_path ),
       despues:fotos!comparaciones_foto_despues_id_fkey ( storage_path )`,
    )
    .eq("paciente_id", id)
    .order("fecha_creacion", { ascending: false })
    .limit(20);

  const comparacionesPrevias: ComparacionRecord[] = [];
  for (const c of comps ?? []) {
    let antesUrl: string | null = null;
    let despuesUrl: string | null = null;
    if (c.antes?.storage_path) {
      const { data } = await supabase.storage
        .from("fotos-consultas")
        .createSignedUrl(c.antes.storage_path, SIGNED_URL_TTL);
      antesUrl = data?.signedUrl ?? null;
    }
    if (c.despues?.storage_path) {
      const { data } = await supabase.storage
        .from("fotos-consultas")
        .createSignedUrl(c.despues.storage_path, SIGNED_URL_TTL);
      despuesUrl = data?.signedUrl ?? null;
    }
    comparacionesPrevias.push({
      id: c.id,
      fotoAntesId: c.foto_antes_id,
      fotoDespuesId: c.foto_despues_id,
      notas: c.notas,
      fechaCreacion: c.fecha_creacion,
      antesUrl,
      despuesUrl,
    });
  }

  const pacienteNombre = `${paciente.apellido}, ${paciente.nombre}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6">
      <header className="mb-6">
        <Link
          href={`/pacientes/${id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {pacienteNombre}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Evolución
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {entries.length === 0
            ? "Aún no hay fotos para este paciente."
            : `${entries.length} foto${entries.length === 1 ? "" : "s"} a lo largo de ${groups.length} consulta${groups.length === 1 ? "" : "s"}. Selecciona dos para comparar.`}
        </p>
      </header>

      <EvolucionView
        pacienteId={id}
        pacienteNombre={pacienteNombre}
        groups={groups}
        comparacionesPrevias={comparacionesPrevias}
      />

      <p className="mt-8 text-xs text-neutral-500">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al
        médico tratante.
      </p>
    </main>
  );
}
