"use client";

import { useCallback, useState } from "react";
import imageCompression, { type Options as ImageCompressionOptions } from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { removeExif } from "@/lib/anonimizar";

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

const COMPRESSION_OPTS: ImageCompressionOptions = {
  // Cap output around 1.5 MB; keeps Storage usage low and IA payloads quick.
  maxSizeMB: 1.5,
  // 2048px is plenty for dermoscopy review; downscales 50MP iPhone shots.
  maxWidthOrHeight: 2048,
  useWebWorker: true,
  fileType: "image/jpeg",
  initialQuality: 0.92,
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
  maxPhotos = 5,
}: {
  // pacienteFullName is currently unused in this component but kept in
  // the public API for future captions (e.g. watermark on download).
  pacienteFullName: string;
  photos: ConsultaPhoto[];
  onChange: (next: ConsultaPhoto[]) => void;
  maxPhotos?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) {
        setUploadError(`Máximo ${maxPhotos} fotos por consulta.`);
        return;
      }
      const toProcess = Array.from(files).slice(0, remaining);
      setUploadError(null);
      setUploading(true);

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Sesión expirada. Inicia sesión de nuevo.");
        }

        const tempConsultaSegment = `temp-${randomId()}`;
        const next: ConsultaPhoto[] = [];

        for (const raw of toProcess) {
          if (!raw.type.startsWith("image/")) {
            throw new Error(
              `"${raw.name}" no es una imagen. Solo aceptamos JPG, PNG o WebP.`,
            );
          }

          // 1. Strip EXIF first (BEFORE compression, while file is still
          //    in its original form so piexifjs can find the segments).
          const stripped = await removeExif(raw);

          // 2. Compress + resize.
          const compressed = await imageCompression(stripped, COMPRESSION_OPTS);

          // 3. Upload to Storage. RLS allows write only when the first
          //    path segment equals auth.uid().
          const photoId = randomId();
          const storagePath = `${user.id}/${tempConsultaSegment}/${photoId}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from("fotos-consultas")
            .upload(storagePath, compressed, {
              contentType: "image/jpeg",
              upsert: false,
            });
          if (uploadErr) {
            throw new Error(`No pudimos subir "${raw.name}": ${uploadErr.message}`);
          }

          next.push({
            localId: photoId,
            storage_path: storagePath,
            preview_url: URL.createObjectURL(compressed),
            tipo: "clinica",
            zona_anatomica: null,
          });
        }

        onChange([...photos, ...next]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Error al subir foto.");
      } finally {
        setUploading(false);
      }
    },
    [photos, onChange, maxPhotos],
  );

  const removePhoto = useCallback(
    async (photo: ConsultaPhoto) => {
      // Best-effort remove from Storage. If it fails the orphan stays in
      // the bucket; the cleanup job will reap temp-* paths older than 24h
      // (TODO in a future migration).
      const supabase = createClient();
      await supabase.storage
        .from("fotos-consultas")
        .remove([photo.storage_path]);
      URL.revokeObjectURL(photo.preview_url);
      onChange(photos.filter((p) => p.localId !== photo.localId));
    },
    [photos, onChange],
  );

  const updatePhoto = useCallback(
    (localId: string, patch: Partial<ConsultaPhoto>) => {
      onChange(
        photos.map((p) => (p.localId === localId ? { ...p, ...patch } : p)),
      );
    },
    [photos, onChange],
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-sm font-semibold">Fotos clínicas</Label>
        <span className="text-xs text-neutral-500">
          {photos.length}/{maxPhotos}
        </span>
      </div>

      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {photos.map((p) => (
            <li
              key={p.localId}
              className="rounded-md border border-neutral-200 p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.preview_url}
                alt="Foto clínica"
                className="aspect-square w-full rounded-md object-cover"
              />
              <div className="mt-2 space-y-2">
                <Select
                  value={p.tipo}
                  onValueChange={(v) =>
                    updatePhoto(p.localId, {
                      tipo: v as ConsultaPhoto["tipo"],
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinica">Foto clínica</SelectItem>
                    <SelectItem value="dermatoscopia">Dermatoscopia</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 text-xs"
                  placeholder="Zona anatómica (opcional)"
                  value={p.zona_anatomica ?? ""}
                  onChange={(e) =>
                    updatePhoto(p.localId, {
                      zona_anatomica: e.target.value || null,
                    })
                  }
                  maxLength={120}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePhoto(p)}
                  className="w-full text-red-600 hover:text-red-700"
                >
                  Quitar foto
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length < maxPhotos && (
        <label
          className={
            buttonClass +
            (uploading ? " opacity-60 pointer-events-none" : "") +
            " flex cursor-pointer items-center justify-center gap-2"
          }
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void handleFiles(e.target.files);
              // Reset so picking the same file again still fires onChange.
              e.target.value = "";
            }}
          />
          {uploading ? "Procesando…" : "📷 Agregar foto"}
        </label>
      )}

      {uploadError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {uploadError}
        </p>
      )}

      <p className="mt-2 text-xs text-neutral-500">
        Las fotos se cifran en reposo y se anonimizan (sin metadata) antes
        de subir. Solo tú puedes verlas.
      </p>
    </div>
  );
}

// Inline class set used by the file-input label (shadcn Button can't wrap
// a real <input type="file"> while keeping a11y, so we replicate its
// look for this single case).
const buttonClass =
  "inline-flex h-9 w-full items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100";
