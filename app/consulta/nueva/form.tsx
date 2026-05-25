"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  abortDictation,
  dictationErrorMessage,
  isSupported as voiceIsSupported,
  startDictation,
  stopDictation,
  type DictationError,
} from "@/lib/voice";
import { EMPTY_SOAP, type SoapData } from "../schema";
import { saveConsulta, type ConsultaActionState } from "../actions";
import { PhotoUploader, type ConsultaPhoto } from "./photo-uploader";

export interface PacienteLite {
  id: string;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string | null;
  sexo: string | null;
  tipo_piel_fitzpatrick: number | null;
}

export interface NuevaConsultaFormProps {
  pacientes: PacienteLite[];
  preselectedPacienteId?: string;
}

/**
 * Dictation targets. 'global' = the raw-dictation panel above the SOAP
 * sections; the SOAP keys = per-section microphones that dictate
 * directly into one textarea. At most one can be active at a time.
 */
type DictationTarget =
  | "global"
  | "subjetivo"
  | "objetivo"
  | "analisis"
  | "plan";

const initialState: ConsultaActionState = { error: null };

export function NuevaConsultaForm({
  pacientes,
  preselectedPacienteId,
}: NuevaConsultaFormProps) {
  const router = useRouter();

  const initialPacienteId = useMemo(() => {
    if (
      preselectedPacienteId &&
      pacientes.some((p) => p.id === preselectedPacienteId)
    ) {
      return preselectedPacienteId;
    }
    return pacientes[0]?.id ?? "";
  }, [pacientes, preselectedPacienteId]);

  const [pacienteId, setPacienteId] = useState(initialPacienteId);
  const [motivo, setMotivo] = useState("");

  // ----- Shared dictation state ---------------------------------------
  // active: which target is being dictated into (null = no one).
  const [active, setActive] = useState<DictationTarget | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceSupported = useRef(false);

  // Per-target raw transcript (the "committed" text the recognizer
  // produced so far for this session of dictation into this target).
  // We keep these separate because the global panel and the SOAP
  // sections each accumulate independently.
  const [globalTranscript, setGlobalTranscript] = useState("");

  // SOAP state
  const [soap, setSoap] = useState<SoapData>(EMPTY_SOAP);

  // While a SOAP-section mic is active, interim text is appended live
  // to the value below the committed content. We hold it separately so
  // we can clear it cleanly when the recognizer finalizes.
  const [interim, setInterim] = useState("");

  // IA structuring state
  const [isStructuring, setIsStructuring] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureNotice, setStructureNotice] = useState<string | null>(null);

  // Photos
  const [photos, setPhotos] = useState<ConsultaPhoto[]>([]);

  // Save state
  const [serverState, setServerState] = useState<ConsultaActionState>(
    initialState,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    voiceSupported.current = voiceIsSupported();
    return () => {
      abortDictation();
    };
  }, []);

  const selectedPaciente = pacientes.find((p) => p.id === pacienteId) ?? null;
  const pacienteFullName = selectedPaciente
    ? `${selectedPaciente.nombre} ${selectedPaciente.apellido}`
    : "";

  // ----- Dictation orchestration --------------------------------------

  const stopActive = useCallback(() => {
    stopDictation();
    setInterim("");
    setActive(null);
  }, []);

  const startFor = useCallback(
    (target: DictationTarget) => {
      setVoiceError(null);
      if (!voiceSupported.current) {
        setVoiceError(dictationErrorMessage("not-supported"));
        return;
      }
      // If another target is active, abort it cleanly first.
      if (active && active !== target) {
        abortDictation();
        setInterim("");
      }
      setActive(target);

      startDictation({
        onTranscript: (text, final) => {
          if (target === "global") {
            if (final) {
              setGlobalTranscript((prev) =>
                prev ? `${prev} ${text}`.trim() : text,
              );
              setInterim("");
            } else {
              setInterim(text);
            }
          } else {
            // Append straight into the corresponding SOAP field.
            if (final) {
              setSoap((s) => {
                const prev = s[target] || "";
                return {
                  ...s,
                  [target]: prev ? `${prev} ${text}`.trim() : text,
                };
              });
              setInterim("");
            } else {
              setInterim(text);
            }
          }
        },
        onError: (err: DictationError) => {
          setVoiceError(err.message);
          setActive(null);
          setInterim("");
        },
        onEnd: () => {
          setActive(null);
          setInterim("");
        },
      });
    },
    [active],
  );

  const toggleFor = useCallback(
    (target: DictationTarget) => {
      if (active === target) {
        stopActive();
      } else {
        startFor(target);
      }
    },
    [active, startFor, stopActive],
  );

  const clearGlobalTranscript = useCallback(() => {
    setGlobalTranscript("");
    setInterim("");
  }, []);

  // ----- Structure with IA --------------------------------------------

  const handleStructure = useCallback(async () => {
    setStructureError(null);
    setStructureNotice(null);

    if (!globalTranscript.trim()) {
      setStructureError("Dicta o escribe algo en el panel arriba antes.");
      return;
    }
    if (!pacienteId) {
      setStructureError("Selecciona un paciente primero.");
      return;
    }

    const hasExistingSoap =
      !!soap.subjetivo.trim() ||
      !!soap.objetivo.trim() ||
      !!soap.analisis.trim() ||
      !!soap.plan.trim();

    setIsStructuring(true);
    try {
      const res = await fetch("/api/ia/estructurar-soap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: globalTranscript,
          paciente_id: pacienteId,
          // Send current SOAP only if non-empty: turns the call into
          // merge mode on the server.
          current_soap: hasExistingSoap
            ? {
                subjetivo: soap.subjetivo,
                objetivo: soap.objetivo,
                analisis: soap.analisis,
                plan: soap.plan,
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStructureError(
          body.error_message ??
            "No pudimos estructurar con IA. Puedes seguir editando manualmente.",
        );
        return;
      }
      const data = await res.json();
      setSoap({
        subjetivo: data.subjetivo ?? "",
        objetivo: data.objetivo ?? "",
        analisis: data.analisis ?? "",
        plan: data.plan ?? "",
        anamnesis_completa: !!data.anamnesis_completa,
        datos_faltantes: Array.isArray(data.datos_faltantes)
          ? data.datos_faltantes
          : [],
      });
      if (hasExistingSoap) {
        setStructureNotice(
          "La IA integró el nuevo texto en las secciones existentes.",
        );
      }
    } catch {
      setStructureError(
        "Error de red al hablar con la IA. Puedes editar manualmente.",
      );
    } finally {
      setIsStructuring(false);
    }
  }, [globalTranscript, pacienteId, soap]);

  // ----- Save ---------------------------------------------------------

  const handleSave = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!pacienteId) {
        setServerState({ error: "Selecciona un paciente." });
        return;
      }
      setServerState(initialState);
      setIsSaving(true);
      abortDictation();
      setActive(null);

      const payload = {
        paciente_id: pacienteId,
        motivo: motivo.trim() || undefined,
        subjetivo: soap.subjetivo,
        objetivo: soap.objetivo,
        analisis: soap.analisis,
        plan: soap.plan,
        transcripcion_raw: globalTranscript,
        fotos: photos.map((p) => ({
          storage_path: p.storage_path,
          tipo: p.tipo,
          zona_anatomica: p.zona_anatomica ?? null,
        })),
      };

      const result = await saveConsulta(payload);
      if (result.error) {
        setServerState(result);
        setIsSaving(false);
        return;
      }
      router.push(`/consulta/${result.consultaId}`);
    },
    [pacienteId, motivo, soap, globalTranscript, photos, router],
  );

  // ----- Render -------------------------------------------------------

  return (
    <form
      onSubmit={handleSave}
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6 pb-28"
    >
      <header className="mb-5 flex items-center justify-between gap-2">
        <Link
          href={
            preselectedPacienteId
              ? `/pacientes/${preselectedPacienteId}`
              : "/dashboard"
          }
          className="text-xs text-neutral-500 hover:underline"
        >
          ← Volver
        </Link>
        <div className="flex-1 max-w-sm">
          <Select
            value={pacienteId}
            onValueChange={(v) => setPacienteId(v ?? "")}
            name="paciente_id"
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona paciente" />
            </SelectTrigger>
            <SelectContent>
              {pacientes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.apellido}, {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <section className="mb-5">
        <Label htmlFor="motivo" className="mb-1.5 inline-block">
          Motivo de consulta (opcional)
        </Label>
        <Input
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Lesión nueva en mejilla, control de acné…"
          maxLength={200}
        />
      </section>

      <section className="mb-5">
        <GlobalDictationPanel
          active={active === "global"}
          onToggle={() => toggleFor("global")}
          transcript={globalTranscript}
          interim={active === "global" ? interim : ""}
          onChange={setGlobalTranscript}
          onClear={clearGlobalTranscript}
          voiceError={active === null ? voiceError : null}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!globalTranscript.trim() || isStructuring}
            onClick={handleStructure}
          >
            {isStructuring ? "Estructurando con IA…" : "Estructurar con IA"}
          </Button>
          {structureError && (
            <p className="text-xs text-red-600" role="alert">
              {structureError}
            </p>
          )}
          {structureNotice && !structureError && (
            <p className="text-xs text-emerald-700" role="status">
              {structureNotice}
            </p>
          )}
          {soap.datos_faltantes.length > 0 && !soap.anamnesis_completa && (
            <p className="basis-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>La IA notó datos faltantes:</strong>{" "}
              {soap.datos_faltantes.join(", ")}.
            </p>
          )}
        </div>
      </section>

      <h2 className="mt-2 mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Nota clínica estructurada
      </h2>

      <section className="space-y-4">
        <SoapTextarea
          id="subjetivo"
          label="Subjetivo"
          hint="Lo que el paciente reporta: síntomas, evolución, tiempo."
          value={soap.subjetivo}
          interim={active === "subjetivo" ? interim : ""}
          onChange={(v) => setSoap((s) => ({ ...s, subjetivo: v }))}
          dictationActive={active === "subjetivo"}
          dictationDisabled={active !== null && active !== "subjetivo"}
          onToggleDictation={() => toggleFor("subjetivo")}
        />
        <SoapTextarea
          id="objetivo"
          label="Objetivo"
          hint="Hallazgos del examen físico: morfología, distribución, dermatoscopia."
          value={soap.objetivo}
          interim={active === "objetivo" ? interim : ""}
          onChange={(v) => setSoap((s) => ({ ...s, objetivo: v }))}
          dictationActive={active === "objetivo"}
          dictationDisabled={active !== null && active !== "objetivo"}
          onToggleDictation={() => toggleFor("objetivo")}
        />
        <SoapTextarea
          id="analisis"
          label="Análisis"
          hint="Impresión clínica inicial. Usa diferenciales — nunca diagnóstico definitivo."
          value={soap.analisis}
          interim={active === "analisis" ? interim : ""}
          onChange={(v) => setSoap((s) => ({ ...s, analisis: v }))}
          dictationActive={active === "analisis"}
          dictationDisabled={active !== null && active !== "analisis"}
          onToggleDictation={() => toggleFor("analisis")}
        />
        <SoapTextarea
          id="plan"
          label="Plan"
          hint="Conducta acordada con el paciente, estudios, tratamiento, control."
          value={soap.plan}
          interim={active === "plan" ? interim : ""}
          onChange={(v) => setSoap((s) => ({ ...s, plan: v }))}
          dictationActive={active === "plan"}
          dictationDisabled={active !== null && active !== "plan"}
          onToggleDictation={() => toggleFor("plan")}
        />
      </section>

      {voiceError && active === null && (
        <p
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
          role="alert"
        >
          {voiceError}
        </p>
      )}

      <section className="mt-6">
        <PhotoUploader
          pacienteFullName={pacienteFullName}
          photos={photos}
          onChange={setPhotos}
          maxPhotos={3}
        />
      </section>

      {serverState.error && (
        <p
          className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {serverState.error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline" })}
          >
            Cancelar
          </Link>
          <Button type="submit" disabled={isSaving || !pacienteId} size="lg">
            {isSaving ? "Guardando…" : "Guardar consulta"}
          </Button>
        </div>
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al
        médico tratante.
      </p>
    </form>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

/**
 * Dictation panel above the SOAP sections. Visually distinct from the
 * SOAP cards (gradient background + colored top accent + explicit
 * heading) so the médico never confuses this textarea with one of the
 * four S/O/A/P fields.
 */
function GlobalDictationPanel({
  active,
  onToggle,
  transcript,
  interim,
  onChange,
  onClear,
  voiceError,
}: {
  active: boolean;
  onToggle: () => void;
  transcript: string;
  interim: string;
  onChange: (value: string) => void;
  onClear: () => void;
  voiceError: string | null;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
            Dictado libre
          </p>
          <p className="text-xs text-neutral-500">
            Habla todo de corrido. La IA lo reorganiza en S/O/A/P abajo
            cuando das tap a “Estructurar con IA”.
          </p>
        </div>
        {transcript && !active && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

      <Button
        type="button"
        size="lg"
        variant={active ? "destructive" : "default"}
        onClick={onToggle}
        className="h-14 w-full text-base"
      >
        {active ? "■ Parar dictado" : "🎤 Dictar todo"}
      </Button>

      <Textarea
        rows={4}
        value={transcript + (interim ? ` ${interim}` : "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Aquí queda el dictado crudo. También puedes escribir directo."
        className="mt-3 bg-white"
      />

      {voiceError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {voiceError}
        </p>
      )}
    </div>
  );
}

function SoapTextarea({
  id,
  label,
  hint,
  value,
  interim,
  onChange,
  dictationActive,
  dictationDisabled,
  onToggleDictation,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  interim: string;
  onChange: (v: string) => void;
  dictationActive: boolean;
  dictationDisabled: boolean;
  onToggleDictation: () => void;
}) {
  const displayValue = value + (interim ? ` ${interim}` : "");
  return (
    <div
      className={
        "rounded-md border p-3 transition-colors " +
        (dictationActive
          ? "border-red-300 bg-red-50/40"
          : "border-neutral-200 bg-white")
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="text-sm font-semibold uppercase tracking-wide"
        >
          {label}
        </Label>
        <Button
          type="button"
          variant={dictationActive ? "destructive" : "ghost"}
          size="sm"
          disabled={dictationDisabled}
          onClick={onToggleDictation}
          aria-label={
            dictationActive
              ? `Parar dictado de ${label}`
              : `Dictar en ${label}`
          }
          className="h-7 gap-1"
        >
          {dictationActive ? "■ Parar" : "🎤 Dictar"}
        </Button>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      <Textarea
        id={id}
        rows={3}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </div>
  );
}
