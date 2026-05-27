/**
 * POST /api/ia/redactar-informe
 *
 * Toma los campos crudos de una consulta (S/O/A/P + datos del paciente
 * + récipes + recordatorios) y devuelve la MISMA información reescrita
 * en prosa formal de informe médico.
 *
 * Reglas inviolables (CLAUDE.md §2 + safety): NO inventa, NO agrega
 * diagnósticos, NO modifica dosis, NO cambia plan. Solo pule la
 * gramática y el tono. Si el médico escribió "paciente refiere mejoría"
 * el output puede ser "La paciente refiere mejoría clínica" — el
 * contenido clínico es idéntico.
 *
 * Modelo: Sonnet 4.6 (razonamiento de redacción profesional). Cost
 * típico ~$0.005-0.015 por informe según largo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { runClinicalCall } from "@/lib/claude";
import { anonymizeText } from "@/lib/anonimizar";
import type { Database } from "@/types/database";

const SONNET_INPUT_USD_PER_MTOK = 3.0;
const SONNET_OUTPUT_USD_PER_MTOK = 15.0;
const costUsd = (inT: number, outT: number) =>
  (inT * SONNET_INPUT_USD_PER_MTOK) / 1_000_000 +
  (outT * SONNET_OUTPUT_USD_PER_MTOK) / 1_000_000;

// =====================================================================
// Request
// =====================================================================

const requestSchema = z.object({
  paciente_id: z.string().uuid(),
  /** Campos crudos del SOAP que el médico escribió */
  motivo: z.string().max(2000).default(""),
  anamnesis: z.string().max(8000).default(""),
  examen_fisico: z.string().max(8000).default(""),
  diagnostico_diferencial: z.string().max(4000).default(""),
  plan_terapeutico: z.string().max(8000).default(""),
});

// =====================================================================
// Response
// =====================================================================

const responseSchema = z.object({
  motivo_consulta: z.string(),
  antecedentes: z.string(),
  anamnesis: z.string(),
  examen_fisico: z.string(),
  diagnostico: z.string(),
  plan: z.string(),
  recomendaciones: z.string(),
});

// =====================================================================
// Prompt
// =====================================================================

const SYSTEM_PROMPT = `Eres un redactor de informes médicos para dermatología. NO eres un asistente clínico.

Tu único trabajo: tomar el contenido crudo de una consulta (lo que el médico escribió o dictó, a veces en estilo telegráfico) y devolverlo REESCRITO en prosa formal de informe médico, manteniendo EXACTAMENTE la misma información clínica.

REGLAS INVIOLABLES:

1. NO inventes datos. Si el médico no escribió antecedentes, en la sección antecedentes pones "Sin antecedentes patológicos referidos" o lo que él dejó.
2. NO agregues diagnósticos, hipótesis ni diferenciales que el médico no escribió.
3. NO cambies dosis, medicamentos, frecuencias ni tiempos.
4. NO incluyas PII (nombre, cédula, teléfono) — el sistema ya anonimizó. Usa "el paciente" o "la paciente".
5. SIEMPRE devuelve JSON parseable, sin markdown, sin code fences.
6. Lenguaje: español formal médico LATAM, tercera persona, sin coloquialismos.

ESTILO:
- "paciente refiere mejoría" → "La paciente refiere mejoría clínica significativa."
- "pápulas en mejillas reducidas" → "Al examen físico se evidencia reducción significativa de las lesiones papulares en mejillas."
- "control en 4 semanas" → "Se programa control en cuatro semanas para evaluar respuesta al tratamiento."

FORMATO EXACTO DEL JSON:

{
  "motivo_consulta": "Párrafo único con el motivo, redactado formalmente",
  "antecedentes": "Resumen de antecedentes patológicos, alergias, medicación actual relevante. Si no hay datos, indícalo.",
  "anamnesis": "Relato narrativo de la anamnesis. Si el input es telegráfico, conviértelo en prosa.",
  "examen_fisico": "Hallazgos al examen físico en prosa estructurada.",
  "diagnostico": "El diagnóstico o diagnósticos diferenciales que el médico planteó, reformulados formalmente.",
  "plan": "Plan terapéutico detallado: medicamentos con posología tal como los escribió el médico, recomendaciones generales.",
  "recomendaciones": "Recomendaciones para el paciente, seguimiento, signos de alarma si los hubiera mencionado. Si el plan menciona control en X tiempo, refléjalo aquí también."
}

Ahora redacta el siguiente caso:`;

