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

  // Dictation state
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [isDictating, setIsDictating] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceSupported = useRef(false);

  // SOAP state
  const [soap, setSoap] = useState<SoapData>(EMPTY_SOAP);
  const [isStructuring, setIsStructuring] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

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
      // Abort any active dictation when the component unmounts.
      abortDictation();
    };
  }, []);

  const selectedPaciente = pacientes.find((p) => p.id === pacienteId) ?? null;
  const pacienteFullName = selectedPaciente
    ? `${selectedPaciente.nombre} ${selectedPaciente.apellido}`
    : "";

  // ----- Voice handling -------------------------------------------------

  const handleStartDictation = useCallback(() => {
    setVoiceError(null);

    if (!voiceSupported.current) {
      setVoiceError(dictationErrorMessage("not-supported"));
      return;
    }

    setIsDictating(true);
    startDictation({
      onTranscript: (text, final) => {
        if (final) {
          setTranscript((prev) => (prev ? `${prev} ${text}`.trim() : text));
          setInterim("");
        } else {
          setInterim(text);
        }
      },
      onError: (err: DictationError) => {
        setVoiceError(err.message);
        setIsDictating(false);
        setInterim("");
      },
      onEnd: () => {
        setIsDictating(false);
        setInterim("");
      },
    });
  }, []);

  const handleStopDictation = useCallback(() => {
    stopDictation();
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterim("");
  }, []);

  // ----- Structure with IA ---------------------------------------------

  const handleStructure = useCallback(async () => {
    if (!transcript.trim()) {
      setStructureError(
        "Dicta o escribe algo antes de estructurar con IA.",
      );
      return;
    }
    if (!pacienteId) {
      setStructureError("Selecciona un paciente primero.");
      return;
    }

    setStructureError(null);
    setIsStructuring(true);
    try {
      const res = await fetch("/api/ia/estructurar-soap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: transcript, paciente_id: pacienteId }),
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
    } catch {
      setStructureError(
        "Error de red al hablar con la IA. Puedes editar manualmente.",
      );
    } finally {
      setIsStructuring(false);
    }
  }, [transcript, pacienteId]);

  // ----- Save -----------------------------------------------------------

  const handleSave = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!pacienteId) {
        setServerState({ error: "Selecciona un paciente." });
        return;
      }
      setServerState(initialState);
      setIsSaving(true);

      const payload = {
        paciente_id: pacienteId,
        motivo: motivo.trim() || undefined,
        subjetivo: soap.subjetivo,
        objetivo: soap.objetivo,
        analisis: soap.analisis,
        plan: soap.plan,
        transcripcion_raw: transcript,
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
    [pacienteId, motivo, soap, transcript, photos, router],
  );

  // ----- Render ---------------------------------------------------------

  return (
    <form
      onSubmit={handleSave}
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6 pb-28"
    >
      <header className="mb-5 flex items-center justify-between gap-2">
        <Link
          href="/dashboard"
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
        <DictationPanel
          isDictating={isDictating}
          onStart={handleStartDictation}
          onStop={handleStopDictation}
          transcript={transcript}
          interim={interim}
          onTranscriptChange={setTranscript}
          onClear={clearTranscript}
          voiceError={voiceError}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!transcript.trim() || isStructuring}
            onClick={handleStructure}
          >
            {isStructuring ? "Estructurando con IA…" : "Estructurar con IA"}
          </Button>
          {structureError && (
            <p className="text-xs text-red-600" role="alert">
              {structureError}
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

      <section className="space-y-4">
        <SoapTextarea
          id="subjetivo"
          label="Subjetivo"
          hint="Lo que el paciente reporta: síntomas, evolución, tiempo."
          value={soap.subjetivo}
          onChange={(v) => setSoap((s) => ({ ...s, subjetivo: v }))}
        />
        <SoapTextarea
          id="objetivo"
          label="Objetivo"
          hint="Hallazgos del examen físico: morfología, distribución, dermatoscopia."
          value={soap.objetivo}
          onChange={(v) => setSoap((s) => ({ ...s, objetivo: v }))}
        />
        <SoapTextarea
          id="analisis"
          label="Análisis"
          hint="Impresión clínica inicial. NO escribas “diagnóstico definitivo” aquí — usa diferenciales."
          value={soap.analisis}
          onChange={(v) => setSoap((s) => ({ ...s, analisis: v }))}
        />
        <SoapTextarea
          id="plan"
          label="Plan"
          hint="Conducta acordada con el paciente, estudios, tratamiento, control."
          value={soap.plan}
          onChange={(v) => setSoap((s) => ({ ...s, plan: v }))}
        />
      </section>

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

function DictationPanel({
  isDictating,
  onStart,
  onStop,
  transcript,
  interim,
  onTranscriptChange,
  onClear,
  voiceError,
}: {
  isDictating: boolean;
  onStart: () => void;
  onStop: () => void;
  transcript: string;
  interim: string;
  onTranscriptChange: (value: string) => void;
  onClear: () => void;
  voiceError: string | null;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Dictado
        </span>
        {transcript && !isDictating && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

      <Button
        type="button"
        size="lg"
        variant={isDictating ? "destructive" : "default"}
        onClick={isDictating ? onStop : onStart}
        className="mt-2 h-14 w-full text-base"
      >
        {isDictating ? "■ Parar dictado" : "🎤 Dictar consulta"}
      </Button>

      <Textarea
        rows={4}
        value={transcript + (interim ? ` ${interim}` : "")}
        onChange={(e) => onTranscriptChange(e.target.value)}
        placeholder="Aquí aparece tu dictado. También puedes escribir directamente."
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
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <Label htmlFor={id} className="text-sm font-semibold uppercase tracking-wide">
        {label}
      </Label>
      <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      <Textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </div>
  );
}
