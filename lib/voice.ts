/**
 * lib/voice.ts
 *
 * Thin wrapper around the Web Speech API (SpeechRecognition) for
 * Spanish dictation. Designed for /consulta/nueva.
 *
 * Why not Whisper or a server-side STT?
 *  - Web Speech is free (browser-native), low-latency, and works on
 *    every modern Chromium browser + Safari. Mobile-first matters here.
 *  - We accept the trade-off of patchy Firefox support (warned in UI).
 *
 * Behavior:
 *  - Default lang 'es-VE'. If the browser rejects it ("language-not-supported")
 *    we transparently retry with 'es-ES'. Fer's hypothesis is that Chrome
 *    voice models are stronger for the broader Spanish variant.
 *  - continuous + interimResults so the textarea updates in real time as
 *    the médico dictates.
 *  - Stop is graceful (fires onEnd); Abort is hard (no events fire after).
 */

// ----- SpeechRecognition minimal types -------------------------------
// The standard DOM lib does not ship SpeechRecognition types. We define
// only what we need so the wrapper stays self-contained.

interface SRAlternative {
  transcript: string;
  confidence: number;
}

interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}

interface SRResultList {
  length: number;
  [index: number]: SRResult;
}

interface SREvent extends Event {
  resultIndex: number;
  results: SRResultList;
}

interface SRErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SREvent) => void) | null;
  onerror: ((ev: SRErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
}

type SRConstructor = new () => SpeechRecognitionLike;

// ----- support detection ---------------------------------------------

export function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );
}

function getCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ----- error model ----------------------------------------------------

export type DictationErrorCode =
  | "not-supported"
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "language-not-supported"
  | "unknown";

export interface DictationError {
  code: DictationErrorCode;
  message: string;
}

function classifyError(raw: string): DictationErrorCode {
  switch (raw) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    case "language-not-supported":
      return "language-not-supported";
    default:
      return "unknown";
  }
}

const SPANISH_ERROR_COPY: Record<DictationErrorCode, string> = {
  "not-supported":
    "Tu navegador no soporta dictado por voz. Usa Chrome, Edge o Safari, o escribe manualmente.",
  "not-allowed":
    "Diste permiso de micrófono denegado. Habilítalo desde la barra del navegador y vuelve a intentar.",
  "no-speech":
    "No se detectó voz. Acércate al micrófono y vuelve a presionar el botón.",
  "audio-capture":
    "No pudimos acceder al micrófono. Revisa que no lo esté usando otra app.",
  network:
    "Sin conexión para el servicio de voz. Verifica tu internet y reintenta.",
  aborted: "Dictado cancelado.",
  "language-not-supported":
    "El idioma de dictado no está disponible en este navegador.",
  unknown: "Ocurrió un error con el dictado. Intenta de nuevo.",
};

export function dictationErrorMessage(code: DictationErrorCode): string {
  return SPANISH_ERROR_COPY[code];
}

// ----- public API -----------------------------------------------------

export interface StartDictationOptions {
  /** Called every time new text arrives. `final=true` means the
   *  recognizer locked in that segment; `false` means it may still change. */
  onTranscript: (text: string, final: boolean) => void;
  onError?: (err: DictationError) => void;
  /** Fired after the recognizer fully stops (after stop() or natural end). */
  onEnd?: () => void;
  /** Override the language. Defaults to es-VE with fallback to es-ES. */
  lang?: string;
}

const FALLBACK_LANGS = ["es-VE", "es-ES"] as const;

let activeRecognition: SpeechRecognitionLike | null = null;
let suppressNextEnd = false;
// true solo cuando el médico pulsa "detener" (o abort). Mientras sea
// false, reiniciamos el reconocimiento cada vez que el navegador lo
// corta solo — así el dictado NO se cierra por una pausa (bug iOS).
let userStopped = false;

