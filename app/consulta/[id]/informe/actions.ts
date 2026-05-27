"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

export interface SaveInformeResult {
  error: string | null;
  informeId?: string;
  signedUrl?: string;
}

interface SaveInformeInput {
  consultaId: string;
  redactadoConIa: boolean;
  pdfStoragePath: string;
}

export async function saveInforme(
  input: SaveInformeInput,
): Promise<SaveInformeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  if (!input.pdfStoragePath.startsWith(`${user.id}/`)) {
    return { error: "Ruta de PDF fuera del scope permitido." };
  }

  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, paciente_id")
    .eq("id", input.consultaId)
    .maybeSingle();
  if (!consulta) return { error: "Consulta no encontrada." };

  const id = randomUUID();
  const { error: insErr } = await supabase.from("informes").insert({
    id,
    consulta_id: consulta.id,
    paciente_id: consulta.paciente_id,
    medico_id: user.id,
    pdf_storage_path: input.pdfStoragePath,
    redactado_con_ia: input.redactadoConIa,
  });
  if (insErr) return { error: `No pudimos guardar el informe: ${insErr.message}` };

  const { data: signed } = await supabase.storage
    .from("informes-pdf")
    .createSignedUrl(input.pdfStoragePath, 60 * 60);

  revalidatePath(`/consulta/${consulta.id}`);
  return {
    error: null,
    informeId: id,
    signedUrl: signed?.signedUrl,
  };
}
