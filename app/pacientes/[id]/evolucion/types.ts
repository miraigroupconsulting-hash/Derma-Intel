/**
 * Shared types between the Server Component (page.tsx) and the Client
 * Component (evolucion-view.tsx). Kept in their own module so they
 * can be imported from either side without "use server"/"use client"
 * collisions.
 */

export interface FotoEntry {
  id: string;
  consultaId: string | null;
  fecha: string; // ISO timestamptz
  tipo: "clinica" | "dermatoscopia";
  zona: string | null;
  signedUrl: string | null;
}

export interface ConsultaGroup {
  consultaId: string;
  consultaFecha: string;
  motivo: string | null;
  fotos: FotoEntry[];
}

export interface ComparacionRecord {
  id: string;
  fotoAntesId: string;
  fotoDespuesId: string;
  notas: string | null;
  fechaCreacion: string;
  /** Signed URLs for both fotos to render thumbnails in the history list. */
  antesUrl: string | null;
  despuesUrl: string | null;
}
