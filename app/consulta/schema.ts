import { z } from "zod";

/**
 * SOAP shape returned by the IA endpoint AND used by the form state.
 *
 * Field names match the dermatology SOAP convention used in the
 * Spanish-speaking world:
 *   - subjetivo  (Subjective)  → patient-reported symptoms
 *   - objetivo   (Objective)   → physical exam findings
 *   - analisis   (Assessment)  → clinical impression, NEVER a "diagnosis"
 *   - plan       (Plan)        → next actions discussed with the patient
 *
 * The IA also returns whether the anamnesis felt complete and a list of
 * follow-up questions if not. We treat both as advisory and never block
 * the save on them.
 */
export const soapSchema = z.object({
  subjetivo: z.string().default(""),
  objetivo: z.string().default(""),
  analisis: z.string().default(""),
  plan: z.string().default(""),
  anamnesis_completa: z.boolean().default(true),
  datos_faltantes: z.array(z.string()).default([]),
});

export type SoapData = z.infer<typeof soapSchema>;

export const EMPTY_SOAP: SoapData = {
  subjetivo: "",
  objetivo: "",
  analisis: "",
  plan: "",
  anamnesis_completa: true,
  datos_faltantes: [],
};

/**
 * Input contract for POST /api/ia/estructurar-soap.
 *
 * `current_soap` is optional. When present and any of its four fields
 * has content, the route runs in MERGE mode: instead of structuring
 * the new text from scratch, it asks Claude to integrate the new text
 * into the matching SOAP section while leaving the others intact.
 */
export const estructurarSoapRequestSchema = z.object({
  texto: z.string().min(1, "El texto del dictado no puede estar vacío.").max(20000),
  paciente_id: z.string().uuid(),
  current_soap: z
    .object({
      subjetivo: z.string().max(8000).default(""),
      objetivo: z.string().max(8000).default(""),
      analisis: z.string().max(8000).default(""),
      plan: z.string().max(8000).default(""),
    })
    .optional(),
});

export type EstructurarSoapRequest = z.infer<
  typeof estructurarSoapRequestSchema
>;

/**
 * Response contract. On IA failure we return error=true plus the raw
 * transcript verbatim in `subjetivo` so the médico can still edit and
 * save without losing what they dictated.
 */
export const estructurarSoapResponseSchema = soapSchema.extend({
  error: z.boolean().default(false),
  error_message: z.string().optional(),
  tokens_used: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
      estimated_cost_usd: z.number(),
    })
    .optional(),
});

export type EstructurarSoapResponse = z.infer<
  typeof estructurarSoapResponseSchema
>;

/**
 * Input for the save consulta server action. Validates everything that
 * the client sends and that ends up in the DB.
 */
export const saveConsultaSchema = z.object({
  paciente_id: z.string().uuid(),
  motivo: z.string().trim().max(200).optional(),
  subjetivo: z.string().trim().max(8000).optional(),
  objetivo: z.string().trim().max(8000).optional(),
  analisis: z.string().trim().max(8000).optional(),
  plan: z.string().trim().max(8000).optional(),
  transcripcion_raw: z.string().trim().max(20000).optional(),
  // Photos are uploaded separately via uploadConsultaFoto before save.
  // Here we receive their final storage paths (already in the bucket).
  fotos: z
    .array(
      z.object({
        storage_path: z.string().min(1),
        tipo: z.enum(["clinica", "dermatoscopia"]),
        zona_anatomica: z.string().optional().nullable(),
      }),
    )
    .max(3),
});

export type SaveConsultaInput = z.infer<typeof saveConsultaSchema>;
