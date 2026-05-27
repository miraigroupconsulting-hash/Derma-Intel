"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function markNotificacionLeida(
  notificacionId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("id", notificacionId);
  if (error) return { error: "No pudimos marcar como leída." };

  revalidatePath("/dashboard");
  return { error: null };
}

export async function markAllNotificacionesLeidas(): Promise<{
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("medico_id", user.id)
    .eq("leida", false);
  if (error) return { error: "No pudimos marcar todas." };

  revalidatePath("/dashboard");
  return { error: null };
}

export async function resolverNotificacion(
  notificacionId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Get notif + linked recordatorio so we can cascade resolution
  const { data: notif } = await supabase
    .from("notificaciones")
    .select("id, recordatorio_id, prioridad")
    .eq("id", notificacionId)
    .maybeSingle();
  if (!notif) return { error: "Notificación no encontrada." };

  const { error: upd1 } = await supabase
    .from("notificaciones")
    .update({ resuelta: true, leida: true })
    .eq("id", notificacionId);
  if (upd1) return { error: "No pudimos resolver." };

  if (notif.recordatorio_id) {
    await supabase
      .from("recordatorios")
      .update({
        estado: "completado",
        completado_at: new Date().toISOString(),
      })
      .eq("id", notif.recordatorio_id);
  }

  revalidatePath("/dashboard");
  revalidatePath("/agenda");
  return { error: null };
}
