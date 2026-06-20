/**
 * POST /api/ia/transcribir
 *
 * Transcripción de voz tipo "Wispr Flow": el cliente graba audio
 * (MediaRecorder) y lo manda acá; nosotros lo reenviamos a Whisper de
 * OpenAI (whisper-1), con muy buena precisión en español médico.
 * Devolvemos el texto plano.
 *
 * NOTA: la llamada sale desde el servidor (Vercel, EE.UU.), no desde el
 * dispositivo de la médica — así que su ubicación no afecta el uso.
 *
 * El médico luego pule/estructura ese texto con el botón "Estructurar
 * con IA" (Claude) que ya existe. Acá NO llamamos a Claude — solo
 * transcribimos, para mantener la latencia baja.
 *
 * Para cambiar de proveedor (p. ej. Groq o Deepgram) basta cambiar la
 * URL/modelo/env key — el shape multipart es el estándar de OpenAI.
 *
 * PRIVACIDAD (CLAUDE.md §2.3): el audio puede contener el nombre del
 * paciente; no se puede anonimizar antes de transcribir. OpenAI no usa
 * datos de su API para entrenar por defecto. Aun así, la recomendación a
 * la médica es evitar nombres completos en el dictado.
 */
import { NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const MODEL = "whisper-1";
const MAX_BYTES = 24 * 1024 * 1024; // 24 MB (OpenAI admite 25; dejamos margen)

export async function POST(req: Request) {
  // ----- Auth ---------------------------------------------------------
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error("[transcribir] OPENAI_API_KEY no configurada");
    return NextResponse.json(
      {
        error:
          "El dictado por voz aún no está configurado en el servidor. Avísale a Fer.",
      },
      { status: 503 },
    );
  }

  // ----- Leer el audio ------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Audio inválido." }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { error: "No recibimos audio para transcribir." },
      { status: 400 },
    );
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El audio es muy largo. Graba tramos más cortos." },
      { status: 413 },
    );
  }

  // ----- Reenviar a Groq Whisper -------------------------------------
  const filename =
    typeof (audio as File).name === "string" && (audio as File).name
      ? (audio as File).name
      : "dictado.webm";

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, filename);
  upstreamForm.append("model", MODEL);
  upstreamForm.append("language", "es");
  upstreamForm.append("response_format", "json");
  // Pista de contexto para mejorar términos clínicos frecuentes.
  upstreamForm.append(
    "prompt",
    "Dictado clínico de dermatología en español: pápulas, máculas, eritema, prurito, dermatoscopia, isotretinoína.",
  );

  const t0 = Date.now();
  try {
    const resp = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error(
        `[transcribir] whisper ${resp.status}: ${body.slice(0, 300)}`,
      );
      return NextResponse.json(
        { error: "No pudimos transcribir el audio. Reintenta." },
        { status: 502 },
      );
    }
    const data = (await resp.json()) as { text?: string };
    const text = (data.text ?? "").trim();
    // eslint-disable-next-line no-console
    console.log(
      `[transcribir] ok bytes=${audio.size} chars=${text.length} latency_ms=${Date.now() - t0}`,
    );
    return NextResponse.json({ text }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[transcribir] FAILED: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return NextResponse.json(
      { error: "Error de red al transcribir. Reintenta." },
      { status: 500 },
    );
  }
}
