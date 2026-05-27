import { z } from "zod";

export const informeContenidoSchema = z.object({
  motivo_consulta: z.string().default(""),
  antecedentes: z.string().default(""),
  anamnesis: z.string().default(""),
  examen_fisico: z.string().default(""),
  diagnostico: z.string().default(""),
  plan: z.string().default(""),
  recomendaciones: z.string().default(""),
});

export type InformeContenido = z.infer<typeof informeContenidoSchema>;
