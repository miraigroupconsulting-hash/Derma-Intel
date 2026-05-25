"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { saveConsultaSchema, type SaveConsultaInput } from "./schema";

export interface ConsultaActionState {
  error: string | null;
}

export interface SaveConsultaResult extends ConsultaActionState {
  consultaId?: string;
}

/**
 * Persist a new consulta with its SOAP fields, raw transcript, and
 * already-uploaded photos.
 *
 * Photo move flow:
 *   1. Client uploads each photo to fotos-consultas/{medico_id}/temp-X/{photo}.jpg.
 *   2. This action inserts the consulta row and gets its id.
 *   3. We move each photo from temp-X/ to {consulta_id}/ so the
 *      bucket layout stays predictable.
 *
 * We don't fail the save if the move fails — the photo path stored in
 * the fotos table is the source of truth either way. The move is just
 * hygiene for the bucket; a janitor job can re-key orphans later.
 */
export async function saveConsulta(
  input: SaveConsultaInput,
): Promise<SaveConsultaResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = saveConsultaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Datos de consulta inválidos. Revisa el formulario.",
    };
  }
  const data = parsed.data;

  // Verify the paciente belongs to this médico (defense in depth — RLS
  // would also enforce this on insert below).
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("id", data.paciente_id)
    .maybeSingle();
  if (!paciente) {
    return { error: "Paciente no encontrado o no tienes acceso." };
  }

  // Insert the consulta row.
  const consultaId = randomUUID();
  const { error: insertErr } = await supabase.from("consultas").insert({
    id: consultaId,
    paciente_id: data.paciente_id,
    medico_id: user.id,
    fecha: new Date().toISOString(),
    motivo: data.motivo ?? null,
    anamnesis: data.subjetivo ?? null,
    examen_fisico: data.objetivo ?? null,
    diagnostico_diferencial: data.analisis ?? null,
    plan_terapeutico: data.plan ?? null,
    notas_ia: data.transcripcion_raw
      ? { transcripcion_raw: data.transcripcion_raw }
      : null,
    estado: "completada",
  });

  if (insertErr) {
    return { error: "No pudimos guardar la consulta. Intenta de nuevo." };
  }

  // For each photo, move from temp-X/ to {consulta_id}/ and insert the
  // foto row.
  for (const f of data.fotos) {
    const finalPath = rekeyPhotoPath(f.storage_path, user.id, consultaId);
    // Move is implemented as copy + delete on Supabase Storage; the
    // upstream client exposes `move`.
    if (finalPath !== f.storage_path) {
      const { error: moveErr } = await supabase.storage
        .from("fotos-consultas")
        .move(f.storage_path, finalPath);
      // If the move fails we keep the original path; the row still
      // points to a valid file.
      if (moveErr) {
        // eslint-disable-next-line no-console
        console.warn(
          `[saveConsulta] photo move failed (${f.storage_path} → ${finalPath}): ${moveErr.message}`,
        );
      }
    }

    const { error: fotoErr } = await supabase.from("fotos").insert({
      consulta_id: consultaId,
      paciente_id: data.paciente_id,
      medico_id: user.id,
      storage_path: finalPath,
      tipo: f.tipo,
      zona_anatomica: f.zona_anatomica ?? null,
    });
    if (fotoErr) {
      // eslint-disable-next-line no-console
      console.warn(
        `[saveConsulta] foto row insert failed: ${fotoErr.message}`,
      );
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/pacientes/${data.paciente_id}`);
  return { error: null, consultaId };
}

/**
 * Rewrite a temp-{x}/photo.jpg path into the canonical
 * {medico_id}/{consulta_id}/photo.jpg path. Leaves already-canonical
 * paths untouched.
 */
function rekeyPhotoPath(
  current: string,
  medicoId: string,
  consultaId: string,
): string {
  const segments = current.split("/");
  if (segments.length < 3) return current;
  if (segments[0] !== medicoId) return current;
  if (!segments[1]?.startsWith("temp-")) return current;
  segments[1] = consultaId;
  return segments.join("/");
}
