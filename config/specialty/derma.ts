/**
 * config/specialty/derma.ts
 *
 * Dermatología — la especialidad original con la que se construyó
 * el chasis. Esta config refleja el comportamiento "default" del
 * código actual; es el baseline para forks futuros.
 */

import type { SpecialtyConfig } from "./types";

export const DERMA_SPECIALTY: SpecialtyConfig = {
  id: "derma",
  nombre: "Dermatología",

  brand: {
    name: "DERMA INTEL Pro",
    shortName: "Derma Intel",
    tagline: "La asistente con IA que el dermatólogo solo nunca tuvo.",
    description:
      "Asistente con IA para dermatólogos. Consulta, historia, récipe y seguimiento en una sola app.",
    especialidadPlural: "dermatólogos",
    especialidadIndividual: "dermatólogo/a",
    colors: {
      primary: "#1B4965",
      secondary: "#5FA8D3",
    },
  },

  features: {
    fotoEvolucion: true,
    dermatoscopia: true,
    fototipo: true,
    modoHistopatologia: true,
    anonimizacionFacial: true,
    zonasAnatomicas: true,
    consultaRapida: true,
  },

  promptsFile: "derma-intel-v2.md",
};
