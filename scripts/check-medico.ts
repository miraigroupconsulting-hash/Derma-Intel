/**
 * One-shot diagnostic: check whether the production user has a row
 * in public.medicos. Used to confirm whether the Day-1 user predates
 * the auto-create trigger added in Day 2.
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
  const { data: users, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) throw usersErr;

  console.log(`\nauth.users count: ${users.users.length}`);
  for (const u of users.users) {
    const { data: medico } = await admin
      .from("medicos")
      .select("id, email, nombre, apellido, especialidad, cedula_profesional, pais_cedula, onboarding_completed")
      .eq("id", u.id)
      .maybeSingle();
    console.log(`- ${u.email} (id ${u.id.slice(0, 8)}…)`);
    console.log(`    medico row: ${medico ? "YES" : "MISSING"}`);
    if (medico) {
      console.log(`      onboarding_completed=${medico.onboarding_completed}`);
      console.log(`      cedula=${medico.cedula_profesional ?? "null"}, especialidad=${medico.especialidad ?? "null"}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
