"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
import { createClient } from "@/lib/supabase/client";
import {
  RecipePdfDocument,
  type RecipePdfMedico,
  type RecipePdfPaciente,
} from "./pdf-document";
import {
  EMPTY_MEDICAMENTO,
  VIAS_ADMIN,
  type Medicamento,
} from "./schema";
import { saveRecipe } from "./actions";

// PDFViewer ships a full PDF renderer into the bundle — load it lazily
// on the client only so we don't bloat the consulta route's initial JS.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <div className="text-xs text-neutral-500">Cargando vista previa…</div> },
);

interface Props {
  consultaId: string;
  medico: RecipePdfMedico;
  paciente: RecipePdfPaciente;
  initialMedicamentos: Medicamento[];
}

export function RecipeForm({
  consultaId,
  medico,
  paciente,
  initialMedicamentos,
}: Props) {
  const router = useRouter();
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>(
    initialMedicamentos.length > 0
      ? initialMedicamentos
      : [{ ...EMPTY_MEDICAMENTO }],
  );
  const [indicacionesPaciente, setIndicacionesPaciente] = useState("");
  const [firmado, setFirmado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const fecha = useMemo(() => new Date(), []);

  const updateMed = useCallback(
    (i: number, patch: Partial<Medicamento>) =>
      setMedicamentos((prev) =>
        prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
      ),
    [],
  );

  const addMed = () =>
    setMedicamentos((prev) => [...prev, { ...EMPTY_MEDICAMENTO }]);
  const removeMed = (i: number) =>
    setMedicamentos((prev) => prev.filter((_, idx) => idx !== i));

  const canGenerate = medicamentos.every(
    (m) => m.nombre.trim().length >= 2 && m.dosis.trim().length >= 1,
  );

  const pdfDocument = (
    <RecipePdfDocument
      medico={medico}
      paciente={paciente}
      medicamentos={medicamentos}
      indicaciones_paciente={indicacionesPaciente || null}
      fecha={fecha}
      consultaId={consultaId}
    />
  );

  const handleGenerate = useCallback(async () => {
    setError(null);
    setSignedUrl(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada.");

      // Lazy-import react-pdf so its module-level code only runs in the
      // browser. Top-level imports were tripping Next's bundler.
      const { pdf } = await import("@react-pdf/renderer");

      let blob: Blob;
      try {
        blob = await pdf(pdfDocument).toBlob();
      } catch (pdfErr) {
        // eslint-disable-next-line no-console
        console.error("[recipe] pdf().toBlob failed:", pdfErr);
        throw new Error(
          `Falló la generación del PDF: ${pdfErr instanceof Error ? pdfErr.message : "error desconocido"}`,
        );
      }
      if (blob.size > 5 * 1024 * 1024) {
        throw new Error("PDF demasiado grande (>5MB). Reduce el contenido.");
      }

      const recipeUuid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storagePath = `${user.id}/${consultaId}/${recipeUuid}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("recetas-pdf")
        .upload(storagePath, blob, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) {
        throw new Error(`No pudimos subir el PDF: ${upErr.message}`);
      }

      const result = await saveRecipe({
        consulta_id: consultaId,
        medicamentos,
        indicaciones_paciente: indicacionesPaciente || null,
        firmado,
        pdf_storage_path: storagePath,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      setSignedUrl(result.signedUrl ?? null);
      router.refresh();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[recipe] generate failed:", e);
      setError(e instanceof Error ? e.message : "Error al generar el récipe.");
    } finally {
      setBusy(false);
    }
  }, [
    consultaId,
    medicamentos,
    indicacionesPaciente,
    firmado,
    pdfDocument,
    router,
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ----- LEFT: form ----- */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Medicamentos
          </h2>
          {medicamentos.map((m, i) => (
            <div
              key={i}
              className="space-y-2 rounded-md border border-neutral-200 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase text-neutral-500">
                  #{i + 1}
                </span>
                {medicamentos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMed(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <Label htmlFor={`nombre-${i}`}>Fármaco *</Label>
                  <Input
                    id={`nombre-${i}`}
                    value={m.nombre}
                    onChange={(e) => updateMed(i, { nombre: e.target.value })}
                    placeholder="Isotretinoína"
                    required
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`presentacion-${i}`}>Presentación</Label>
                    <Input
                      id={`presentacion-${i}`}
                      value={m.presentacion ?? ""}
                      onChange={(e) =>
                        updateMed(i, {
                          presentacion: e.target.value || null,
                        })
                      }
                      placeholder="Cápsulas 20 mg"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`via-${i}`}>Vía</Label>
                    <Select
                      value={m.via ?? ""}
                      onValueChange={(v) => updateMed(i, { via: v || null })}
                    >
                      <SelectTrigger id={`via-${i}`}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {VIAS_ADMIN.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`dosis-${i}`}>Dosis *</Label>
                    <Input
                      id={`dosis-${i}`}
                      value={m.dosis}
                      onChange={(e) => updateMed(i, { dosis: e.target.value })}
                      placeholder="1 cápsula al día"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`duracion-${i}`}>Duración</Label>
                    <Input
                      id={`duracion-${i}`}
                      value={m.duracion ?? ""}
                      onChange={(e) =>
                        updateMed(i, { duracion: e.target.value || null })
                      }
                      placeholder="4 meses"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`indicaciones-${i}`}>
                    Indicaciones al paciente (Sig.)
                  </Label>
                  <Textarea
                    id={`indicaciones-${i}`}
                    value={m.indicaciones ?? ""}
                    onChange={(e) =>
                      updateMed(i, {
                        indicaciones: e.target.value || null,
                      })
                    }
                    placeholder="Tomar con las comidas. Usar protector solar."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMed}
            className="w-full"
          >
            + Agregar fármaco
          </Button>
        </div>

        <div>
          <Label htmlFor="indicaciones-generales">
            Indicaciones generales al paciente
          </Label>
          <Textarea
            id="indicaciones-generales"
            value={indicacionesPaciente}
            onChange={(e) => setIndicacionesPaciente(e.target.value)}
            placeholder="Régimen higiénico, cuidados generales, signos de alarma…"
            rows={3}
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={firmado}
            onChange={(e) => setFirmado(e.target.checked)}
            className="mt-1"
          />
          <span>
            Marcar como <strong>firmado</strong>. Recuerda revisar dosis,
            contraindicaciones y firmar físicamente el PDF antes de
            entregarlo al paciente.
          </span>
        </label>

        {error && (
          <p
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {signedUrl && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p>✓ Récipe guardado.</p>
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              Descargar PDF
            </a>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/consulta/${consultaId}`)}
          >
            Volver
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !canGenerate}
            size="lg"
          >
            {busy ? "Generando…" : "📄 Generar récipe"}
          </Button>
        </div>
      </div>

      {/* ----- RIGHT: live preview ----- */}
      <div className="hidden lg:block">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Vista previa
        </h2>
        <div className="h-[80vh] overflow-hidden rounded-md border border-neutral-300 bg-white">
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            {pdfDocument}
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
