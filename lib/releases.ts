/**
 * Single source of truth for product release notes.
 *
 * Read by:
 *   - app/about/changelog/page.tsx  (full history)
 *   - components/novedades-card.tsx (dashboard "✨ Novedades" surface)
 *
 * Newest release first. The dashboard surface shows LATEST_RELEASE and
 * re-appears for each user whenever `version` changes (dismissal is keyed
 * by version in localStorage), so shipping a new entry here is all it
 * takes to tell every user what's new.
 */

export interface Release {
  version: string;
  fecha: string;
  highlight: string;
  incluye: string[];
  proximamente?: string[];
}

export const RELEASES: Release[] = [
  {
    version: "1.1",
    fecha: "Octubre 2026",
    highlight: "✨ Más fácil de usar, cada semana un poco mejor",
    incluye: [
      "Pantalla de Novedades: entérate de cada mejora sin salir de la app",
      "Guía rápida dentro de la app: aprende lo esencial en 2 minutos",
      "Ayudas en pantalla: cada botón ahora te dice para qué sirve",
      "Primer paso más claro para empezar sin registrar nada",
    ],
    proximamente: [
      "IA clínica aún más precisa",
      "Sugerencias con evidencia reciente y fuentes citadas",
    ],
  },
  {
    version: "1.0",
    fecha: "Mayo 2026",
    highlight: "🎉 Lanzamiento inicial de DERMA INTEL Pro",
    incluye: [
      "Gestión completa de pacientes con historia clínica",
      "Dictado por voz con estructuración SOAP automática",
      "IA clínica especializada con 6 modos (Caso, Express, Bibliografía, Histopatología, Terapéutica, Docente)",
      "Récipes profesionales en PDF con firma digital + envío por WhatsApp",
      "Galería de evolución con comparación lado a lado + exportación con anonimización facial",
      "Recordatorios automáticos + sistema de alertas inteligentes",
      "Dashboard proactivo con resumen diario y notificaciones",
      "Agenda semanal de citas y controles",
      "Funcionamiento offline (récipes se sincronizan al recuperar señal)",
    ],
  },
];

/** The release the dashboard "Novedades" surface announces. */
export const LATEST_RELEASE: Release = RELEASES[0]!;
