/**
 * config/specialty/types.ts
 *
 * Contract para cada especialidad médica (derma, oftal, cardio, etc.).
 *
 * Filosofía pragmática: solo abstraemos lo que MÁS varía y MENOS
 * trabajo cuesta abstraer. Los catálogos grandes (medicamentos por
 * especialidad, zonas anatómicas, prompts clínicos completos) siguen
 * en sus archivos `.ts`/`.md` correspondientes — los forks los
 * reemplazan directo. No hay indirección dinámica para esos casos.
 *
 * Lo que SÍ vive aquí:
 *   - Identidad de marca (nombre, tagline, colores, logo)
 *   - Feature flags (qué módulos opcionales están encendidos)
 *   - Path al archivo de prompts clínicos
 *
 * Para agregar una nueva especialidad ver `docs/add-new-specialty.md`.
 */

export interface BrandConfig {
  /** Display name. Ej: "DERMA INTEL Pro", "OFTAL INTEL Pro" */
  name: string;
  /** Short name para PWA / home screen iOS */
  shortName: string;
  /** Tagline para landing + carta del fundador. Una línea. */
  tagline: string;
  /** Description para metadata HTML + OG image. */
  description: string;
  /** Especialidad humana legible. Ej: "dermatólogos", "oftalmólogos" */
  especialidadPlural: string;
  /** Profesional individual. Ej: "dermatólogo/a", "oftalmólogo/a" */
  especialidadIndividual: string;
  /** Colors opcionales — si undefined se usan los brand-* de globals.css. */
  colors?: {
    primary: string;
    secondary: string;
  };
}

export interface SpecialtyFeatures {
  /** Galería de evolución de fotos con timeline + comparación slider. */
  fotoEvolucion: boolean;
  /** Foto tipo "dermatoscopia" disponible en uploaders + IA. */
  dermatoscopia: boolean;
  /** Campo fototipo Fitzpatrick en pacientes (derma-specific). */
  fototipo: boolean;
  /** Modo IA Histopatología activo. */
  modoHistopatologia: boolean;
  /** Modo anónimo facial (MediaPipe) en export de fotos. */
  anonimizacionFacial: boolean;
  /** Tagger de zonas anatómicas en fotos. */
  zonasAnatomicas: boolean;
  /** Endpoint /consulta-rapida con análisis IA de fotos sueltas. */
  consultaRapida: boolean;
}

export interface SpecialtyConfig {
  /** Identificador corto, lowercase, sin espacios. Coincide con el
   *  filename de este config (config/specialty/<id>.ts). */
  id: string;
  /** Nombre legible. Ej: "Dermatología" */
  nombre: string;
  brand: BrandConfig;
  features: SpecialtyFeatures;
  /** Archivo de prompts clínicos en /prompts. Solo el nombre, no path. */
  promptsFile: string;
}
