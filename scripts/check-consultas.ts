/**
 * Diagnostic: list every consulta in the DB with its SOAP fields and
 * linked foto storage paths. Service role so RLS does not hide things.
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
  const { data: consultas, error } = await admin
    .from("consultas")
    .select(
      `id, paciente_id, medico_id, fecha, motivo, anamnesis, examen_fisico,
       diagnostico_diferencial, plan_terapeutico, estado, notas_ia, created_at,
       paciente:pacientes ( nombre, apellido )`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("query error:", error.message);
    return;
  }

  console.log(`\nconsultas total: ${consultas?.length ?? 0}\n`);

  for (const c of consultas ?? []) {
    const p = c.paciente;
    console.log(`# ${c.id.slice(0, 8)}…  paciente=${p?.apellido}, ${p?.nombre}`);
    console.log(`  fecha=${c.fecha}  estado=${c.estado}  motivo=${c.motivo ?? "-"}`);
    console.log(`  S: ${(c.anamnesis ?? "").slice(0, 100)}${(c.anamnesis ?? "").length > 100 ? "…" : ""}`);
    console.log(`  O: ${(c.examen_fisico ?? "").slice(0, 100)}${(c.examen_fisico ?? "").length > 100 ? "…" : ""}`);
    console.log(`  A: ${(c.diagnostico_diferencial ?? "").slice(0, 100)}${(c.diagnostico_diferencial ?? "").length > 100 ? "…" : ""}`);
    console.log(`  P: ${(c.plan_terapeutico ?? "").slice(0, 100)}${(c.plan_terapeutico ?? "").length > 100 ? "…" : ""}`);

    const { data: fotos } = await admin
      .from("fotos")
      .select("id, storage_path, tipo, zona_anatomica")
      .eq("consulta_id", c.id);
    console.log(`  fotos: ${fotos?.length ?? 0}`);
    for (const f of fotos ?? []) {
      console.log(`    - ${f.storage_path}  tipo=${f.tipo}  zona=${f.zona_anatomica ?? "-"}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
