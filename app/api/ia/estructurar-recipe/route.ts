/**
 * POST /api/ia/estructurar-recipe
 *
 * Parses free-text dictation (e.g. "metronidazol crema 0.75% dos veces
 * al día por 8 semanas") into a structured medicamentos[] array.
 *
 * This is a PARSER, not a clinical assistant: the system prompt
 * explicitly forbids recommending, substituting, or doubting any drug
 * the médico names. We extract what they said. The médico edits
 * before saving the récipe.
 *
 * Model: Haiku 4.5 (light parsing task, 5× cheaper than Sonnet).
 * Logs each call to public.uso_ia like the other endpoints.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { runClinicalCall } from "@/lib/claude";
import { anonymizeText } from "@/lib/anonimizar";
import { MEDICAMENTOS } from "@/lib/medicamentos";
import type { Database } from "@/types/database";

// =====================================================================
// Pricing — keep in sync with /api/ia/consultar route.
// =====================================================================
const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;
const costUsd = (inT: number, outT: number) =>
  (inT * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
  (outT * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000;

// =====================================================================
// Request / response shape
// =====================================================================

const requestSchema = z.object({
  paciente_id: z.string().uuid(),
  texto: z.string().trim().min(3, "Dictado muy corto.").max(4000),
});

const medicamentoStructured = z.object({
  nombre: z.string(),
  presentacion: z.string().nullable().default(null),
  concentracion: z.string().nullable().default(null),
  cantidad: z.string().nullable().default(null),
  frecuencia: z.string().nullable().default(null),
  duracion: z.string().nullable().default(null),
  via: z.string().nullable().default(null),
  zona: z.string().nullable().default(null),
  es_controlado: z.boolean().default(false),
  indicaciones: z.string().nullable().default(null),
});

const responseSchema = z.object({
  medicamentos: z.array(medicamentoStructured),
  indicaciones_generales: z.array(z.string()).default([]),
});

// =====================================================================
// System prompt — parsing only, no clinical opinions
// =====================================================================

const SYSTEM_PROMPT = `Eres un parser de récipes médicos. NO eres un asistente clínico.

Tu único trabajo: leer un texto crudo dictado por un dermatólogo y devolver UN JSON estructurado con los medicamentos mencionados, exactamente como el médico los nombró.

REGLAS INVIOLABLES:

1. NO sustituyas, NO recomiendes, NO dudes. Si el médico dictó "metronidazol crema 0.75%", devuelves eso. Si te suena raro, igual lo devuelves. El médico ya decidió.
2. NO inventes campos. Si el médico no mencionó duración, "duracion" = null. Igual para cantidad, frecuencia, vía, zona.
3. NO ajustes dosis. Devuelves la que él dictó tal cual.
4. NO traduzcas nombres comerciales a genéricos ni viceversa. Mantén lo que dijo.
5. NO incluyas PII (nombre del paciente, cédula, teléfono).
6. SIEMPRE devuelve JSON parseable. Nada de markdown, sin code fences, sin texto antes o después del JSON.
7. Si el texto contiene varios fármacos separados por "y", "además", "también", punto, párrafo nuevo, etc. — devuelves un objeto por cada fármaco en el array.

FORMA EXACTA DEL JSON (todos los campos opcionales pueden ser null):

{
  "medicamentos": [
    {
      "nombre": "string — nombre del fármaco como lo dictó el médico",
      "presentacion": "string | null — forma farmacéutica: crema, gel, tabletas, cápsulas, etc.",
      "concentracion": "string | null — ej '0.75%', '20 mg', '500 mg/5ml'",
      "cantidad": "string | null — ej '1 tubo', '30 cápsulas', 'caja por 10'",
      "frecuencia": "string | null — ej '2 veces al día', 'cada 8 horas', 'una vez al día'",
      "duracion": "string | null — ej '8 semanas', '15 días', '3 meses'",
      "via": "string | null — 'tópica', 'oral', 'intramuscular', 'subcutánea', 'inhalada'",
      "zona": "string | null — zona corporal si el médico la mencionó",
      "es_controlado": false,
      "indicaciones": "string | null — instrucción específica de uso si la dictó (ej 'tomar con comidas', 'aplicar de noche')"
    }
  ],
  "indicaciones_generales": ["array de strings con indicaciones globales mencionadas que no son de un fármaco específico (ej fotoprotección)"]
}

es_controlado: SIEMPRE devuelve false. El servidor decide ese campo comparando contra catálogo después de tu respuesta.

Ahora parsea el siguiente texto:`;

// =====================================================================
// Resolve es_controlado server-side via the local catalogue
// =====================================================================

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isControlado(nombreFromIa: string): boolean {
  const n = normalize(nombreFromIa);
  return MEDICAMENTOS.some((m) => {
    if (!m.controlado) return false;
    if (n.includes(normalize(m.nombre))) return true;
    return (m.comerciales ?? []).some((c) => n.includes(normalize(c)));
  });
}

// =====================================================================
// Helpers
// =====================================================================

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

// =====================================================================
// Route
// =====================================================================

export async function POST(req: Request) {
  // Auth
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  // Validate input
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido." },
      { status: 400 },
    );
  }

  // Confirm paciente ownership
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
      mode: "EXPRESS", // Haiku 4.5 — light parsing task
      maxTokens: 800,
      systemPromptOverride: SYSTEM_PROMPT,
      userMessages: [{ role: "user", content: anonymized }],
    });
    const latencyMs = Date.now() - t0;
    const inTok = response.usage?.input_tokens ?? 0;
    const outTok = response.usage?.output_tokens ?? 0;
    const cost = costUsd(inTok, outTok);

    // eslint-disable-next-line no-console
    console.log(
      `[claude-call] mode=recipe_parse model=${response.model} prompt_tokens=${inTok} completion_tokens=${outTok} total_tokens=${inTok + outTok} est_cost_usd=${cost.toFixed(6)} latency_ms=${latencyMs}`,
    );

    // Log to uso_ia (best-effort). modo enum doesn't cover this case
    // since it's not one of the 6 clinical modos — log as 'express'
    // (closest fit: Haiku, light task) so cost analytics still works.
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
      // eslint-disable-next-line no-console
      console.error(
        `[uso_ia recipe_parse] insert failed: ${logErr instanceof Error ? logErr.message : "unknown"}`,
      );
    }

    // Extract text + parse JSON
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
          medicamentos: [],
          indicaciones_generales: [],
        },
        { status: 200 },
      );
    }

    const responseParsed = responseSchema.safeParse(modelJson);
    if (!responseParsed.success) {
      return NextResponse.json(
        {
          error: "La IA respondió con campos inesperados.",
          medicamentos: [],
          indicaciones_generales: [],
        },
        { status: 200 },
      );
    }

    // Resolve es_controlado server-side from local catalogue. This is
    // more reliable than asking Claude to know the controlado list.
    const medsWithControl = responseParsed.data.medicamentos.map((m) => ({
      ...m,
      es_controlado: isControlado(m.nombre),
    }));

    return NextResponse.json(
      {
        medicamentos: medsWithControl,
        indicaciones_generales: responseParsed.data.indicaciones_generales,
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
    // eslint-disable-next-line no-console
    console.error(`[claude-call] mode=recipe_parse FAILED error="${msg}"`);
    return NextResponse.json(
      {
        error: "No pudimos parsear el dictado.",
        medicamentos: [],
        indicaciones_generales: [],
      },
      { status: 200 },
    );
  }
}
