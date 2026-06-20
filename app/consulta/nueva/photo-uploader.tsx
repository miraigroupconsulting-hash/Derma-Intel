"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { processImageToJpeg } from "@/lib/image";

export interface ConsultaPhoto {
  // local-only id for React keys
  localId: string;
  // path inside the fotos-consultas bucket (already uploaded)
  storage_path: string;
  // preview URL (object URL on the local file we compressed)
  preview_url: string;
  tipo: "clinica" | "dermatoscopia";
  zona_anatomica: string | null;
}

type FotoTipo = ConsultaPhoto["tipo"];

// 1280px en el lado largo: la revisión dermatoscópica resuelve red
// pigmentaria, vasos y morfología a esta resolución, costando ~60%
// menos en tokens de imagen que a 2048px. processImageToJpeg hace el
// resize + JPEG en una sola pasada de canvas (descarta EXIF de paso).
const MAX_DIMENSION = 1280;
const MAX_POR_TIPO = 5;

const SECCIONES: { tipo: FotoTipo; titulo: string; singular: string }[] = [
  { tipo: "clinica", titulo: "Fotos clínicas", singular: "foto clínica" },
  {
    tipo: "dermatoscopia",
    titulo: "Fotos dermatoscópicas",
    singular: "dermatoscopia",
  },
];

