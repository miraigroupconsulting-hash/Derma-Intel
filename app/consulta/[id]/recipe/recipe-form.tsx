"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  findMedicamento,
  searchMedicamentos,
  type MedicamentoCatalogo,
} from "@/lib/medicamentos";
import {
  abortDictation,
  dictationErrorMessage,
  isSupported as voiceIsSupported,
  startDictation,
  stopDictation,
} from "@/lib/voice";
import { normalizePhoneForWhatsapp } from "@/lib/phone";
import { enqueueRecipe } from "@/lib/offline-db";
import { downloadBlob, syncOutbox } from "@/lib/recipe-sync";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-neutral-500">Cargando vista previa…</div>
    ),
  },
);

export interface TerapeuticaSnippet {
  /** Plain-text assistant response from the most recent saved
   *  Terapéutica session, or null if no such session exists. */
  text: string | null;
}

interface Props {
  consultaId: string;
  /** Paciente UUID. Required so the form can call
   *  /api/ia/estructurar-recipe (which expects paciente_id, not
   *  consulta_id) for both voice dictation and "Desde IA Terapéutica". */
  pacienteId: string;
  /** If present, the form is re-signing an existing récipe. Triggers
   *  the UPDATE-path in saveRecipe instead of INSERT, and the audit
   *  log gets a `re_firmado` entry. */
  existingRecipeId?: string;
  medico: RecipePdfMedico;
  paciente: RecipePdfPaciente;
  initialMedicamentos: Medicamento[];
  /** Pre-fill for the "Indicaciones generales al paciente" textarea
   *  (used in the re-firma flow). Defaults to empty. */
  initialIndicacionesPaciente?: string;
  /** Optional plain-text from the most recent saved Terapéutica IA
   *  session for this consulta. Used to enable the "✨ Desde IA"
   *  button which parses it through /api/ia/estructurar-recipe. */
  terapeutica: TerapeuticaSnippet;
}

