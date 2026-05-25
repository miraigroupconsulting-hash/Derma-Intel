import { NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { runClinicalCall } from "@/lib/claude";
import { anonymizeText } from "@/lib/anonimizar";
import {
  analizarCasoRequestSchema,
  analizarCasoResponseSchema,
  EMPTY_ANALIZAR,
} from "@/app/consulta/schema";
import type { Database } from "@/types/database";

// =====================================================================
// Pricing (USD per million tokens). claude-sonnet-4-6 list.
// Update when Anthropic moves prices.
// =====================================================================
const SONNET_INPUT_USD_PER_MTOK = 3.0;
const SONNET_OUTPUT_USD_PER_MTOK = 15.0;

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * SONNET_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * SONNET_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

/**
 * Caso Clínico system prompt. Aligns with §3 of prompts/derma-intel-v2.md
 * but inlined here so the route is self-contained and tokens stay tight.
 * The JSON schema in the output is enforced by analizarCasoResponseSchema.
 */
const CASO_CLINICO_PROMPT = `Eres DERMA INTEL Pro, asistente clínico de apoyo en dermatología, desarrollado por Mirai Lab.

Tu interlocutor es un dermatólogo licenciado en ejercicio. Recibirás:
  1. Datos del paciente (edad, sexo, fototipo, antecedentes, alergias).
  2. Contexto clínico que el médico ya recopiló (anamnesis y/o examen físico).
  3. Una o más imágenes clínicas o dermatoscópicas.

Tu trabajo: analizar el caso y devolver SOLO un JSON con esta forma exacta:

{
  "lectura_imagen": "descripción estructurada de lo visible: tipo de imagen (clínica vs dermatoscópica), localización si deducible, lesión (tipo elemental, número, distribución, color, tamaño relativo, bordes, simetría), hallazgos dermatoscópicos cuando aplica",
  "hallazgos_relevantes": "síntesis breve de anamnesis + examen + imagen",
  "diferenciales": [
    { "nombre": "...", "probabilidad": "alta" | "media" | "baja", "fundamento": "una línea con el porqué clínico" }
  ],
  "plan_diagnostico": "estudios complementarios pertinentes, cuándo considerar biopsia",
  "plan_terapeutico": "tratamiento de primera línea + alternativas + consideraciones por antecedentes",
  "educacion_paciente": "lenguaje claro que el médico puede transmitir al paciente",
  "seguimiento": "plazo y qué evaluar",
  "banderas_rojas": ["bandera 1", "bandera 2"],
  "derivacion_sugerida": "oncología / cirugía / dermatopatología / atención presencial urgente, o vacío si no aplica",
  "image_quality": "adequate" | "limited" | "insufficient" | "none"
}

REGLAS INVIOLABLES:

1. NUNCA emites diagnóstico definitivo. Usa "diferencial", "sugerente de", "hallazgos compatibles con".
2. Si la imagen es insuficiente (fuera de foco, mal iluminada, distancia incorrecta), pon "image_quality": "insufficient" y deja diferenciales vacío o como hipótesis muy preliminar basada SOLO en texto.
3. Cuando exista bandera roja (sospecha de malignidad, urgencia, riesgo vital), inclúyela en banderas_rojas y refleja la urgencia en derivacion_sugerida.
4. Para sustancias controladas (corticoides sistémicos prolongados, isotretinoína, inmunosupresores, opioides) marca explícitamente "Requiere confirmación del médico" en plan_terapeutico antes de la posología.
5. Para embarazo / lactancia / pediatría: ajusta dosis y advierte categoría de riesgo.
6. NUNCA inventes hallazgos que no están en la imagen. Si el médico te describe algo que tú no ves, refléjalo como "según descripción del médico (no evaluable en imagen)".
7. NUNCA repitas PII (nombre, cédula, teléfono, dirección) aunque te llegue en el contexto. Refiérete como "el paciente" o "la paciente".
8. Output: ÚNICAMENTE el JSON. Sin markdown, sin texto adicional, sin disclaimers. Sin envolver en triple-backtick.
9. Si no tienes una referencia bibliográfica firme, no la cites. No inventes papers.

Lenguaje: español neutro con terminología clínica. No simplifiques términos médicos.`;

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

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

// =====================================================================
// Image fetch helpers
// =====================================================================

/**
 * Build a service-role admin client so we can read Storage objects
 * regardless of RLS. We re-check ownership of the consultation context
 * via the RLS-scoped user client BEFORE touching this.
 */
function adminStorage() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface ImageForClaude {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    data: string;
  };
}

