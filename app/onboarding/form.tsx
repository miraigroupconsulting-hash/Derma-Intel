"use client";

import { useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  PAISES_CEDULA,
  onboardingSchema,
  type OnboardingInput,
} from "./schema";
import { completeOnboarding, type OnboardingActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: OnboardingActionState = { error: null };

/**
 * Accept a relaxed shape for defaults because a fresh médico has no
 * pais_cedula yet (empty string). The Select component restricts user
 * input to valid codes at runtime; the server action re-validates with
 * the strict zod schema before any DB write.
 */
export interface OnboardingFormProps {
  defaultValues: Omit<OnboardingInput, "pais_cedula"> & { pais_cedula: string };
}

export function OnboardingForm({ defaultValues }: OnboardingFormProps) {
  const [serverState, formAction, pending] = useActionState(
    completeOnboarding,
    initialState,
  );
  const formId = useId();

  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingFormProps["defaultValues"]>({
    resolver: zodResolver(onboardingSchema) as never,
    defaultValues,
    mode: "onBlur",
  });

  const pais = watch("pais_cedula");

  return (
    <form id={formId} action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="nombre"
          label="Nombre"
          required
          error={errors.nombre?.message ?? serverState.fieldErrors?.nombre}
        >
          <Input
            id="nombre"
            autoComplete="given-name"
            {...register("nombre")}
            required
          />
        </Field>

        <Field
          id="apellido"
          label="Apellido"
          required
          error={errors.apellido?.message ?? serverState.fieldErrors?.apellido}
        >
          <Input
            id="apellido"
            autoComplete="family-name"
            {...register("apellido")}
            required
          />
        </Field>
      </div>

      <Field
        id="especialidad"
        label="Especialidad"
        required
        hint="Ej.: Dermatología clínica, Dermatopatología, Dermatología pediátrica."
        error={
          errors.especialidad?.message ?? serverState.fieldErrors?.especialidad
        }
      >
        <Input id="especialidad" {...register("especialidad")} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="pais_cedula"
          label="País de tu cédula"
          required
          error={
            errors.pais_cedula?.message ?? serverState.fieldErrors?.pais_cedula
          }
        >
          <Select
            value={pais}
            onValueChange={(value) =>
              setValue("pais_cedula", value as OnboardingInput["pais_cedula"], {
                shouldValidate: true,
              })
            }
            name="pais_cedula"
            required
          >
            <SelectTrigger id="pais_cedula">
              <SelectValue placeholder="Selecciona país" />
            </SelectTrigger>
            <SelectContent>
              {PAISES_CEDULA.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="cedula_profesional"
          label="Cédula profesional"
          required
          hint="MPPS, RUT, RN o registro local de tu colegio."
          error={
            errors.cedula_profesional?.message ??
            serverState.fieldErrors?.cedula_profesional
          }
        >
          <Input
            id="cedula_profesional"
            {...register("cedula_profesional")}
            required
          />
        </Field>
      </div>

      <Field
        id="telefono"
        label="Teléfono"
        hint="Opcional. Solo lo usamos para mostrar contacto en el récipe."
        error={errors.telefono?.message ?? serverState.fieldErrors?.telefono}
      >
        <Input
          id="telefono"
          type="tel"
          autoComplete="tel"
          {...register("telefono")}
        />
      </Field>

      {serverState.error && !serverState.fieldErrors && (
        <p className="text-sm text-red-600" role="alert">
          {serverState.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? "Guardando…" : "Activar mi cuenta"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
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
      {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
