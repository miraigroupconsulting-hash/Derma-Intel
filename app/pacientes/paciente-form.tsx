"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  emptyPacienteDefaults,
  FITZPATRICK_OPTIONS,
  pacienteSchema,
  SEXO_OPTIONS,
  type PacienteFormDefaults,
} from "./schema";
import {
  type PacienteActionState,
  createPaciente,
  updatePaciente,
} from "./actions";
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
import { useState } from "react";
import { SPECIALTY } from "@/config/specialty";

void pacienteSchema; // ensures the import is preserved for type-checking

const initialState: PacienteActionState = { error: null };

export type PacienteFormMode =
  | { mode: "create" }
  | { mode: "edit"; pacienteId: string };

export function PacienteForm({
  defaultValues = emptyPacienteDefaults,
  mode,
  cancelHref,
}: {
  defaultValues?: PacienteFormDefaults;
  mode: PacienteFormMode;
  cancelHref: string;
}) {
  const router = useRouter();

  const action =
    mode.mode === "create"
      ? createPaciente
      : updatePaciente.bind(null, mode.pacienteId);

  const [state, formAction, pending] = useActionState(action, initialState);

  // Local controlled state for selects (HTMLSelect needs a value; we use
  // shadcn Select which stores its value separately).
  const [sexo, setSexo] = useState(defaultValues.sexo);
  const [fitz, setFitz] = useState(defaultValues.tipo_piel_fitzpatrick);
  const handleSexo = (v: string | null) => setSexo(v ?? "");
  const handleFitz = (v: string | null) => setFitz(v ?? "");

  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-neutral-900">
          Datos personales
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="nombre" label="Nombre" required error={err("nombre")}>
            <Input
              id="nombre"
              name="nombre"
              defaultValue={defaultValues.nombre}
              autoComplete="given-name"
              required
            />
          </Field>
          <Field
            id="apellido"
            label="Apellido"
            required
            error={err("apellido")}
          >
            <Input
              id="apellido"
              name="apellido"
              defaultValue={defaultValues.apellido}
              autoComplete="family-name"
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="fecha_nacimiento"
            label="Fecha de nacimiento"
            error={err("fecha_nacimiento")}
          >
            <Input
              id="fecha_nacimiento"
              name="fecha_nacimiento"
              type="date"
              defaultValue={defaultValues.fecha_nacimiento}
            />
          </Field>
          <Field id="sexo" label="Sexo" error={err("sexo")}>
            <Select value={sexo} onValueChange={handleSexo} name="sexo">
              <SelectTrigger id="sexo">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {SEXO_OPTIONS.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {SPECIALTY.features.fototipo && (
            <Field
              id="tipo_piel_fitzpatrick"
              label="Fototipo Fitzpatrick"
              error={err("tipo_piel_fitzpatrick")}
            >
              <Select
                value={fitz}
                onValueChange={handleFitz}
                name="tipo_piel_fitzpatrick"
              >
                <SelectTrigger id="tipo_piel_fitzpatrick">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {FITZPATRICK_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={String(f.value)}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="telefono" label="Teléfono" error={err("telefono")}>
            <Input
              id="telefono"
              name="telefono"
              type="tel"
              autoComplete="tel"
              defaultValue={defaultValues.telefono}
            />
          </Field>
          <Field id="email" label="Correo" error={err("email")}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={defaultValues.email}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="cedula"
            label="Cédula / documento de identidad"
            error={err("cedula")}
          >
            <Input
              id="cedula"
              name="cedula"
              autoComplete="off"
              placeholder="V-12345678, E-12345678, etc."
              defaultValue={defaultValues.cedula}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-neutral-900">
          Datos clínicos
        </legend>
        <Field id="alergias" label="Alergias" error={err("alergias")}>
          <Textarea
            id="alergias"
            name="alergias"
            rows={2}
            defaultValue={defaultValues.alergias}
            placeholder="Penicilina, AINEs, látex…"
          />
        </Field>
        <Field
          id="antecedentes"
          label="Antecedentes médicos"
          error={err("antecedentes")}
        >
          <Textarea
            id="antecedentes"
            name="antecedentes"
            rows={3}
            defaultValue={defaultValues.antecedentes}
            placeholder="Comorbilidades, cirugías previas, exposición laboral…"
          />
        </Field>
        <Field
          id="medicacion_actual"
          label="Medicación actual"
          error={err("medicacion_actual")}
        >
          <Textarea
            id="medicacion_actual"
            name="medicacion_actual"
            rows={2}
            defaultValue={defaultValues.medicacion_actual}
            placeholder="Fármacos sistémicos y tópicos en uso."
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-neutral-900">Notas</legend>
        <Field id="notas" label="Notas del médico" error={err("notas")}>
          <Textarea
            id="notas"
            name="notas"
            rows={3}
            defaultValue={defaultValues.notas}
            placeholder="Cualquier dato adicional útil para la consulta."
          />
        </Field>
      </fieldset>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(cancelHref)}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : mode.mode === "create"
              ? "Crear paciente"
              : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
