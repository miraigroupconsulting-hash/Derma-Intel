import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runClinicalCall } from "@/lib/claude";
import { anonymizeText } from "@/lib/anonimizar";
import {
  estructurarSoapRequestSchema,
  estructurarSoapResponseSchema,
  EMPTY_SOAP,
} from "@/app/consulta/schema";

// =====================================================================
// Pricing (USD per million tokens). Update when Anthropic moves prices.
// claude-haiku-4-5 list price as of the build of this file.
// =====================================================================
const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

const SOAP_FROM_SCRATCH_PROMPT = `Eres un asistente especializado en estructurar transcripciones clínicas dermatológicas en formato SOAP.

Recibirás un texto crudo dictado por un dermatólogo durante o después de una consulta. Tu único trabajo es reorganizarlo en JSON con esta forma EXACTA:

{
  "subjetivo": "lo que el paciente reporta (síntomas, evolución, tiempo)",
  "objetivo": "hallazgos del examen físico (morfología, distribución, dermatoscopia si aplica)",
  "analisis": "impresión clínica inicial — diferenciales sugeridos, NUNCA diagnóstico definitivo",
  "plan": "conducta acordada o sugerida (estudios, tratamiento, derivación, control)",
  "anamnesis_completa": true | false,
  "datos_faltantes": ["edad si no se mencionó", "tiempo de evolución", "tratamientos previos", ...]
}

REGLAS INVIOLABLES:

1. NUNCA inventes datos. Si el médico no dictó algo, lo dejas vacío y agrégalo a datos_faltantes.
2. NUNCA escribas "diagnóstico" sin calificativo. Usa "diferenciales", "impresión", "hallazgos sugerentes de".
3. NUNCA repitas información personal identificable (nombres, cédulas, teléfonos, direcciones). Refiérete como "el/la paciente".
4. Mantén el tono y vocabulario clínico que el médico usó. No simplifiques términos técnicos.
5. Si el texto está desordenado (ej. el médico saltó del examen físico a la anamnesis), tú lo reorganizas correctamente.
6. Output: ÚNICAMENTE el JSON. Sin markdown, sin texto adicional, sin disclaimers. Solo el JSON parseable.

datos_faltantes debe incluir cosas críticas que NO se mencionaron pero que ayudarían (ej. tiempo de evolución, tratamientos previos, antecedentes relevantes, fototipo de piel, alergias).`;

/**
 * Build the merge-mode prompt. The médico has partially filled the four
 * SOAP fields already; the new text is an addendum that must be
 * classified and integrated into the section it logically belongs to,
 * leaving the others untouched.
 */
function buildMergePrompt(current: {
  subjetivo: string;
  objetivo: string;
  analisis: string;
  plan: string;
}): string {
  return `Eres un asistente especializado en estructurar transcripciones clínicas dermatológicas en formato SOAP.

El dermatólogo YA TIENE 4 secciones SOAP con contenido. Te entrega un fragmento NUEVO (texto dictado adicional) y necesita que lo integres en la sección que corresponda, SIN tocar las otras.

ESTADO ACTUAL DE LAS 4 SECCIONES:

[SUBJETIVO]
${current.subjetivo || "(vacío)"}

[OBJETIVO]
${current.objetivo || "(vacío)"}

[ANÁLISIS]
${current.analisis || "(vacío)"}

[PLAN]
${current.plan || "(vacío)"}

INSTRUCCIONES:

1. Clasifica el FRAGMENTO NUEVO en exactamente UNA de las 4 secciones según su contenido clínico:
   - Síntomas, tiempo de evolución, lo que dice el paciente → subjetivo
   - Hallazgos del examen físico, dermatoscopia → objetivo
   - Diferenciales, impresión clínica → analisis
   - Tratamiento, conducta, próximo control, derivación → plan
2. APPEND el fragmento al final de la sección que corresponde (no reemplazar — añadir con una línea en blanco entre el contenido previo y el nuevo).
3. Las otras 3 secciones se devuelven EXACTAMENTE como estaban.
4. Devuelve JSON con esta forma:

{
  "subjetivo": "...",
  "objetivo": "...",
  "analisis": "...",
  "plan": "...",
  "anamnesis_completa": true | false,
  "datos_faltantes": [...]
}

REGLAS INVIOLABLES:

1. NUNCA inventes datos. Solo reorganiza lo que ya está.
2. NUNCA escribas "diagnóstico" sin calificativo.
3. NUNCA incluyas información personal identificable (nombre, cédula, teléfono).
4. Mantén el tono clínico del médico.
5. Output: ÚNICAMENTE el JSON. Sin markdown, sin disclaimers, sin texto adicional.

Si el fragmento NUEVO es ambiguo y podría caer en dos secciones, escoge la más probable y NO dupliques.`;
}

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Narrow a ContentBlock from the Anthropic SDK to its text shape. The
 * SDK's published `TextBlock` type carries a few extra fields (citations,
 * etc.) we don't care about; this guard keeps the call site terse.
 */
function isTextBlock(b: { type: string }): b is { type: "text"; text: string } {
  return b.type === "text" && typeof (b as { text?: unknown }).text === "string";
}

