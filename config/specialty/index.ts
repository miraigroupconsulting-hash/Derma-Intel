/**
 * config/specialty/index.ts
 *
 * Registry de especialidades disponibles + selector activo basado en
 * `NEXT_PUBLIC_SPECIALTY` env var. Default: 'derma'.
 *
 * Para agregar una nueva especialidad ver `docs/add-new-specialty.md`.
 *
 * Uso en código:
 *   import { SPECIALTY } from "@/config/specialty";
 *   <h1>{SPECIALTY.brand.name}</h1>
 *   {SPECIALTY.features.fotoEvolucion && <GaleriaButton />}
 */

import type { SpecialtyConfig } from "./types";
import { DERMA_SPECIALTY } from "./derma";

const REGISTRY: Record<string, SpecialtyConfig> = {
  derma: DERMA_SPECIALTY,
  // Agregar acá futuras especialidades:
  // oftal: OFTAL_SPECIALTY,
  // cardio: CARDIO_SPECIALTY,
};

const REQUESTED =
  process.env.NEXT_PUBLIC_SPECIALTY ??
  (typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_SPECIALTY
    : undefined) ??
  "derma";

const RESOLVED = REGISTRY[REQUESTED];
if (!RESOLVED) {
  // Fail loud — un typo en NEXT_PUBLIC_SPECIALTY no debe degradar
  // silenciosamente a derma.
  throw new Error(
    `NEXT_PUBLIC_SPECIALTY="${REQUESTED}" no está registrada. Especialidades disponibles: ${Object.keys(
      REGISTRY,
    ).join(", ")}.`,
  );
}

export const SPECIALTY: SpecialtyConfig = RESOLVED;

export type { SpecialtyConfig, BrandConfig, SpecialtyFeatures } from "./types";
