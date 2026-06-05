import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompararView } from "./comparar-view";
import { BackLink } from "@/components/back-link";

export const metadata = { title: "Comparar fotos" };

const SIGNED_URL_TTL = 60 * 60;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string; comp?: string }>;
}

export default async function CompararPage({
  params,
  searchParams,
}: PageProps) {
  const { id: pacienteId } = await params;
  const { a, b, comp } = await searchParams;

  if (!a || !b || a === b) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("id", pacienteId)
    .maybeSingle();
  if (!paciente) notFound();

  // Fetch both fotos in a single query (only allow ones belonging to
  // this paciente; RLS handles médico ownership).
  const { data: fotos } = await supabase
    .from("fotos")
    .select("id, fecha, tipo, zona_anatomica, storage_path")
    .in("id", [a, b])
    .eq("paciente_id", pacienteId);
  if (!fotos || fotos.length !== 2) notFound();

  const ordered = [a, b]
    .map((wantedId) => fotos.find((f) => f.id === wantedId))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
  if (ordered.length !== 2) notFound();

  const [antes, despues] = ordered;
  if (!antes || !despues) notFound();

  const [antesSigned, despuesSigned] = await Promise.all([
    supabase.storage
      .from("fotos-consultas")
      .createSignedUrl(antes.storage_path, SIGNED_URL_TTL),
    supabase.storage
      .from("fotos-consultas")
      .createSignedUrl(despues.storage_path, SIGNED_URL_TTL),
  ]);

  // Optional: load previously-saved comparación to seed the notes.
  let initialNotes = "";
  let comparacionId: string | undefined = undefined;
  if (comp) {
    const { data } = await supabase
      .from("comparaciones")
      .select("id, notas")
      .eq("id", comp)
      .eq("paciente_id", pacienteId)
      .maybeSingle();
    if (data) {
      initialNotes = data.notas ?? "";
      comparacionId = data.id;
    }
  }

  const pacienteNombre = `${paciente.apellido}, ${paciente.nombre}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6">
      <header className="mb-4">
        <BackLink
          href={`/pacientes/${pacienteId}/evolucion`}
          label="Evolución"
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Comparar fotos
        </h1>
        <p className="mt-1 text-sm text-neutral-600">{pacienteNombre}</p>
      </header>

      <CompararView
        pacienteId={pacienteId}
        pacienteNombre={pacienteNombre}
        antes={{
          id: antes.id,
          fecha: antes.fecha,
          tipo: antes.tipo,
          zona: antes.zona_anatomica,
          signedUrl: antesSigned.data?.signedUrl ?? null,
        }}
        despues={{
          id: despues.id,
          fecha: despues.fecha,
          tipo: despues.tipo,
          zona: despues.zona_anatomica,
          signedUrl: despuesSigned.data?.signedUrl ?? null,
        }}
        initialNotes={initialNotes}
        comparacionId={comparacionId}
      />
    </main>
  );
}
