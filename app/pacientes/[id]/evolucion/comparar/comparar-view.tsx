"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { labelForZona } from "@/lib/zonas-anatomicas";
import {
  composeComparisonExport,
  loadImageForCanvas,
  triggerDownload,
  type ExportOrientation,
} from "@/lib/compare-export";
import { saveComparacion, markComparacionExportada } from "./actions";

interface FotoView {
  id: string;
  fecha: string;
  tipo: "clinica" | "dermatoscopia";
  zona: string | null;
  signedUrl: string | null;
}

interface Props {
  pacienteId: string;
  pacienteNombre: string;
  antes: FotoView;
  despues: FotoView;
  initialNotes: string;
  comparacionId?: string;
}

function formatFecha(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Caracas",
  });
}

function deltaDias(a: string, b: string): number {
  return Math.max(
    0,
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)),
  );
}

export function CompararView({
  pacienteId,
  pacienteNombre,
  antes,
  despues,
  initialNotes,
  comparacionId: initialComparacionId,
}: Props) {
  const router = useRouter();
  const [notas, setNotas] = useState(initialNotes);
  const [comparacionId, setComparacionId] = useState(initialComparacionId);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [orientation, setOrientation] = useState<ExportOrientation>("landscape");
  const [anonimo, setAnonimo] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sliderRef = useRef<HTMLDivElement>(null);

  const dias = useMemo(
    () => deltaDias(antes.fecha, despues.fecha),
    [antes.fecha, despues.fecha],
  );

  const handleSave = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await saveComparacion({
        pacienteId,
        fotoAntesId: antes.id,
        fotoDespuesId: despues.id,
        notas: notas.trim(),
        comparacionId,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setComparacionId(result.comparacionId ?? comparacionId);
        setSavedAt(new Date());
      }
    });
  }, [pacienteId, antes.id, despues.id, notas, comparacionId]);

  const handleExport = useCallback(async () => {
    if (!antes.signedUrl || !despues.signedUrl) {
      setError("Las URLs firmadas de las fotos no están disponibles.");
      return;
    }
    setExporting(true);
    setExportNotice(null);
    setError(null);
    try {
      const [imgAntes, imgDespues] = await Promise.all([
        loadImageForCanvas(antes.signedUrl),
        loadImageForCanvas(despues.signedUrl),
      ]);
      const result = await composeComparisonExport({
        pacienteNombre,
        fechaAntes: antes.fecha,
        fechaDespues: despues.fecha,
        imgAntes,
        imgDespues,
        notas: notas.trim(),
        orientation,
        anonymize: anonimo,
      });

      if (anonimo && result.facesAntes === 0 && result.facesDespues === 0) {
        setExportNotice(
          "⚠ No se detectaron rostros automáticamente en ninguna de las dos fotos. Si las fotos contienen caras visibles, revísalas a mano antes de compartir.",
        );
      } else if (anonimo && (result.facesAntes === 0 || result.facesDespues === 0)) {
        setExportNotice(
          `⚠ Solo se detectó rostro en ${result.facesAntes > 0 ? "la foto ANTES" : "la foto DESPUÉS"}. Revisa la otra a mano antes de compartir.`,
        );
      }

      const slug = pacienteNombre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const filename = `comparacion-${slug || "paciente"}-${new Date().toISOString().slice(0, 10)}.jpg`;
      triggerDownload(result.blob, filename);

      if (comparacionId) {
        void markComparacionExportada(comparacionId);
      }
    } catch (e) {
      console.error("[comparar] export failed:", e);
      setError(
        e instanceof Error
          ? `Falló la exportación: ${e.message}`
          : "Falló la exportación.",
      );
    } finally {
      setExporting(false);
    }
  }, [
    antes.signedUrl,
    despues.signedUrl,
    antes.fecha,
    despues.fecha,
    pacienteNombre,
    notas,
    orientation,
    anonimo,
    comparacionId,
  ]);

  const zonaInfo = useMemo(() => {
    const za = labelForZona(antes.zona);
    const zd = labelForZona(despues.zona);
    if (za && zd && za === zd) return za;
    if (za && zd) return `${za} ↔ ${zd}`;
    return za || zd || null;
  }, [antes.zona, despues.zona]);

  return (
    <div className="space-y-5">
      {/* Slider */}
      <div ref={sliderRef} className="overflow-hidden rounded-lg bg-black shadow-md">
        {antes.signedUrl && despues.signedUrl ? (
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={antes.signedUrl}
                alt={`Antes — ${formatFecha(antes.fecha)}`}
                style={{ objectFit: "contain", background: "#000" }}
                crossOrigin="anonymous"
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={despues.signedUrl}
                alt={`Después — ${formatFecha(despues.fecha)}`}
                style={{ objectFit: "contain", background: "#000" }}
                crossOrigin="anonymous"
              />
            }
            keyboardIncrement="5%"
            style={{
              height: "min(70vh, 600px)",
              width: "100%",
            }}
            onlyHandleDraggable={false}
          />
        ) : (
          <div className="flex h-72 items-center justify-center text-sm text-white/60">
            No pudimos cargar las imágenes.
          </div>
        )}
      </div>

      {/* Captions */}
      <div className="grid grid-cols-2 gap-2 text-center text-xs text-neutral-600">
        <div>
          <span className="font-medium text-neutral-900">ANTES</span> ·{" "}
          {formatFecha(antes.fecha)}
        </div>
        <div>
          <span className="font-medium text-neutral-900">DESPUÉS</span> ·{" "}
          {formatFecha(despues.fecha)}
        </div>
      </div>

      {/* Stat row */}
      <div className="rounded-md bg-neutral-50 px-3 py-2 text-center text-sm text-neutral-700">
        Evolución de <span className="font-semibold">{dias}</span>{" "}
        día{dias === 1 ? "" : "s"}
        {zonaInfo && <> · zona: <span className="font-medium">{zonaInfo}</span></>}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Notas clínicas
        </label>
        <Textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          placeholder="Ej: Mejoría significativa con metronidazol crema. Lesiones eritematosas reducidas."
          maxLength={4000}
        />
        <p className="text-[0.65rem] text-neutral-500">
          {savedAt
            ? `Guardado a las ${savedAt.toLocaleTimeString("es-VE", { timeStyle: "short", timeZone: "America/Caracas" })}.`
            : "Las notas se guardan al presionar el botón."}
        </p>
      </div>

      {/* Export controls */}
      <div className="space-y-3 rounded-md border border-neutral-200 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Exportación
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-xs text-neutral-700">Formato</span>
            <Select
              value={orientation}
              onValueChange={(v) =>
                setOrientation((v as ExportOrientation) ?? "landscape")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">
                  Horizontal 1920×1080 (presentaciones)
                </SelectItem>
                <SelectItem value="portrait">
                  Vertical 1080×1920 (stories / IG)
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-end gap-2">
            <input
              type="checkbox"
              checked={anonimo}
              onChange={(e) => setAnonimo(e.target.checked)}
              className="h-5 w-5 rounded border-neutral-300 accent-neutral-900"
            />
            <span className="text-sm">
              🔒 Modo anónimo (pixela ojos + oculta nombre del paciente)
            </span>
          </label>
        </div>
        {anonimo && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            La detección de rostros se carga al primer uso (~150KB). Si la
            foto no contiene cara visible, se te avisará para revisar a mano
            antes de compartir.
          </p>
        )}
        {exportNotice && (
          <p
            className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"
            role="alert"
          >
            {exportNotice}
          </p>
        )}
      </div>

      {error && (
        <p
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-2 rounded-full border border-neutral-300 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Volver
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleSave}
          disabled={pending}
        >
          {pending ? "Guardando…" : "💾 Guardar"}
        </Button>
        <Button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? "Generando JPG…" : "📤 Exportar JPG"}
        </Button>
      </div>
    </div>
  );
}
