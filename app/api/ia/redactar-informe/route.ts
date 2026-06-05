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

const SYSTEM_PROMPT = `Eres un redactor de informes médicos dermatológicos, formado en escuelas de medicina latinoamericanas. NO eres un asistente clínico — solo redactas.

Tu único trabajo: tomar el contenido crudo de una consulta (lo que el médico escribió o dictó, a veces telegráfico) y devolverlo REESCRITO con prosa formal de informe médico hospitalario, manteniendo EXACTAMENTE la misma información clínica del input.

REGLAS INVIOLABLES:

1. NO inventes datos. Si no hay antecedentes en el input, pones "Sin antecedentes patológicos de relevancia para el motivo de consulta".
2. NO agregues diagnósticos, hipótesis ni diferenciales que el médico no escribió.
3. NO cambies dosis, medicamentos, frecuencias ni tiempos. Estos son sagrados.
4. NO incluyas PII (nombre, cédula, teléfono). Usa "el paciente" o "la paciente".
5. SIEMPRE devuelve JSON parseable, sin markdown, sin code fences.

REGISTRO LINGÜÍSTICO OBLIGATORIO — Médico-técnico formal LATAM:

Reemplaza vocabulario coloquial por terminología clínica precisa:
- "granitos" → "pápulas" / "pápulo-pústulas"
- "manchas rojas" → "lesiones eritematosas" / "máculas eritematosas"
- "manchas oscuras" → "lesiones hiperpigmentadas" / "máculas melanocíticas"
- "picazón" → "prurito"
- "ronchas" → "habones" / "urticaria"
- "ampolla" → "vesícula" / "bula" (según tamaño)
- "costra" → "costra serosa" / "costra hemática" / "costra melicérica" (especificar tipo)
- "descamación" → "descamación furfurácea / laminar / xerótica" (especificar)
- "irritación" → "eczematización" / "dermatitis" (según corresponda)
- "se ve mejor" → "presenta mejoría clínica objetiva"
- "le mando" → "se prescribe" / "se indica"
- "le digo que" → "se instruye al paciente" / "se le educa sobre"
- "viene a control" → "acude para evaluación de seguimiento"

Localización anatómica con precisión:
- "en la cara" → "en región facial" / "en región malar bilateral" / "en hemicara derecha"
- "en los brazos" → "en miembros superiores" / "en cara extensora de antebrazos"
- "en la espalda" → "en región dorsal" / "en hemitorax posterior"
- "en las manos" → "en dorso de manos" / "en pulpejos digitales"

Temporalidad clínica:
- "hace tiempo" → "con evolución crónica" (especificar tiempo si está)
- "le empezó hace días" → "cuadro de evolución aguda de X días"
- "cada tanto" → "con curso recurrente / brotes intermitentes"

ESTILO DE EJEMPLOS:
- INPUT: "paciente refiere mejoría con la crema"
  OUTPUT: "La paciente refiere mejoría clínica subjetiva tras el inicio del tratamiento tópico indicado."
- INPUT: "pápulas en mejillas reducidas"
  OUTPUT: "Al examen físico se objetiva reducción significativa en número y eritema de las lesiones papulares previamente documentadas en región malar bilateral."
- INPUT: "rosácea con buena respuesta"
  OUTPUT: "Rosácea papulopustulosa con respuesta clínica favorable al esquema terapéutico instaurado."
- INPUT: "control en 4 semanas"
  OUTPUT: "Se programa control clínico en cuatro semanas para evaluar respuesta sostenida al tratamiento y considerar ajustes terapéuticos."

FORMATO EXACTO DEL JSON:

{
  "motivo_consulta": "Párrafo único formal. Verbos en tercera persona.",
  "antecedentes": "Antecedentes patológicos, alergias medicamentosas, fármacos en uso (con presentación + dosis cuando estén). Si no hay datos: 'Sin antecedentes patológicos de relevancia. Sin alergias medicamentosas conocidas. Sin medicación habitual referida.'",
  "anamnesis": "Relato narrativo formal. Si el input es telegráfico, conviértelo en prosa médica con conectores apropiados (Refiere..., Niega..., Asocia...).",
  "examen_fisico": "Hallazgos al examen físico en prosa clínica estructurada. Empieza por la localización, luego el tipo de lesión elemental, características y extensión.",
  "diagnostico": "El diagnóstico o diagnósticos diferenciales del médico, con nomenclatura formal (CIE-10 nominal cuando sea común; ej. 'Rosácea papulopustulosa' no 'rosácea'). Si era diferencial, conserva esa naturaleza ('diagnóstico diferencial entre... y...').",
  "plan": "Plan terapéutico detallado: medicamentos con genérico + presentación + concentración + posología EXACTOS como los escribió el médico. Vehículos topicos con nombre completo (no abrevies). Recomendaciones generales formales.",
  "recomendaciones": "Recomendaciones al paciente formuladas como instrucciones médicas (Se indica..., Se recomienda..., Se instruye...). Signos de alarma si los hubiera mencionado. Si menciona control en X tiempo, refléjalo formalmente. Cierra con 'Se mantienen recomendaciones generales de fotoprotección y evitar irritantes locales' si aplica al caso."
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
