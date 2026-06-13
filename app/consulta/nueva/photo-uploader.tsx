"use client";

import { useCallback, useRef, useState } from "react";
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

// 1280px en el lado largo: la revisión dermatoscópica resuelve red
// pigmentaria, vasos y morfología a esta resolución, costando ~60%
// menos en tokens de imagen que a 2048px. processImageToJpeg hace el
// resize + JPEG en una sola pasada de canvas (descarta EXIF de paso).
const MAX_DIMENSION = 1280;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IMPORTANTE: recibe File[] ya copiado (NO un FileList vivo). El
  // onChange hace Array.from() ANTES de resetear input.value, porque en
  // Safari iOS resetear value invalida el FileList y los File se pierden
  // — ese era el bug que hacía que "no cargaran" las fotos en iPhone.
  const handleFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) {
        setUploadError(
          "No recibimos ninguna imagen del selector. Reintenta; si persiste, toma la foto con la cámara en vez de elegir de la galería.",
        );
        return;
      }
      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) {
        setUploadError(`Máximo ${maxPhotos} fotos por consulta.`);
        return;
      }
      const toProcess = incoming.slice(0, remaining);
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
        const failures: string[] = [];

        for (const raw of toProcess) {
          // No abortamos todo el batch si una foto falla: procesamos
          // las demás y reportamos al final cuáles fallaron.
          try {
            if (raw.type && !raw.type.startsWith("image/")) {
              throw new Error(`no es una imagen (${raw.type})`);
            }

            // Decodifica (robusto a HEIC) + resize + JPEG + strip EXIF
            // en una sola pasada de canvas.
            const compressed = await processImageToJpeg(raw, MAX_DIMENSION);

            // Upload a Storage. RLS permite escribir solo cuando el
            // primer segmento del path es auth.uid().
            const photoId = randomId();
            const storagePath = `${user.id}/${tempConsultaSegment}/${photoId}.jpg`;
            const { error: uploadErr } = await supabase.storage
              .from("fotos-consultas")
              .upload(storagePath, compressed, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (uploadErr) {
              throw new Error(`fallo al subir: ${uploadErr.message}`);
            }

            next.push({
              localId: photoId,
              storage_path: storagePath,
              preview_url: URL.createObjectURL(compressed),
              tipo: "clinica",
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

      {photos.length < maxPhotos ? (
        /* Patrón overlay: input <file> absolutamente posicionado
           ENCIMA del label, ocupando 100% del área, con opacity 0.
           El usuario toca lo que percibe como un botón, pero su tap
           físicamente cae sobre el input — no hay forwarding necesario,
           no hay pointer-events: none que bloquee.
           Esto es el patrón gold-standard para file inputs porque NO
           depende de label.click() ni de fileInput.click() programático,
           que iOS Safari históricamente trata con reglas estrictas. */
        <label
          className={
            "relative flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground " +
            (uploading ? "pointer-events-none opacity-50" : "cursor-pointer")
          }
          style={{ minHeight: 44 }}
        >
          {uploading
            ? "Procesando…"
            : `📷 Agregar foto (${maxPhotos - photos.length} restante${maxPhotos - photos.length === 1 ? "" : "s"})`}
          <input
            ref={fileInputRef}
            type="file"
            /* `image/*` cubre todos los formatos que pueda tener el
               teléfono (incluído HEIC del iPhone que es default). iOS
               a veces no respeta listas explícitas y el wildcard es
               más confiable. processImageToJpeg() decodifica cualquier
               formato que el browser soporte y lo convierte a JPEG. */
            accept="image/*"
            multiple
            disabled={uploading}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              fontSize: 0,
            }}
            onChange={(e) => {
              // Copiamos a array ANTES de resetear value. En Safari iOS
              // `value = ""` invalida el FileList y perdíamos los File.
              const picked = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              void handleFiles(picked);
            }}
          />
        </label>
      ) : (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-xs text-neutral-600">
          Llegaste al máximo de {maxPhotos} fotos para esta consulta. Quita
          una antes de agregar otra.
        </p>
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

