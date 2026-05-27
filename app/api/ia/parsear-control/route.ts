/**
 * POST /api/ia/parsear-control
 *
 * Lee texto libre (típicamente plan_terapeutico de una consulta o
 * dictado adicional) y extrae si la médica mencionó programar un
 * control, en cuántos días, y qué tipo. El servidor decide si crear
 * el recordatorio; este endpoint solo parsea.
 *
 * Es un PARSER + asesor conservador, NO un asistente clínico. El
 * prompt aplica reglas defensivas para tratamientos críticos: si el
 * texto menciona isotretinoína sin control mensual, sugiere uno; nunca
 * sugiere períodos peligrosos largos para meds críticos.
 *
 * Modelo: Haiku 4.5 (parser ligero).
 * Logs en uso_ia como 'express' (Haiku, light task) — consistente con
 * estructurar-recipe.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { runClinicalCall } from "@/lib/claude";
import { anonymizeText } from "@/lib/anonimizar";
import type { Database } from "@/types/database";

const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;
const costUsd = (inT: number, outT: number) =>
  (inT * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
  (outT * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000;

const requestSchema = z.object({
  paciente_id: z.string().uuid(),
  texto: z.string().trim().min(3).max(4000),
});

const responseSchema = z.object({
  hay_control_programado: z.boolean(),
  dias_desde_hoy: z.number().int().min(0).max(365).nullable().default(null),
  tipo: z
    .enum(["control_clinico", "control_laboratorio", "control_evolucion"])
    .nullable()
    .default(null),
  notas: z.string().nullable().default(null),
  /** Tratamiento crítico detectado que exige control mensual mínimo */
  tratamiento_critico_detectado: z.string().nullable().default(null),
  /** Si el médico NO mencionó control pero el sistema lo recomienda */
  sugerencia_sistema: z.string().nullable().default(null),
});

const SYSTEM_PROMPT = `Eres un parser conservador de planes terapéuticos en dermatología. NO eres un asistente clínico.

Tu único trabajo: leer un plan/dictado y devolver UN JSON estructurado describiendo si el médico programó un control, en cuánto tiempo, y de qué tipo.

REGLAS INVIOLABLES:

1. NO inventes controles. Si el médico no mencionó control, "hay_control_programado" = false y "dias_desde_hoy" = null.
2. NO sugieras controles más cortos que lo que el médico escribió. Si dijo "control en 8 semanas", devuelves 56 días.
3. NO sugieras controles más largos que lo seguro para tratamientos críticos:
   - Isotretinoína: control mensual OBLIGATORIO (28-31 días). Si el plan dice "isotretinoína" y NO menciona control mensual, marca tratamiento_critico_detectado="isotretinoína" y sugerencia_sistema="Control mensual con laboratorio (transaminasas, perfil lipídico) y evaluación clínica es estándar de práctica para isotretinoína oral".
   - Inmunosupresores sistémicos (metotrexato, ciclosporina, azatioprina): control mensual.
   - Antibióticos sistémicos prolongados (doxiciclina/minociclina): control a 6-8 semanas.
4. NO traduzcas frases comerciales a genéricos.
5. NO incluyas PII.
6. SIEMPRE devuelve JSON parseable. Sin markdown, sin code fences.

CONVERSIONES SEMÁNTICAS:
- "control en X semanas" → X * 7
- "control en un mes" → 30
- "lo veo en 6 semanas" → 42
- "control quincenal" → 14
- "control mensual" → 30
- "control en 3 meses" → 90

TIPOS:
- control_clinico: revisión visual / examen físico
- control_laboratorio: cuando se mencionan exámenes (perfil hepático, hemograma, transaminasas, etc.)
- control_evolucion: respuesta a tratamiento, foto-evolución

FORMA EXACTA DEL JSON:

{
  "hay_control_programado": boolean,
  "dias_desde_hoy": number | null,
  "tipo": "control_clinico" | "control_laboratorio" | "control_evolucion" | null,
  "notas": "Breve descripción del propósito del control (max 200 chars)" | null,
  "tratamiento_critico_detectado": "nombre del medicamento crítico" | null,
  "sugerencia_sistema": "Recomendación adicional cuando el médico omitió un control crítico" | null
}

Ahora parsea el siguiente texto:`;

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

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("id", parsed.data.paciente_id)
    .maybeSingle();
  if (!paciente) {
    return NextResponse.json({ error: "Paciente no encontrado." }, { status: 404 });
  }

  const fullName = `${paciente.nombre} ${paciente.apellido}`;
  const anonymized = anonymizeText(parsed.data.texto, fullName);

  const t0 = Date.now();
  try {
    const response = await runClinicalCall({
      mode: "EXPRESS",
      maxTokens: 400,
      systemPromptOverride: SYSTEM_PROMPT,
      userMessages: [{ role: "user", content: anonymized }],
    });
    const latencyMs = Date.now() - t0;
    const inTok = response.usage?.input_tokens ?? 0;
    const outTok = response.usage?.output_tokens ?? 0;
    const cost = costUsd(inTok, outTok);

    try {
      const admin = adminClient();
      await admin.from("uso_ia").insert({
        medico_id: user.id,
        consulta_id: null,
        modo: "express",
        modelo: response.model,
        tokens_input: inTok,
        tokens_output: outTok,
        costo_usd: Number(cost.toFixed(6)),
        latency_ms: latencyMs,
        estado: "completed",
      });
    } catch (logErr) {
      console.error(
        `[uso_ia parsear_control] insert failed: ${logErr instanceof Error ? logErr.message : "unknown"}`,
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
        {
          error: "La IA respondió en formato inesperado.",
          hay_control_programado: false,
          dias_desde_hoy: null,
          tipo: null,
          notas: null,
        },
        { status: 200 },
      );
    }

    const responseParsed = responseSchema.safeParse(modelJson);
    if (!responseParsed.success) {
      return NextResponse.json(
        {
          error: "La IA respondió con campos inesperados.",
          hay_control_programado: false,
          dias_desde_hoy: null,
          tipo: null,
          notas: null,
        },
        { status: 200 },
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
    console.error(`[claude-call] mode=parsear_control FAILED error="${msg}"`);
    return NextResponse.json(
      {
        error: "No pudimos parsear el plan.",
        hay_control_programado: false,
      },
      { status: 200 },
    );
  }
}
