"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { programarControl } from "./actions";

interface Props {
  consultaId: string;
  pacienteId: string;
  /** plan_terapeutico + diagnostico_diferencial concatenated; used to
   *  query the IA suggestion. Pass empty string if médica still hasn't
   *  written anything. */
  planTexto: string;
}

interface IaSuggestion {
  hay_control_programado: boolean;
  dias_desde_hoy: number | null;
  tipo: "control_clinico" | "control_laboratorio" | "control_evolucion" | null;
  notas: string | null;
  tratamiento_critico_detectado: string | null;
  sugerencia_sistema: string | null;
}

const PRESETS_DIAS = [
  { value: 7, label: "1 semana" },
  { value: 14, label: "2 semanas" },
  { value: 21, label: "3 semanas" },
  { value: 28, label: "4 semanas" },
  { value: 42, label: "6 semanas" },
  { value: 60, label: "2 meses" },
  { value: 90, label: "3 meses" },
  { value: 180, label: "6 meses" },
];

export function ProgramarControl({ consultaId, pacienteId, planTexto }: Props) {
  const [habilitado, setHabilitado] = useState(false);
  const [dias, setDias] = useState(28);
  const [diasCustom, setDiasCustom] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [iaSuggestion, setIaSuggestion] = useState<IaSuggestion | null>(null);
  const [loadingIa, setLoadingIa] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRecordatorioId, setSavedRecordatorioId] = useState<string | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  // Query IA suggestion on mount when there's enough plan text.
  useEffect(() => {
    if (!planTexto || planTexto.trim().length < 5) return;
    let cancelled = false;
    setLoadingIa(true);
    setIaError(null);
    fetch("/api/ia/parsear-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paciente_id: pacienteId, texto: planTexto }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setIaError(data.error);
        } else {
          setIaSuggestion(data as IaSuggestion);
          // Pre-fill UI con sugerencia IA si la médica no decidió aún.
          if (data.hay_control_programado && data.dias_desde_hoy) {
            setDias(data.dias_desde_hoy);
            if (data.notas) setMensaje(data.notas);
          }
          if (data.sugerencia_sistema) {
            setMensaje((prev) => prev || data.sugerencia_sistema);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setIaError(e instanceof Error ? e.message : "Error consultando IA");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingIa(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planTexto, pacienteId]);

  const handleGuardar = useCallback(() => {
    setSaveError(null);
    const diasNum =
      diasCustom.trim() !== "" ? Number(diasCustom) : dias;
    if (!Number.isFinite(diasNum) || diasNum < 1) {
      setSaveError("Selecciona un período válido.");
      return;
    }
    startTransition(async () => {
      // Decidir prioridad: si IA detectó tratamiento crítico → alta.
      const prioridad = iaSuggestion?.tratamiento_critico_detectado
        ? "alta"
        : diasNum <= 14
          ? "media"
          : "baja";
      const result = await programarControl({
        consultaId,
        diasDesdeHoy: diasNum,
        tipo: "control",
        prioridad,
        mensaje: mensaje.trim() || null,
        autoGenerado: false,
      });
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSavedRecordatorioId(result.recordatorioId ?? null);
      }
    });
  }, [dias, diasCustom, mensaje, consultaId, iaSuggestion]);

  if (savedRecordatorioId) {
    return (
      <section className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        ✓ Control programado. Aparecerá en tu Agenda y en el Dashboard.
      </section>
    );
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          📅 Programar control
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Crea un recordatorio que aparecerá en tu agenda y en alertas del
          dashboard.
        </p>
      </header>

      {/* IA suggestion banner */}
      {loadingIa && (
        <div className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Consultando sugerencia IA…
        </div>
      )}
      {iaSuggestion?.tratamiento_critico_detectado && (
        <div
          className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
          role="alert"
        >
          <p className="font-medium">
            ⚠ Tratamiento crítico detectado:{" "}
            <span className="capitalize">
              {iaSuggestion.tratamiento_critico_detectado}
            </span>
          </p>
          {iaSuggestion.sugerencia_sistema && (
            <p className="mt-1 text-xs">{iaSuggestion.sugerencia_sistema}</p>
          )}
          <p className="mt-1 text-xs">
            Sugerencia: control en 28-30 días con laboratorio si aplica.
          </p>
        </div>
      )}
      {iaSuggestion?.hay_control_programado &&
        iaSuggestion.dias_desde_hoy &&
        !iaSuggestion.tratamiento_critico_detectado && (
          <div className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            💡 La IA detectó &quot;control en {iaSuggestion.dias_desde_hoy}{" "}
            días&quot; en tu plan. Pre-llené el formulario; ajusta si
            corresponde.
          </div>
        )}
      {iaError && (
        <div className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          (No pudimos consultar la sugerencia IA: {iaError})
        </div>
      )}

      {!habilitado ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setHabilitado(true)}
          >
            Sí, programar control
          </Button>
          <span className="text-xs text-neutral-500">
            o deja sin programar (control a demanda)
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="control-dias">Tiempo desde hoy</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(dias)}
                onValueChange={(v) => {
                  setDias(Number(v));
                  setDiasCustom("");
                }}
              >
                <SelectTrigger id="control-dias" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS_DIAS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label} ({p.value} días)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-neutral-500">o personalizado:</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={diasCustom}
                onChange={(e) => setDiasCustom(e.target.value)}
                placeholder="días"
                className="w-24"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="control-mensaje">Recordatorio (opcional)</Label>
            <Textarea
              id="control-mensaje"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Ej: Evaluar respuesta a metronidazol crema. Revisar laboratorio si está disponible."
              rows={2}
              maxLength={400}
            />
          </div>

          {saveError && (
            <p
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHabilitado(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleGuardar}
              disabled={pending}
            >
              {pending ? "Guardando…" : "Programar"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
