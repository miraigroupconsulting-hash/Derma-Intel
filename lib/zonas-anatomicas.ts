/**
 * lib/zonas-anatomicas.ts
 *
 * Catálogo canónico de zonas anatómicas para etiquetar fotos en
 * dermatología. Organizado por grupo para el dropdown jerárquico de
 * la UI; en BD se guarda como string plano (`fotos.zona_anatomica`).
 *
 * Para zonas no listadas (lecho ungueal, pliegues, mucosas internas)
 * usar el campo "Otra" → se guarda con prefijo `otra:` + texto libre.
 *
 * Schema check actual: solo valida longitud (1..120). Esta whitelist
 * vive en el cliente para que agregar zonas no requiera migración.
 */

export interface ZonaAnatomica {
  /** Stored value in DB (snake_case, ASCII). */
  value: string;
  /** Display label in UI (Spanish, with accents). */
  label: string;
  /** Whether this zona requires an extra privacy confirmation. */
  sensitive?: boolean;
}

export interface ZonaGroup {
  group: string;
  zonas: ZonaAnatomica[];
}

export const ZONAS_ANATOMICAS: ZonaGroup[] = [
  {
    group: "Cara",
    zonas: [
      { value: "frente", label: "Frente" },
      { value: "mejilla_derecha", label: "Mejilla derecha" },
      { value: "mejilla_izquierda", label: "Mejilla izquierda" },
      { value: "nariz", label: "Nariz" },
      { value: "menton", label: "Mentón" },
      { value: "perioral", label: "Perioral" },
      { value: "periocular", label: "Periocular" },
    ],
  },
  {
    group: "Cuello y tronco superior",
    zonas: [
      { value: "cuello", label: "Cuello" },
      { value: "escote", label: "Escote" },
      { value: "hombro_derecho", label: "Hombro derecho" },
      { value: "hombro_izquierdo", label: "Hombro izquierdo" },
    ],
  },
  {
    group: "Miembros superiores",
    zonas: [
      { value: "brazo_derecho", label: "Brazo derecho" },
      { value: "brazo_izquierdo", label: "Brazo izquierdo" },
      { value: "antebrazo_derecho", label: "Antebrazo derecho" },
      { value: "antebrazo_izquierdo", label: "Antebrazo izquierdo" },
      { value: "mano_derecha", label: "Mano derecha" },
      { value: "mano_izquierda", label: "Mano izquierda" },
    ],
  },
  {
    group: "Tronco",
    zonas: [
      { value: "pecho", label: "Pecho" },
      { value: "abdomen", label: "Abdomen" },
      { value: "espalda_alta", label: "Espalda alta" },
      { value: "espalda_baja", label: "Espalda baja" },
    ],
  },
  {
    group: "Miembros inferiores",
    zonas: [
      { value: "muslo_derecho", label: "Muslo derecho" },
      { value: "muslo_izquierdo", label: "Muslo izquierdo" },
      { value: "pierna_derecha", label: "Pierna derecha" },
      { value: "pierna_izquierda", label: "Pierna izquierda" },
      { value: "pie_derecho", label: "Pie derecho" },
      { value: "pie_izquierdo", label: "Pie izquierdo" },
    ],
  },
  {
    group: "Otras",
    zonas: [
      { value: "cuero_cabelludo", label: "Cuero cabelludo" },
      { value: "genital", label: "Genital", sensitive: true },
    ],
  },
];

/** Flat list of all canonical values (for whitelist checks). */
export const ZONA_VALUES: readonly string[] = ZONAS_ANATOMICAS.flatMap((g) =>
  g.zonas.map((z) => z.value),
);

/** Find the display label for a stored value. Falls back to the
 *  free-text portion when prefixed with `otra:`. Returns the raw
 *  value if neither matches. */
export function labelForZona(stored: string | null | undefined): string {
  if (!stored) return "";
  if (stored.startsWith("otra:")) {
    return stored.slice(5).trim() || "Otra";
  }
  for (const group of ZONAS_ANATOMICAS) {
    for (const zona of group.zonas) {
      if (zona.value === stored) return zona.label;
    }
  }
  return stored;
}

/** Check if a stored value is the sensitive (privacy-warning) kind. */
export function isSensitiveZona(stored: string | null | undefined): boolean {
  if (!stored) return false;
  for (const group of ZONAS_ANATOMICAS) {
    for (const zona of group.zonas) {
      if (zona.value === stored && zona.sensitive) return true;
    }
  }
  return false;
}

/** Build the "otra:<libre>" namespaced value. */
export function otraZona(libre: string): string {
  return `otra:${libre.trim().slice(0, 110)}`;
}
