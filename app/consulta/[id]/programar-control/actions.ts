"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { buildFechaObjetivo } from "@/lib/recordatorios";

interface ProgramarInput {
  consultaId: string;
  diasDesdeHoy: number;
  tipo: "control" | "seguimiento" | "biopsia_pendiente" | "tratamiento_finaliza" | "otro";
  prioridad: "baja" | "media" | "alta";
  mensaje: string | null;
  autoGenerado: boolean;
}

export async function programarControl(
  input: ProgramarInput,
): Promise<{ error: string | null; recordatorioId?: string }> {
  if (input.diasDesdeHoy < 1 || input.diasDesdeHoy > 365) {
    return { error: "El rango válido es 1–365 días desde hoy." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Resolver consulta + paciente + zona_horaria del médico.
  const [consultaRes, medicoRes] = await Promise.all([
    supabase
      .from("consultas")
      .select("id, paciente_id")
      .eq("id", input.consultaId)
      .maybeSingle(),
    supabase
      .from("medicos")
      .select("zona_horaria")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (consultaRes.error || !consultaRes.data) {
    return { error: "Consulta no encontrada." };
  }
  const consulta = consultaRes.data;
  const tz = medicoRes.data?.zona_horaria ?? "America/Caracas";
  const fechaObjetivo = buildFechaObjetivo(input.diasDesdeHoy, tz);

  // Insert con ON CONFLICT vía unique constraint en (paciente_id,
  // tipo, fecha_objetivo::date). PostgREST devuelve PGRST204 si la
  // fila existe; capturamos eso como "ya programado".
  const { data: inserted, error: insErr } = await supabase
    .from("recordatorios")
    .insert({
      paciente_id: consulta.paciente_id,
      medico_id: user.id,
      consulta_id: consulta.id,
      tipo: input.tipo,
      fecha_objetivo: fechaObjetivo.toISOString(),
      mensaje: input.mensaje,
      prioridad: input.prioridad,
      auto_generado: input.autoGenerado,
    })
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      return { error: "Ya hay un control programado ese día para este paciente." };
    }
    return { error: `No pudimos programar el control: ${insErr.message}` };
  }

  revalidatePath(`/consulta/${input.consultaId}`);
  revalidatePath(`/pacientes/${consulta.paciente_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/agenda");

  return { error: null, recordatorioId: inserted?.id };
}

export async function cancelarRecordatorio(
  recordatorioId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: rec } = await supabase
    .from("recordatorios")
    .select("id, paciente_id, consulta_id")
    .eq("id", recordatorioId)
    .maybeSingle();
  if (!rec) return { error: "Recordatorio no encontrado." };

  const { error: updErr } = await supabase
    .from("recordatorios")
    .update({
      estado: "cancelado",
      completado_at: new Date().toISOString(),
    })
    .eq("id", recordatorioId);
  if (updErr) return { error: "No pudimos cancelar." };

  revalidatePath("/dashboard");
  revalidatePath("/agenda");
  if (rec.consulta_id) revalidatePath(`/consulta/${rec.consulta_id}`);
  if (rec.paciente_id) revalidatePath(`/pacientes/${rec.paciente_id}`);
  return { error: null };
}