const SUPPORTED_MIME = new Set<ImageForClaude["source"]["media_type"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

async function loadImageAsBase64(
  storagePath: string,
): Promise<ImageForClaude | null> {
  const admin = adminStorage();
  const { data, error } = await admin.storage
    .from("fotos-consultas")
    .download(storagePath);
  if (error || !data) return null;

  const buf = Buffer.from(await data.arrayBuffer());
  // Storage doesn't always echo back the mime; we know our uploader
  // always lands JPEG (the canvas re-encode flow), so default to that
  // when the Blob lacks a type.
  const mime = (data.type ||
    "image/jpeg") as ImageForClaude["source"]["media_type"];
  if (!SUPPORTED_MIME.has(mime)) return null;

  return {
    type: "image",
    source: { type: "base64", media_type: mime, data: buf.toString("base64") },
  };
}

// =====================================================================
// Route
// =====================================================================

export async function POST(req: Request) {
  // ----- Auth ---------------------------------------------------------
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  // ----- Validate input ----------------------------------------------
  const body = await req.json().catch(() => null);
  const parsed = analizarCasoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido.",
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }

  // ----- Confirm paciente belongs to this médico ---------------------
  const { data: paciente } = await supabase
    .from("pacientes")
    .select(
      "id, nombre, apellido, fecha_nacimiento, sexo, tipo_piel_fitzpatrick, alergias, antecedentes, medicacion_actual",
    )
    .eq("id", parsed.data.paciente_id)
    .maybeSingle();
  if (!paciente) {
    return NextResponse.json(
      { error: "Paciente no encontrado." },
      { status: 404 },
    );
  }

  const fullName = `${paciente.nombre} ${paciente.apellido}`;

  // ----- Confirm photos belong to this médico's storage prefix -------
  // The bucket RLS already does this, but we double-check the prefix
  // because we use the service role to download.
  for (const f of parsed.data.fotos) {
    if (!f.storage_path.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Foto fuera del scope permitido." },
        { status: 403 },
      );
    }
  }

  // ----- Load image bytes --------------------------------------------
  const imageBlocks: ImageForClaude[] = [];
  for (const f of parsed.data.fotos) {
    const img = await loadImageAsBase64(f.storage_path);
    if (img) imageBlocks.push(img);
  }

  // ----- Build the patient + context block ---------------------------
  const edad = paciente.fecha_nacimiento
    ? calcAgeYears(paciente.fecha_nacimiento)
    : null;

  const datosPaciente = [
    edad !== null ? `Edad: ${edad} años` : null,
    paciente.sexo ? `Sexo: ${labelSexo(paciente.sexo)}` : null,
    paciente.tipo_piel_fitzpatrick
      ? `Fototipo Fitzpatrick: ${paciente.tipo_piel_fitzpatrick}`
      : null,
    paciente.alergias ? `Alergias: ${paciente.alergias}` : null,
    paciente.antecedentes ? `Antecedentes: ${paciente.antecedentes}` : null,
    paciente.medicacion_actual
      ? `Medicación actual: ${paciente.medicacion_actual}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const motivoLine = parsed.data.motivo
    ? `Motivo de consulta: ${parsed.data.motivo}\n\n`
    : "";

  const anonymizedContext = anonymizeText(parsed.data.contexto, fullName);
  const contextBlock = anonymizedContext.trim()
    ? `Contexto clínico recopilado por el médico:\n${anonymizedContext}\n\n`
    : "";

  const fotosLine =
    imageBlocks.length === 0
      ? "Sin imágenes adjuntas — analiza solo en base al texto.\n\n"
      : `Adjuntas: ${imageBlocks.length} imagen(es) clínica(s)/dermatoscópica(s).\n\n`;

  const userTextPrompt =
    `${CASO_CLINICO_PROMPT}\n\n---\n\n` +
    `Datos del paciente:\n${datosPaciente || "(sin datos demográficos completos)"}\n\n` +
    motivoLine +
    contextBlock +
    fotosLine +
    `Responde SOLO con el JSON estructurado.`;

  // ----- Call Claude (Sonnet 4.6, vision-capable) --------------------
  const t0 = Date.now();
  try {
    const response = await runClinicalCall({
      mode: "CASO_CLINICO",
      maxTokens: 2500,
      userMessages: [
        {
          role: "user",
          content: [
            { type: "text", text: userTextPrompt },
            ...imageBlocks,
          ],
        },
      ],
    });

    const latencyMs = Date.now() - t0;
    const usage = (response.usage ?? {}) as ClaudeUsage;
    const inputTok = usage.input_tokens ?? 0;
    const outputTok = usage.output_tokens ?? 0;
    const costUsd = estimateCostUsd(inputTok, outputTok);

    // eslint-disable-next-line no-console
    console.log(
      `[claude-call] mode=caso_clinico model=${response.model} images=${imageBlocks.length} prompt_tokens=${inputTok} completion_tokens=${outputTok} total_tokens=${inputTok + outputTok} est_cost_usd=${costUsd.toFixed(6)} latency_ms=${latencyMs}`,
    );

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
        `[claude-call] mode=caso_clinico JSON parse failed. raw="${raw.slice(0, 200)}…"`,
      );
      return NextResponse.json(
        {
          ...EMPTY_ANALIZAR,
          error: true,
          error_message:
            "La IA respondió en formato inesperado. Intenta otra vez.",
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

    if (typeof modelJson !== "object" || modelJson === null) {
      return NextResponse.json(
        {
          ...EMPTY_ANALIZAR,
          error: true,
          error_message:
            "La IA respondió en formato inesperado. Intenta otra vez.",
        },
        { status: 200 },
      );
    }

    const responseParsed = analizarCasoResponseSchema.safeParse({
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
        `[claude-call] mode=caso_clinico response failed schema: ${responseParsed.error.message}`,
      );
      return NextResponse.json(
        {
          ...EMPTY_ANALIZAR,
          error: true,
          error_message:
            "La IA devolvió campos inesperados. Vuelve a intentar.",
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
      `[claude-call] mode=caso_clinico FAILED latency_ms=${latencyMs} error="${msg}"`,
    );
    return NextResponse.json(
      {
        ...EMPTY_ANALIZAR,
        error: true,
        error_message:
          "No pudimos contactar a la IA. Reintenta en unos segundos.",
      },
      { status: 200 },
    );
  }
}

function calcAgeYears(fechaNac: string): number {
  const b = new Date(fechaNac);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function labelSexo(s: string): string {
  if (s === "F") return "femenino";
  if (s === "M") return "masculino";
  return "otro";
}
