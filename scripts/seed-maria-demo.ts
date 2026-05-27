/**
 * scripts/seed-maria-demo.ts
 *
 * Seed idempotente para Día 7 e2e — crea/asegura "María Demo (Mirai)"
 * con 3 consultas espaciadas y una consulta inicial de hace 30 días
 * para validar el flujo de "paciente perdido + control pendiente".
 *
 * Uso:
 *   MEDICO_EMAIL=tu@email.com npx tsx scripts/seed-maria-demo.ts
 *
 * Para borrar luego:
 *   MEDICO_EMAIL=tu@email.com npx tsx scripts/seed-maria-demo.ts --delete
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database } from "../types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const medicoEmail = process.env.MEDICO_EMAIL;
const shouldDelete = process.argv.includes("--delete");

if (!url || !serviceKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
if (!medicoEmail) {
  console.error("Set MEDICO_EMAIL=tu@email.com en el entorno antes de correr.");
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NOMBRE = "María";
const APELLIDO = "Demo (Mirai)";

async function findMedico() {
  const { data } = await supabase
    .from("medicos")
    .select("id, email, zona_horaria")
    .eq("email", medicoEmail!)
    .maybeSingle();
  if (!data) throw new Error(`Médico no encontrado para email=${medicoEmail}`);
  return data;
}

function daysAgo(d: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - d);
  // Forzar 09:00 UTC para mantener consistencia
  date.setUTCHours(13, 0, 0, 0); // 09:00 Caracas = 13:00 UTC
  return date.toISOString();
}

async function deleteSeed() {
  const medico = await findMedico();
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("nombre", NOMBRE)
    .eq("apellido", APELLIDO)
    .maybeSingle();
  if (!paciente) {
    console.log("María Demo no existe — nada que borrar.");
    return;
  }
  // CASCADE elimina consultas, fotos, recordatorios, notificaciones.
  const { error } = await supabase
    .from("pacientes")
    .delete()
    .eq("id", paciente.id);
  if (error) {
    console.error("Error borrando:", error.message);
    process.exit(1);
  }
  console.log("✓ María Demo borrada.");
}

async function upsertSeed() {
  const medico = await findMedico();

  // 1. Paciente (idempotente)
  let pacienteId: string;
  const { data: existing } = await supabase
    .from("pacientes")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("nombre", NOMBRE)
    .eq("apellido", APELLIDO)
    .maybeSingle();
  if (existing) {
    pacienteId = existing.id;
    console.log(`✓ Paciente existe: ${pacienteId}`);
  } else {
    const { data: inserted, error } = await supabase
      .from("pacientes")
      .insert({
        medico_id: medico.id,
        nombre: NOMBRE,
        apellido: APELLIDO,
        fecha_nacimiento: "1985-03-22",
        sexo: "F",
        tipo_piel_fitzpatrick: 3,
        cedula: "V-15.789.234",
        telefono: "+58 414 123 4567",
        email: "maria.demo@example.com",
        alergias: "Ninguna conocida",
        antecedentes: "Rosácea papulopustulosa, brote inicial reportado en marzo 2026.",
        medicacion_actual: "Metronidazol 0.75% crema, 2 veces/día desde 28/03/2026.",
        notas: "Paciente demo creada por seed Día 7 (Mirai). Borrar con --delete.",
      })
      .select("id")
      .single();
    if (error || !inserted) throw error ?? new Error("Insert paciente falló");
    pacienteId = inserted.id;
    console.log(`✓ Paciente creada: ${pacienteId}`);
  }

  // 2. Consultas espaciadas: 90, 80, 65 días atrás
  //    La última está a 65 días → triggea la regla paciente perdido
  //    amarillo (> 60 días sin contacto).
  const consultas = [
    {
      dias: 90,
      motivo: "Consulta inicial — pápulas y eritema en mejillas",
      anamnesis:
        "Paciente refiere brote de pápulas eritematosas en mejillas desde hace 6 semanas. Empeora con sol y bebidas calientes.",
      examen_fisico:
        "Pápulas y pústulas distribuidas en zona malar bilateral. Eritema persistente. Sin telangiectasias visibles.",
      diagnostico_diferencial: "Rosácea papulopustulosa (probable)",
      plan_terapeutico:
        "Iniciar metronidazol crema 0.75% 2 veces al día. Fotoprotector SPF 50+ diario. Evitar irritantes. Control en 8 semanas.",
    },
    {
      dias: 80,
      motivo: "Control inicial post-tratamiento",
      anamnesis:
        "Paciente refiere mejoría leve. Tolera bien tratamiento. Sin efectos adversos.",
      examen_fisico: "Reducción parcial de pápulas. Persistencia de eritema basal.",
      diagnostico_diferencial: "Rosácea — respuesta parcial",
      plan_terapeutico:
        "Continuar metronidazol crema. Considerar añadir ácido azelaico si en próximo control no hay respuesta completa. Control en 4 semanas.",
    },
    {
      dias: 65,
      motivo: "Control rutinario",
      anamnesis: "Refiere mejoría sostenida. Cumple con tratamiento.",
      examen_fisico:
        "Lesiones papulopustulosas casi resueltas. Eritema disminuido pero persiste.",
      diagnostico_diferencial: "Rosácea papulopustulosa — buena respuesta",
      plan_terapeutico:
        "Continuar tratamiento. Reforzar fotoprotección. Control en 4 semanas — evaluar eritema residual.",
    },
  ];

  // Limpiar consultas previas del seed (mensaje contiene 'seed Día 7')
  await supabase
    .from("consultas")
    .delete()
    .eq("paciente_id", pacienteId)
    .ilike("notas_ia->>seed", "true");

  for (const c of consultas) {
    const { error } = await supabase.from("consultas").insert({
      paciente_id: pacienteId,
      medico_id: medico.id,
      fecha: daysAgo(c.dias),
      motivo: c.motivo,
      anamnesis: c.anamnesis,
      examen_fisico: c.examen_fisico,
      diagnostico_diferencial: c.diagnostico_diferencial,
      plan_terapeutico: c.plan_terapeutico,
      estado: "completada",
      notas_ia: { seed: "true", dia: 7 },
    });
    if (error) throw new Error(`Insert consulta (${c.dias}d): ${error.message}`);
  }
  console.log(`✓ 3 consultas creadas (90d, 80d, 65d atrás).`);

  // 3. Recordatorio próximo (en próximas 12h) para validar la regla
  // del cron "recordatorios en próximas 24h → notificación".
  // Idempotente: dedup por (paciente_id, tipo, fecha::date).
  const en12h = new Date();
  en12h.setUTCHours(en12h.getUTCHours() + 12);
  const { error: recErr } = await supabase
    .from("recordatorios")
    .upsert(
      {
        paciente_id: pacienteId,
        medico_id: medico.id,
        tipo: "control",
        prioridad: "alta",
        auto_generado: false,
        fecha_objetivo: en12h.toISOString(),
        mensaje:
          "Control de evolución de rosácea. Evaluar respuesta a metronidazol.",
      },
      { onConflict: "paciente_id,tipo" } as never,
    );
  if (recErr && recErr.code !== "23505") {
    console.warn(`⚠ no se pudo crear recordatorio próximo: ${recErr.message}`);
  } else {
    console.log("✓ Recordatorio próximo creado (en ~12 horas).");
  }

  console.log("");
  console.log("─────────────────────────────────────────────────────");
  console.log("Listo. Para validar el e2e:");
  console.log("");
  console.log("1. Visita /pacientes y abre 'Demo (Mirai), María'");
  console.log("2. Verás 3 consultas, la más reciente de hace 30 días");
  console.log("3. Dispara el cron manualmente:");
  console.log(
    `   curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/evaluar-alertas`,
  );
  console.log("4. Refresca /dashboard — deberías ver la alerta amarilla:");
  console.log(
    "   '⚠ María Demo (Mirai) sin contacto hace 30 días'  (regla paciente perdido)",
  );
  console.log("");
  console.log("Para borrar: re-ejecuta con --delete");
  console.log("─────────────────────────────────────────────────────");
}

(async () => {
  if (shouldDelete) await deleteSeed();
  else await upsertSeed();
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
