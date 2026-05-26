/**
 * lib/prompts/parser.ts
 *
 * Single source of truth: parse prompts/derma-intel-v2.md at runtime
 * (server-side only) into the base system prompt and the six mode
 * sections. Cached per-process so we read the file once.
 *
 * Why parse the markdown instead of mirroring it into TypeScript
 * constants?  The clinical brain is a living document — Fer's wife
 * will tune it. The product never has two stale copies to drift
 * between: edits to derma-intel-v2.md ship as-is on the next request.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export type ClinicalMode =
  | "CASO_CLINICO"
  | "EXPRESS"
  | "BIBLIOGRAFIA"
  | "HISTOPATOLOGIA"
  | "TERAPEUTICA"
  | "DOCENTE";

/**
 * Maps each mode to the canonical Spanish heading we search for in
 * the markdown file. Accents and casing matter — the file uses
 * "## 3. Modo CASO CLÍNICO (análisis completo)" etc.
 */
const MODE_HEADING: Record<ClinicalMode, RegExp> = {
  CASO_CLINICO: /^##\s*\d+\.\s*Modo\s+CASO\s+CL[IÍ]NICO\b/im,
  EXPRESS: /^##\s*\d+\.\s*Modo\s+EXPRESS\b/im,
  BIBLIOGRAFIA: /^##\s*\d+\.\s*Modo\s+BIBLIOGRAF[IÍ]A\b/im,
  HISTOPATOLOGIA: /^##\s*\d+\.\s*Modo\s+HISTOPATOLOG[IÍ]A\b/im,
  TERAPEUTICA: /^##\s*\d+\.\s*Modo\s+TERAP[EÉ]UTICA\b/im,
  DOCENTE: /^##\s*\d+\.\s*Modo\s+DOCENTE\b/im,
};

export interface ParsedPrompts {
  /** §2 of the v2 file: the literal text sent as the API system prompt. */
  base: string;
  /** §3-§8 raw markdown, one per mode. */
  modes: Record<ClinicalMode, string>;
}

const PROMPT_FILE = path.join(process.cwd(), "prompts", "derma-intel-v2.md");
const IS_DEV = process.env.NODE_ENV === "development";

let _cache: ParsedPrompts | null = null;

/**
 * Read + parse the prompt file. Cached in production for the lifetime
 * of the server process; bypassed in development so the dermatóloga can
 * tune the prompt without restarting the dev server. Throws if the
 * file or any required section is missing — failing fast beats
 * silently sending half-built prompts to a clinical IA.
 */
export async function loadPrompts(): Promise<ParsedPrompts> {
  if (_cache && !IS_DEV) return _cache;

  const raw = await fs.readFile(PROMPT_FILE, "utf8");
  const base = extractBase(raw);
  const modes: Record<ClinicalMode, string> = {
    CASO_CLINICO: extractMode(raw, "CASO_CLINICO"),
    EXPRESS: extractMode(raw, "EXPRESS"),
    BIBLIOGRAFIA: extractMode(raw, "BIBLIOGRAFIA"),
    HISTOPATOLOGIA: extractMode(raw, "HISTOPATOLOGIA"),
    TERAPEUTICA: extractMode(raw, "TERAPEUTICA"),
    DOCENTE: extractMode(raw, "DOCENTE"),
  };

  _cache = { base, modes };
  return _cache;
}

/**
 * Test hook — drop the cache so a fresh read happens on the next
 * call. Used by unit tests; safe to call in dev too.
 */
export function _resetPromptCache(): void {
  _cache = null;
}

/**
 * Extract the §2 system prompt — the 4-backtick fenced block that
 * follows the "## 2. System Prompt" heading.
 */
function extractBase(raw: string): string {
  const headingIdx = raw.search(/^##\s*2\.\s*System\s+Prompt/im);
  if (headingIdx < 0) {
    throw new Error(
      `Missing "## 2. System Prompt" heading in ${PROMPT_FILE}`,
    );
  }
  const fence = "````";
  const openIdx = raw.indexOf(fence, headingIdx);
  if (openIdx < 0) {
    throw new Error(
      `Could not find opening 4-backtick fence for §2 in ${PROMPT_FILE}`,
    );
  }
  const contentStart = openIdx + fence.length;
  const closeIdx = raw.indexOf(fence, contentStart);
  if (closeIdx < 0) {
    throw new Error(
      `Could not find closing 4-backtick fence for §2 in ${PROMPT_FILE}`,
    );
  }
  return raw.slice(contentStart, closeIdx).trim();
}

/**
 * Extract one mode section. The section begins at its "## N. Modo X"
 * heading and ends at the next "## " heading (or EOF). We keep the
 * heading itself out of the returned content to avoid a duplicate
 * "Modo X" line when we compose the prompt.
 */
function extractMode(raw: string, mode: ClinicalMode): string {
  const headingRegex = MODE_HEADING[mode];
  const match = headingRegex.exec(raw);
  if (!match || match.index === undefined) {
    throw new Error(`Missing heading for mode ${mode} in ${PROMPT_FILE}`);
  }
  const startOfHeadingLine = match.index;
  // Advance past the heading line so the body starts cleanly.
  const newlineAfterHeading = raw.indexOf("\n", startOfHeadingLine);
  const bodyStart =
    newlineAfterHeading < 0 ? raw.length : newlineAfterHeading + 1;

  // Find the next top-level "## " heading.
  const nextHeading = raw.slice(bodyStart).search(/^##\s+/m);
  const bodyEnd = nextHeading < 0 ? raw.length : bodyStart + nextHeading;

  return raw.slice(bodyStart, bodyEnd).trim();
}