export async function POST(req: Request) {
  // ----- Auth check ---------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sesión expirada." },
      { status: 401 },
    );
  }

  // ----- Parse + validate input ---------------------------------------
  const body = await req.json().catch(() => null);
  const parsed = estructurarSoapRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido.",
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }

  // ----- Confirm paciente belongs to this médico ----------------------
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("id", parsed.data.paciente_id)
    .maybeSingle();
  if (!paciente) {
    return NextResponse.json(
      { error: "Paciente no encontrado." },
      { status: 404 },
    );
  }

  // ----- Anonymize the dictated text BEFORE sending to IA -------------
  const fullName = `${paciente.nombre} ${paciente.apellido}`;
  const anonymized = anonymizeText(parsed.data.texto, fullName);

  // Anonymize current SOAP too (defense in depth — names sometimes
  // slip into a manually-typed field).
  const anonymizedCurrent = parsed.data.current_soap
    ? {
        subjetivo: anonymizeText(parsed.data.current_soap.subjetivo, fullName),
        objetivo: anonymizeText(parsed.data.current_soap.objetivo, fullName),
        analisis: anonymizeText(parsed.data.current_soap.analisis, fullName),
        plan: anonymizeText(parsed.data.current_soap.plan, fullName),
      }
    : null;

  const isMergeMode =
    !!anonymizedCurrent &&
    (anonymizedCurrent.subjetivo.trim().length > 0 ||
      anonymizedCurrent.objetivo.trim().length > 0 ||
      anonymizedCurrent.analisis.trim().length > 0 ||
      anonymizedCurrent.plan.trim().length > 0);

  const systemPrompt = isMergeMode
    ? buildMergePrompt(anonymizedCurrent!)
    : SOAP_FROM_SCRATCH_PROMPT;

  const userTurn = isMergeMode
    ? `FRAGMENTO NUEVO A INTEGRAR:\n\n${anonymized}\n\nResponde SOLO con el JSON de las 4 secciones (con el fragmento integrado en la que corresponde).`
    : `TEXTO A ESTRUCTURAR:\n\n${anonymized}\n\nResponde SOLO con el JSON estructurado.`;

  // ----- Call Claude --------------------------------------------------
  const t0 = Date.now();
  try {
    const response = await runClinicalCall({
      mode: "EXPRESS", // Haiku 4.5 — light/cheap, perfect for SOAP shaping
      maxTokens: 1500,
      userMessages: [
        {
          role: "user",
          content: `${systemPrompt}\n\n---\n\n${userTurn}`,
        },
      ],
    });

    const latencyMs = Date.now() - t0;
    const usage = (response.usage ?? {}) as ClaudeUsage;
    const inputTok = usage.input_tokens ?? 0;
    const outputTok = usage.output_tokens ?? 0;
    const costUsd = estimateCostUsd(inputTok, outputTok);

    // Structured log line for cost tracking. Grep "[claude-call]" in
    // server logs to aggregate.
    // eslint-disable-next-line no-console
    console.log(
      `[claude-call] mode=soap submode=${isMergeMode ? "merge" : "scratch"} model=${response.model} prompt_tokens=${inputTok} completion_tokens=${outputTok} total_tokens=${inputTok + outputTok} est_cost_usd=${costUsd.toFixed(6)} latency_ms=${latencyMs}`,
    );

    // ----- Extract + parse JSON from the model's text reply -----------
    let raw = "";
    for (const block of response.content) {
      if (isTextBlock(block)) {
        raw = block.text.trim();
        break;
      }
    }
    const jsonText = stripJsonFences(raw);

    let modelJson: unknown;
    try {
      modelJson = JSON.parse(jsonText);
    } catch {
      // eslint-disable-next-line no-console
      console.error(
        `[claude-call] JSON parse failed. raw="${raw.slice(0, 200)}…"`,
      );
      return NextResponse.json(
        {
          ...EMPTY_SOAP,
          subjetivo: parsed.data.texto,
          error: true,
          error_message:
            "La IA respondió en formato inesperado. Puedes editar manualmente.",
          tokens_used: {
            input: inputTok,
            output: outputTok,
            total: inputTok + outputTok,
            estimated_cost_usd: costUsd,
          },
        },
        { status: 200 },
      );
    }

    // ----- Validate against our schema --------------------------------
    if (typeof modelJson !== "object" || modelJson === null) {
      return NextResponse.json(
        {
          ...EMPTY_SOAP,
          subjetivo: parsed.data.texto,
          error: true,
          error_message:
            "La IA respondió en formato inesperado. Puedes editar manualmente.",
        },
        { status: 200 },
      );
    }
    const responseParsed = estructurarSoapResponseSchema.safeParse({
      ...(modelJson as Record<string, unknown>),
      tokens_used: {
        input: inputTok,
        output: outputTok,
        total: inputTok + outputTok,
        estimated_cost_usd: costUsd,
      },
    });
    if (!responseParsed.success) {
      // eslint-disable-next-line no-console
      console.error(
        `[claude-call] response failed schema validation: ${responseParsed.error.message}`,
      );
      return NextResponse.json(
        {
          ...EMPTY_SOAP,
          subjetivo: parsed.data.texto,
          error: true,
          error_message:
            "La IA respondió con campos inesperados. Puedes editar manualmente.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(responseParsed.data, { status: 200 });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : "unknown";
    // eslint-disable-next-line no-console
    console.error(
      `[claude-call] mode=soap FAILED latency_ms=${latencyMs} error="${msg}"`,
    );
    return NextResponse.json(
      {
        ...EMPTY_SOAP,
        subjetivo: parsed.data.texto,
        error: true,
        error_message:
          "No pudimos contactar a la IA. Puedes seguir editando manualmente y guardar igual.",
      },
      { status: 200 },
    );
  }
}

/**
 * Some Claude responses wrap the JSON in a ```json fenced block even
 * though we asked them not to. Strip the fence so JSON.parse succeeds.
 */
function stripJsonFences(text: string): string {
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();
  // Sometimes there's leading prose; grab the first {...} block.
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}
