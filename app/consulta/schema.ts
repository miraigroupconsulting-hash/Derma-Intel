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

// =====================================================================
// Caso Clínico — image + context → differential diagnosis + plan
// =====================================================================

export const analizarCasoRequestSchema = z.object({
  paciente_id: z.string().uuid(),
  motivo: z.string().max(200).optional(),
  // Free-text context the médico provides (anamnesis, examen físico,
  // etc.) — typically the current SOAP S+O concatenated.
  contexto: z.string().max(8000).default(""),
  // Each photo is referenced by its current storage_path inside the
  // fotos-consultas bucket. The route downloads bytes server-side.
  // Hasta 10: 5 clínicas + 5 dermatoscópicas (en la práctica se toman
  // ambas del mismo caso).
  fotos: z
    .array(
      z.object({
        storage_path: z.string().min(1),
        tipo: z.enum(["clinica", "dermatoscopia"]),
        zona_anatomica: z.string().optional().nullable(),
      }),
    )
    .max(10),
});

export type AnalizarCasoRequest = z.infer<typeof analizarCasoRequestSchema>;

export const diferencialSchema = z.object({
  nombre: z.string(),
  probabilidad: z.enum(["alta", "media", "baja"]),
  fundamento: z.string(),
});

export type Diferencial = z.infer<typeof diferencialSchema>;

export const analizarCasoResponseSchema = z.object({
  lectura_imagen: z.string().default(""),
  hallazgos_relevantes: z.string().default(""),
  diferenciales: z.array(diferencialSchema).default([]),
  plan_diagnostico: z.string().default(""),
  plan_terapeutico: z.string().default(""),
  educacion_paciente: z.string().default(""),
  seguimiento: z.string().default(""),
  banderas_rojas: z.array(z.string()).default([]),
  derivacion_sugerida: z.string().default(""),
  image_quality: z
    .enum(["adequate", "limited", "insufficient", "none"])
    .default("none"),
  // Echoed back so the client can show tokens used / cost.
  tokens_used: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
      estimated_cost_usd: z.number(),
    })
    .optional(),
  // Set when something went wrong but we still want the UI to render a
  // useful fallback.
  error: z.boolean().default(false),
  error_message: z.string().optional(),
});

export type AnalizarCasoResponse = z.infer<typeof analizarCasoResponseSchema>;

export const EMPTY_ANALIZAR: AnalizarCasoResponse = {
  lectura_imagen: "",
  hallazgos_relevantes: "",
  diferenciales: [],
  plan_diagnostico: "",
  plan_terapeutico: "",
  educacion_paciente: "",
  seguimiento: "",
  banderas_rojas: [],
  derivacion_sugerida: "",
  image_quality: "none",
  error: false,
};

/**
 * JSON Schema for the forced-tool-use call that produces the análisis.
 * Mirrors analizarCasoResponseSchema (minus the server-only echo fields
 * tokens_used / error). Used by /api/ia/analizar-caso and
 * /api/ia/consulta-rapida via runStructuredClinicalCall so the model
 * MUST return a well-formed object (no more truncated-JSON parse fails).
 *
 * Kept as a hand-written literal (not zod-to-json-schema) to avoid a new
 * dependency and to keep the field descriptions tuned for the model.
 */
export const ANALISIS_TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    lectura_imagen: {
      type: "string",
      description:
        "Descripción estructurada de lo visible: tipo de imagen (clínica vs dermatoscópica), localización si deducible, lesión (tipo elemental, número, distribución, color, tamaño relativo, bordes, simetría), hallazgos dermatoscópicos cuando aplica. Lenguaje médico-técnico formal.",
    },
    hallazgos_relevantes: {
      type: "string",
      description: "Síntesis breve de imagen + contexto recibido.",
    },
    diferenciales: {
      type: "array",
      description:
        "Diagnósticos diferenciales ordenados por probabilidad. Vacío si la imagen es insuficiente.",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          probabilidad: { type: "string", enum: ["alta", "media", "baja"] },
          fundamento: {
            type: "string",
            description: "Una línea con el porqué clínico.",
          },
        },
        required: ["nombre", "probabilidad", "fundamento"],
      },
    },
    plan_diagnostico: {
      type: "string",
      description:
        "Estudios complementarios pertinentes, cuándo considerar biopsia.",
    },
    plan_terapeutico: {
      type: "string",
      description:
        'Tratamiento de primera línea + alternativas + consideraciones. Para sustancias controladas, anteponer "Requiere confirmación del médico".',
    },
    educacion_paciente: {
      type: "string",
      description: "Lenguaje claro que el médico puede transmitir al paciente.",
    },
    seguimiento: { type: "string", description: "Plazo y qué evaluar." },
    banderas_rojas: {
      type: "array",
      description:
        "Señales de alarma (sospecha de malignidad, urgencia, riesgo vital). Vacío si no hay.",
      items: { type: "string" },
    },
    derivacion_sugerida: {
      type: "string",
      description:
        "Oncología / cirugía / dermatopatología / atención presencial urgente, o cadena vacía si no aplica.",
    },
    image_quality: {
      type: "string",
      enum: ["adequate", "limited", "insufficient", "none"],
    },
  },
  required: [
    "lectura_imagen",
    "hallazgos_relevantes",
    "diferenciales",
    "plan_diagnostico",
    "plan_terapeutico",
    "educacion_paciente",
    "seguimiento",
    "banderas_rojas",
    "derivacion_sugerida",
    "image_quality",
  ],
} as const;

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
  // Optional IA analysis (Caso Clínico mode result) snapshot. Stored
  // alongside the consulta so it appears when the médico reopens.
  analisis_ia: z
    .object({
      lectura_imagen: z.string().optional(),
      hallazgos_relevantes: z.string().optional(),
      diferenciales: z
        .array(
          z.object({
            nombre: z.string(),
            probabilidad: z.enum(["alta", "media", "baja"]),
            fundamento: z.string(),
          }),
        )
        .optional(),
      plan_diagnostico: z.string().optional(),
      plan_terapeutico: z.string().optional(),
      educacion_paciente: z.string().optional(),
      seguimiento: z.string().optional(),
      banderas_rojas: z.array(z.string()).optional(),
      derivacion_sugerida: z.string().optional(),
      image_quality: z
        .enum(["adequate", "limited", "insufficient", "none"])
        .optional(),
    })
    .optional()
    .nullable(),
  // Photos are uploaded separately via uploadConsultaFoto before save.
  // Here we receive their final storage paths (already in the bucket).
  // Hasta 10: 5 clínicas + 5 dermatoscópicas.
  fotos: z
    .array(
      z.object({
        storage_path: z.string().min(1),
        tipo: z.enum(["clinica", "dermatoscopia"]),
        zona_anatomica: z.string().optional().nullable(),
      }),
    )
    .max(10),
});

export type SaveConsultaInput = z.infer<typeof saveConsultaSchema>;
