/**
 * POST /api/ia/transcribir
 *
 * Transcripción de voz tipo "Wispr Flow": el cliente graba audio
 * (MediaRecorder) y lo manda acá; nosotros lo reenviamos a un modelo
 * Whisper hospedado en Groq (whisper-large-v3) — rápido y barato, con
 * muy buena precisión en español médico. Devolvemos el texto plano.
 *
 * El médico luego pule/estructura ese texto con el botón "Estructurar
 * con IA" (Claude) que ya existe. Acá NO llamamos a Claude — solo
 * transcribimos, para mantener la latencia baja.
 *
 * Proveedor: Groq (OpenAI-compatible). Para cambiar a OpenAI, basta
 * cambiar BASE_URL y la env key — el shape del request es el mismo.
 *
 * PRIVACIDAD (CLAUDE.md §2.3): el audio puede contener el nombre del
 * paciente; no se puede anonimizar antes de transcribir. Groq declara
 * que los datos de su API NO se usan para entrenamiento. Aun así, la
 * recomendación a la médica es evitar nombres completos en el dictado.
 */
import { NextResponse } from "next/server";
import { createClient as createSsrClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (Groq admite 25; dejamos margen)

export async function POST(req: Request) {
  // ----- Auth ---------------------------------------------------------
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error("[transcribir] GROQ_API_KEY no configurada");
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

  const groqForm = new FormData();
  groqForm.append("file", audio, filename);
  groqForm.append("model", MODEL);
  groqForm.append("language", "es");
  groqForm.append("response_format", "json");
  // Pista de contexto para mejorar términos clínicos frecuentes.
  groqForm.append(
    "prompt",
    "Dictado clínico de dermatología en español: pápulas, máculas, eritema, prurito, dermatoscopia, isotretinoína.",
  );

  const t0 = Date.now();
  try {
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error(
        `[transcribir] Groq ${resp.status}: ${body.slice(0, 300)}`,
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
