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

export async function verificarLicencia(
  tenant: string,
  nombre?: string | null,
): Promise<Licencia> {
  const ahora = Date.now();
  const hit = cache.get(tenant);
  if (hit && hit.hasta > ahora) return hit.valor;

  const url = new URL(`${BASE}/${encodeURIComponent(APP_KEY)}`);
  if (tenant) url.searchParams.set("tenant", tenant);
  if (nombre) url.searchParams.set("nombre", nombre);

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
  cache.set(tenant, { hasta: ahora + TTL_MS, valor });
  return valor;
}
