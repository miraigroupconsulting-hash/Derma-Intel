"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  InformePdfDocument,
  type InformePdfMedico,
  type InformePdfPaciente,
} from "./informe-pdf-document";
import type { InformeContenido } from "./schema";
import { saveInforme } from "./actions";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-brand-gray">Cargando vista previa…</div>
    ),
  },
);

interface CamposConsulta {
  motivo: string;
  anamnesis: string;
  examen_fisico: string;
  diagnostico_diferencial: string;
  plan_terapeutico: string;
}

// Secciones editables del informe (orden y etiqueta de presentación).
const SECCIONES_INFORME: {
  key: keyof InformeContenido;
  label: string;
  rows: number;
}[] = [
  { key: "motivo_consulta", label: "Motivo de consulta", rows: 2 },
  { key: "antecedentes", label: "Antecedentes", rows: 2 },
  { key: "anamnesis", label: "Anamnesis", rows: 3 },
  { key: "examen_fisico", label: "Examen físico", rows: 3 },
  { key: "diagnostico", label: "Diagnóstico / Impresión", rows: 2 },
  { key: "plan", label: "Plan", rows: 3 },
  { key: "recomendaciones", label: "Recomendaciones", rows: 2 },
];

interface InformePrevio {
  id: string;
  fecha: string;
  redactadoConIa: boolean;
  url: string | null;
}

interface Props {
  consultaId: string;
  pacienteId: string;
  medico: InformePdfMedico;
  paciente: InformePdfPaciente;
  consultaCampos: CamposConsulta;
  fechaConsulta: string; // ISO
  informesPrevios: InformePrevio[];
}

/**
 * Construye el contenido literal del informe a partir de los campos
 * crudos de la consulta — sin redacción IA. Cada sección es el texto
 * tal como el médico lo escribió.
 */
function contenidoLiteral(campos: CamposConsulta): InformeContenido {
  return {
    motivo_consulta: campos.motivo || "Sin motivo registrado.",
    antecedentes:
      "Ver historia clínica del paciente para detalle de antecedentes, alergias y medicación.",
    anamnesis: campos.anamnesis || "Sin información registrada.",
    examen_fisico: campos.examen_fisico || "Sin información registrada.",
    diagnostico: campos.diagnostico_diferencial || "Pendiente.",
    plan: campos.plan_terapeutico || "Pendiente.",
    recomendaciones:
      "Seguir las indicaciones del plan terapéutico. Contactar al médico ante cualquier reacción adversa o duda.",
  };
}

