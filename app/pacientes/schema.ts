import { z } from "zod";

export const SEXO_OPTIONS = [
  { code: "F", label: "Femenino" },
  { code: "M", label: "Masculino" },
  { code: "O", label: "Otro / No binario" },
] as const;

export const FITZPATRICK_OPTIONS = [
  { value: 1, label: "I — Muy clara, no se broncea, siempre se quema" },
  { value: 2, label: "II — Clara, se quema, broncea poco" },
  { value: 3, label: "III — Media, se broncea gradualmente" },
  { value: 4, label: "IV — Trigueña, rara vez se quema" },
  { value: 5, label: "V — Oscura, nunca se quema" },
  { value: 6, label: "VI — Muy oscura, nunca se quema" },
] as const;

// Helper: turn empty strings into null/undefined.
const trimToNull = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? null : t;
};

export const pacienteSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es requerido.")
    .max(80, "Demasiado largo."),
  apellido: z
    .string()
    .trim()
    .min(1, "El apellido es requerido.")
    .max(80, "Demasiado largo."),
  fecha_nacimiento: z
    .preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD).")
        .nullable(),
    )
    .optional(),
  sexo: z
    .preprocess(trimToNull, z.enum(["F", "M", "O"]).nullable())
    .optional(),
  tipo_piel_fitzpatrick: z
    .preprocess(
      (v) => {
        if (v === "" || v === null || v === undefined) return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : v;
      },
      z.number().int().min(1).max(6).nullable(),
    )
    .optional(),
  alergias: z.preprocess(trimToNull, z.string().max(2000).nullable()).optional(),
  antecedentes: z
    .preprocess(trimToNull, z.string().max(4000).nullable())
    .optional(),
  medicacion_actual: z
    .preprocess(trimToNull, z.string().max(2000).nullable())
    .optional(),
  telefono: z.preprocess(trimToNull, z.string().max(40).nullable()).optional(),
  cedula: z.preprocess(trimToNull, z.string().max(40).nullable()).optional(),
  email: z
    .preprocess(
      trimToNull,
      z
        .string()
        .email("Correo inválido.")
        .max(200)
        .nullable(),
    )
    .optional(),
  notas: z.preprocess(trimToNull, z.string().max(8000).nullable()).optional(),
});

export type PacienteInput = z.infer<typeof pacienteSchema>;

/**
 * Default-value shape for the form. Accepts strings for fields the
 * schema later coerces (date, fitzpatrick) so React controlled inputs
 * stay happy with empty state.
 */
export interface PacienteFormDefaults {
  nombre: string;
  apellido: string;
  fecha_nacimiento: string;
  sexo: string;
  tipo_piel_fitzpatrick: string;
  alergias: string;
  antecedentes: string;
  medicacion_actual: string;
  telefono: string;
  cedula: string;
  email: string;
  notas: string;
}

export const emptyPacienteDefaults: PacienteFormDefaults = {
  nombre: "",
  apellido: "",
  fecha_nacimiento: "",
  sexo: "",
  tipo_piel_fitzpatrick: "",
  alergias: "",
  antecedentes: "",
  medicacion_actual: "",
  telefono: "",
  cedula: "",
  email: "",
  notas: "",
};
