import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeForm } from "./recipe-form";
import {
  EMPTY_MEDICAMENTO,
  medicamentoSchema,
  suggestMedicamentosFromPlan,
  type Medicamento,
} from "./schema";

export const metadata = { title: "Generar récipe" };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

/**
 * Defensive parser for the `medicamentos` jsonb column of an existing
 * récipe — we re-validate so a tampered-with row can't crash the form.
 */
function parseMedicamentosFromDb(raw: unknown): Medicamento[] {
  if (!Array.isArray(raw)) return [];
  const out: Medicamento[] = [];
  for (const r of raw) {
    const parsed = medicamentoSchema.safeParse(r);
    if (parsed.success) {
      out.push({ ...EMPTY_MEDICAMENTO, ...parsed.data });
    }
  }
  return out;
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

/**
 * Extracts plain text from the *most recent* saved Terapéutica IA
 * session attached to this consulta. The médica triggers the "✨ Desde
 * IA Terapéutica" button in the form to parse this into structured
 * medicamentos via /api/ia/estructurar-recipe.
 *
 * Returns null if no Terapéutica session exists yet.
 */
function extractLatestTerapeutica(notasIa: unknown): string | null {
  if (!notasIa || typeof notasIa !== "object") return null;
  const raw = (notasIa as { consulta_ia?: unknown }).consulta_ia;
  if (!Array.isArray(raw)) return null;

  type SavedSession = {
    modo: string;
    modelo: string;
    fecha: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const sessions = raw.filter((s): s is SavedSession => {
    if (!s || typeof s !== "object") return false;
    const obj = s as Record<string, unknown>;
    return (
      typeof obj.modo === "string" &&
      typeof obj.modelo === "string" &&
      typeof obj.fecha === "string" &&
      Array.isArray(obj.messages)
    );
  });

  const terapeuticas = sessions.filter((s) => s.modo === "terapeutica");
  if (terapeuticas.length === 0) return null;

  // Most recent first
  terapeuticas.sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );
  const latest = terapeuticas[0]!;

  // Concatenate all assistant turns as the "snippet" — gives the parser
  // the most useful context.
  const assistantTurns = latest.messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n\n")
    .trim();

  return assistantTurns.length > 0 ? assistantTurns : null;
}

export default async function RecipePage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { from: fromRecipeId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      `id, plan_terapeutico, notas_ia,
       paciente:pacientes ( id, nombre, apellido, fecha_nacimiento, cedula, telefono )`,
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

  const terapeuticaText = extractLatestTerapeutica(consulta.notas_ia);

  // Re-firma flow: load the unsigned récipe to pre-fill the form.
  // Guards: récipe must belong to this consulta, must NOT be firmado
  // already (a firmado récipe can't be edited; it must be desfirmado
  // first via the consulta detail page).
  let existingRecipe: {
    id: string;
    medicamentos: Medicamento[];
    indicacionesPaciente: string;
  } | null = null;
  if (fromRecipeId) {
    const { data: row } = await supabase
      .from("recipes")
      .select("id, consulta_id, firmado, medicamentos, indicaciones_paciente")
      .eq("id", fromRecipeId)
      .maybeSingle();
    if (row && row.consulta_id === consulta.id && !row.firmado) {
      existingRecipe = {
        id: row.id,
        medicamentos: parseMedicamentosFromDb(row.medicamentos),
        indicacionesPaciente: row.indicaciones_paciente ?? "",
      };
    }
  }

  const initialMedicamentos =
    existingRecipe && existingRecipe.medicamentos.length > 0
      ? existingRecipe.medicamentos
      : suggestMedicamentosFromPlan(consulta.plan_terapeutico);

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
          {existingRecipe ? "Re-firmar récipe" : "Generar récipe"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {existingRecipe
            ? "Estás editando un récipe previamente desfirmado. Al firmar, se generará un PDF nuevo y la revisión queda registrada en el historial del récipe."
            : "Edita los medicamentos sugeridos a partir del plan terapéutico, revisa la vista previa, y genera el PDF. El archivo queda guardado en el expediente del paciente."}
        </p>
      </header>

      <RecipeForm
        consultaId={consulta.id}
        pacienteId={consulta.paciente.id}
        existingRecipeId={existingRecipe?.id}
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
          cedula: consulta.paciente.cedula ?? null,
          telefono: consulta.paciente.telefono ?? null,
        }}
        initialMedicamentos={initialMedicamentos}
        initialIndicacionesPaciente={
          existingRecipe?.indicacionesPaciente ?? ""
        }
        terapeutica={{ text: terapeuticaText }}
      />
    </main>
  );
}
