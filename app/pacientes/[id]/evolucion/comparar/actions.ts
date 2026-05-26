"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface SaveInput {
  pacienteId: string;
  fotoAntesId: string;
  fotoDespuesId: string;
  notas: string;
  /** When set, update this existing comparación in place. */
  comparacionId?: string;
}

export async function saveComparacion(
  input: SaveInput,
): Promise<{ error: string | null; comparacionId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  if (input.fotoAntesId === input.fotoDespuesId) {
    return { error: "No se puede comparar una foto consigo misma." };
  }
  if (input.notas.length > 4000) {
    return { error: "Las notas no pueden superar 4000 caracteres." };
  }

  if (input.comparacionId) {
    const { error: updErr } = await supabase
      .from("comparaciones")
      .update({
        notas: input.notas || null,
        foto_antes_id: input.fotoAntesId,
        foto_despues_id: input.fotoDespuesId,
      })
      .eq("id", input.comparacionId);
    if (updErr) return { error: "No pudimos guardar la comparación." };
    revalidatePath(`/pacientes/${input.pacienteId}/evolucion`);
    return { error: null, comparacionId: input.comparacionId };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("comparaciones")
    .insert({
      medico_id: user.id,
      paciente_id: input.pacienteId,
      foto_antes_id: input.fotoAntesId,
      foto_despues_id: input.fotoDespuesId,
      notas: input.notas || null,
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { error: "No pudimos crear la comparación." };

  revalidatePath(`/pacientes/${input.pacienteId}/evolucion`);
  return { error: null, comparacionId: inserted.id };
}

export async function markComparacionExportada(
  comparacionId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("comparaciones")
    .update({ exportada: true })
    .eq("id", comparacionId);
}
