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

  // ====================================================================
  // Cross-tenant denial on EVERY child PHI table.
  // Seed one row of each for médico B (B's own client, RLS allows), then
  // assert médico A querying that row by id returns 0 rows. This is the
  // "requesting X owned by another user returns no rows" proof the audit
  // asked for, generalized beyond pacientes.
  // ====================================================================
  console.log("\n[3b/4] Cross-tenant denial on child PHI tables...");

  type PhiChildTable =
    | "consultas"
    | "fotos"
    | "recipes"
    | "recordatorios"
    | "notificaciones"
    | "comparaciones"
    | "informes";
  const bPaciente = b.pacienteIds[0]!;
  const childIds: Partial<Record<PhiChildTable, string>> = {};

  // consultas
  {
    const { data, error } = await b.client
      .from("consultas")
      .insert({ medico_id: b.id, paciente_id: bPaciente, motivo: "RLS test" })
      .select("id")
      .single();
    if (error || !data) fail("seed B consulta", error?.message);
    else childIds.consultas = data.id;
  }
  // fotos (two — needed for comparaciones)
  const bFotoIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { data, error } = await b.client
      .from("fotos")
      .insert({
        medico_id: b.id,
        paciente_id: bPaciente,
        consulta_id: childIds.consultas ?? null,
        storage_path: `${b.id}/rls-test/foto-${i}.jpg`,
        tipo: "clinica",
      })
      .select("id")
      .single();
    if (error || !data) fail(`seed B foto ${i}`, error?.message);
    else bFotoIds.push(data.id);
  }
  if (bFotoIds[0]) childIds.fotos = bFotoIds[0];
  // recipes
  if (childIds.consultas) {
    const { data, error } = await b.client
      .from("recipes")
      .insert({
        medico_id: b.id,
        paciente_id: bPaciente,
        consulta_id: childIds.consultas,
        medicamentos: [],
      })
      .select("id")
      .single();
    if (error || !data) fail("seed B recipe", error?.message);
    else childIds.recipes = data.id;
  }
  // recordatorios
  {
    const { data, error } = await b.client
      .from("recordatorios")
      .insert({
        medico_id: b.id,
        paciente_id: bPaciente,
        tipo: "control",
        fecha_objetivo: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) fail("seed B recordatorio", error?.message);
    else childIds.recordatorios = data.id;
  }
  // notificaciones
  {
    const { data, error } = await b.client
      .from("notificaciones")
      .insert({
        medico_id: b.id,
        paciente_id: bPaciente,
        tipo: "alerta",
        titulo: "RLS test",
      })
      .select("id")
      .single();
    if (error || !data) fail("seed B notificacion", error?.message);
    else childIds.notificaciones = data.id;
  }
  // comparaciones
  if (bFotoIds[0] && bFotoIds[1]) {
    const { data, error } = await b.client
      .from("comparaciones")
      .insert({
        medico_id: b.id,
        paciente_id: bPaciente,
        foto_antes_id: bFotoIds[0],
        foto_despues_id: bFotoIds[1],
      })
      .select("id")
      .single();
    if (error || !data) fail("seed B comparacion", error?.message);
    else childIds.comparaciones = data.id;
  }
  // informes
  if (childIds.consultas) {
    const { data, error } = await b.client
      .from("informes")
      .insert({
        medico_id: b.id,
        paciente_id: bPaciente,
        consulta_id: childIds.consultas,
      })
      .select("id")
      .single();
    if (error || !data) fail("seed B informe", error?.message);
    else childIds.informes = data.id;
  }

  ok(`seeded ${Object.keys(childIds).length} child rows for B`);

  // A must see ZERO of B's child rows on every table.
  for (const [table, rowId] of Object.entries(childIds) as [
    PhiChildTable,
    string,
  ][]) {
    const { data, error } = await a.client
      .from(table)
      .select("id")
      .eq("id", rowId);
    if (error) fail(`A: select foreign ${table} errored`, error.message);
    else if ((data ?? []).length === 0)
      ok(`A cannot read B's ${table} by id (0 rows)`);
    else fail(`A leaked B's ${table}!`, data);
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
