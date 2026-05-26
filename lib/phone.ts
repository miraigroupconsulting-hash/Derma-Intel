/**
 * lib/phone.ts
 *
 * Normaliza teléfonos a formato E.164 (sin el `+` inicial) para usar
 * en links de wa.me/<numero>.
 *
 * Por qué: WhatsApp's wa.me only accepts the international number with
 * country code and NO leading +. Si pasas "04141234567" (formato local
 * venezolano), WhatsApp lo interpreta mal y termina abriendo el chat
 * de un contacto cualquiera.
 *
 * Heurística para Venezuela (mayoría de pacientes):
 *
 *   Input                     →  Output (E.164 sin +)
 *   ─────────────────────────────────────────────────
 *   "0414-1234567"            →  "584141234567"
 *   "04141234567"             →  "584141234567"
 *   "+58 414 123 4567"        →  "584141234567"
 *   "+584141234567"           →  "584141234567"
 *   "584141234567"            →  "584141234567"
 *   "414 1234567"             →  "584141234567"  (asume VE)
 *   "0212-9876543"            →  "582129876543"  (fijo Caracas)
 *
 * Códigos de operadora móvil venezolanos: 412, 414, 416, 424, 426.
 * Códigos fijos comunes: 212 (Caracas), 241 (Valencia), 261 (Maracaibo),
 *                        251 (Barquisimeto), 281 (Pto. La Cruz), etc.
 *
 * Para números que claramente NO son venezolanos (ej. otro código de
 * país explícito), devolvemos los dígitos tal cual y dejamos que
 * WhatsApp decida. La heurística de "asumir VE" solo dispara cuando
 * la longitud y los prefijos cuadran con un número doméstico VE.
 */

/** Country code de Venezuela. */
const VE_CC = "58";

/** Áreas móviles venezolanas (sin 0 inicial). */
const VE_MOBILE_AREAS = new Set(["412", "414", "416", "424", "426"]);

export interface PhoneNormalizeResult {
  /** E.164-sin-`+` listo para wa.me. Null si no pudimos normalizar. */
  e164NoPlus: string | null;
  /** Formato bonito para mostrar al médico, ej. "+58 414 123 4567". */
  display: string | null;
}

export function normalizePhoneForWhatsapp(
  raw: string | null | undefined,
): PhoneNormalizeResult {
  if (!raw) return { e164NoPlus: null, display: null };
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return { e164NoPlus: null, display: null };

  let intl: string | null = null;

  // Caso 1: ya viene con código de país 58 + 10 dígitos
  if (digits.length === 12 && digits.startsWith(VE_CC)) {
    intl = digits;
  }
  // Caso 2: formato local con 0 al frente (11 dígitos)
  else if (digits.length === 11 && digits.startsWith("0")) {
    intl = VE_CC + digits.slice(1);
  }
  // Caso 3: 10 dígitos sin 0 y con prefijo VE conocido
  else if (digits.length === 10) {
    const area = digits.slice(0, 3);
    if (VE_MOBILE_AREAS.has(area) || area.startsWith("2")) {
      intl = VE_CC + digits;
    }
  }
  // Caso 4: número internacional explícito de otro país (más de 10
  // dígitos sin prefijo VE) — pasa derecho. Para 11/12 dígitos sin
  // prefijo VE, mejor no asumir y devolver tal cual.
  if (!intl) {
    if (digits.length >= 10 && digits.length <= 15) {
      intl = digits;
    } else {
      return { e164NoPlus: null, display: null };
    }
  }

  return {
    e164NoPlus: intl,
    display: prettyFormat(intl),
  };
}

/**
 * Formatea un E.164-sin-+ para display amable.
 *   "584141234567" → "+58 414 123 4567"
 *   "12025550100"  → "+1 202 555 0100" (best-effort genérico)
 */
function prettyFormat(e164: string): string {
  if (e164.startsWith(VE_CC) && e164.length === 12) {
    const area = e164.slice(2, 5);
    const a = e164.slice(5, 8);
    const b = e164.slice(8);
    return `+${VE_CC} ${area} ${a} ${b}`;
  }
  // Fallback: agrupa en bloques de 3 desde el final.
  const rev = e164.split("").reverse();
  const chunks: string[] = [];
  for (let i = 0; i < rev.length; i += 3) {
    chunks.push(rev.slice(i, i + 3).reverse().join(""));
  }
  return "+" + chunks.reverse().join(" ");
}
