"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  PAISES_CEDULA,
  type PerfilDefaults,
} from "./schema";
import { updatePerfil, updateMedicoAssetPath, type PerfilActionState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { convertImageToPng } from "@/lib/image-to-png";

const initialState: PerfilActionState = { error: null };

export function PerfilForm({
  defaultValues,
  initialLogoUrl,
  initialFirmaUrl,
}: {
  defaultValues: PerfilDefaults;
  initialLogoUrl: string | null;
  initialFirmaUrl: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updatePerfil, initialState);
  const [paisCedula, setPaisCedula] = useState(defaultValues.pais_cedula);

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-5">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Datos personales
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="nombre" label="Nombre" required error={state.fieldErrors?.nombre}>
              <Input
                id="nombre"
                name="nombre"
                defaultValue={defaultValues.nombre}
                autoComplete="given-name"
                required
              />
            </Field>
            <Field id="apellido" label="Apellido" required error={state.fieldErrors?.apellido}>
              <Input
                id="apellido"
                name="apellido"
                defaultValue={defaultValues.apellido}
                autoComplete="family-name"
                required
              />
            </Field>
          </div>
          <Field
            id="telefono"
            label="Teléfono"
            error={state.fieldErrors?.telefono}
            hint="Aparece en el récipe."
          >
            <Input
              id="telefono"
              name="telefono"
              type="tel"
              autoComplete="tel"
              defaultValue={defaultValues.telefono}
            />
          </Field>
          <Field
            id="direccion"
            label="Dirección de consultorio"
            error={state.fieldErrors?.direccion}
            hint="Línea opcional bajo tu nombre en el récipe."
          >
            <Textarea
              id="direccion"
              name="direccion"
              rows={2}
              defaultValue={defaultValues.direccion}
              placeholder="Av. Principal, Edif. Médico, Piso 2, Of. 204, Caracas"
              maxLength={300}
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Identidad profesional
          </legend>
          <Field
            id="especialidad"
            label="Especialidad"
            required
            error={state.fieldErrors?.especialidad}
          >
            <Input
              id="especialidad"
              name="especialidad"
              defaultValue={defaultValues.especialidad}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="pais_cedula"
              label="País de tu cédula"
              required
              error={state.fieldErrors?.pais_cedula}
            >
              <Select
                value={paisCedula}
                onValueChange={(v) => setPaisCedula(v ?? "")}
                name="pais_cedula"
                required
              >
                <SelectTrigger id="pais_cedula">
                  <SelectValue placeholder="Selecciona" />
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
              error={state.fieldErrors?.cedula_profesional}
            >
              <Input
                id="cedula_profesional"
                name="cedula_profesional"
                defaultValue={defaultValues.cedula_profesional}
                required
              />
            </Field>
          </div>
        </fieldset>

        {state.error && !state.success && (
          <p
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {state.error}
          </p>
        )}
        {state.success && (
          <p
            className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            role="status"
          >
            ✓ Perfil actualizado.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            Volver
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </form>

      <fieldset className="space-y-5 border-t border-neutral-200 pt-6">
        <legend className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Imágenes para el récipe (opcional)
        </legend>

        <AssetUploader
          field="logo"
          label="Logo de tu consultorio"
          hint="Aparece arriba a la izquierda del récipe. Recomendado: PNG con fondo transparente, máx. 500 KB."
          initialUrl={initialLogoUrl}
          maxDimension={800}
        />

        <AssetUploader
          field="firma"
          label="Firma digital"
          hint="Foto de tu firma sobre papel blanco, con buena luz. Recórtala bien pegada al trazo antes de subir — la app la comprime automáticamente a 600px."
          initialUrl={initialFirmaUrl}
          maxDimension={600}
        />
      </fieldset>
    </div>
  );
}

function AssetUploader({
  field,
  label,
  hint,
  initialUrl,
  maxDimension,
}: {
  field: "logo" | "firma";
  label: string;
  hint: string;
  initialUrl: string | null;
  /** Longest-edge clamp in pixels. Default 800 (logo); pass 600 for
   *  firmas to keep the file lean even when the médico subió una foto
   *  HD del papel. */
  maxDimension?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Solo aceptamos imágenes (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Imagen demasiado grande. Máximo 5 MB antes de comprimir.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada.");

      const png = await convertImageToPng(file, {
        maxDimension: maxDimension ?? 800,
      });
      if (png.size > 2 * 1024 * 1024) {
        throw new Error("PNG resultante mayor a 2 MB. Sube una imagen más pequeña.");
      }

      const path = `${user.id}/${field}.png`;
      const { error: upErr } = await supabase.storage
        .from("medico-assets")
        .upload(path, png, {
          contentType: "image/png",
          upsert: true,
        });
      if (upErr) throw new Error(`No pudimos subir: ${upErr.message}`);

      const result = await updateMedicoAssetPath(field, path);
      if (!result.ok) throw new Error(result.error ?? "Error al guardar.");

      const { data: signed } = await supabase.storage
        .from("medico-assets")
        .createSignedUrl(path, 60 * 60);
      setPreviewUrl(signed?.signedUrl ?? null);
      // No router.refresh() — local preview state already reflects the
      // upload. Refreshing would re-mount the form's uncontrolled inputs
      // and trigger a Base UI "changing default value" warning.
    } catch (e) {
      console.error(`[perfil ${field}] upload failed:`, e);
      setError(e instanceof Error ? e.message : "Error al subir.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada.");
      const path = `${user.id}/${field}.png`;
      await supabase.storage.from("medico-assets").remove([path]);
      const result = await updateMedicoAssetPath(field, null);
      if (!result.ok) throw new Error(result.error);
      setPreviewUrl(null);
      // Same as handleFile: local state already updates the UI.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al quitar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-3">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-neutral-500">{hint}</p>
      {previewUrl && (
        <div className="my-2 rounded-md border border-neutral-200 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={label}
            className="mx-auto block max-h-32 object-contain"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label
          className={
            "inline-flex h-9 cursor-pointer items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-50 " +
            (busy ? "pointer-events-none opacity-50" : "")
          }
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {busy ? "Procesando…" : previewUrl ? "Reemplazar" : "Subir"}
        </label>
        {previewUrl && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleRemove()}
          >
            Quitar
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
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
