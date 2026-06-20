"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { processImageToJpeg } from "@/lib/image";
import { postJsonWithTimeout } from "@/lib/ai-request";
import { AiProgress } from "@/components/ai-progress";
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

  // IMPORTANTE: recibe File[] ya copiado (NO un FileList vivo). El
  // onChange hace Array.from() ANTES de resetear input.value, porque
  // en Safari iOS resetear value invalida/vacía el FileList y los
  // File se pierden. Ese era el bug que hacía que "no cargaran" las
  // imágenes en iPhone aunque el picker abriera bien.
  const addFiles = useCallback(async (incoming: File[]) => {
    setError(null);
    const room = MAX_FOTOS - fotos.length;
    if (room <= 0) {
      setError(`Máximo ${MAX_FOTOS} imágenes por consulta rápida.`);
      return;
    }
    if (incoming.length === 0) {
      setError(
        "No recibimos ninguna imagen del selector. Reintenta; si persiste, toma la foto con la cámara en vez de elegir de la galería.",
      );
      return;
    }
    const files = incoming.slice(0, room);

    for (const file of files) {
      // iOS a veces entrega archivos con mime vacío desde la Photos
      // library. No saltamos por mime vacío — dejamos que el decode
      // intente y reporte un error específico si no puede.
      if (file.type && !file.type.startsWith("image/")) {
        setError(
          `"${file.name || "archivo"}" no es una imagen (${file.type}). Elige una foto.`,
        );
        continue;
      }
      try {
        // Pipeline unificado: decodifica UNA vez, redimensiona y
        // exporta JPEG (descarta EXIF de paso). Más robusto que el
        // doble-canvas anterior y con mejor soporte HEIC.
        const resized = await processImageToJpeg(file, MAX_DIMENSION);
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
        // Diagnóstico visible: tipo/tamaño del archivo + razón. Así la
        // próxima prueba en iPhone nos dice exactamente qué pasó en vez
        // de "no cargan" a secas.
        const detalle = `${file.name || "imagen"} · ${file.type || "sin-tipo"} · ${Math.round(
          file.size / 1024,
        )}KB`;
        setError(
          `No pudimos procesar ${detalle}: ${e instanceof Error ? e.message : "error desconocido"}. ` +
            `Si tu iPhone guarda en HEIC, ve a Ajustes › Cámara › Formatos › "Más compatible".`,
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
      const { ok, status, data } = await postJsonWithTimeout<
        Record<string, unknown>
      >("/api/ia/consulta-rapida", {
        contexto: contexto.trim(),
        fotos: fotos.map((f) => ({
          base64: f.base64,
          mime: f.mime,
          tipo: f.tipo,
        })),
      });
      const errMsg = typeof data.error === "string" ? data.error : null;
      if (!ok || errMsg) {
        throw new Error(errMsg ?? `Error ${status}`);
      }
      setAnalisis(data as unknown as AnalizarCasoResponse);
    } catch (e) {
      // postJsonWithTimeout lanza AiTimeoutError / AiNetworkError con
      // mensaje en español accionable; cualquier otro error trae su msg.
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
              // Copiamos a array ANTES de resetear value. En Safari iOS
              // `value = ""` invalida el FileList y perdíamos los File.
              const picked = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              void addFiles(picked);
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

      {/* Progreso mientras la IA analiza (~40s) */}
      {loading && <AiProgress expectedMs={40_000} />}

      {/* Result */}
      {analisis && !loading && (
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