function isTextBlock(b: { type: string }): b is { type: "text"; text: string } {
  return b.type === "text" && typeof (b as { text?: unknown }).text === "string";
}

function stripJsonFences(text: string): string {
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence && fence[1]) return fence[1].trim();
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) return brace[0];
  return text;
}

function adminClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: Request) {
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido." },
      { status: 400 },
    );
  }

  // Confirm paciente belongs to médico + get name for anonymization
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido, alergias, antecedentes, medicacion_actual")
    .eq("id", parsed.data.paciente_id)
    .maybeSingle();
  if (!paciente) {
    return NextResponse.json(
      { error: "Paciente no encontrado." },
      { status: 404 },
    );
  }

  const fullName = `${paciente.nombre} ${paciente.apellido}`;

  // Build anonymized user message with all the raw fields
  const userPayload = [
    `MOTIVO: ${parsed.data.motivo || "—"}`,
    `ANAMNESIS: ${parsed.data.anamnesis || "—"}`,
    `EXAMEN FÍSICO: ${parsed.data.examen_fisico || "—"}`,
    `DIAGNÓSTICO DIFERENCIAL: ${parsed.data.diagnostico_diferencial || "—"}`,
    `PLAN TERAPÉUTICO: ${parsed.data.plan_terapeutico || "—"}`,
    `ALERGIAS: ${paciente.alergias || "Ninguna referida"}`,
    `ANTECEDENTES: ${paciente.antecedentes || "Sin antecedentes referidos"}`,
    `MEDICACIÓN ACTUAL: ${paciente.medicacion_actual || "Ninguna"}`,
  ].join("\n\n");

  const anonymized = anonymizeText(userPayload, fullName);

  const t0 = Date.now();
  try {
    const response = await runClinicalCall({
      mode: "CASO_CLINICO", // Sonnet para redacción profesional
      maxTokens: 2000,
      systemPromptOverride: SYSTEM_PROMPT,
      userMessages: [{ role: "user", content: anonymized }],
    });

    const latencyMs = Date.now() - t0;
    const inTok = response.usage?.input_tokens ?? 0;
    const outTok = response.usage?.output_tokens ?? 0;
    const cost = costUsd(inTok, outTok);

    // eslint-disable-next-line no-console
    console.log(
      `[claude-call] mode=redactar_informe model=${response.model} prompt_tokens=${inTok} completion_tokens=${outTok} est_cost_usd=${cost.toFixed(6)} latency_ms=${latencyMs}`,
    );

    try {
      const admin = adminClient();
      await admin.from("uso_ia").insert({
        medico_id: user.id,
        consulta_id: null,
        modo: "caso_clinico",
        modelo: response.model,
        tokens_input: inTok,
        tokens_output: outTok,
        costo_usd: Number(cost.toFixed(6)),
        latency_ms: latencyMs,
        estado: "completed",
      });
    } catch (logErr) {
      console.error(
        `[uso_ia redactar_informe] insert failed: ${logErr instanceof Error ? logErr.message : "unknown"}`,
      );
    }

    let raw = "";
    for (const block of response.content) {
      if (isTextBlock(block)) {
        raw = block.text.trim();
        break;
      }
    }
    let modelJson: unknown;
    try {
      modelJson = JSON.parse(stripJsonFences(raw));
    } catch {
      return NextResponse.json(
        { error: "La IA respondió en formato inesperado." },
        { status: 502 },
      );
    }

    const responseParsed = responseSchema.safeParse(modelJson);
    if (!responseParsed.success) {
      return NextResponse.json(
        { error: "La IA respondió con campos inesperados." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ...responseParsed.data,
        tokens_used: {
          input: inTok,
          output: outTok,
          total: inTok + outTok,
          estimated_cost_usd: cost,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[claude-call] mode=redactar_informe FAILED error="${msg}"`);
    return NextResponse.json(
      { error: "No pudimos generar la redacción." },
      { status: 500 },
    );
  }
}
