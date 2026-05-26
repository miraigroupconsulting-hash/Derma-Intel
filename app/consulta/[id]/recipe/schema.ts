import { z } from "zod";

export const VIAS_ADMIN = [
  "Oral",
  "Tópica",
  "Intramuscular",
  "Subcutánea",
  "Intravenosa",
  "Inhalada",
  "Oftálmica",
  "Ótica",
  "Rectal",
  "Otra",
] as const;

/**
 * Día 5 — schema extendido para recipe.
 *
 * Campos nuevos sobre Día 4:
 *   concentracion, cantidad, frecuencia, zona, es_controlado
 *
 * `dosis` se mantiene como campo opcional para retrocompatibilidad
 * con récipes existentes. Si solo está `dosis` (legacy), el PDF lo
 * usa como línea de "frecuencia". Si están los campos nuevos, se
 * usan en su lugar y `dosis` se ignora visualmente.
 *
 * `nombre` ahora exige solo 1 char (en lugar de 2) porque algunos
 * fármacos abreviados son cortos. Validación clínica fuerte la hace
 * el médico al revisar; el schema no debe pelearle.
 */
export const medicamentoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Indica el nombre del fármaco.")
    .max(200),
  presentacion: z.string().trim().max(200).optional().nullable(),
  concentracion: z.string().trim().max(100).optional().nullable(),
  cantidad: z.string().trim().max(100).optional().nullable(),
  frecuencia: z.string().trim().max(200).optional().nullable(),
  duracion: z.string().trim().max(200).optional().nullable(),
  via: z.string().trim().max(60).optional().nullable(),
  zona: z.string().trim().max(120).optional().nullable(),
  es_controlado: z.boolean().default(false),
  /** Legacy field — kept nullable for backward compat with Día-4
   *  recipes already stored in DB. New flows fill the structured
   *  fields above instead. */
  dosis: z.string().trim().max(200).optional().nullable(),
  indicaciones: z.string().trim().max(600).optional().nullable(),
});

export type Medicamento = z.infer<typeof medicamentoSchema>;

export const saveRecipeSchema = z.object({
  consulta_id: z.string().uuid(),
  medicamentos: z
    .array(medicamentoSchema)
    .min(1, "El récipe debe tener al menos un fármaco."),
  indicaciones_paciente: z.string().trim().max(2000).optional().nullable(),
  firmado: z.boolean().default(false),
});

export type SaveRecipeInput = z.infer<typeof saveRecipeSchema>;

export const EMPTY_MEDICAMENTO: Medicamento = {
  nombre: "",
  presentacion: null,
  concentracion: null,
  cantidad: null,
  frecuencia: null,
  duracion: null,
  via: null,
  zona: null,
  es_controlado: false,
  dosis: null,
  indicaciones: null,
};

/**
 * Pure helper. Lives in schema.ts (not actions.ts) because actions.ts
 * is a "use server" file — Next.js requires every export there to be
 * an async Server Action.
 *
 * Reasonable starter medicamentos derived from the consulta's
 * plan_terapeutico free text. Heuristic only — split by newline and
 * treat each substantive line as a draft entry. Médico edits before
 * saving.
 */
export function suggestMedicamentosFromPlan(plan: string | null): Medicamento[] {
  if (!plan || !plan.trim()) return [];
  const lines = plan
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4);
  return lines.slice(0, 5).map((l) => ({
    ...EMPTY_MEDICAMENTO,
    nombre: l.slice(0, 200),
  }));
}
