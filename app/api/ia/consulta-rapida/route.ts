/**
 * POST /api/ia/consulta-rapida
 *
 * Endpoint para el flujo "Consulta rápida" — la médica adjunta hasta
 * 5 fotos efímeras + un contexto en texto y recibe el análisis IA
 * SIN necesidad de crear paciente, consulta, ni persistir nada.
 *
 * Diferencias clave con /api/ia/analizar-caso:
 *   - NO requiere paciente_id (no hay paciente)
 *   - NO descarga fotos de Storage (vienen inline en base64)
 *   - NO anonimización (no hay nombre/cédula/etc. en el request)
 *   - Mismo prompt clínico (CASO_CLINICO_PROMPT) — la respuesta usa la
 *     misma JSON shape que /api/ia/analizar-caso para que la UI
 *     comparta el AnalisisIaPanel
 *   - Log a uso_ia con consulta_id=null + paciente_id=null para
 *     analytics de costo
 *
 * Las fotos NUNCA tocan Supabase Storage en este flujo — viajan
 * directo del browser de la médica a Anthropic vía nuestro server,
 * sin persistirse. Si la médica quiere guardar el caso, lo convierte
 * después en un paciente real desde la UI.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { runStructuredClinicalCall } from "@/lib/claude";
import {
  analizarCasoResponseSchema,
  ANALISIS_TOOL_INPUT_SCHEMA,
} from "@/app/consulta/schema";
import type { Database } from "@/types/database";

// El análisis con visión + tool use puede tardar ~40-50s. El default de
// función serverless en Vercel Hobby es bajo; lo fijamos al máximo (60s)
// para que la respuesta alcance a volver. El prompt pide brevedad para
// mantener la latencia real bien por debajo de este techo.
export const maxDuration = 60;

const SONNET_INPUT_USD_PER_MTOK = 3.0;
const SONNET_OUTPUT_USD_PER_MTOK = 15.0;
const costUsd = (inT: number, outT: number) =>
  (inT * SONNET_INPUT_USD_PER_MTOK) / 1_000_000 +
  (outT * SONNET_OUTPUT_USD_PER_MTOK) / 1_000_000;

// =====================================================================
// Request shape
// =====================================================================

const SUPPORTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const requestSchema = z.object({
  contexto: z.string().trim().max(8000).default(""),
  fotos: z
    .array(
      z.object({
        base64: z.string().min(50, "Imagen muy pequeña."),
        mime: z.enum(SUPPORTED_MIME),
        tipo: z.enum(["clinica", "dermatoscopia"]).default("clinica"),
      }),
    )
    .min(1, "Adjunta al menos una imagen.")
    .max(5, "Máximo 5 imágenes por consulta rápida."),
});

// =====================================================================
// System prompt — same conservative spec as /analizar-caso, but
// adapted to "no patient profile" case.
// =====================================================================

const SYSTEM_PROMPT = `Eres DERMA INTEL Pro, asistente clínico de apoyo en dermatología, desarrollado por Mirai Lab.

Tu interlocutor es un dermatólogo licenciado en ejercicio que está haciendo una CONSULTA RÁPIDA: te pasa fotos + un contexto breve para que le des una lectura inicial. NO hay paciente registrado en el sistema; es un caso ad-hoc.

Recibirás:
  1. Una o más imágenes clínicas o dermatoscópicas.
  2. Contexto en texto que el médico provee (puede ser breve, telegráfico, o estar vacío).

Tu trabajo: analizar el caso y devolver tu lectura estructurada llamando a la herramienta "emitir_analisis". Llena todos sus campos; deja como cadena vacía o arreglo vacío los que no apliquen.

REGLAS INVIOLABLES:

1. NUNCA emites diagnóstico definitivo. Usa "diferencial", "sugerente de", "hallazgos compatibles con".
2. Si la imagen es insuficiente, pon image_quality "insufficient" y deja diferenciales como hipótesis preliminar basada en lo que haya.
3. Para banderas rojas (sospecha de malignidad, urgencia, riesgo vital) inclúyelas explícitamente y refleja la urgencia en derivacion_sugerida.
4. Para sustancias controladas (corticoides sistémicos prolongados, isotretinoína, inmunosupresores) marca "Requiere confirmación del médico" antes de cualquier posología.
5. Como NO hay paciente identificado, NO asumas edad, sexo, antecedentes ni fototipo a menos que el médico los mencione en contexto. Si la decisión clínica depende de esos datos, dilo: "Conducta depende de edad/comorbilidades a confirmar".
6. NUNCA inventes hallazgos que no están en la imagen.
7. BREVEDAD OBLIGATORIA (la médica está entre pacientes y necesita la lectura rápida): cada campo de texto en 1-2 frases cortas, telegráficas. Máximo 3 diagnósticos diferenciales salvo necesidad clínica clara. No repitas información entre campos. Términos técnicos sí, pero sin relleno ni párrafos largos.
8. Si no tienes referencia bibliográfica firme, no la cites.

LENGUAJE OBLIGATORIO — Médico-técnico formal LATAM, sin coloquialismos:

- Lesiones elementales: usa el término técnico (pápula, mácula, vesícula, pústula, nódulo, placa, habón, escara, costra serosa/hemática/melicérica, descamación furfurácea/laminar) — NO "granito", "manchita".
- Eritema, prurito, ardor. NO "rojo", "picazón".
- Localización con anatomía descriptiva: "región malar bilateral" no "mejillas"; "cara extensora de antebrazos" no "brazos por fuera".
- Distribución: simétrica, asimétrica, fotodistribuida, en pliegues, en zonas seborreicas.
- Dermatoscopía: red pigmentaria, puntos, glóbulos, vasos en horquilla, vasos arborizantes, velo azul-blanquecino, áreas sin estructura.
- Verbos formales: "se objetiva", "se evidencia", "compatible con", "sugerente de". NO "hay", "tiene", "se ve".

El interlocutor es un dermatólogo licenciado; no necesita explicaciones de qué es una pápula. Mantén el registro clínico.`;

// =====================================================================
// Helpers
// =====================================================================

interface ImageForClaude {
  type: "image";
  source: {
    type: "base64";
    media_type: (typeof SUPPORTED_MIME)[number];
    data: string;
  };
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

  // Hard payload-size sanity check. Each base64 image ~1.3x size of bytes.
  // We allow up to 5 photos at ~1MB each → max ~6.5MB payload.
  const totalBase64 = parsed.data.fotos.reduce((s, f) => s + f.base64.length, 0);
  if (totalBase64 > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Las imágenes adjuntas son muy grandes. Comprime más antes de enviar." },
      { status: 413 },
    );
  }

  // Build Claude content blocks
  const imageBlocks: ImageForClaude[] = parsed.data.fotos.map((f) => ({
    type: "image",
    source: { type: "base64", media_type: f.mime, data: f.base64 },
  }));

  const contextBlock = parsed.data.contexto.trim()
    ? `Contexto que comparte el médico:\n${parsed.data.contexto.trim()}`
    : "El médico no proveyó contexto adicional. Trabajar solo desde la imagen.";

  const t0 = Date.now();
  try {
    const response = await runStructuredClinicalCall({
      mode: "CASO_CLINICO",
      // Con la brevedad pedida el output natural ronda ~1500-1800 tok.
      // 2200 da margen para que el tool call cierre sin truncar, y la
      // latencia queda ~35-45s (cómoda bajo el techo de 60s).
      maxTokens: 2200,
      systemPromptOverride: SYSTEM_PROMPT,
      tool: {
        name: "emitir_analisis",
        description:
          "Emite la lectura clínica estructurada del caso (diferenciales, planes, banderas rojas, calidad de imagen).",
        input_schema: ANALISIS_TOOL_INPUT_SCHEMA,
      },
      userMessages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: contextBlock }],
        },
      ],
    });

    const latencyMs = Date.now() - t0;
    const inTok = response.usage?.input_tokens ?? 0;
    const outTok = response.usage?.output_tokens ?? 0;
    const cost = costUsd(inTok, outTok);

    // eslint-disable-next-line no-console
    console.log(
      `[claude-call] mode=consulta_rapida model=${response.model} prompt_tokens=${inTok} completion_tokens=${outTok} total_tokens=${inTok + outTok} est_cost_usd=${cost.toFixed(6)} latency_ms=${latencyMs} stop=${response.stopReason}`,
    );

    // Log to uso_ia for cost analytics
    try {
      const admin = adminClient();
      await admin.from("uso_ia").insert({
        medico_id: user.id,
        consulta_id: null,
        modo: "caso_clinico", // reuse existing enum; consulta_rapida es solo otro entrypoint
        modelo: response.model,
        tokens_input: inTok,
        tokens_output: outTok,
        costo_usd: Number(cost.toFixed(6)),
        latency_ms: latencyMs,
        estado: "completed",
      });
    } catch (logErr) {
      console.error(
        `[uso_ia consulta_rapida] insert failed: ${logErr instanceof Error ? logErr.message : "unknown"}`,
      );
    }

    // El tool_use input ya viene como objeto. Si el modelo se quedó sin
    // tokens a media tool call, stopReason === "max_tokens" y el input
    // puede venir incompleto: lo tratamos como error claro.
    if (response.input === undefined) {
      console.error(
        `[claude-call] mode=consulta_rapida NO_TOOL_USE stop=${response.stopReason} text="${response.rawText?.slice(0, 200) ?? ""}"`,
      );
      return NextResponse.json(
        {
          error:
            response.stopReason === "max_tokens"
              ? "El análisis quedó incompleto (respuesta muy larga). Reintenta con menos imágenes o más contexto."
              : "La IA no devolvió un análisis. Reintenta.",
        },
        { status: 502 },
      );
    }

    const responseParsed = analizarCasoResponseSchema.safeParse(response.input);
    if (!responseParsed.success) {
      console.error(
        `[claude-call] mode=consulta_rapida SCHEMA_FAIL issues=${JSON.stringify(responseParsed.error.issues.slice(0, 3))}`,
      );
      return NextResponse.json(
        { error: "La IA respondió con campos inesperados. Reintenta." },
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
    console.error(`[claude-call] mode=consulta_rapida FAILED error="${msg}"`);
    return NextResponse.json(
      { error: "No pudimos procesar el análisis. Reintenta." },
      { status: 500 },
    );
  }
}
