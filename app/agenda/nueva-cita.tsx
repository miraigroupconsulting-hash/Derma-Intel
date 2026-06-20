"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  PacienteCombobox,
  type PacienteOption,
} from "@/components/paciente-combobox";
import { crearCita } from "./actions";
import type { RecordatorioTipo, Prioridad } from "@/lib/recordatorios";

const TIPO_OPTIONS: { value: RecordatorioTipo; label: string }[] = [
  { value: "control", label: "Control" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "biopsia_pendiente", label: "Biopsia pendiente" },
  { value: "tratamiento_finaliza", label: "Fin de tratamiento" },
  { value: "otro", label: "Otro" },
];

const PRIORIDAD_OPTIONS: { value: Prioridad; label: string }[] = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];

/** "Mañana 09:00" en hora local del dispositivo, formato datetime-local. */
function defaultFecha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NuevaCita({ pacientes }: { pacientes: PacienteOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pacienteId, setPacienteId] = useState("");
  const [fecha, setFecha] = useState(defaultFecha);
  const [tipo, setTipo] = useState<RecordatorioTipo>("control");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setPacienteId("");
    setFecha(defaultFecha());
    setTipo("control");
    setPrioridad("media");
    setMensaje("");
    setError(null);
  };

  const handleSubmit = () => {
    setError(null);
    if (!pacienteId) {
      setError("Selecciona un paciente.");
      return;
    }
    startTransition(async () => {
      const res = await crearCita({
        pacienteId,
        fechaLocal: fecha,
        tipo,
        prioridad,
        mensaje: mensaje.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  if (pacientes.length === 0) {
    // Sin pacientes no tiene sentido el botón; lo ocultamos.
    return null;
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Nueva cita
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md space-y-3 rounded-t-lg bg-background p-5 shadow-xl sm:rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nueva cita</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Paciente</label>
              <PacienteCombobox
                pacientes={pacientes}
                value={pacienteId}
                onChange={setPacienteId}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="cita-fecha" className="text-sm font-medium">
                Fecha y hora
              </label>
              <input
                id="cita-fecha"
                type="datetime-local"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="cita-tipo" className="text-sm font-medium">
                  Tipo
                </label>
                <select
                  id="cita-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as RecordatorioTipo)}
                  className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TIPO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor="cita-prioridad" className="text-sm font-medium">
                  Prioridad
                </label>
                <select
                  id="cita-prioridad"
                  value={prioridad}
                  onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                  className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {PRIORIDAD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="cita-mensaje" className="text-sm font-medium">
                Nota (opcional)
              </label>
              <input
                id="cita-mensaje"
                type="text"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Control post-isotretinoína, revisar biopsia…"
                maxLength={200}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={pending}>
                {pending ? "Guardando…" : "Crear cita"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
