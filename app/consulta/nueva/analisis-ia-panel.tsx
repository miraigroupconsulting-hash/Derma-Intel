"use client";

import type { AnalizarCasoResponse } from "../schema";

/**
 * Read-only panel that renders the Caso Clínico IA output.
 *
 * Design constraints from CLAUDE.md §2 / discussion with Fer:
 *   - This is a SUGGESTION. Never writes to SOAP fields.
 *   - Visible disclaimer at top.
 *   - "Banderas rojas" pulled to the top so they're never missed.
 *   - Differentials get probability pills.
 */
export function AnalisisIaPanel({ data }: { data: AnalizarCasoResponse }) {
  const hasRedFlags = data.banderas_rojas.length > 0;
  const hasReferral =
    !!data.derivacion_sugerida && data.derivacion_sugerida.trim().length > 0;
  const insufficient = data.image_quality === "insufficient";

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          Sugerencia de la IA
        </h3>
        {/* Tokens/costo NO se muestran al clínico — esa telemetría vive
            solo en /mirai-admin (panel de Mirai Lab). */}
      </div>

      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Sugerencia de apoyo clínico. La decisión y la firma corresponden al
        médico tratante. Nada en este panel constituye diagnóstico definitivo.
      </p>

      {insufficient && (
        <p className="rounded-md border border-amber-400 bg-amber-100 px-3 py-2 text-sm text-amber-900">
          <strong>Imagen insuficiente</strong> para lectura clínica confiable.
          Considera repetir la captura con buena iluminación, foco y/o
          dermatoscopia.
        </p>
      )}

      {hasRedFlags && (
        <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            ⚠ Banderas rojas
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
            {data.banderas_rojas.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {hasReferral && (
        <div className="rounded-md border border-purple-300 bg-purple-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            Derivación sugerida
          </p>
          <p className="mt-1 text-sm text-purple-900">{data.derivacion_sugerida}</p>
        </div>
      )}

      <Section title="Lectura de imagen" text={data.lectura_imagen} />
      <Section title="Hallazgos relevantes" text={data.hallazgos_relevantes} />

      {data.diferenciales.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Diagnósticos diferenciales sugeridos
          </p>
          <ol className="space-y-2">
            {data.diferenciales.map((d, i) => (
              <li
                key={i}
                className="rounded-md border border-neutral-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-neutral-900">
                    {i + 1}. {d.nombre}
                  </p>
                  <span className={probPillClass(d.probabilidad)}>
                    {d.probabilidad}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-700">{d.fundamento}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Section title="Plan diagnóstico sugerido" text={data.plan_diagnostico} />
      <Section title="Plan terapéutico tentativo" text={data.plan_terapeutico} />
      <Section title="Educación al paciente" text={data.educacion_paciente} />
      <Section title="Seguimiento sugerido" text={data.seguimiento} />
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text || !text.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{text}</p>
    </div>
  );
}

function probPillClass(prob: "alta" | "media" | "baja"): string {
  const base =
    "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide";
  if (prob === "alta") return `${base} bg-emerald-100 text-emerald-800`;
  if (prob === "media") return `${base} bg-amber-100 text-amber-800`;
  return `${base} bg-neutral-100 text-neutral-700`;
}
