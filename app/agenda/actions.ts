"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { wallClockToUtc, type RecordatorioTipo, type Prioridad } from "@/lib/recordatorios";

interface CrearCitaInput {
  pacienteId: string;
  /** Hora de pared local del médico: "YYYY-MM-DDTHH:mm". */
  fechaLocal: string;
  tipo: RecordatorioTipo;
  prioridad: Prioridad;
  mensaje: string | null;
}

/**
 * Crea una cita/recordatorio desde /agenda con fecha y hora explícitas
 * (a diferencia de programarControl, que usa "X días desde hoy").
 * RLS garantiza que solo se inserta para el médico autenticado.
 */
export async function crearCita(
  input: CrearCitaInput,
): Promise<{ error: string | null; recordatorioId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  if (!input.pacienteId) return { error: "Selecciona un paciente." };
  if (!input.fechaLocal) return { error: "Elige fecha y hora." };

  const { data: medico } = await supabase
    .from("medicos")
    .select("zona_horaria")
    .eq("id", user.id)
    .maybeSingle();
  const tz = medico?.zona_horaria ?? "America/Caracas";

  const fechaObjetivo = wallClockToUtc(input.fechaLocal, tz);
  if (!fechaObjetivo || Number.isNaN(fechaObjetivo.getTime())) {
    return { error: "La fecha/hora no es válida." };
  }

  // Verificar que el paciente pertenece al médico (RLS también lo hace).
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("id", input.pacienteId)
    .maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado o sin acceso." };

  const { data: inserted, error: insErr } = await supabase
    .from("recordatorios")
    .insert({
      paciente_id: input.pacienteId,
      medico_id: user.id,
      tipo: input.tipo,
      fecha_objetivo: fechaObjetivo.toISOString(),
      mensaje: input.mensaje?.trim() || null,
      prioridad: input.prioridad,
      auto_generado: false,
    })
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      return {
        error: "Ya hay una cita de ese tipo ese día para este paciente.",
      };
    }
    return { error: `No pudimos crear la cita: ${insErr.message}` };
  }

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath(`/pacientes/${input.pacienteId}`);
  return { error: null, recordatorioId: inserted?.id };
}
