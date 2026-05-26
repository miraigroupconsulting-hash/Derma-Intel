/**
 * lib/recipe-sync.ts
 *
 * Drains the récipe outbox (PDFs the médica firmó offline but we
 * couldn't upload) and ships each entry. Called:
 *
 *   - On window 'online' event (auto-retry)
 *   - On explicit user click of "Reintentar pendientes" in dashboard
 *   - On every successful saveRecipe (best-effort opportunistic drain)
 *
 * Failure handling:
 *   - Transient (network/5xx): increment attempts, leave in outbox.
 *   - Permanent (4xx, RLS denied, schema mismatch): increment attempts,
 *     surface lastError, leave in outbox so the médica decides what to
 *     do. We never silently drop a signed récipe.
 *
 * Server-side dependencies:
 *   - createClient (browser supabase) → for Storage upload
 *   - saveRecipe server action → for DB row insert
 *
 * The shape of `payload.medicamentos` is whatever the client built at
 * firma time; the server action re-validates with zod so we don't
 * worry about drift here.
 */
import { createClient } from "@/lib/supabase/client";
import {
  listOutboxRecipes,
  removeOutboxRecipe,
  updateOutboxRecipe,
  type OutboxRecipe,
} from "@/lib/offline-db";
import { saveRecipe } from "@/app/consulta/[id]/recipe/actions";
import type { Medicamento } from "@/app/consulta/[id]/recipe/schema";

const MAX_ATTEMPTS = 5;

export interface SyncResult {
  drained: number;
  failed: number;
  remaining: number;
}

export async function syncOutbox(medicoId: string): Promise<SyncResult> {
  const pending = await listOutboxRecipes(medicoId);
  let drained = 0;
  let failed = 0;

  for (const entry of pending) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      failed++;
      continue;
    }
    try {
      await replayOutboxEntry(entry);
      await removeOutboxRecipe(entry.id);
      drained++;
    } catch (err) {
      failed++;
      await updateOutboxRecipe(entry.id, {
        attempts: entry.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const remaining = pending.length - drained;
  return { drained, failed, remaining };
}

async function replayOutboxEntry(entry: OutboxRecipe): Promise<void> {
  const supabase = createClient();

  // Upload PDF
  const { error: upErr } = await supabase.storage
    .from("recetas-pdf")
    .upload(entry.pdfStoragePath, entry.pdfBlob, {
      contentType: "application/pdf",
      upsert: false,
    });
  // 409 (already exists) means a previous attempt got past upload but
  // failed on insert. We can proceed to saveRecipe with the existing path.
  if (upErr && !/already exists|duplicate/i.test(upErr.message)) {
    throw new Error(`Upload falló: ${upErr.message}`);
  }

  // Insert DB row via server action
  const result = await saveRecipe({
    consulta_id: entry.consulta_id,
    medicamentos: entry.payload.medicamentos as Medicamento[],
    indicaciones_paciente: entry.payload.indicaciones_paciente,
    firmado: entry.payload.firmado,
    pdf_storage_path: entry.pdfStoragePath,
    existingRecipeId: entry.payload.existingRecipeId,
  });
  if (result.error) {
    throw new Error(result.error);
  }
}

/**
 * Trigger a synchronous-feeling browser download of a blob with a
 * suggested filename. Used as fallback when the upload fails offline:
 * the médica still gets the PDF in their device so they can hand it to
 * the patient via WhatsApp directly.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser actually starts the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
