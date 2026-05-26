"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database";

type ConsultaJson = Database["public"]["Tables"]["consultas"]["Update"]["notas_ia"];

export type IaSessionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type IaModoWire =
  | "caso_clinico"
  | "express"
  | "bibliografia"
  | "histopatologia"
  | "terapeutica"
  | "docente";

export interface IaSessionInput {
  modo: IaModoWire;
  modelo: string;
  messages: IaSessionMessage[];
}

export interface SaveIaSessionResult {
  ok: boolean;
  error?: string;
}

/**
 * Append an IA conversation session to consultas.notas_ia.consulta_ia
 * (which is a jsonb array). Each saved session captures the mode used,
 * the model identifier, a timestamp, and every user/assistant turn so
 * the médico can recover the conversation later from the consulta view.
 */
export async function saveIaSession(
  consultaId: string,
  session: IaSessionInput,
): Promise<SaveIaSessionResult> {
  if (!consultaId) return { ok: false, error: "consultaId requerido." };
  if (!session.messages || session.messages.length === 0) {
    return { ok: false, error: "No hay mensajes para guardar." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada." };

  // Read current notas_ia (RLS limits to owning médico).
  const { data: consulta, error: readErr } = await supabase
    .from("consultas")
    .select("id, notas_ia")
    .eq("id", consultaId)
    .maybeSingle();
  if (readErr || !consulta) {
    return { ok: false, error: "Consulta no encontrada." };
  }

  const existing =
    consulta.notas_ia && typeof consulta.notas_ia === "object" && !Array.isArray(consulta.notas_ia)
      ? (consulta.notas_ia as Record<string, unknown>)
      : {};

  const sessions = Array.isArray(existing.consulta_ia)
    ? (existing.consulta_ia as unknown[])
    : [];

  const newSession = {
    modo: session.modo,
    modelo: session.modelo,
    fecha: new Date().toISOString(),
    messages: session.messages,
  };

  const next: Record<string, unknown> = {
    ...existing,
    consulta_ia: [...sessions, newSession],
  };

  const { error: writeErr } = await supabase
    .from("consultas")
    .update({ notas_ia: next as unknown as ConsultaJson })
    .eq("id", consultaId);
  if (writeErr) {
    return { ok: false, error: "No pudimos guardar la conversación." };
  }

  revalidatePath(`/consulta/${consultaId}`);
  return { ok: true };
}
