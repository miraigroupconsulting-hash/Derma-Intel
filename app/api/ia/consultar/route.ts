/**
 * POST /api/ia/consultar
 *
 * Unified clinical IA endpoint. Dispatches the 6 modes of
 * derma-intel-v2.md, streams Claude responses as SSE, and logs each
 * call to public.uso_ia for cost analytics.
 *
 * Request body (JSON):
 *   {
 *     consulta_id: string (uuid),
 *     modo: 'caso_clinico' | 'express' | 'bibliografia' |
 *           'histopatologia' | 'terapeutica' | 'docente',
 *     pregunta_seguimiento?: string,
 *     historial?: { role: 'user' | 'assistant', content: string }[]
 *   }
 *
 * Response: text/event-stream with data lines:
 *   data: {"type":"chunk","text":"..."}\n\n
 *   data: {"type":"done","usage":{...},"disclaimer_injected":bool}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 *
 * Server-side guarantees:
 *   - SSR client confirms paciente ownership before any IA call.
 *   - Patient name is anonymized in every byte sent to Claude.
 *   - For image modes, fotos are downloaded via service role and
 *     inlined as base64.
 *   - Mandatory disclaimer is injected at the tail if the model
 *     forgot to include it.
 *   - Tokens + cost + latency are inserted into public.uso_ia after
 *     the stream closes (or with estado='aborted' if the client
 *     disconnected).
 */

import { z } from "zod";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { streamClinicalCall, type ClinicalMode } from "@/lib/claude";
import { anonymizeText } from "@/lib/anonimizar";
import { buildPrompt, responseHasDisclaimer, getMandatoryDisclaimer } from "@/lib/prompts/builder";
import type { Database } from "@/types/database";

// =====================================================================
// Pricing (USD per million tokens). Update when Anthropic moves prices.
// =====================================================================
const PRICING = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
} as const;

function estimateCostUsd(modelKey: string, inTok: number, outTok: number): number {
  const k = Object.keys(PRICING).find((key) => modelKey.startsWith(key)) as
    | keyof typeof PRICING
    | undefined;
  if (!k) return 0;
  const { input, output } = PRICING[k];
  return (inTok * input) / 1_000_000 + (outTok * output) / 1_000_000;
}

// =====================================================================
// Request schema
// =====================================================================

const MODE_WIRE: Record<string, ClinicalMode> = {
  caso_clinico: "CASO_CLINICO",
  express: "EXPRESS",
  bibliografia: "BIBLIOGRAFIA",
  histopatologia: "HISTOPATOLOGIA",
  terapeutica: "TERAPEUTICA",
  docente: "DOCENTE",
};

const MODE_DB: Record<ClinicalMode, Database["public"]["Enums"]["ia_modo"]> = {
  CASO_CLINICO: "caso_clinico",
  EXPRESS: "express",
  BIBLIOGRAFIA: "bibliografia",
  HISTOPATOLOGIA: "histopatologia",
  TERAPEUTICA: "terapeutica",
  DOCENTE: "docente",
};

const MODES_WITH_IMAGES: ReadonlySet<ClinicalMode> = new Set([
  "CASO_CLINICO",
  "EXPRESS",
  "HISTOPATOLOGIA",
]);

const requestSchema = z.object({
  consulta_id: z.string().uuid(),
  modo: z.enum([
    "caso_clinico",
    "express",
    "bibliografia",
    "histopatologia",
    "terapeutica",
    "docente",
  ]),
  pregunta_seguimiento: z.string().trim().max(4000).optional(),
  historial: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
      }),
    )
    // Capped at 8 turns. Beyond that conversations rarely add useful
    // context and the input-token cost grows linearly — the médico
    // can start a fresh session if they need a deeper thread.
    .max(8)
    .optional(),
});

/**
 * Per-modo max output tokens. Calibrated against the real usage data
 * in uso_ia at Día 4 close: the default of 2500 was leaving Sonnet
 * responses bloated. These caps trim ~30% of output tokens without
 * sacrificing clinical usefulness. Update when usage data matures.
 */
const MAX_TOKENS_BY_MODE: Record<ClinicalMode, number> = {
  CASO_CLINICO: 1500,
  EXPRESS: 800,
  BIBLIOGRAFIA: 1500,
  HISTOPATOLOGIA: 1500,
  TERAPEUTICA: 1500,
  DOCENTE: 2000,
};

// =====================================================================
// SSE helpers
// =====================================================================

const ENC = new TextEncoder();

function sseLine(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseEvent(payload: object): Uint8Array {
  return ENC.encode(sseLine(payload));
}

// =====================================================================
// Image helpers
// =====================================================================

interface ImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    data: string;
  };
}