// Patrón overlay: input <file> posicionado ENCIMA del label con opacity 0.
// El tap cae sobre el input directamente — gold-standard para iOS Safari,
// que trata con reglas estrictas a label.click()/fileInput.click().
const OVERLAY_INPUT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  fontSize: 0,
};

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function PhotoUploader({
  pacienteFullName: _pacienteFullName,
  photos,
  onChange,
  maxPorTipo = MAX_POR_TIPO,
}: {
  // pacienteFullName is currently unused in this component but kept in
  // the public API for future captions (e.g. watermark on download).
  pacienteFullName: string;
  photos: ConsultaPhoto[];
  onChange: (next: ConsultaPhoto[]) => void;
  maxPorTipo?: number;
}) {
  // Qué sección está procesando (null = ninguna). Mientras una sube,
  // deshabilitamos ambas para no pisar el estado.
  const [uploadingTipo, setUploadingTipo] = useState<FotoTipo | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // IMPORTANTE: recibe File[] ya copiado (NO un FileList vivo). El onChange
  // hace Array.from() ANTES de resetear input.value, porque en Safari iOS
  // resetear value invalida el FileList y los File se pierden.
  const handleFiles = useCallback(
    async (incoming: File[], tipo: FotoTipo) => {
      const etiqueta = tipo === "clinica" ? "clínicas" : "dermatoscópicas";
      if (incoming.length === 0) {
        setUploadError(
          "No recibimos ninguna imagen del selector. Reintenta; si persiste, toma la foto con la cámara en vez de elegir de la galería.",
        );
        return;
      }
      const current = photos.filter((p) => p.tipo === tipo).length;
      const remaining = maxPorTipo - current;
      if (remaining <= 0) {
        setUploadError(`Máximo ${maxPorTipo} fotos ${etiqueta} por consulta.`);
        return;
      }
      const toProcess = incoming.slice(0, remaining);
      setUploadError(null);
      setUploadingTipo(tipo);

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sesión expirada. Inicia sesión de nuevo.");

        const tempConsultaSegment = `temp-${randomId()}`;
        const next: ConsultaPhoto[] = [];
        const failures: string[] = [];

        for (const raw of toProcess) {
          // No abortamos todo el batch si una foto falla.
          try {
            if (raw.type && !raw.type.startsWith("image/")) {
              throw new Error(`no es una imagen (${raw.type})`);
            }
            // Decodifica (robusto a HEIC) + resize + JPEG + strip EXIF.
            const compressed = await processImageToJpeg(raw, MAX_DIMENSION);
            const photoId = randomId();
            const storagePath = `${user.id}/${tempConsultaSegment}/${photoId}.jpg`;
            const { error: uploadErr } = await supabase.storage
              .from("fotos-consultas")
              .upload(storagePath, compressed, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (uploadErr) throw new Error(`fallo al subir: ${uploadErr.message}`);

            next.push({
              localId: photoId,
              storage_path: storagePath,
              preview_url: URL.createObjectURL(compressed),
              tipo,
              zona_anatomica: null,
            });
          } catch (perFileErr) {
            // eslint-disable-next-line no-console
            console.error("[photo-uploader] foto failed:", raw.name, perFileErr);
            const detalle = `${raw.name || "imagen"} · ${raw.type || "sin-tipo"} · ${Math.round(
              raw.size / 1024,
            )}KB`;
            failures.push(
              `${detalle}: ${perFileErr instanceof Error ? perFileErr.message : "error"}`,
            );
          }
        }

        if (next.length > 0) onChange([...photos, ...next]);
        if (failures.length > 0) {
          setUploadError(
            `No pudimos procesar ${failures.length} imagen(es): ${failures.join(" | ")}. ` +
              `Si tu iPhone guarda en HEIC, ve a Ajustes › Cámara › Formatos › "Más compatible".`,
          );
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Error al subir foto.");
      } finally {
        setUploadingTipo(null);
      }
    },
    [photos, onChange, maxPorTipo],
  );

  const removePhoto = useCallback(
    async (photo: ConsultaPhoto) => {
      // Best-effort remove from Storage; orphan temp-* paths se limpian luego.
      const supabase = createClient();
      await supabase.storage.from("fotos-consultas").remove([photo.storage_path]);
      URL.revokeObjectURL(photo.preview_url);
      onChange(photos.filter((p) => p.localId !== photo.localId));
    },
    [photos, onChange],
  );

  const updateZona = useCallback(
    (localId: string, zona: string | null) => {
      onChange(
        photos.map((p) =>
          p.localId === localId ? { ...p, zona_anatomica: zona } : p,
        ),
      );
    },
    [photos, onChange],
  );

  return (
    <div className="space-y-5">
      {SECCIONES.map((s) => (
        <PhotoSection
          key={s.tipo}
          tipo={s.tipo}
          titulo={s.titulo}
          singular={s.singular}
          items={photos.filter((p) => p.tipo === s.tipo)}
          maxPorTipo={maxPorTipo}
          processing={uploadingTipo === s.tipo}
          disabled={uploadingTipo !== null}
          onFiles={handleFiles}
          onRemove={removePhoto}
          onUpdateZona={updateZona}
        />
      ))}

      {uploadError && (
        <p className="text-xs text-red-600" role="alert">
          {uploadError}
        </p>
      )}

      <p className="text-xs text-neutral-500">
        Toma clínicas, dermatoscópicas o ambas — el análisis corre con lo que
        haya. Las fotos se cifran en reposo y se anonimizan (sin metadata)
        antes de subir. Solo tú puedes verlas.
      </p>
    </div>
  );
}

function PhotoSection({
  tipo,
  titulo,
  singular,
  items,
  maxPorTipo,
  processing,
  disabled,
  onFiles,
  onRemove,
  onUpdateZona,
}: {
  tipo: FotoTipo;
  titulo: string;
  singular: string;
  items: ConsultaPhoto[];
  maxPorTipo: number;
  processing: boolean;
  disabled: boolean;
  onFiles: (files: File[], tipo: FotoTipo) => void;
  onRemove: (photo: ConsultaPhoto) => void;
  onUpdateZona: (localId: string, zona: string | null) => void;
}) {
  const restantes = maxPorTipo - items.length;

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-sm font-semibold">{titulo}</Label>
        <span className="text-xs text-neutral-500">
          {items.length}/{maxPorTipo}
        </span>
      </div>

      {items.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((p) => (
            <li
              key={p.localId}
              className="rounded-md border border-neutral-200 p-1.5 dark:border-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.preview_url}
                alt={titulo}
                className="aspect-square w-full rounded object-cover"
              />
              <Input
                className="mt-1.5 h-8 text-xs"
                placeholder="Zona (opcional)"
                value={p.zona_anatomica ?? ""}
                onChange={(e) => onUpdateZona(p.localId, e.target.value || null)}
                maxLength={120}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(p)}
                className="mt-1 h-8 w-full text-xs text-red-600 hover:text-red-700"
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {restantes > 0 ? (
        <label
          className={
            "relative flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground " +
            (disabled ? "pointer-events-none opacity-50" : "cursor-pointer")
          }
          style={{ minHeight: 44 }}
        >
          {processing
            ? "Procesando…"
            : `📷 Agregar ${singular} (${restantes} restante${restantes === 1 ? "" : "s"})`}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            style={OVERLAY_INPUT_STYLE}
            onChange={(e) => {
              // Copiamos a array ANTES de resetear value (bug iOS).
              const picked = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              onFiles(picked, tipo);
            }}
          />
        </label>
      ) : (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-xs text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
          Máximo de {maxPorTipo} {titulo.toLowerCase()}. Quita una para agregar
          otra.
        </p>
      )}
    </div>
  );
}
