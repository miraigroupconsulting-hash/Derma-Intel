"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { removeExif } from "@/lib/anonimizar";
import { AnalisisIaPanel } from "@/app/consulta/nueva/analisis-ia-panel";
import type { AnalizarCasoResponse } from "@/app/consulta/schema";

const MAX_FOTOS = 5;
const MAX_DIMENSION = 1280;
const MIN_BYTES = 5_000; // sanity check: < 5KB es muy chico
const TARGET_MIME = "image/jpeg";

interface FotoLocal {
  id: string;
  preview: string; // object URL para mostrar
  base64: string; // sin el prefix "data:image/jpeg;base64,"
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  tipo: "clinica" | "dermatoscopia";
  sizeKb: number;
}

/**
 * Cliente. Comprime + strip EXIF en el browser; envía base64 inline
 * al endpoint /api/ia/consulta-rapida (NO toca Supabase Storage).
 */
export function ConsultaRapidaForm() {
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [contexto, setContexto] = useState("");
  const [analisis, setAnalisis] = useState<AnalizarCasoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (incoming: FileList) => {
    setError(null);
    const room = MAX_FOTOS - fotos.length;
    if (room <= 0) {
      setError(`Máximo ${MAX_FOTOS} imágenes por consulta rápida.`);
      return;
    }
    const files = Array.from(incoming).slice(0, room);

    for (const file of files) {
      // iOS a veces entrega archivos con mime vacío desde la Photos
      // library. Antes saltábamos esos archivos silenciosamente, lo
      // cual le aparecía a la médica como "no se cargan las imágenes".
      // Ahora dejamos que removeExif() intente el canvas re-encode
      // y reporte error específico si el browser no puede decodificar.
      if (file.type && !file.type.startsWith("image/")) continue;
      try {
        // 1. Strip EXIF + recomprimir a JPEG con maxDimension
        const stripped = await removeExif(file);
        const resized = await resizeToJpeg(stripped, MAX_DIMENSION);
        if (resized.size < MIN_BYTES) {
          setError("Una imagen quedó demasiado pequeña tras comprimir. Reintenta con mejor calidad.");
          continue;
        }
        const base64 = await fileToBase64(resized);
        const preview = URL.createObjectURL(resized);
        setFotos((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            preview,
            base64,
            mime: TARGET_MIME,
            tipo: "clinica",
            sizeKb: Math.round(resized.size / 1024),
          },
        ]);
      } catch (e) {
        console.error("[consulta-rapida] foto failed:", e);
        setError(
          `No pudimos procesar una imagen: ${e instanceof Error ? e.message : "error"}`,
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [fotos.length]);

  const updateFotoTipo = (id: string, tipo: FotoLocal["tipo"]) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, tipo } : f)));
  };

  const removeFoto = (id: string) => {
    setFotos((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleAnalizar = useCallback(async () => {
    if (fotos.length === 0) {
      setError("Adjunta al menos una imagen.");
      return;
    }
    setError(null);
    setAnalisis(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ia/consulta-rapida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto: contexto.trim(),
          fotos: fotos.map((f) => ({
            base64: f.base64,
            mime: f.mime,
            tipo: f.tipo,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      setAnalisis(data as AnalizarCasoResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al consultar la IA.");
    } finally {
      setLoading(false);
    }
  }, [fotos, contexto]);

  const handleReset = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.preview));
    setFotos([]);
    setContexto("");
    setAnalisis(null);
    setError(null);
  };

  const totalKb = fotos.reduce((s, f) => s + f.sizeKb, 0);

  return (
    <div className="space-y-5">
      {/* Photos */}
      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <Label>Imágenes ({fotos.length} / {MAX_FOTOS})</Label>
          <span className="text-xs text-brand-gray">{totalKb} KB total</span>
        </div>
        {fotos.length > 0 && (
          <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fotos.map((f) => (
              <li
                key={f.id}
                className="clinical-photo overflow-hidden rounded-md border border-neutral-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.preview}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                <div className="space-y-1 p-1.5 text-[0.65rem]">
                  <select
                    value={f.tipo}
                    onChange={(e) =>
                      updateFotoTipo(f.id, e.target.value as FotoLocal["tipo"])
                    }
                    className="w-full rounded border border-neutral-300 px-1 py-0.5"
                  >
                    <option value="clinica">Clínica</option>
                    <option value="dermatoscopia">Dermatoscopia</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFoto(f.id)}
                    className="text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* Patrón overlay: input file absolutamente posicionado encima
            del label con opacity 0. El tap físicamente cae sobre el
            input — sin forwarding ni programmatic .click() que iOS
            Safari trata con reglas estrictas. */}
        <label
          className={
            "relative inline-flex items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground " +
            (fotos.length >= MAX_FOTOS || loading
              ? "pointer-events-none opacity-50"
              : "cursor-pointer")
          }
          style={{ minHeight: 44 }}
        >
          {fotos.length === 0 ? "📷 Adjuntar imágenes" : "+ Agregar otra"}
          <input
            ref={fileInputRef}
            type="file"
            /* `image/*` para que iOS no filtre HEIC (formato default
               del iPhone). El procesamiento convierte a JPEG. */
            accept="image/*"
            multiple
            disabled={fotos.length >= MAX_FOTOS || loading}
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
              const list = e.target.files;
              e.target.value = "";
              if (list) void addFiles(list);
            }}
          />
        </label>
        <p className="mt-2 text-[0.7rem] text-brand-gray">
          Se comprimen a {MAX_DIMENSION}px y se elimina metadata EXIF antes
          de enviar a la IA. No se guardan en Supabase.
        </p>
      </section>

      {/* Contexto */}
      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <Label htmlFor="contexto-rapido">Contexto (opcional)</Label>
        <Textarea
          id="contexto-rapido"
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          placeholder="Edad aproximada, sexo, tiempo de evolución, síntomas, antecedentes relevantes — lo que ayude a la IA a leer mejor el caso."
          rows={4}
          maxLength={8000}
          disabled={loading}
        />
      </section>

      {error && (
        <p
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {(fotos.length > 0 || analisis) && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={loading}
          >
            Limpiar
          </Button>
        )}
        <Button
          type="button"
          onClick={handleAnalizar}
          disabled={fotos.length === 0 || loading}
          size="lg"
        >
          {loading ? "Consultando a DERMA INTEL…" : "🧠 Analizar"}
        </Button>
      </div>

      {/* Result */}
      {analisis && (
        <div>
          <AnalisisIaPanel data={analisis} />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Helpers
// =====================================================================

/**
 * Re-encode + resize una imagen a JPEG con maxDimension en lado largo.
 * Si la imagen ya es más pequeña, conserva tamaño pero re-encoda (lo
 * cual también descarta metadata residual).
 */
async function resizeToJpeg(file: Blob, maxDim: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No pudimos leer la imagen"));
      el.src = url;
    });
    const ratio = Math.min(
      1,
      maxDim / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.round(img.naturalWidth * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob falló"))),
        "image/jpeg",
        0.88,
      ),
    );
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Blob → base64 sin el prefix "data:...;base64," */
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader devolvió non-string"));
        return;
      }
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}