export function InformeForm({
  consultaId,
  pacienteId,
  medico,
  paciente,
  consultaCampos,
  fechaConsulta,
  informesPrevios,
}: Props) {
  const router = useRouter();
  const [usarIa, setUsarIa] = useState(false);
  const [contenido, setContenido] = useState<InformeContenido>(() =>
    contenidoLiteral(consultaCampos),
  );
  const [iaCargando, setIaCargando] = useState(false);
  const [iaCargado, setIaCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const fechaConsultaDate = useMemo(
    () => new Date(fechaConsulta),
    [fechaConsulta],
  );

  // Cuando se activa el toggle por primera vez, llamar a la IA
  const handleToggleIa = useCallback(async (checked: boolean) => {
    setUsarIa(checked);
    if (!checked) {
      // Volver a versión literal
      setContenido(contenidoLiteral(consultaCampos));
      setIaCargado(false);
      return;
    }
    if (iaCargado) return; // ya tenemos el resultado IA cacheado
    setIaCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/ia/redactar-informe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: pacienteId,
          motivo: consultaCampos.motivo,
          anamnesis: consultaCampos.anamnesis,
          examen_fisico: consultaCampos.examen_fisico,
          diagnostico_diferencial: consultaCampos.diagnostico_diferencial,
          plan_terapeutico: consultaCampos.plan_terapeutico,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      setContenido({
        motivo_consulta: data.motivo_consulta ?? "",
        antecedentes: data.antecedentes ?? "",
        anamnesis: data.anamnesis ?? "",
        examen_fisico: data.examen_fisico ?? "",
        diagnostico: data.diagnostico ?? "",
        plan: data.plan ?? "",
        recomendaciones: data.recomendaciones ?? "",
      });
      setIaCargado(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error consultando redacción IA.",
      );
      setUsarIa(false);
    } finally {
      setIaCargando(false);
    }
  }, [iaCargado, consultaCampos, pacienteId, paciente]);

  const updateCampo = useCallback(
    (key: keyof InformeContenido, value: string) => {
      setContenido((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const pdfDocument = useMemo(
    () => (
      <InformePdfDocument
        medico={medico}
        paciente={paciente}
        contenido={contenido}
        fechaConsulta={fechaConsultaDate}
        consultaId={consultaId}
      />
    ),
    [medico, paciente, contenido, fechaConsultaDate, consultaId],
  );

  const handleGenerar = useCallback(async () => {
    setError(null);
    setSignedUrl(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada.");

      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(pdfDocument).toBlob();

      if (blob.size > 5 * 1024 * 1024) {
        throw new Error("Informe PDF demasiado grande (>5MB).");
      }

      const informeUuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storagePath = `${user.id}/${consultaId}/${informeUuid}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("informes-pdf")
        .upload(storagePath, blob, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) {
        throw new Error(`No pudimos subir el PDF: ${upErr.message}`);
      }

      const result = await saveInforme({
        consultaId,
        redactadoConIa: usarIa && iaCargado,
        pdfStoragePath: storagePath,
      });
      if (result.error) throw new Error(result.error);
      setSignedUrl(result.signedUrl ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar el informe.");
    } finally {
      setBusy(false);
    }
  }, [pdfDocument, consultaId, usarIa, iaCargado, router]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      {/* LEFT: controles */}
      <div className="space-y-4">
        <section className="rounded-md border border-neutral-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
            Redacción
          </h2>

          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={usarIa}
              onChange={(e) => void handleToggleIa(e.target.checked)}
              disabled={iaCargando || busy}
              className="mt-0.5 h-5 w-5 accent-brand-primary"
            />
            <div className="text-sm">
              <p className="font-medium">
                ✨ Redactar con IA{" "}
                {iaCargando && (
                  <span className="text-xs text-brand-gray">
                    (consultando…)
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-brand-gray">
                Sonnet 4.6 pule el lenguaje a estilo formal médico,
                conservando dosis, diagnósticos y plan EXACTAMENTE como
                los escribiste. No inventa nada.
              </p>
            </div>
          </label>
        </section>

        {/* Contenido editable: la médica ajusta cualquier sección según su
            criterio antes de generar. Alimenta el PDF en vivo (la vista
            previa se actualiza). En móvil esta es la forma de ver/editar
            el informe, ya que la vista previa PDF solo se muestra en
            pantallas grandes. */}
        <section className="rounded-md border border-neutral-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
            Contenido del informe
          </h2>
          <p className="mt-1 text-xs text-brand-gray">
            Edita cualquier sección a tu criterio. Si activas la IA arriba, se
            rellena con su redacción y luego puedes ajustarla.
          </p>
          <div className="mt-3 space-y-3">
            {SECCIONES_INFORME.map((s) => (
              <div key={s.key}>
                <label
                  htmlFor={`informe-${s.key}`}
                  className="text-xs font-medium text-brand-ink"
                >
                  {s.label}
                </label>
                <Textarea
                  id={`informe-${s.key}`}
                  value={contenido[s.key]}
                  onChange={(e) => updateCampo(s.key, e.target.value)}
                  rows={s.rows}
                  disabled={iaCargando || busy}
                  className="mt-1 text-sm"
                />
              </div>
            ))}
          </div>
        </section>

        {error && (
          <p
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {signedUrl && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p>✓ Informe firmado y guardado en el expediente.</p>
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex h-9 items-center rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"
            >
              📥 Descargar PDF
            </a>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={handleGenerar}
            disabled={busy || iaCargando}
            size="lg"
          >
            {busy ? "Generando…" : "📋 Generar y guardar informe"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/consulta/${consultaId}`)}
            disabled={busy}
          >
            Volver
          </Button>
        </div>

        {/* Informes previos */}
        {informesPrevios.length > 0 && (
          <section className="rounded-md border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-gray">
              Informes previos
            </h2>
            <ul className="space-y-2 text-sm">
              {informesPrevios.map((inf) => (
                <li
                  key={inf.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div>
                    <p>
                      {new Date(inf.fecha).toLocaleString("es-VE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/Caracas",
                      })}
                    </p>
                    <p className="text-xs text-brand-gray">
                      {inf.redactadoConIa ? "Con IA" : "Literal"}
                    </p>
                  </div>
                  {inf.url && (
                    <a
                      href={inf.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-primary underline-offset-4 hover:underline"
                    >
                      Descargar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* RIGHT: preview PDF */}
      <div className="hidden lg:block">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-gray">
          Vista previa
        </h2>
        <div className="clinical-photo h-[80vh] overflow-hidden rounded-md border border-neutral-300 bg-white">
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            {pdfDocument}
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