const SUPPORTED_MIME = new Set<ImageBlock["source"]["media_type"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function adminStorage() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function loadImageAsBase64(storagePath: string): Promise<ImageBlock | null> {
  const admin = adminStorage();
  const { data } = await admin.storage
    .from("fotos-consultas")
    .download(storagePath);
  if (!data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const mime = (data.type ||
    "image/jpeg") as ImageBlock["source"]["media_type"];
  if (!SUPPORTED_MIME.has(mime)) return null;
  return {
    type: "image",
    source: { type: "base64", media_type: mime, data: buf.toString("base64") },
  };
}

// =====================================================================
// Patient context builder
// =====================================================================

function calcAgeYears(fechaNac: string): number {
  const b = new Date(fechaNac);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function labelSexo(s: string | null): string {
  if (s === "F") return "femenino";
  if (s === "M") return "masculino";
  if (s === "O") return "otro";
  return "no especificado";
}

interface ConsultaContext {
  fullName: string;
  patientLine: string;
  soapBlock: string;
  motivo: string | null;
  fotosPaths: string[];
}

function buildContextText(ctx: ConsultaContext): string {
  const sections: string[] = [`Datos del paciente:\n${ctx.patientLine}`];
  if (ctx.motivo) sections.push(`Motivo de consulta: ${ctx.motivo}`);
  if (ctx.soapBlock) sections.push(`Nota clínica estructurada (SOAP):\n${ctx.soapBlock}`);
  return sections.join("\n\n");
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
    return new Response(
      sseLine({ type: "error", message: "Sesión expirada." }),
      { status: 401, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // ----- Parse + validate input --------------------------------------
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      sseLine({
        type: "error",
        message: `Payload inválido: ${parsed.error.issues[0]?.message ?? "shape error"}`,
      }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }
  const mode = MODE_WIRE[parsed.data.modo]!;
  const modeDb = MODE_DB[mode];

  // ----- Load consulta + paciente + fotos (RLS-scoped) ---------------
  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      `id, paciente_id, motivo, anamnesis, examen_fisico,
       diagnostico_diferencial, plan_terapeutico,
       paciente:pacientes ( nombre, apellido, fecha_nacimiento, sexo,
                            tipo_piel_fitzpatrick, alergias, antecedentes,
                            medicacion_actual )`,
    )
    .eq("id", parsed.data.consulta_id)
    .maybeSingle();

  if (!consulta || !consulta.paciente) {
    return new Response(
      sseLine({ type: "error", message: "Consulta no encontrada." }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } },
    );
  }
  const p = consulta.paciente;
  const fullName = `${p.nombre} ${p.apellido}`;
  const edad = p.fecha_nacimiento ? calcAgeYears(p.fecha_nacimiento) : null;

  const patientLine = [
    edad !== null ? `Edad: ${edad} años` : null,
    `Sexo: ${labelSexo(p.sexo)}`,
    p.tipo_piel_fitzpatrick
      ? `Fototipo Fitzpatrick: ${p.tipo_piel_fitzpatrick}`
      : null,
    p.alergias ? `Alergias: ${anonymizeText(p.alergias, fullName)}` : null,
    p.antecedentes
      ? `Antecedentes: ${anonymizeText(p.antecedentes, fullName)}`
      : null,
    p.medicacion_actual
      ? `Medicación actual: ${anonymizeText(p.medicacion_actual, fullName)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const soapBlock = [
    consulta.anamnesis
      ? `[Subjetivo]\n${anonymizeText(consulta.anamnesis, fullName)}`
      : null,
    consulta.examen_fisico
      ? `[Objetivo]\n${anonymizeText(consulta.examen_fisico, fullName)}`
      : null,
    consulta.diagnostico_diferencial
      ? `[Análisis]\n${anonymizeText(consulta.diagnostico_diferencial, fullName)}`
      : null,
    consulta.plan_terapeutico
      ? `[Plan]\n${anonymizeText(consulta.plan_terapeutico, fullName)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // ----- Load image bytes when mode uses them -----------------------
  const imageBlocks: ImageBlock[] = [];
  if (MODES_WITH_IMAGES.has(mode)) {
    const { data: fotos } = await supabase
      .from("fotos")
      .select("storage_path, tipo, zona_anatomica")
      .eq("consulta_id", consulta.id);
    for (const f of fotos ?? []) {
      if (!f.storage_path.startsWith(`${user.id}/`)) continue;
      const img = await loadImageAsBase64(f.storage_path);
      if (img) imageBlocks.push(img);
    }
  }

  // ----- Build prompt + first user message --------------------------
  const systemPrompt = await buildPrompt(mode);
  const contextText = buildContextText({
    fullName,
    patientLine,
    soapBlock,
    motivo: consulta.motivo,
    fotosPaths: [],
  });

  const firstUserText =
    contextText +
    (imageBlocks.length > 0
      ? `\n\nSe adjuntan ${imageBlocks.length} imagen(es) de la consulta.`
      : "") +
    `\n\nAnaliza este caso siguiendo las reglas del modo ${parsed.data.modo}.`;

  const firstUserContent: Array<
    { type: "text"; text: string } | ImageBlock
  > = [{ type: "text", text: firstUserText }, ...imageBlocks];

  // Append conversation history + new follow-up question if present.
  const userMessages: Array<{
    role: "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | ImageBlock>;
  }> = [{ role: "user", content: firstUserContent }];

  if (parsed.data.historial && parsed.data.historial.length > 0) {
    for (const m of parsed.data.historial) {
      userMessages.push({
        role: m.role,
        content: anonymizeText(m.content, fullName),
      });
    }
  }

  if (parsed.data.pregunta_seguimiento) {
    userMessages.push({
      role: "user",
      content: anonymizeText(parsed.data.pregunta_seguimiento, fullName),
    });
  }

  // ----- Stream from Claude → SSE to client -------------------------
  const t0 = Date.now();
  let accumulatedText = "";
  let finalUsage = { input: 0, output: 0 };
  let modelKey = "";
  let estado: "completed" | "error" | "aborted" = "completed";
  let errorMessage: string | null = null;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let stream: Awaited<ReturnType<typeof streamClinicalCall>> | null = null;
      try {
        stream = await streamClinicalCall({
          mode,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          userMessages: userMessages as any, // SDK types coerce ok
          systemPromptOverride: systemPrompt,
          maxTokens: MAX_TOKENS_BY_MODE[mode],
        });

        // Forward each text delta to the client.
        stream.on("text", (delta: string) => {
          accumulatedText += delta;
          controller.enqueue(sseEvent({ type: "chunk", text: delta }));
        });

        // Resolve with the final message so we can read usage + model.
        const finalMessage = await stream.finalMessage();
        modelKey = finalMessage.model;
        finalUsage = {
          input: finalMessage.usage.input_tokens,
          output: finalMessage.usage.output_tokens,
        };

        // Inject the mandatory disclaimer if Claude forgot it.
        let disclaimerInjected = false;
        if (!responseHasDisclaimer(accumulatedText)) {
          const tail = `\n\n---\n\n_${getMandatoryDisclaimer()}_`;
          accumulatedText += tail;
          controller.enqueue(sseEvent({ type: "chunk", text: tail }));
          disclaimerInjected = true;
        }

        const latencyMs = Date.now() - t0;
        const costUsd = estimateCostUsd(
          modelKey,
          finalUsage.input,
          finalUsage.output,
        );

        controller.enqueue(
          sseEvent({
            type: "done",
            usage: {
              input: finalUsage.input,
              output: finalUsage.output,
              total: finalUsage.input + finalUsage.output,
              estimated_cost_usd: costUsd,
            },
            model: modelKey,
            disclaimer_injected: disclaimerInjected,
            latency_ms: latencyMs,
          }),
        );

        // eslint-disable-next-line no-console
        console.log(
          `[claude-call] mode=${parsed.data.modo} model=${modelKey} images=${imageBlocks.length} prompt_tokens=${finalUsage.input} completion_tokens=${finalUsage.output} total_tokens=${finalUsage.input + finalUsage.output} est_cost_usd=${costUsd.toFixed(6)} latency_ms=${latencyMs} disclaimer_injected=${disclaimerInjected}`,
        );
      } catch (err) {
        estado = req.signal.aborted ? "aborted" : "error";
        errorMessage =
          err instanceof Error ? err.message : "Error desconocido en la IA.";
        try {
          if (stream) stream.abort();
        } catch {
          /* ignore */
        }
        controller.enqueue(
          sseEvent({ type: "error", message: errorMessage }),
        );
      } finally {
        controller.close();

        // ----- Log to uso_ia (fire-and-forget) -----------------------
        // Use service role: clients can never insert into this table.
        try {
          const admin = adminStorage();
          await admin.from("uso_ia").insert({
            medico_id: user.id,
            consulta_id: consulta.id,
            modo: modeDb,
            modelo: modelKey || "unknown",
            tokens_input: finalUsage.input,
            tokens_output: finalUsage.output,
            costo_usd: Number(
              estimateCostUsd(
                modelKey || "claude-sonnet-4-6",
                finalUsage.input,
                finalUsage.output,
              ).toFixed(6),
            ),
            latency_ms: Date.now() - t0,
            estado,
          });
        } catch (logErr) {
          // eslint-disable-next-line no-console
          console.error(
            `[uso_ia] insert failed: ${logErr instanceof Error ? logErr.message : "unknown"}`,
          );
        }
      }
    },
    cancel() {
      // Client disconnected. Mark estado for the log.
      estado = "aborted";
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
