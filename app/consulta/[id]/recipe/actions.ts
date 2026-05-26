"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { saveRecipeSchema, type SaveRecipeInput, type Medicamento } from "./schema";
import type { Database } from "@/types/database";

type RecipesJson = Database["public"]["Tables"]["recipes"]["Insert"]["medicamentos"];

export interface SaveRecipeResult {
  error: string | null;
  recipeId?: string;
  pdfStoragePath?: string;
  signedUrl?: string;
}

/**
 * Persist a récipe for a given consulta.
 *
 * The client uploads the rendered PDF blob to recetas-pdf bucket
 * BEFORE calling this action (so the heavy bytes never travel through
 * a Server Action which has a 1MB payload limit). The client passes
 * the storage path it used; we verify the path is in the médico's
 * scope and insert the row.
 */
export async function saveRecipe(
  input: SaveRecipeInput & { pdf_storage_path: string },
): Promise<SaveRecipeResult> {
  const parsed = saveRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Datos del récipe inválidos.",
    };
  }
  if (!input.pdf_storage_path || input.pdf_storage_path.length < 5) {
    return { error: "Ruta de PDF inválida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Defense in depth: confirm path lives under the médico's prefix
  // (RLS on the bucket would also reject foreign paths but checking
  // here gives a clearer error).
  if (!input.pdf_storage_path.startsWith(`${user.id}/`)) {
    return { error: "Ruta de PDF fuera del scope permitido." };
  }

  // Resolve paciente_id via the consulta (RLS-scoped query).
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, paciente_id")
    .eq("id", parsed.data.consulta_id)
    .maybeSingle();
  if (!consulta) return { error: "Consulta no encontrada." };

  const recipeId = randomUUID();
  const { error: insertErr } = await supabase.from("recipes").insert({
    id: recipeId,
    consulta_id: consulta.id,
    paciente_id: consulta.paciente_id,
    medico_id: user.id,
    medicamentos: parsed.data.medicamentos as unknown as RecipesJson,
    indicaciones_paciente: parsed.data.indicaciones_paciente ?? null,
    pdf_storage_path: input.pdf_storage_path,
    firmado: parsed.data.firmado,
    firmado_at: parsed.data.firmado ? new Date().toISOString() : null,
  });
  if (insertErr) {
    return { error: "No pudimos guardar el récipe." };
  }

  // Sign a URL for immediate download (1 hour).
  const { data: signed } = await supabase.storage
    .from("recetas-pdf")
    .createSignedUrl(input.pdf_storage_path, 60 * 60);

  revalidatePath(`/consulta/${consulta.id}`);
  return {
    error: null,
    recipeId,
    pdfStoragePath: input.pdf_storage_path,
    signedUrl: signed?.signedUrl,
  };
}

/**
 * Reasonable starter medicamentos derived from the consulta's
 * plan_terapeutico free text. Heuristic only — we split by newline
 * and treat each line as a draft entry. Médico edits before saving.
 */
export function suggestMedicamentosFromPlan(plan: string | null): Medicamento[] {
  if (!plan || !plan.trim()) return [];
  const lines = plan
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4);
  return lines.slice(0, 5).map((l) => ({
    nombre: l.slice(0, 200),
    presentacion: null,
    dosis: "",
    via: null,
    duracion: null,
    indicaciones: null,
  }));
}
