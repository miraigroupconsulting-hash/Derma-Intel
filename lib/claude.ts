import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Single entry point for every Claude API call in the app.
 * NEVER import @anthropic-ai/sdk directly anywhere else.
 *
 * See prompts/derma-intel-v2.md for the system prompt and the
 * six clinical modes.
 *
 * Usage examples:
 *   const out = await runClinicalCall({
 *     mode: "EXPRESS",
 *     userMessages: [{ role: "user", content: "..." }],
 *   });
 */

// ---------------------------------------------------------------------
// Client (lazy-init so this module is safe to import server-side only)
// ---------------------------------------------------------------------

let _client: Anthropic | null = null;

/**
 * Resolve the Anthropic API key with a defensive fallback.
 *
 * In hosted environments (Vercel) the key is injected into process.env
 * directly and we use it as-is. In local development a parent shell may
 * export ANTHROPIC_API_KEY="" (empty string), which silently wins over
 * .env.local because dotenv does not override existing env vars. When
 * the inherited value is empty we fall back to reading .env.local from
 * disk so the dev server still works without the developer having to
 * unset the shell variable first.
 */
function resolveApiKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!existsSync(envPath)) return undefined;
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const idx = line.indexOf("=");
      if (idx < 0) continue;
      const k = line.slice(0, idx).trim();
      if (k !== "ANTHROPIC_API_KEY") continue;
      let v = line.slice(idx + 1).trim();
      // Strip surrounding quotes if present.
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v.length > 0 ? v : undefined;
    }
  } catch {
    // ignore — caller will throw the user-friendly message
  }
  return undefined;
}

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (server-only).",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// ---------------------------------------------------------------------
// Model router
// ---------------------------------------------------------------------

/**
 * The six clinical modes (see prompts/derma-intel-v2.md §3–§8).
 * Use SCREAMING_SNAKE in the wire payload so the prompt can match.
 */
export type ClinicalMode =
  | "CASO_CLINICO"
  | "EXPRESS"
  | "BIBLIOGRAFIA"
  | "HISTOPATOLOGIA"
  | "TERAPEUTICA"
  | "DOCENTE";

export type ModelTask = "clinical" | "light" | "vision";

/**
 * Pick the right Claude model for the task.
 *
 *   clinical → claude-sonnet-4-6 (deep reasoning, costlier)
 *   light    → claude-haiku-4-5  (fast/cheap, classification/parsing)
 *   vision   → claude-sonnet-4-6 (image analysis needs the larger model)
 *
 * Express mode uses Haiku; everything else uses Sonnet.
 * Update model IDs here when Anthropic ships new versions.
 */
export function pickModel(task: ModelTask): string {
  switch (task) {
    case "light":
      return "claude-haiku-4-5";
    case "clinical":
    case "vision":
      return "claude-sonnet-4-6";
  }
}

/**
 * Routing per CLAUDE.md §4 + Day 4 brief:
 *   Haiku 4.5 (light) → Express, Terapéutica
 *   Sonnet 4.6 (clinical/vision) → Caso Clínico, Bibliografía,
 *                                  Histopatología, Docente
 */
export function pickModelForMode(mode: ClinicalMode): string {
  return mode === "EXPRESS" || mode === "TERAPEUTICA"
    ? pickModel("light")
    : pickModel("clinical");
}

// ---------------------------------------------------------------------
// Prompt loader (reads prompts/derma-intel-v2.md, extracts §2 system prompt)
// ---------------------------------------------------------------------

const PROMPT_FILE = path.join(process.cwd(), "prompts", "derma-intel-v2.md");

let _systemPromptCache: string | null = null;

/**
 * Load the system prompt block from prompts/derma-intel-v2.md (§2).
 * Cached for the lifetime of the server process.
 *
 * Extraction strategy: take the content of the first 4-backtick fence
 * after the "## 2. System Prompt" heading. This keeps the prompt
 * editable in markdown without sprinkling it across TypeScript files.
 */
export async function loadSystemPrompt(): Promise<string> {
  if (_systemPromptCache) return _systemPromptCache;

  const raw = await fs.readFile(PROMPT_FILE, "utf8");
  const fence = "````";
  const heading = "## 2. System Prompt";
  const headingIdx = raw.indexOf(heading);
  if (headingIdx === -1) {
    throw new Error(`Could not find "${heading}" in ${PROMPT_FILE}`);
  }
  const openIdx = raw.indexOf(fence, headingIdx);
  if (openIdx === -1) {
    throw new Error(`Could not find opening 4-backtick fence after ${heading}`);
  }
  const contentStart = openIdx + fence.length;
  const closeIdx = raw.indexOf(fence, contentStart);
  if (closeIdx === -1) {
    throw new Error(`Could not find closing 4-backtick fence for system prompt`);
  }
  const prompt = raw.slice(contentStart, closeIdx).trim();
  _systemPromptCache = prompt;
  return prompt;
}

// ---------------------------------------------------------------------
// Public call helper
// ---------------------------------------------------------------------

export interface ClinicalCallInput {
  mode: ClinicalMode;
  /** Conversation history. The system prompt is loaded automatically. */
  userMessages: Anthropic.MessageParam[];
  /** Override model selection if you really need to. */
  modelOverride?: string;
  /** Max tokens for the response. Defaults to 2048. */
  maxTokens?: number;
  /**
   * Override the system prompt entirely. When set, skip the §2 loader
   * and use this string directly. Used by /api/ia/consultar which
   * composes a per-mode prompt via lib/prompts/builder.
   */
  systemPromptOverride?: string;
}

/**
 * Run a clinical call with the v2 system prompt injected.
 * Returns the full Anthropic response (not the text only) so the caller
 * can inspect token usage, stop reason, and structured content blocks.
 */
export async function runClinicalCall(input: ClinicalCallInput) {
  const system = input.systemPromptOverride ?? (await loadSystemPrompt());
  const model = input.modelOverride ?? pickModelForMode(input.mode);

  return client().messages.create({
    model,
    max_tokens: input.maxTokens ?? 2048,
    system,
    messages: input.userMessages,
  });
}

/**
 * Streaming variant. Returns the Anthropic MessageStream so the
 * caller can iterate text deltas and forward them via SSE. The
 * caller is responsible for closing the stream and reading the
 * final usage from stream.finalMessage().
 */
export function streamClinicalCall(input: ClinicalCallInput) {
  const model = input.modelOverride ?? pickModelForMode(input.mode);
  return (async () => {
    const system = input.systemPromptOverride ?? (await loadSystemPrompt());
    return client().messages.stream({
      model,
      max_tokens: input.maxTokens ?? 2500,
      system,
      messages: input.userMessages,
    });
  })();
}
