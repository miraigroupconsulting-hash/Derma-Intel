/**
 * lib/licencia.ts
 *
 * Interruptor Mirai Lab: pregunta al panel de suscripciones si ESTE médico sigue
 * activo. El panel vive en el VPS de Mirai (https://mirailabconsulting.com/panel/)
 * y es el mismo que controla Vela, Seito, talleres, etc.
 *
 * Reglas que no se negocian:
 *  - FAIL-OPEN. Si el panel no responde, tarda o devuelve basura, la app SIGUE
 *    funcionando. Jamás dejar a una médica sin su historia clínica en consulta
 *    porque un servidor nuestro se cayó.
 *  - Cache en memoria de 60 s por médico: el middleware corre en cada request y
 *    no vale pegarle al panel por cada navegación.
 *  - El corte es por médico (tenant = auth.users.id), no por deployment: se apaga
 *    a quien no pagó sin tocar al resto.
 */
const BASE = process.env.MIRAI_LIC_URL ?? "https://mirailabconsulting.com/lic";
const APP_KEY = process.env.MIRAI_APP_KEY ?? "derma";
const TTL_MS = 60_000;
const TIMEOUT_MS = 2500;

export interface Licencia {
  activa: boolean;
  mensaje: string;
}

const cache = new Map<string, { hasta: number; valor: Licencia }>();

/** Datos del visitante para el censo del panel: quién entró y desde qué aparato.
 *  El "aparato" es IP + navegador — no identifica personas, sirve para detectar una
 *  misma cuenta usada por varios a la vez. Este chequeo corre en el servidor, así que
 *  la app tiene que pasar la IP/navegador del cliente: si no, se vería siempre Vercel. */
export interface Visitante {
  ip?: string | null;
  agente?: string | null;
}

export async function verificarLicencia(
  tenant: string,
  nombre?: string | null,
  visitante?: Visitante,
): Promise<Licencia> {
  // La caché es por tenant Y aparato: si dos personas comparten la cuenta, cada una
  // se reporta al panel (que es justo lo que queremos ver) en vez de taparse entre sí.
  const clave = `${tenant}|${visitante?.ip ?? ""}|${visitante?.agente ?? ""}`;
  const ahora = Date.now();
  const hit = cache.get(clave);
  if (hit && hit.hasta > ahora) return hit.valor;

  const url = new URL(`${BASE}/${encodeURIComponent(APP_KEY)}`);
  if (tenant) url.searchParams.set("tenant", tenant);
  if (nombre) url.searchParams.set("nombre", nombre);
  if (nombre) {
    // en estas apps el tenant ES el profesional: el usuario del censo es su email
    url.searchParams.set("usuario", nombre);
    url.searchParams.set("nombre_usuario", nombre);
  }
  if (visitante?.ip) url.searchParams.set("ip", visitante.ip);
  if (visitante?.agente) url.searchParams.set("agente", visitante.agente.slice(0, 180));

  let valor: Licencia = { activa: true, mensaje: "" };
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const j = (await r.json()) as { activa?: boolean; mensaje?: string };
    valor = { activa: j.activa !== false, mensaje: j.mensaje ?? "" };
  } catch {
    valor = { activa: true, mensaje: "" }; // fail-open
  }
  cache.set(clave, { hasta: ahora + TTL_MS, valor });
  return valor;
}
