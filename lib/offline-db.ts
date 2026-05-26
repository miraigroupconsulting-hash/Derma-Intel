/**
 * lib/offline-db.ts
 *
 * IndexedDB wrapper for DERMA INTEL Pro offline functionality.
 * Uses the `idb` library (Jake Archibald, 0 deps) which exposes a
 * Promise-based API over the raw IndexedDB callbacks.
 *
 * Stores defined here:
 *
 *   - `pacientes_cache`   — last-N viewed pacientes + their consultas.
 *                           Key: paciente.id (uuid).
 *                           Used as read-only fallback when offline.
 *
 *   - `recipe_outbox`     — récipes firmados localmente whose PDF could
 *                           NOT be uploaded to Supabase Storage yet
 *                           (network failed). The PDF blob is stored
 *                           inline alongside the payload needed to
 *                           replay the upload + saveRecipe action.
 *                           Key: client-generated uuid.
 *
 * All client-side. Lives in the browser of the médica's device. RLS
 * doesn't apply here because nothing is sent to the server — but we
 * still scope each entry by `medico_id` so a shared device with two
 * accounts doesn't cross-contaminate.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const DB_NAME = "derma-intel-pro";
export const DB_VERSION = 1;

// =====================================================================
// Schema
// =====================================================================

export interface CachedPaciente {
  id: string;
  medico_id: string;
  /** Snapshot of the row from public.pacientes (subset we render). */
  paciente: {
    id: string;
    nombre: string;
    apellido: string;
    fecha_nacimiento: string | null;
    sexo: string | null;
    tipo_piel_fitzpatrick: number | null;
    cedula: string | null;
    telefono: string | null;
    email: string | null;
    alergias: string | null;
    antecedentes: string | null;
    medicacion_actual: string | null;
    notas: string | null;
    archivado: boolean;
  };
  /** Up to last-3 consultas, ordered fecha desc. */
  consultas: Array<{
    id: string;
    fecha: string;
    motivo: string | null;
    estado: "borrador" | "completada" | "archivada";
  }>;
  /** ISO timestamp of when this snapshot was taken. */
  cachedAt: string;
}

export interface OutboxRecipe {
  /** Local UUID generated on enqueue. */
  id: string;
  medico_id: string;
  consulta_id: string;
  paciente_id: string;
  /** The rendered PDF blob, ready to upload to Storage. */
  pdfBlob: Blob;
  /** Target Storage path: `${medico_id}/${consulta_id}/${recipeUuid}.pdf` */
  pdfStoragePath: string;
  /** Payload for the saveRecipe server action (medicamentos, indicaciones, etc.). */
  payload: {
    medicamentos: unknown[]; // raw shape — re-validated server-side
    indicaciones_paciente: string | null;
    firmado: boolean;
    existingRecipeId?: string;
  };
  /** ISO timestamp when the user firmó (NOT when we successfully uploaded). */
  firmadoAt: string;
  /** Retry counter. After 5 failed attempts we surface a hard error. */
  attempts: number;
  /** Last error message (best-effort). */
  lastError: string | null;
}

interface DermaIntelDB extends DBSchema {
  pacientes_cache: {
    key: string; // paciente.id
    value: CachedPaciente;
    indexes: { "by-medico": string; "by-cached-at": string };
  };
  recipe_outbox: {
    key: string; // outbox entry id
    value: OutboxRecipe;
    indexes: { "by-medico": string };
  };
}

// =====================================================================
// Singleton connection
// =====================================================================

let dbPromise: Promise<IDBPDatabase<DermaIntelDB>> | null = null;

export function openOfflineDb(): Promise<IDBPDatabase<DermaIntelDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible en este entorno."));
  }
  if (!dbPromise) {
    dbPromise = openDB<DermaIntelDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pacientes_cache")) {
          const store = db.createObjectStore("pacientes_cache", {
            keyPath: "id",
          });
          store.createIndex("by-medico", "medico_id");
          store.createIndex("by-cached-at", "cachedAt");
        }
        if (!db.objectStoreNames.contains("recipe_outbox")) {
          const store = db.createObjectStore("recipe_outbox", {
            keyPath: "id",
          });
          store.createIndex("by-medico", "medico_id");
        }
      },
    });
  }
  return dbPromise;
}

// =====================================================================
// Pacientes cache helpers
// =====================================================================

const PACIENTE_TTL_DAYS = 7;

export async function cachePaciente(entry: CachedPaciente): Promise<void> {
  const db = await openOfflineDb();
  await db.put("pacientes_cache", entry);
}

export async function readCachedPaciente(
  id: string,
): Promise<CachedPaciente | null> {
  const db = await openOfflineDb();
  const got = await db.get("pacientes_cache", id);
  if (!got) return null;
  // TTL: stale entries are still served (better than nothing offline) —
  // we just surface the cachedAt timestamp to the UI. Hard-delete only
  // when much older than TTL so cleanup doesn't break a power-cut
  // session that's been running for a week.
  const ageDays =
    (Date.now() - new Date(got.cachedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > PACIENTE_TTL_DAYS * 4) {
    await db.delete("pacientes_cache", id);
    return null;
  }
  return got;
}

export async function listCachedPacientes(
  medicoId: string,
): Promise<CachedPaciente[]> {
  const db = await openOfflineDb();
  return db.getAllFromIndex("pacientes_cache", "by-medico", medicoId);
}

// =====================================================================
// Recipe outbox helpers
// =====================================================================

export async function enqueueRecipe(entry: OutboxRecipe): Promise<void> {
  const db = await openOfflineDb();
  await db.put("recipe_outbox", entry);
}

export async function listOutboxRecipes(
  medicoId: string,
): Promise<OutboxRecipe[]> {
  const db = await openOfflineDb();
  return db.getAllFromIndex("recipe_outbox", "by-medico", medicoId);
}

export async function removeOutboxRecipe(id: string): Promise<void> {
  const db = await openOfflineDb();
  await db.delete("recipe_outbox", id);
}

export async function updateOutboxRecipe(
  id: string,
  patch: Partial<Pick<OutboxRecipe, "attempts" | "lastError">>,
): Promise<void> {
  const db = await openOfflineDb();
  const existing = await db.get("recipe_outbox", id);
  if (!existing) return;
  await db.put("recipe_outbox", { ...existing, ...patch });
}