function attach(
  rec: SpeechRecognitionLike,
  opts: StartDictationOptions,
  remainingLangs: string[],
) {
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = remainingLangs[0]!;

  rec.onresult = (ev) => {
    // Acumulamos por evento el delta final y el interino por separado.
    // Emitimos UN solo onTranscript final y uno interino, en vez de uno
    // por resultado — reduce duplicación cuando el navegador reenvía.
    let finalDelta = "";
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i]!;
      const alt = res[0];
      if (!alt) continue;
      const t = alt.transcript.trim();
      if (!t) continue;
      if (res.isFinal) finalDelta += (finalDelta ? " " : "") + t;
      else interim += (interim ? " " : "") + t;
    }
    if (finalDelta) opts.onTranscript(finalDelta, true);
    if (interim) opts.onTranscript(interim, false);
  };

  rec.onerror = (ev) => {
    const code = classifyError(ev.error);

    // Try the next language candidate if the current one is rejected.
    if (code === "language-not-supported" && remainingLangs.length > 1) {
      const next = remainingLangs.slice(1);
      suppressNextEnd = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      const ctor = getCtor();
      if (!ctor) {
        opts.onError?.({
          code: "not-supported",
          message: SPANISH_ERROR_COPY["not-supported"],
        });
        return;
      }
      const replacement = new ctor();
      activeRecognition = replacement;
      attach(replacement, opts, next);
      try {
        replacement.start();
      } catch {
        opts.onError?.({
          code: "unknown",
          message: SPANISH_ERROR_COPY.unknown,
        });
      }
      return;
    }

    // Silencio / abort durante un reinicio interno: NO es un error real,
    // dejamos que onend reinicie y seguimos escuchando.
    if (code === "no-speech") return;
    if (code === "aborted" && !userStopped) return;

    // Errores terminales (permiso, micrófono, red): paramos de verdad.
    userStopped = true;
    opts.onError?.({ code, message: SPANISH_ERROR_COPY[code] });
  };

  rec.onend = () => {
    if (suppressNextEnd) {
      suppressNextEnd = false;
      return;
    }
    // Este reconocimiento ya fue reemplazado/abandonado (otra sesión
    // arrancó). No reinicies ni dispares onEnd: silencio.
    if (activeRecognition !== rec) return;

    // Reinicio automático: el navegador corta el reconocimiento tras una
    // pausa (sobre todo iOS Safari). Si el médico NO pulsó detener,
    // arrancamos de nuevo para que el dictado sea continuo.
    if (!userStopped) {
      try {
        rec.start();
        return;
      } catch {
        // start() puede lanzar si se llama demasiado rápido; intentamos
        // con una instancia fresca.
        const ctor = getCtor();
        if (ctor && !userStopped) {
          const fresh = new ctor();
          activeRecognition = fresh;
          attach(fresh, opts, remainingLangs);
          try {
            fresh.start();
            return;
          } catch {
            /* cae al cierre real abajo */
          }
        }
      }
    }

    activeRecognition = null;
    opts.onEnd?.();
  };
}

export function startDictation(opts: StartDictationOptions): void {
  if (!isSupported()) {
    opts.onError?.({
      code: "not-supported",
      message: SPANISH_ERROR_COPY["not-supported"],
    });
    return;
  }

  // If a previous session is still alive, abort it before starting a new
  // one. Detach FIRST (activeRecognition = null) para que el onend del
  // previo se vea como "abandonado" y no auto-reinicie ni dispare onEnd,
  // tanto si onend llega síncrono como asíncrono.
  if (activeRecognition) {
    const previo = activeRecognition;
    activeRecognition = null;
    try {
      previo.abort();
    } catch {
      /* ignore */
    }
  }

  userStopped = false;
  suppressNextEnd = false;

  const ctor = getCtor()!;
  const rec = new ctor();
  activeRecognition = rec;

  const langs = opts.lang
    ? [opts.lang, ...FALLBACK_LANGS.filter((l) => l !== opts.lang)]
    : [...FALLBACK_LANGS];

  attach(rec, opts, langs);

  try {
    rec.start();
  } catch {
    // Calling start() twice throws InvalidStateError in some browsers.
    opts.onError?.({ code: "unknown", message: SPANISH_ERROR_COPY.unknown });
    activeRecognition = null;
  }
}

export function stopDictation(): void {
  // Marca de parada explícita: evita el auto-reinicio en onend. El onend
  // sí dispara opts.onEnd() para que la UI sepa que terminó.
  userStopped = true;
  if (!activeRecognition) return;
  try {
    activeRecognition.stop();
  } catch {
    /* ignore */
  }
}

export function abortDictation(): void {
  userStopped = true;
  if (!activeRecognition) return;
  suppressNextEnd = true;
  try {
    activeRecognition.abort();
  } catch {
    /* ignore */
  }
  activeRecognition = null;
}

export function isActive(): boolean {
  return activeRecognition !== null;
}
