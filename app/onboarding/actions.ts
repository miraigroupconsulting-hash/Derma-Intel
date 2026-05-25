"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { onboardingSchema } from "./schema";

export interface OnboardingActionState {
  error: string | null;
  fieldErrors?: Partial<Record<keyof ReturnType<typeof onboardingSchema.parse>, string>>;
}

export async function completeOnboarding(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const raw = {
    nombre: formData.get("nombre"),
    apellido: formData.get("apellido"),
    especialidad: formData.get("especialidad"),
    cedula_profesional: formData.get("cedula_profesional"),
    pais_cedula: formData.get("pais_cedula"),
    telefono: formData.get("telefono"),
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      error: "Revisa los campos marcados.",
      fieldErrors,
    };
  }

  const { data, error } = await supabase
    .from("medicos")
    .update({
      nombre: parsed.data.nombre,
      apellido: parsed.data.apellido,
      especialidad: parsed.data.especialidad,
      cedula_profesional: parsed.data.cedula_profesional,
      pais_cedula: parsed.data.pais_cedula,
      telefono: parsed.data.telefono || null,
      onboarding_completed: true,
    })
    .eq("id", user.id)
    .select("id");

  if (error) {
    return {
      error: "No pudimos guardar tu perfil. Intenta de nuevo.",
    };
  }

  // Defensive: if no row was updated, the médico profile is missing in
  // the DB (RLS would also produce this if the trigger never fired).
  // Fail loudly instead of silently looping the middleware → /onboarding.
  if (!data || data.length === 0) {
    return {
      error:
        "Tu perfil profesional no existe en la base de datos. Contacta a soporte.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
