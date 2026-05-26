/**
 * Types + parser for the recipes.revisiones audit log.
 *
 * Lives in its own module (not actions.ts) because Next.js requires
 * every export of a "use server" file to be an async Server Action,
 * which means we can't co-locate sync helpers or type exports there.
 */

export type RevisionAccion = "firmado" | "desfirmado" | "re_firmado";

export interface RevisionEntry {
  accion: RevisionAccion;
  fecha: string; // ISO timestamptz string
  pdf_storage_path: string | null;
}

/** Defensive parser for the `revisiones` jsonb column. */
export function parseRevisiones(raw: unknown): RevisionEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RevisionEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (
      (o.accion === "firmado" ||
        o.accion === "desfirmado" ||
        o.accion === "re_firmado") &&
      typeof o.fecha === "string"
    ) {
      out.push({
        accion: o.accion,
        fecha: o.fecha,
        pdf_storage_path:
          typeof o.pdf_storage_path === "string" ? o.pdf_storage_path : null,
      });
    }
  }
  return out;
}
