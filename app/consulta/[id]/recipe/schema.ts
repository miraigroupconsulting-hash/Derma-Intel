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

export const medicamentoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Indica el nombre del fármaco.")
    .max(200),
  presentacion: z.string().trim().max(200).optional().nullable(),
  dosis: z
    .string()
    .trim()
    .min(1, "Indica la dosis.")
    .max(200),
  via: z.string().trim().max(60).optional().nullable(),
  duracion: z.string().trim().max(200).optional().nullable(),
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
  dosis: "",
  via: null,
  duracion: null,
  indicaciones: null,
};
