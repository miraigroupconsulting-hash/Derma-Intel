import { z } from "zod";
import { PAIS_CEDULA_CODES, PAISES_CEDULA } from "@/app/onboarding/schema";

// Re-export so the form can use the same dropdown list as onboarding.
export { PAISES_CEDULA, PAIS_CEDULA_CODES };

export const perfilSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido.").max(80),
  apellido: z.string().trim().min(1, "Apellido requerido.").max(80),
  especialidad: z.string().trim().min(2, "Especialidad requerida.").max(120),
  cedula_profesional: z
    .string()
    .trim()
    .min(2, "Cédula profesional requerida.")
    .max(40),
  pais_cedula: z.enum(PAIS_CEDULA_CODES, {
    message: "Selecciona el país de tu cédula.",
  }),
  telefono: z.string().trim().max(40).optional().nullable(),
  direccion: z.string().trim().max(300).optional().nullable(),
  // logo_storage_path and firma_digital_path are updated via separate
  // upload flow; not part of the text form.
});

export type PerfilInput = z.infer<typeof perfilSchema>;

export interface PerfilDefaults {
  nombre: string;
  apellido: string;
  especialidad: string;
  cedula_profesional: string;
  pais_cedula: string;
  telefono: string;
  direccion: string;
  logo_storage_path: string | null;
  firma_digital_path: string | null;
}