export function RecipeForm({
  consultaId,
  pacienteId,
  existingRecipeId,
  medico,
  paciente,
  initialMedicamentos,
  initialIndicacionesPaciente = "",
  terapeutica,
}: Props) {
  const router = useRouter();

  const [medicamentos, setMedicamentos] = useState<Medicamento[]>(
    initialMedicamentos.length > 0
      ? initialMedicamentos
      : [{ ...EMPTY_MEDICAMENTO }],
  );
  const [indicacionesPaciente, setIndicacionesPaciente] = useState(
    initialIndicacionesPaciente,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Global dictation pad
  const [dictating, setDictating] = useState(false);
  const [dictationDraft, setDictationDraft] = useState("");
  const [dictationInterim, setDictationInterim] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [parsingDictation, setParsingDictation] = useState(false);

  // "✨ Desde IA" state
  const [parsingFromIa, setParsingFromIa] = useState(false);

  // Sign modal state
  const [showSignModal, setShowSignModal] = useState(false);
  const [signConfirmText, setSignConfirmText] = useState("");

  /**
   * `offlineQueued` is true when the upload couldn't reach Supabase
   * (network failure) and we fell through to the IndexedDB outbox.
   * The médica still gets a local PDF download she can hand to the
   * patient via WhatsApp; the actual sync happens later, automatically
   * on 'online' event or manually via the dashboard.
   */
  const [offlineQueued, setOfflineQueued] = useState(false);

  const fecha = useMemo(() => new Date(), []);

  useEffect(() => () => abortDictation(), []);

  const anyControlado = medicamentos.some((m) => m.es_controlado);
  const canGenerate = medicamentos.every(
    (m) => m.nombre.trim().length >= 1,
  );

  // ----- Mutators ----------------------------------------------------

  const updateMed = useCallback(
    (i: number, patch: Partial<Medicamento>) =>
      setMedicamentos((prev) =>
        prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
      ),
    [],
  );

  const addMed = () =>
    setMedicamentos((prev) => [...prev, { ...EMPTY_MEDICAMENTO }]);

  const addMedsFromArray = useCallback((news: Medicamento[]) => {
    setMedicamentos((prev) => {
      // If the only existing row is the empty default, replace it.
      const onlyEmpty =
        prev.length === 1 && prev[0]!.nombre.trim().length === 0;
      const base = onlyEmpty ? [] : prev;
      return [...base, ...news];
    });
  }, []);

  const removeMed = (i: number) =>
    setMedicamentos((prev) => prev.filter((_, idx) => idx !== i));

  // ----- Voice dictation ---------------------------------------------

  const handleStartDictation = useCallback(() => {
    setDictationError(null);
    if (!voiceIsSupported()) {
      setDictationError(dictationErrorMessage("not-supported"));
      return;
    }
    setDictating(true);
    setDictationInterim("");
    startDictation({
      onTranscript: (text, final) => {
        if (final) {
          setDictationDraft((prev) => (prev ? `${prev} ${text}`.trim() : text));
          setDictationInterim("");
        } else {
          setDictationInterim(text);
        }
      },
      onError: (err) => {
        setDictationError(err.message);
        setDictating(false);
        setDictationInterim("");
      },
      onEnd: () => {
        setDictating(false);
        setDictationInterim("");
      },
    });
  }, []);

  const handleStopDictation = useCallback(() => {
    stopDictation();
  }, []);

  const parseTextWithIa = useCallback(
    async (texto: string) => {
      if (!pacienteId) {
        setError("No pudimos identificar al paciente. Recarga la página.");
        return null;
      }
      const res = await fetch("/api/ia/estructurar-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paciente_id: pacienteId, texto }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as {
        medicamentos: Array<{
          nombre: string;
          presentacion: string | null;
          concentracion: string | null;
          cantidad: string | null;
          frecuencia: string | null;
          duracion: string | null;
          via: string | null;
          zona: string | null;
          es_controlado: boolean;
          indicaciones: string | null;
        }>;
        indicaciones_generales?: string[];
        error?: string;
      };
      if (data.error) {
        throw new Error(data.error);
      }
      return data;
    },
    [pacienteId],
  );

  const handleApplyDictation = useCallback(async () => {
    const text = dictationDraft.trim();
    if (!text) return;
    setParsingDictation(true);
    setDictationError(null);
    try {
      const data = await parseTextWithIa(text);
      if (!data) return;
      const mapped: Medicamento[] = data.medicamentos.map((m) => ({
        ...EMPTY_MEDICAMENTO,
        nombre: m.nombre,
        presentacion: m.presentacion,
        concentracion: m.concentracion,
        cantidad: m.cantidad,
        frecuencia: m.frecuencia,
        duracion: m.duracion,
        via: m.via,
        zona: m.zona,
        es_controlado: m.es_controlado,
        indicaciones: m.indicaciones,
      }));
      if (mapped.length === 0) {
        setDictationError(
          "La IA no encontró medicamentos en el dictado. Reformula e intenta de nuevo.",
        );
        return;
      }
      addMedsFromArray(mapped);
      const extras = data.indicaciones_generales ?? [];
      if (extras.length > 0) {
        setIndicacionesPaciente((prev) => {
          const joined = extras.map((x) => `• ${x}`).join("\n");
          return prev ? `${prev}\n${joined}` : joined;
        });
      }
      setDictationDraft("");
    } catch (e) {
      setDictationError(
        e instanceof Error ? e.message : "Error al estructurar el dictado.",
      );
    } finally {
      setParsingDictation(false);
    }
  }, [dictationDraft, addMedsFromArray, parseTextWithIa]);

  // ----- Desde IA Terapéutica ---------------------------------------

  const handleParseTerapeutica = useCallback(async () => {
    if (!terapeutica.text) return;
    setParsingFromIa(true);
    setError(null);
    try {
      const data = await parseTextWithIa(terapeutica.text);
      if (!data || data.medicamentos.length === 0) {
        setError(
          "La IA Terapéutica no contenía medicamentos parseables. Edita manualmente.",
        );
        return;
      }
      const mapped: Medicamento[] = data.medicamentos.map((m) => ({
        ...EMPTY_MEDICAMENTO,
        nombre: m.nombre,
        presentacion: m.presentacion,
        concentracion: m.concentracion,
        cantidad: m.cantidad,
        frecuencia: m.frecuencia,
        duracion: m.duracion,
        via: m.via,
        zona: m.zona,
        es_controlado: m.es_controlado,
        indicaciones: m.indicaciones,
      }));
      addMedsFromArray(mapped);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al extraer desde IA.",
      );
    } finally {
      setParsingFromIa(false);
    }
  }, [terapeutica.text, parseTextWithIa, addMedsFromArray]);

  // ----- Sign + generate PDF ----------------------------------------

  const pdfDocument = useMemo(
    () => (
      <RecipePdfDocument
        medico={medico}
        paciente={paciente}
        medicamentos={medicamentos}
        indicaciones_paciente={indicacionesPaciente || null}
        fecha={fecha}
        consultaId={consultaId}
      />
    ),
    [medico, paciente, medicamentos, indicacionesPaciente, fecha, consultaId],
  );

  const openSignModal = () => {
    setError(null);
    if (!canGenerate) {
      setError("Cada medicamento necesita al menos un nombre.");
      return;
    }
    setSignConfirmText("");
    setShowSignModal(true);
  };

  const handleGenerate = useCallback(async () => {
    if (anyControlado && signConfirmText.trim().toUpperCase() !== "CONFIRMO") {
      setError("Para sustancias controladas, escribe CONFIRMO para liberar el récipe.");
      return;
    }
    setError(null);
    setSignedUrl(null);
    setOfflineQueued(false);
    setBusy(true);

    // Step 1 — render PDF locally. This works offline.
    let blob: Blob;
    try {
      const { pdf } = await import("@react-pdf/renderer");
      blob = await pdf(pdfDocument).toBlob();
    } catch (pdfErr) {
      console.error("[recipe] pdf().toBlob failed:", pdfErr);
      setError(
        `Falló la generación del PDF: ${pdfErr instanceof Error ? pdfErr.message : "error desconocido"}`,
      );
      setBusy(false);
      return;
    }
    if (blob.size > 5 * 1024 * 1024) {
      setError("PDF demasiado grande (>5MB). Reduce el contenido.");
      setBusy(false);
      return;
    }

    // Step 2 — resolve user. getUser uses the cached session if offline.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada. Inicia sesión nuevamente.");
      setBusy(false);
      return;
    }

    const recipeUuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${user.id}/${consultaId}/${recipeUuid}.pdf`;
    const pacienteApellidoSlug = paciente.apellido
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const localFilename = `recipe-${pacienteApellidoSlug || "paciente"}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    // Step 3 — try the online happy-path. If anything network-y fails,
    // fall through to the IDB outbox so the récipe isn't lost.
    try {
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
        firmado: true,
        pdf_storage_path: storagePath,
        existingRecipeId,
      });
      if (result.error) {
        throw new Error(result.error);
      }

      setSignedUrl(result.signedUrl ?? null);
      setShowSignModal(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const looksOffline =
        !navigator.onLine ||
        /failed to fetch|network|networkerror|load failed/i.test(msg);

      if (looksOffline) {
        console.warn("[recipe] online path failed, queuing to outbox:", msg);
        try {
          await enqueueRecipe({
            id: recipeUuid,
            medico_id: user.id,
            consulta_id: consultaId,
            paciente_id: pacienteId,
            pdfBlob: blob,
            pdfStoragePath: storagePath,
            payload: {
              medicamentos,
              indicaciones_paciente: indicacionesPaciente || null,
              firmado: true,
              existingRecipeId,
            },
            firmadoAt: new Date().toISOString(),
            attempts: 0,
            lastError: msg,
          });
          downloadBlob(blob, localFilename);
          setOfflineQueued(true);
          setShowSignModal(false);
        } catch (queueErr) {
          console.error("[recipe] outbox enqueue failed:", queueErr);
          setError(
            "Sin conexión y no pudimos guardar el récipe localmente. Descarga el PDF manualmente desde la vista previa.",
          );
        }
      } else {
        console.error("[recipe] generate failed (online error):", e);
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [
    anyControlado,
    signConfirmText,
    consultaId,
    existingRecipeId,
    pacienteId,
    paciente.apellido,
    medicamentos,
    indicacionesPaciente,
    pdfDocument,
    router,
  ]);

  // Opportunistic outbox drain on online + on mount. Cheap when empty.
  useEffect(() => {
    let cancelled = false;
    const tryDrain = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        await syncOutbox(user.id);
        if (!cancelled) router.refresh();
      } catch {
        // Silent: this is best-effort.
      }
    };
    if (navigator.onLine) void tryDrain();
    const handleOnline = () => {
      void tryDrain();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [router]);

  // ----- WhatsApp ----------------------------------------------------

  const whatsappLink = useMemo(() => {
    if (!signedUrl || !paciente.telefono) {
      return { href: null, display: null };
    }
    const { e164NoPlus, display } = normalizePhoneForWhatsapp(
      paciente.telefono,
    );
    if (!e164NoPlus) return { href: null, display: null };
    const medicoFullName =
      [medico.nombre, medico.apellido].filter(Boolean).join(" ") ||
      "tu médico";
    const fechaTxt = fecha.toLocaleDateString("es-VE", {
      timeZone: "America/Caracas",
    });
    const msg = `Hola ${paciente.nombre}, aquí va el récipe de tu consulta del ${fechaTxt}. Adjúntalo desde tu galería en este chat. Cualquier duda, escríbeme. — Dr/a. ${medicoFullName}`;
    return {
      href: `https://wa.me/${e164NoPlus}?text=${encodeURIComponent(msg)}`,
      display,
    };
  }, [signedUrl, paciente, medico, fecha]);

  // ----- Render ------------------------------------------------------

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ----- LEFT: form ----- */}
      <div className="space-y-4">
        {/* Quick actions row */}
        <div className="flex flex-wrap gap-2">
          {!dictating ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleStartDictation}
              disabled={parsingDictation}
            >
              🎤 Dictar récipe
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleStopDictation}
            >
              ■ Parar dictado
            </Button>
          )}
          {terapeutica.text && (
            <Button
              type="button"
              variant="outline"
              onClick={handleParseTerapeutica}
              disabled={parsingFromIa}
            >
              {parsingFromIa ? "Extrayendo…" : "✨ Desde IA Terapéutica"}
            </Button>
          )}
        </div>

        {(dictating || dictationDraft || dictationError) && (
          <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3 space-y-2">
            <Label>Dictado crudo</Label>
            <Textarea
              rows={3}
              value={dictationDraft + (dictationInterim ? ` ${dictationInterim}` : "")}
              onChange={(e) => setDictationDraft(e.target.value)}
              placeholder='Ej: "Metronidazol crema 0.75% aplicar dos veces al día por 8 semanas. Doxiciclina 100 mg cápsulas, una cada 12 horas por 30 días."'
              className="bg-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleApplyDictation}
                disabled={!dictationDraft.trim() || parsingDictation || dictating}
              >
                {parsingDictation ? "Estructurando con IA…" : "Estructurar con IA"}
              </Button>
              {dictationDraft && !dictating && (
                <button
                  type="button"
                  className="text-xs text-neutral-500 hover:underline"
                  onClick={() => setDictationDraft("")}
                >
                  Limpiar
                </button>
              )}
            </div>
            {dictationError && (
              <p className="text-xs text-red-600" role="alert">
                {dictationError}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Medicamentos ({medicamentos.length})
          </h2>
          {medicamentos.map((m, i) => (
            <MedicamentoCard
              key={i}
              index={i}
              med={m}
              onChange={(patch) => updateMed(i, patch)}
              onRemove={medicamentos.length > 1 ? () => removeMed(i) : undefined}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMed}
            className="w-full"
          >
            + Agregar medicamento
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
            placeholder="• Fotoprotector SPF 50+ diario&#10;• Evitar exfoliantes durante el tratamiento&#10;• Control en 4 semanas"
            rows={4}
          />
        </div>

        {error && !showSignModal && (
          <p
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {offlineQueued && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
            <p>
              <span className="font-medium">
                ✓ Récipe firmado y guardado localmente.
              </span>{" "}
              Sin conexión a internet — el PDF se descargó al dispositivo
              para que lo envíes ahora si lo necesitas. Cuando regrese la
              señal, lo subiremos al expediente automáticamente.
            </p>
            <p className="text-xs text-amber-800/80">
              Mientras tanto puedes compartirlo por WhatsApp adjuntando el
              archivo descargado.
            </p>
          </div>
        )}

        {signedUrl && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-2">
            <p>
              <span className="font-medium">✓ Récipe firmado.</span> Listo para
              descargar o enviar al paciente.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"
              >
                📥 Descargar PDF
              </a>
              {whatsappLink.href ? (
                <a
                  href={whatsappLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-md border border-emerald-700 bg-white px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  💬 Enviar por WhatsApp
                </a>
              ) : (
                <span className="text-xs text-emerald-800/70">
                  {paciente.telefono
                    ? "Teléfono inválido para WhatsApp."
                    : "El paciente no tiene teléfono registrado."}
                </span>
              )}
            </div>
            {whatsappLink.display && (
              <p className="text-xs text-emerald-800/70">
                Se abrirá WhatsApp con el número{" "}
                <span className="font-medium">{whatsappLink.display}</span>.
                Verifica que sea el correcto antes de enviar.
              </p>
            )}
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
            onClick={openSignModal}
            disabled={busy || !canGenerate}
            size="lg"
          >
            {busy ? "Generando…" : "✅ Firmar y generar PDF"}
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

      {/* ----- Sign modal ----- */}
      {showSignModal && (
        <SignModal
          medicamentos={medicamentos}
          anyControlado={anyControlado}
          confirmText={signConfirmText}
          onConfirmTextChange={setSignConfirmText}
          onCancel={() => setShowSignModal(false)}
          onConfirm={handleGenerate}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}

// =====================================================================
// MedicamentoCard — single drug entry with autocomplete on nombre
// =====================================================================

function MedicamentoCard({
  index,
  med,
  onChange,
  onRemove,
}: {
  index: number;
  med: Medicamento;
  onChange: (patch: Partial<Medicamento>) => void;
  onRemove?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MedicamentoCatalogo[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleNombreChange = (v: string) => {
    onChange({ nombre: v });
    const found = searchMedicamentos(v, 6);
    setSuggestions(found);
    setShowSuggestions(found.length > 0);
  };

  const pickSuggestion = (s: MedicamentoCatalogo) => {
    onChange({
      nombre: s.nombre,
      via: s.via_default,
      es_controlado: s.controlado,
      // Pre-fill presentación with the first option so the médica only
      // has to tweak if needed.
      presentacion: s.presentaciones[0] ?? null,
    });
    setShowSuggestions(false);
  };

  // Re-evaluate controlado flag when the user types a name that
  // matches a catalogue entry exactly (e.g. typed without picking from
  // dropdown).
  useEffect(() => {
    const exact = findMedicamento(med.nombre);
    if (exact && exact.controlado !== med.es_controlado) {
      onChange({ es_controlado: exact.controlado });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [med.nombre]);

  return (
    <div
      className={
        "space-y-2 rounded-md border p-3 " +
        (med.es_controlado
          ? "border-amber-400 bg-amber-50/40"
          : "border-neutral-200")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-neutral-500">
          #{index + 1}
        </span>
        <div className="flex items-center gap-2">
          {med.es_controlado && (
            <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-amber-900">
              ⚠ Controlado
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-600 hover:underline"
            >
              Quitar
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Label htmlFor={`nombre-${index}`}>Fármaco *</Label>
        <Input
          id={`nombre-${index}`}
          value={med.nombre}
          onChange={(e) => handleNombreChange(e.target.value)}
          onFocus={() => med.nombre.length >= 2 && setShowSuggestions(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          autoComplete="off"
          placeholder="Empieza a escribir…"
          required
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md">
            {suggestions.map((s) => (
              <li key={s.nombre}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  <div className="font-medium">
                    {s.nombre}
                    {s.controlado && (
                      <span className="ml-2 text-[0.6rem] text-amber-700">
                        ⚠ controlado
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {s.uso_comun ?? s.presentaciones[0]}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`presentacion-${index}`}>Presentación</Label>
          <Input
            id={`presentacion-${index}`}
            value={med.presentacion ?? ""}
            onChange={(e) => onChange({ presentacion: e.target.value || null })}
            placeholder="Crema, gel, cápsulas, etc."
          />
        </div>
        <div>
          <Label htmlFor={`concentracion-${index}`}>Concentración</Label>
          <Input
            id={`concentracion-${index}`}
            value={med.concentracion ?? ""}
            onChange={(e) =>
              onChange({ concentracion: e.target.value || null })
            }
            placeholder="0.75%, 20 mg, 500 mg/5 ml"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`cantidad-${index}`}>Cantidad</Label>
          <Input
            id={`cantidad-${index}`}
            value={med.cantidad ?? ""}
            onChange={(e) => onChange({ cantidad: e.target.value || null })}
            placeholder="1 tubo, 30 cápsulas, caja por 10"
          />
        </div>
        <div>
          <Label htmlFor={`via-${index}`}>Vía</Label>
          <Select
            value={med.via ?? ""}
            onValueChange={(v) => onChange({ via: v || null })}
          >
            <SelectTrigger id={`via-${index}`}>
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
          <Label htmlFor={`frecuencia-${index}`}>Frecuencia</Label>
          <Input
            id={`frecuencia-${index}`}
            value={med.frecuencia ?? ""}
            onChange={(e) => onChange({ frecuencia: e.target.value || null })}
            placeholder="2 veces al día"
          />
        </div>
        <div>
          <Label htmlFor={`duracion-${index}`}>Duración</Label>
          <Input
            id={`duracion-${index}`}
            value={med.duracion ?? ""}
            onChange={(e) => onChange({ duracion: e.target.value || null })}
            placeholder="8 semanas"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`zona-${index}`}>Zona / sitio anatómico (opcional)</Label>
        <Input
          id={`zona-${index}`}
          value={med.zona ?? ""}
          onChange={(e) => onChange({ zona: e.target.value || null })}
          placeholder="Mejillas, dorso, área genital…"
        />
      </div>

      <div>
        <Label htmlFor={`indicaciones-${index}`}>
          Indicaciones específicas (Sig.)
        </Label>
        <Textarea
          id={`indicaciones-${index}`}
          value={med.indicaciones ?? ""}
          onChange={(e) => onChange({ indicaciones: e.target.value || null })}
          placeholder="Tomar con comidas. Usar protector solar. Evitar exposición prolongada."
          rows={2}
        />
      </div>
    </div>
  );
}

// =====================================================================
// SignModal — confirmation before generating signed PDF
// =====================================================================

function SignModal({
  medicamentos,
  anyControlado,
  confirmText,
  onConfirmTextChange,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  medicamentos: Medicamento[];
  anyControlado: boolean;
  confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}) {
  const controlados = medicamentos.filter((m) => m.es_controlado);
  const confirmoOk = !anyControlado || confirmText.trim().toUpperCase() === "CONFIRMO";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">Firmar récipe</h3>
        <p className="text-sm text-neutral-700">
          ¿Confirma que <strong>revisó y aprueba</strong> este récipe? Una vez
          firmado, el PDF se genera y guarda en el expediente del paciente.
        </p>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <p className="font-medium">{medicamentos.length} medicamento{medicamentos.length === 1 ? "" : "s"}:</p>
          <ul className="mt-1 list-disc pl-5">
            {medicamentos.map((m, i) => (
              <li key={i}>
                {m.nombre}
                {m.es_controlado && (
                  <span className="ml-1 text-amber-800">⚠ controlado</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {anyControlado && (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-900">
              ⚠ Sustancia controlada detectada
            </p>
            <p className="text-xs text-amber-900">
              {controlados.length === 1
                ? `"${controlados[0]!.nombre}" está marcado como controlado.`
                : `${controlados.length} medicamentos están marcados como controlados.`}{" "}
              Para liberar el récipe, escribe <strong>CONFIRMO</strong> abajo:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              placeholder="CONFIRMO"
              autoComplete="off"
              className="bg-white"
            />
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy || !confirmoOk}>
            {busy ? "Generando…" : "Firmar y generar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

