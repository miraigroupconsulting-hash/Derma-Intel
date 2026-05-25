/**
 * RLS isolation test for DERMA INTEL Pro.
 *
 * Spins up 2 ephemeral médicos in Supabase, gives each 2 pacientes, then
 * verifies that:
 *   - each médico can READ only their own pacientes
 *   - each médico can UPDATE/DELETE only their own pacientes
 *   - cross-tenant INSERTs (forging medico_id) are rejected by RLS
 *   - no médico can read or update another médico's profile row
 *   - direct INSERT into medicos is blocked (only trigger can insert)
 *
 * Cleanup deletes both test médicos at the end; cascade removes their
 * pacientes.
 *
 * Run with:
 *   npm run test:rls
 *
 * Requires the same env vars as the app:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import type { Database } from "../types/database";

loadEnvConfig(process.cwd());

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error(
    "Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const admin = createClient<Database>(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
  pacienteIds: string[];
}

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label: string, extra?: unknown) {
  failed++;
  console.log(`  ✗ ${label}`);
  if (extra !== undefined) console.log("    ", extra);
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `rls-test-${label}-${randomUUID()}@dermaintel.test`;
  const password = `Pw_${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  // Sign the user in to get a regular JWT (NOT the service role).
  const userClient = createClient<Database>(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr || !session.session) {
    throw new Error(`signIn failed: ${signErr?.message}`);
  }

  return {
    id: data.user.id,
    email,
    password,
    client: userClient,
    pacienteIds: [],
  };
}

async function deleteTestUser(user: TestUser) {
  await admin.auth.admin.deleteUser(user.id);
}

async function seedPaciente(user: TestUser, nombre: string) {
  const { data, error } = await user.client
    .from("pacientes")
    .insert({
      medico_id: user.id,
      nombre,
      apellido: "Test",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedPaciente failed: ${error?.message}`);
  user.pacienteIds.push(data.id);
}

async function main() {
  console.log("\n[1/4] Creating 2 ephemeral médicos...");
  const a = await createTestUser("a");
  const b = await createTestUser("b");
  console.log(`   medico A: ${a.id}`);
  console.log(`   medico B: ${b.id}`);

  // Give each médico 2 pacientes.
  console.log("\n[2/4] Seeding 2 pacientes each (own client, RLS allows)...");
  await seedPaciente(a, "Ana");
  await seedPaciente(a, "Aurelio");
  await seedPaciente(b, "Beatriz");
  await seedPaciente(b, "Bruno");
  ok("seed succeeded for both médicos");

  console.log("\n[3/4] Running isolation checks...");

  // --- SELECT own data ---
  {
    const { data, error } = await a.client.from("pacientes").select("id");
    if (error) fail("A: select own pacientes errored", error.message);
    else if (data.length === 2) ok("A sees exactly 2 pacientes (own)");
    else fail(`A expected 2 own pacientes, saw ${data.length}`);
  }
  {
    const { data, error } = await b.client.from("pacientes").select("id");
    if (error) fail("B: select own pacientes errored", error.message);
    else if (data.length === 2) ok("B sees exactly 2 pacientes (own)");
    else fail(`B expected 2 own pacientes, saw ${data.length}`);
  }

  // --- SELECT cross-tenant by foreign id ---
  {
    const targetId = b.pacienteIds[0]!;
    const { data, error } = await a.client
      .from("pacientes")
      .select("id")
      .eq("id", targetId);
    if (error) fail("A: select foreign paciente errored", error.message);
    else if (data.length === 0) ok("A cannot read B's paciente by id");
    else fail("A leaked B's paciente!", data);
  }

  // --- UPDATE cross-tenant ---
  {
    const targetId = b.pacienteIds[0]!;
    const { data, error } = await a.client
      .from("pacientes")
      .update({ nombre: "HACKED" })
      .eq("id", targetId)
      .select("id");
    if (error) ok(`A cannot UPDATE B's paciente (errored: ${error.code ?? "?"})`);
    else if (data.length === 0)
      ok("A cannot UPDATE B's paciente (0 rows affected)");
    else fail("A managed to UPDATE B's paciente!", data);
  }

  // --- DELETE cross-tenant ---
  {
    const targetId = b.pacienteIds[1]!;
    const { data, error } = await a.client
      .from("pacientes")
      .delete()
      .eq("id", targetId)
      .select("id");
    if (error) ok(`A cannot DELETE B's paciente (errored: ${error.code ?? "?"})`);
    else if (data.length === 0)
      ok("A cannot DELETE B's paciente (0 rows affected)");
    else fail("A managed to DELETE B's paciente!", data);
  }

  // --- INSERT with foreign medico_id (forge attempt) ---
  {
    const { data, error } = await a.client
      .from("pacientes")
      .insert({
        medico_id: b.id,
        nombre: "Ghost",
        apellido: "Forge",
      })
      .select("id");
    if (error) ok(`A cannot INSERT with medico_id=B (errored: ${error.code ?? "?"})`);
    else if (!data || data.length === 0) ok("A cannot INSERT with medico_id=B (no row)");
    else fail("A managed to INSERT a paciente owned by B!", data);
  }

  // --- SELECT foreign medico profile ---
  {
    const { data, error } = await a.client
      .from("medicos")
      .select("id, email")
      .eq("id", b.id);
    if (error) fail("A: read foreign medico errored", error.message);
    else if (data.length === 0) ok("A cannot read B's medico profile");
    else fail("A leaked B's medico row!", data);
  }

  // --- UPDATE foreign medico profile ---
  {
    const { data, error } = await a.client
      .from("medicos")
      .update({ especialidad: "hack" })
      .eq("id", b.id)
      .select("id");
    if (error) ok(`A cannot UPDATE B's medico (errored: ${error.code ?? "?"})`);
    else if (data.length === 0)
      ok("A cannot UPDATE B's medico (0 rows affected)");
    else fail("A modified B's medico row!", data);
  }

  // --- Direct INSERT into medicos blocked (no policy = blocked) ---
  {
    const { data, error } = await a.client
      .from("medicos")
      .insert({
        id: randomUUID(),
        email: "ghost@spoof.test",
      })
      .select("id");
    if (error) ok(`Direct INSERT into medicos blocked (errored: ${error.code ?? "?"})`);
    else if (!data || data.length === 0) ok("Direct INSERT into medicos returned no row");
    else fail("Spoofed a medico row directly!", data);
  }

  // --- Own UPDATE still works ---
  {
    const { error } = await a.client
      .from("pacientes")
      .update({ notas: "ok-test-note" })
      .eq("id", a.pacienteIds[0]!);
    if (error) fail("A cannot UPDATE own paciente!", error.message);
    else ok("A can UPDATE own paciente");
  }

  console.log("\n[4/4] Cleanup...");
  await deleteTestUser(a);
  await deleteTestUser(b);
  ok("ephemeral médicos deleted (cascade clears pacientes)");

  console.log("\n----------------------------------------");
  console.log(`Result: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log("RLS isolation FAILED. DO NOT DEPLOY.");
    process.exit(1);
  } else {
    console.log("RLS isolation OK ✓");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
