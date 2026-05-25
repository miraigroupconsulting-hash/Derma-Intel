/**
 * Diagnostic: verifies that lib/claude.ts can pick up
 * ANTHROPIC_API_KEY from .env.local and round-trip a tiny
 * Haiku call. Useful when /api/ia/estructurar-soap is failing
 * silently and we need to localize the problem.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  console.log("key present?", !!process.env.ANTHROPIC_API_KEY);
  console.log(
    "key starts:",
    (process.env.ANTHROPIC_API_KEY ?? "").slice(0, 12),
  );
  const { runClinicalCall } = await import("../lib/claude");
  const t0 = Date.now();
  const res = await runClinicalCall({
    mode: "EXPRESS",
    maxTokens: 50,
    userMessages: [{ role: "user", content: "Responde con la palabra: OK" }],
  });
  const dt = Date.now() - t0;
  const usage = (res.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
  console.log(
    `OK: model=${res.model} input=${usage.input_tokens ?? "?"} output=${usage.output_tokens ?? "?"} latency_ms=${dt}`,
  );
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
