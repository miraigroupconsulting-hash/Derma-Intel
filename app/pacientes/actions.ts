"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pacienteSchema } from "./schema";

export interface PacienteActionState {
  error: string | null;
  fieldErrors?: Record<string, string>;
}

function readFormPaciente(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    apellido: formData.get("apellido"),
    fecha_nacimiento: formData.get("fecha_nacimiento"),
    sexo: formData.get("sexo"),
    tipo_piel_fitzpatrick: formData.get("tipo_piel_fitzpatrick"),
    alergias: formData.get("alergias"),
    antecedentes: formData.get("antecedentes"),
    medicacion_actual: formData.get("medicacion_actual"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
    notas: formData.get("notas"),
  };
}

function collectFieldErrors(
  parsed: ReturnType<typeof pacienteSchema.safeParse>,
): Record<string, string> {
  if (parsed.success) return {};
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export async function createPaciente(
  _prev: PacienteActionState,
  formData: FormData,
): Promise<PacienteActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = pacienteSchema.safeParse(readFormPaciente(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos marcados.",
      fieldErrors: collectFieldErrors(parsed),
    };
  }

  const { data, error } = await supabase
    .from("pacientes")
    .insert({
      medico_id: user.id,
      nombre: parsed.data.nombre,
      apellido: parsed.data.apellido,
      fecha_nacimiento: parsed.data.fecha_nacimiento ?? null,
      sexo: parsed.data.sexo ?? null,
      tipo_piel_fitzpatrick: parsed.data.tipo_piel_fitzpatrick ?? null,
      alergias: parsed.data.alergias ?? null,
      antecedentes: parsed.data.antecedentes ?? null,
      medicacion_actual: parsed.data.medicacion_actual ?? null,
      telefono: parsed.data.telefono ?? null,
      email: parsed.data.email ?? null,
      notas: parsed.data.notas ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "No pudimos crear al paciente. Intenta de nuevo." };
  }

  revalidatePath("/pacientes");
  redirect(`/pacientes/${data.id}`);
}

export async function updatePaciente(
  id: string,
  _prev: PacienteActionState,
  formData: FormData,
): Promise<PacienteActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = pacienteSchema.safeParse(readFormPaciente(formData));
  if (!parsed.success) {
    return {
      error: "Revisa los campos marcados.",
      fieldErrors: collectFieldErrors(parsed),
    };
  }

  const { error } = await supabase
    .from("pacientes")
    .update({
      nombre: parsed.data.nombre,
      apellido: parsed.data.apellido,
      fecha_nacimiento: parsed.data.fecha_nacimiento ?? null,
      sexo: parsed.data.sexo ?? null,
      tipo_piel_fitzpatrick: parsed.data.tipo_piel_fitzpatrick ?? null,
      alergias: parsed.data.alergias ?? null,
      antecedentes: parsed.data.antecedentes ?? null,
      medicacion_actual: parsed.data.medicacion_actual ?? null,
      telefono: parsed.data.telefono ?? null,
      email: parsed.data.email ?? null,
      notas: parsed.data.notas ?? null,
    })
    .eq("id", id);
  // RLS filters by medico_id; foreign médicos see 0 rows affected.

  if (error) {
    return { error: "No pudimos guardar los cambios." };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}

/**
 * Soft delete: marks the patient as archived.
 * Stays in DB for audit; disappears from default lists.
 */
export async function archivePaciente(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("pacientes").update({ archivado: true }).eq("id", id);

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect("/pacientes");
}

/**
 * Restore a previously archived patient back into the main list.
 */
export async function unarchivePaciente(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("pacientes").update({ archivado: false }).eq("id", id);

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}
