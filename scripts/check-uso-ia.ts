/**
 * Diagnostic: dump every row in public.uso_ia for the current médico.
 * Service role bypasses RLS so we see everything; in normal use the
 * client query would already be RLS-scoped.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import type { Database } from "../types/database";

loadEnvConfig(process.cwd());

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient<Database>(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: rows, error } = await admin
    .from("uso_ia")
    .select(
      "id, medico_id, consulta_id, modo, modelo, tokens_input, tokens_output, costo_usd, latency_ms, estado, fecha",
    )
    .order("fecha", { ascending: false });
  if (error) {
    console.error(error.message);
    return;
  }
  console.log(`\nTotal calls: ${rows?.length ?? 0}\n`);
  for (const r of rows ?? []) {
    console.log(
      `${r.fecha}  modo=${r.modo}  model=${r.modelo}  in=${r.tokens_input} out=${r.tokens_output}  $${Number(r.costo_usd).toFixed(6)}  ${r.latency_ms}ms  ${r.estado}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
