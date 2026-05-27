"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

/**
 * Resolve the public origin for this request. Used as the base for
 * Supabase email confirmation redirect links so they land on the
 * deployed app, not on whoever's Supabase "Site URL" happens to be
 * configured at the moment (which historically defaulted to
 * localhost:3000 in dev).
 *
 * Priority:
 *   1. `NEXT_PUBLIC_SITE_URL` env (set explicitly in Vercel)
 *   2. `x-forwarded-host` + protocol headers (real production hostname)
 *   3. Origin from the incoming request
 *   4. Final fallback: derma-intel.vercel.app
 */
async function resolveOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return "https://derma-intel.vercel.app";
}

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
  const origin = await resolveOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
    options: {
      // Override Supabase project's "Site URL" so confirmation emails
      // ALWAYS land on the right deployment — independent of dashboard
      // setting that may drift over time.
      emailRedirectTo: `${origin}/login`,
    },
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
