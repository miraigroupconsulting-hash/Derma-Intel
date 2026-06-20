"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Elimina TODOS los datos demo del médico autenticado.
 *
 * Borra los pacientes con is_demo=true; el ON DELETE CASCADE de las FKs
 * limpia sus consultas, fotos, récipes, recordatorios, informes y
 * comparaciones. Best-effort: también quita los archivos de fotos del
 * bucket de Storage (que no cascadea con la BD). NUNCA toca pacientes
 * reales (is_demo=false). RLS además limita todo al propio médico.
 */
export async function eliminarDatosDemo(): Promise<{
  error: string | null;
  deleted: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada.", deleted: 0 };

  const { data: demoPacientes, error: selErr } = await supabase
    .from("pacientes")
    .select("id")
    .eq("medico_id", user.id)
    .eq("is_demo", true);
  if (selErr) return { error: "No pudimos leer los datos demo.", deleted: 0 };

  const ids = (demoPacientes ?? []).map((p) => p.id);
  if (ids.length === 0) return { error: null, deleted: 0 };

  // Recolectar paths de fotos ANTES de borrar (el cascade limpia las
  // filas pero no los objetos de Storage).
  const { data: fotos } = await supabase
    .from("fotos")
    .select("storage_path")
    .in("paciente_id", ids);
  const paths = (fotos ?? [])
    .map((f) => f.storage_path)
    .filter((p): p is string => Boolean(p));

  const { error: delErr } = await supabase
    .from("pacientes")
    .delete()
    .in("id", ids)
    .eq("is_demo", true); // doble cinturón: jamás borrar reales
  if (delErr) {
    return { error: `No pudimos eliminar los datos demo: ${delErr.message}`, deleted: 0 };
  }

  // Limpieza best-effort de Storage. Si falla, los archivos quedan
  // huérfanos (inofensivos) pero el expediente ya está limpio.
  if (paths.length > 0) {
    await supabase.storage.from("fotos-consultas").remove(paths);
  }

  revalidatePath("/pacientes");
  revalidatePath("/dashboard");
  revalidatePath("/agenda");
  revalidatePath("/perfil");
  return { error: null, deleted: ids.length };
}
