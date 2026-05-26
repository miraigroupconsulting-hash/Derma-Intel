"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Update a foto's zona_anatomica field. Used by the long-press retag
 * flow in the gallery. Free-text values must be passed already
 * namespaced with `otra:` prefix.
 *
 * RLS on `fotos` ensures the médica can only modify her own.
 */
export async function updateFotoZona(
  fotoId: string,
  zona: string | null,
): Promise<{ error: string | null }> {
  if (!fotoId || typeof fotoId !== "string") {
    return { error: "ID de foto inválido." };
  }
  if (zona !== null) {
    const trimmed = zona.trim();
    if (trimmed.length === 0 || trimmed.length > 120) {
      return { error: "Zona inválida (1-120 caracteres)." };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: foto, error: selErr } = await supabase
    .from("fotos")
    .select("id, paciente_id")
    .eq("id", fotoId)
    .maybeSingle();
  if (selErr || !foto) return { error: "Foto no encontrada." };

  const { error: updErr } = await supabase
    .from("fotos")
    .update({ zona_anatomica: zona })
    .eq("id", fotoId);
  if (updErr) return { error: "No pudimos guardar la zona." };

  revalidatePath(`/pacientes/${foto.paciente_id}/evolucion`);
  return { error: null };
}
