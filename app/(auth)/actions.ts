"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/**
 * Server Actions for auth flow.
 * All Supabase Auth calls happen here, never in client components.
 */

export interface AuthActionResult {
  error: string | null;
}

function getEmailAndPassword(formData: FormData): {
  email: string;
  password: string;
} | { error: string } {
  const email = (formData.get("email") ?? "").toString().trim();
  const password = (formData.get("password") ?? "").toString();
  if (!email || !password) {
    return { error: "Correo y contraseña son requeridos." };
  }
  return { email, password };
}

export async function login(_prev: AuthActionResult, formData: FormData): Promise<AuthActionResult> {
  const creds = getEmailAndPassword(formData);
  if ("error" in creds) return { error: creds.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });

  if (error) {
    return { error: "Credenciales incorrectas o usuario no confirmado." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(_prev: AuthActionResult, formData: FormData): Promise<AuthActionResult> {
  const creds = getEmailAndPassword(formData);
  if ("error" in creds) return { error: creds.error };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
  });

  if (error) {
    return { error: "No pudimos crear tu cuenta. Verifica el correo e intenta de nuevo." };
  }

  // If email confirmation is enabled in Supabase, session is null and the user must confirm.
  // If auto-confirm is on (dev), session is present and we can redirect.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  return {
    error:
      "Cuenta creada. Revisa tu correo para confirmar el acceso antes de iniciar sesión.",
  };
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
