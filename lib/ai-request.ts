/**
 * lib/ai-request.ts
 *
 * Cliente helper para llamadas a los endpoints /api/ia/* que tardan
 * (~30s con visión). Envuelve fetch con un AbortController + timeout
 * para que la UI nunca se quede colgada indefinidamente, y normaliza
 * los modos de fallo a errores tipados con mensajes en español.
 */

export class AiTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(
      `El análisis tardó más de ${Math.round(
        timeoutMs / 1000,
      )} segundos. Puede ser la conexión o una imagen muy grande. Reintenta.`,
    );
    this.name = "AiTimeoutError";
  }
}

export class AiNetworkError extends Error {
  constructor() {
    super("No pudimos conectar con la IA. Revisa tu conexión y reintenta.");
    this.name = "AiNetworkError";
  }
}

/** Default timeout. Las llamadas con visión rondan 30s; 45s da margen. */
export const AI_TIMEOUT_MS = 45_000;

/**
 * POST JSON a un endpoint con timeout vía AbortController.
 *
 * - Si el server responde (ok o error), devuelve `{ ok, status, data }`
 *   con el body parseado (data puede traer `error`/`error_message`).
 * - Si se excede el timeout, lanza AiTimeoutError.
 * - Si falla la red (offline, DNS, etc.), lanza AiNetworkError.
 *
 * Acepta un `externalSignal` opcional para que el caller también pueda
 * abortar (p. ej. al desmontar o al pulsar "cancelar").
 */
export async function postJsonWithTimeout<T = unknown>(
  url: string,
  body: unknown,
  opts: { timeoutMs?: number; externalSignal?: AbortSignal } = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Encadenar un signal externo (si el caller lo pasa) al nuestro.
  if (opts.externalSignal) {
    if (opts.externalSignal.aborted) controller.abort();
    else
      opts.externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Distinguir timeout nuestro de abort externo.
      if (opts.externalSignal?.aborted) throw err;
      throw new AiTimeoutError(timeoutMs);
    }
    throw new AiNetworkError();
  } finally {
    clearTimeout(timer);
  }
}
