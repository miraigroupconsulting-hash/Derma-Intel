import { z } from "zod";

/**
 * Países donde tenemos contemplado licenciamiento dermatológico inicial.
 * El usuario puede ampliar la lista por SQL si necesita otro país.
 */
export const PAISES_CEDULA = [
  { code: "VE", label: "Venezuela" },
  { code: "CO", label: "Colombia" },
  { code: "AR", label: "Argentina" },
  { code: "MX", label: "México" },
  { code: "CL", label: "Chile" },
  { code: "PE", label: "Perú" },
  { code: "EC", label: "Ecuador" },
  { code: "UY", label: "Uruguay" },
  { code: "PA", label: "Panamá" },
  { code: "DO", label: "República Dominicana" },
  { code: "CR", label: "Costa Rica" },
  { code: "ES", label: "España" },
  { code: "US", label: "Estados Unidos" },
] as const;

export const PAIS_CEDULA_CODES = PAISES_CEDULA.map((p) => p.code) as [
  (typeof PAISES_CEDULA)[number]["code"],
  ...(typeof PAISES_CEDULA)[number]["code"][],
];

export const onboardingSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es requerido.")
    .max(80, "El nombre es demasiado largo."),
  apellido: z
    .string()
    .trim()
    .min(1, "El apellido es requerido.")
    .max(80, "El apellido es demasiado largo."),
  especialidad: z
    .string()
    .trim()
    .min(3, "Indica tu especialidad.")
    .max(120),
  cedula_profesional: z
    .string()
    .trim()
    .min(3, "La cédula profesional es requerida.")
    .max(40),
  pais_cedula: z.enum(PAIS_CEDULA_CODES, {
    message: "Selecciona el país de tu cédula.",
  }),
  telefono: z
    .string()
    .trim()
    .max(30, "Teléfono demasiado largo.")
    .optional()
    .or(z.literal("")),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
