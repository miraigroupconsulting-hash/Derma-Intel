/**
 * lib/evaluar-alertas.ts
 *
 * Lógica compartida por los cron endpoints. Recorre los médicos y
 * genera (idempotentemente) filas en `notificaciones` para:
 *
 *   1. Recordatorios cuya fecha_objetivo está dentro de las próximas
 *      24h y aún no tienen notificación abierta.
 *   2. Pacientes "perdidos" — sin consultas en > 60d con tx activo
 *      (heurística: tienen consultas previas, no nueva en 60-90d).
 *   3. Récipes próximos a vencer — placeholder hasta tener
 *      duracion_dias estructurada.
 *
 * Usa el cliente service-role para saltarse RLS y hacer cross-cuenta;
 * cada inserción es scoped por medico_id.
 */
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { diasDesde, PACIENTE_PERDIDO_AMARILLO_DIAS, PACIENTE_PERDIDO_NARANJA_DIAS } from "./recordatorios";

function admin() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface EvaluarResult {
  recordatoriosProcessed: number;
  pacientesPerdidosFlagged: number;
  notificacionesCreated: number;
  errors: string[];
}

export async function evaluarAlertasDiarias(): Promise<EvaluarResult> {
  const supabase = admin();
  const result: EvaluarResult = {
    recordatoriosProcessed: 0,
    pacientesPerdidosFlagged: 0,
    notificacionesCreated: 0,
    errors: [],
  };

  const now = new Date();
  const en24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 1. Recordatorios pendientes en ventana próxima (24h)
  const { data: recsProximos } = await supabase
    .from("recordatorios")
    .select(
      `id, medico_id, paciente_id, fecha_objetivo, tipo, prioridad, mensaje,
       paciente:pacientes ( nombre, apellido )`,
    )
    .eq("estado", "pendiente")
    .gte("fecha_objetivo", now.toISOString())
    .lt("fecha_objetivo", en24h.toISOString());

  for (const r of recsProximos ?? []) {
    result.recordatoriosProcessed++;
    const nombre = r.paciente
      ? `${r.paciente.nombre} ${r.paciente.apellido}`
      : "Paciente";
    const { error } = await supabase
      .from("notificaciones")
      .upsert(
        {
          medico_id: r.medico_id,
          paciente_id: r.paciente_id,
          recordatorio_id: r.id,
          tipo: "recordatorio",
          prioridad: r.prioridad,
          titulo: `Control próximo: ${nombre}`,
          mensaje: r.mensaje ?? "Recordatorio programado para hoy/mañana.",
          accion_url: `/pacientes/${r.paciente_id}`,
          fecha_objetivo: r.fecha_objetivo,
        },
        { onConflict: "medico_id,recordatorio_id" },
      );
    if (error) result.errors.push(`rec ${r.id}: ${error.message}`);
    else result.notificacionesCreated++;
  }

  // 2. Pacientes perdidos: heurística por pacientes con consultas
  // previas y sin consulta nueva en > 60d. Iteramos por médico.
  const { data: medicos } = await supabase
    .from("medicos")
    .select("id, zona_horaria");

  for (const m of medicos ?? []) {
    const tz = m.zona_horaria ?? "America/Caracas";
    // Pacientes activos del médico
    const { data: pacientes } = await supabase
      .from("pacientes")
      .select("id, nombre, apellido")
      .eq("medico_id", m.id)
      .eq("archivado", false);

    for (const p of pacientes ?? []) {
      const { data: ultima } = await supabase
        .from("consultas")
        .select("id, fecha")
        .eq("paciente_id", p.id)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ultima) continue; // nunca tuvo consulta; no aplica regla
      const dias = diasDesde(ultima.fecha, tz);
      if (dias < PACIENTE_PERDIDO_AMARILLO_DIAS) continue;

      const prioridad =
        dias >= PACIENTE_PERDIDO_NARANJA_DIAS ? "alta" : "media";
      const titulo =
        prioridad === "alta"
          ? `${p.nombre} ${p.apellido} sin contacto hace ${dias} días`
          : `${p.nombre} ${p.apellido} sin contacto hace ${dias} días`;

      // Insert sin recordatorio_id; dedup manual via select previo.
      const { data: existing } = await supabase
        .from("notificaciones")
        .select("id")
        .eq("medico_id", m.id)
        .eq("paciente_id", p.id)
        .eq("tipo", "alerta")
        .eq("resuelta", false)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const { error } = await supabase.from("notificaciones").insert({
        medico_id: m.id,
        paciente_id: p.id,
        tipo: "alerta",
        prioridad,
        titulo,
        mensaje: `Considerar contacto proactivo. Última consulta hace ${dias} días.`,
        accion_url: `/pacientes/${p.id}`,
      });
      if (error) result.errors.push(`perdido ${p.id}: ${error.message}`);
      else {
        result.notificacionesCreated++;
        result.pacientesPerdidosFlagged++;
      }
    }
  }

  return result;
}
