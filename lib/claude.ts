import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
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

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
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

export function pickModelForMode(mode: ClinicalMode): string {
  return mode === "EXPRESS" ? pickModel("light") : pickModel("clinical");
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
}

/**
 * Run a clinical call with the v2 system prompt injected.
 * Returns the full Anthropic response (not the text only) so the caller
 * can inspect token usage, stop reason, and structured content blocks.
 */
export async function runClinicalCall(input: ClinicalCallInput) {
  const system = await loadSystemPrompt();
  const model = input.modelOverride ?? pickModelForMode(input.mode);

  return client().messages.create({
    model,
    max_tokens: input.maxTokens ?? 2048,
    system,
    messages: input.userMessages,
  });
}
