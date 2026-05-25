/**
 * Diagnostic: list every paciente row in the DB and the médico it
 * belongs to. Run with service role so RLS does not hide anything.
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
  const { data: medicos } = await admin
    .from("medicos")
    .select("id, email, nombre, apellido, onboarding_completed");
  console.log("\nmedicos:");
  for (const m of medicos ?? []) {
    console.log(
      `- ${m.email} (id ${m.id.slice(0, 8)}…) onb=${m.onboarding_completed} nombre=${m.nombre ?? "null"}`,
    );
  }

  const { data: pacientes, error } = await admin
    .from("pacientes")
    .select("id, medico_id, nombre, apellido, archivado, created_at")
    .order("created_at", { ascending: false });

  console.log("\npacientes:");
  if (error) {
    console.log("error:", error.message);
    return;
  }
  console.log(`  total rows: ${pacientes?.length ?? 0}`);
  for (const p of pacientes ?? []) {
    console.log(
      `- ${p.apellido}, ${p.nombre}  medico=${p.medico_id.slice(0, 8)}…  archivado=${p.archivado}  created=${p.created_at}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
