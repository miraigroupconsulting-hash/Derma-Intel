"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { saveRecipeSchema, type SaveRecipeInput } from "./schema";
import { parseRevisiones, type RevisionEntry } from "./revisiones";
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
 * Two modes:
 *  - **Create** (no `existingRecipeId`): inserts a new récipe row.
 *    Appends a `firmado` revisión.
 *  - **Re-sign** (`existingRecipeId` set): updates the existing récipe
 *    in place, swapping `pdf_storage_path` to the new PDF and appending
 *    a `re_firmado` revisión. The previous PDF in Storage is kept as
 *    audit evidence (we never delete it).
 *
 * The client uploads the rendered PDF blob to recetas-pdf bucket
 * BEFORE calling this action (so the heavy bytes never travel through
 * a Server Action which has a 1MB payload limit). The client passes
 * the storage path it used; we verify the path is in the médico's
 * scope and insert/update the row.
 */
export async function saveRecipe(
  input: SaveRecipeInput & {
    pdf_storage_path: string;
    existingRecipeId?: string;
  },
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

  const nowIso = new Date().toISOString();

  if (input.existingRecipeId) {
    // ----- Re-sign existing récipe -----
    const { data: existing } = await supabase
      .from("recipes")
      .select("id, revisiones, firmado")
      .eq("id", input.existingRecipeId)
      .eq("consulta_id", consulta.id)
      .maybeSingle();
    if (!existing) {
      return { error: "Récipe a re-firmar no encontrado." };
    }
    const prevRevs = parseRevisiones(existing.revisiones);
    const newRevs: RevisionEntry[] = [
      ...prevRevs,
      {
        accion: "re_firmado",
        fecha: nowIso,
        pdf_storage_path: input.pdf_storage_path,
      },
    ];
    const { error: updErr } = await supabase
      .from("recipes")
      .update({
        medicamentos: parsed.data.medicamentos as unknown as RecipesJson,
        indicaciones_paciente: parsed.data.indicaciones_paciente ?? null,
        pdf_storage_path: input.pdf_storage_path,
        firmado: parsed.data.firmado,
        firmado_at: parsed.data.firmado ? nowIso : null,
        revisiones: newRevs as unknown as RecipesJson,
      })
      .eq("id", existing.id);
    if (updErr) {
      return { error: "No pudimos re-firmar el récipe." };
    }

    const { data: signed } = await supabase.storage
      .from("recetas-pdf")
      .createSignedUrl(input.pdf_storage_path, 60 * 60);

    revalidatePath(`/consulta/${consulta.id}`);
    return {
      error: null,
      recipeId: existing.id,
      pdfStoragePath: input.pdf_storage_path,
      signedUrl: signed?.signedUrl,
    };
  }

  // ----- Create new récipe -----
  const recipeId = randomUUID();
  const initialRevs: RevisionEntry[] = parsed.data.firmado
    ? [
        {
          accion: "firmado",
          fecha: nowIso,
          pdf_storage_path: input.pdf_storage_path,
        },
      ]
    : [];
  const { error: insertErr } = await supabase.from("recipes").insert({
    id: recipeId,
    consulta_id: consulta.id,
    paciente_id: consulta.paciente_id,
    medico_id: user.id,
    medicamentos: parsed.data.medicamentos as unknown as RecipesJson,
    indicaciones_paciente: parsed.data.indicaciones_paciente ?? null,
    pdf_storage_path: input.pdf_storage_path,
    firmado: parsed.data.firmado,
    firmado_at: parsed.data.firmado ? nowIso : null,
    revisiones: initialRevs as unknown as RecipesJson,
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
 * Mark a récipe as no longer signed (back to draft). Appends a
 * `desfirmado` entry to `revisiones`. The PDF in Storage is NOT
 * deleted — it stays as audit evidence of what the médico had
 * previously released. The médico can later edit and re-firmar,
 * which will produce a new PDF + append `re_firmado` to revisiones.
 */
export async function unsignRecipe(
  recipeId: string,
): Promise<{ error: string | null }> {
  if (!recipeId || typeof recipeId !== "string") {
    return { error: "ID de récipe inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: existing } = await supabase
    .from("recipes")
    .select("id, consulta_id, firmado, pdf_storage_path, revisiones")
    .eq("id", recipeId)
    .maybeSingle();
  if (!existing) return { error: "Récipe no encontrado." };
  if (!existing.firmado) {
    return { error: "Este récipe no está firmado." };
  }

  const newRevs: RevisionEntry[] = [
    ...parseRevisiones(existing.revisiones),
    {
      accion: "desfirmado",
      fecha: new Date().toISOString(),
      pdf_storage_path: existing.pdf_storage_path,
    },
  ];

  const { error: updErr } = await supabase
    .from("recipes")
    .update({
      firmado: false,
      firmado_at: null,
      revisiones: newRevs as unknown as RecipesJson,
    })
    .eq("id", existing.id);
  if (updErr) return { error: "No pudimos desfirmar el récipe." };

  revalidatePath(`/consulta/${existing.consulta_id}`);
  return { error: null };
}
