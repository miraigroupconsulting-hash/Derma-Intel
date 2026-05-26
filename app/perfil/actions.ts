"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { perfilSchema } from "./schema";

export interface PerfilActionState {
  error: string | null;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function readForm(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    apellido: formData.get("apellido"),
    especialidad: formData.get("especialidad"),
    cedula_profesional: formData.get("cedula_profesional"),
    pais_cedula: formData.get("pais_cedula"),
    telefono: formData.get("telefono") || null,
    direccion: formData.get("direccion") || null,
  };
}

export async function updatePerfil(
  _prev: PerfilActionState,
  formData: FormData,
): Promise<PerfilActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const parsed = perfilSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "Revisa los campos marcados.", fieldErrors };
  }

  const { error } = await supabase
    .from("medicos")
    .update({
      nombre: parsed.data.nombre,
      apellido: parsed.data.apellido,
      especialidad: parsed.data.especialidad,
      cedula_profesional: parsed.data.cedula_profesional,
      pais_cedula: parsed.data.pais_cedula,
      telefono: parsed.data.telefono || null,
      direccion: parsed.data.direccion || null,
      onboarding_completed: true,
    })
    .eq("id", user.id)
    .select("id");

  if (error) {
    return { error: "No pudimos guardar tu perfil." };
  }

  revalidatePath("/perfil");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

/**
 * Update one of the asset paths on the médico row after the client
 * uploaded the file directly to Storage. Field can be "logo" or "firma".
 */
export async function updateMedicoAssetPath(
  field: "logo" | "firma",
  storagePath: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada." };

  if (storagePath && !storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Ruta fuera del scope permitido." };
  }

  const update =
    field === "logo"
      ? { logo_storage_path: storagePath }
      : { firma_digital_path: storagePath };
  const { error } = await supabase
    .from("medicos")
    .update(update)
    .eq("id", user.id);
  if (error) return { ok: false, error: "No pudimos guardar el archivo." };

  revalidatePath("/perfil");
  return { ok: true };
}
