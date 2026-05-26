/**
 * lib/prompts/builder.ts
 *
 * Compose the system prompt that goes to Claude for a given clinical
 * mode. Layout:
 *
 *   <base §2 — ethical framing, role, format rules>
 *   ---
 *   ## Modo activo: {LABEL}
 *
 *   <mode body §3-§8>
 *
 *   ---
 *
 *   CIERRE OBLIGATORIO al final de tu respuesta...
 *
 * The final paragraph reinforces the disclaimer that §11 of the v2
 * file already demands. We repeat it here because (a) the per-mode
 * body sometimes pushes the §11 instructions far back in context,
 * (b) the route handler also injects the disclaimer if the response
 * still lacks it. Triple seguro per CLAUDE.md §2.4.
 */

import { loadPrompts, type ClinicalMode } from "./parser";

const MODE_LABEL: Record<ClinicalMode, string> = {
  CASO_CLINICO: "Caso Clínico (análisis completo)",
  EXPRESS: "Express (análisis rápido)",
  BIBLIOGRAFIA: "Bibliografía (evidencia)",
  HISTOPATOLOGIA: "Histopatología",
  TERAPEUTICA: "Terapéutica (plan de tratamiento)",
  DOCENTE: "Docente (educativo)",
};

const MANDATORY_DISCLAIMER =
  "Sugerencia educativa. La decisión clínica final corresponde al médico tratante.";

const CIERRE_INSTRUCTION = `---

CIERRE OBLIGATORIO: termina tu respuesta con este disclaimer literal en cursiva, sin omitirlo nunca:

_${MANDATORY_DISCLAIMER}_`;

export async function buildPrompt(mode: ClinicalMode): Promise<string> {
  const { base, modes } = await loadPrompts();
  const modeBody = modes[mode];
  const label = MODE_LABEL[mode];

  return `${base}

---

## Modo activo: ${label}

${modeBody}

${CIERRE_INSTRUCTION}`;
}

export function getMandatoryDisclaimer(): string {
  return MANDATORY_DISCLAIMER;
}

/**
 * Detect whether a Claude response already contains the disclaimer
 * (with or without italics/markdown). Used by the route handler to
 * skip injection when Claude obeyed the closing instruction.
 */
export function responseHasDisclaimer(text: string): boolean {
  // Normalize: strip markdown emphasis, collapse whitespace, lower.
  const normalized = text
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const needle = MANDATORY_DISCLAIMER.replace(/\s+/g, " ").toLowerCase();
  return normalized.includes(needle);
}
