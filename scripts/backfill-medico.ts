/**
 * One-shot backfill: insert public.medicos rows for any auth.users that
 * predate the handle_new_auth_user trigger. Idempotent (skips rows that
 * already exist). Run with: npx tsx scripts/backfill-medico.ts
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
  const { data: users, error } = await admin.auth.admin.listUsers();
  if (error) throw error;

  for (const u of users.users) {
    const { data: existing } = await admin
      .from("medicos")
      .select("id")
      .eq("id", u.id)
      .maybeSingle();
    if (existing) {
      console.log(`skip ${u.email} (row exists)`);
      continue;
    }
    if (!u.email) {
      console.log(`skip ${u.id} (no email)`);
      continue;
    }
    const { error: insertErr } = await admin.from("medicos").insert({
      id: u.id,
      email: u.email,
    });
    if (insertErr) {
      console.error(`FAIL ${u.email}: ${insertErr.message}`);
    } else {
      console.log(`inserted ${u.email}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
