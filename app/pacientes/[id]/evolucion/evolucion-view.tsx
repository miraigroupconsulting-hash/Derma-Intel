"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ZONAS_ANATOMICAS,
  isSensitiveZona,
  labelForZona,
  otraZona,
} from "@/lib/zonas-anatomicas";
import { updateFotoZona } from "./actions";
import type {
  ComparacionRecord,
  ConsultaGroup,
  FotoEntry,
} from "./types";

type ViewMode = "timeline" | "grid";

type DateRangePreset = "all" | "week" | "month" | "3months";

interface Filters {
  zona: string; // "" = all
  tipo: "" | "clinica" | "dermatoscopia";
  rango: DateRangePreset;
}

const DEFAULT_FILTERS: Filters = { zona: "", tipo: "", rango: "all" };

function withinRange(fechaIso: string, rango: DateRangePreset): boolean {
  if (rango === "all") return true;
  const days = rango === "week" ? 7 : rango === "month" ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(fechaIso).getTime() >= cutoff;
}

function formatFecha(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: undefined,
    timeZone: "America/Caracas",
  });
}

function formatFechaCorta(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Caracas",
  });
}

export function EvolucionView({
  pacienteId,
  pacienteNombre,
  groups,
  comparacionesPrevias,
}: {
  pacienteId: string;
  pacienteNombre: string;
  groups: ConsultaGroup[];
  comparacionesPrevias: ComparacionRecord[];
}) {
  void pacienteNombre;
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("timeline");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selection, setSelection] = useState<string[]>([]); // foto IDs, max 2
  const [retagFor, setRetagFor] = useState<FotoEntry | null>(null);

  const filteredGroups = useMemo(() => {
    const filtered: ConsultaGroup[] = [];
    for (const g of groups) {
      const keptFotos = g.fotos.filter((f) => {
        if (filters.zona && f.zona !== filters.zona) return false;
        if (filters.tipo && f.tipo !== filters.tipo) return false;
        if (!withinRange(f.fecha, filters.rango)) return false;
        return true;
      });
      if (keptFotos.length > 0) {
        filtered.push({ ...g, fotos: keptFotos });
      }
    }
    return filtered;
  }, [groups, filters]);

  const allFlat: FotoEntry[] = useMemo(
    () => filteredGroups.flatMap((g) => g.fotos),
    [filteredGroups],
  );

  const toggleSelect = (fotoId: string) => {
    setSelection((prev) => {
      if (prev.includes(fotoId)) return prev.filter((id) => id !== fotoId);
      if (prev.length >= 2) {
        // Reemplaza el más viejo en selección
        return [prev[1]!, fotoId];
      }
      return [...prev, fotoId];
    });
  };

  const handleCompare = () => {
    if (selection.length !== 2) return;
    const [a, b] = selection;
    // Ordena cronológicamente: el más antiguo es "antes"
    const fa = allFlat.find((f) => f.id === a);
    const fb = allFlat.find((f) => f.id === b);
    if (!fa || !fb) return;
    const before =
      new Date(fa.fecha).getTime() <= new Date(fb.fecha).getTime() ? a : b;
    const after = before === a ? b : a;
    router.push(
      `/pacientes/${pacienteId}/evolucion/comparar?a=${before}&b=${after}`,
    );
  };

  const fotoCount = allFlat.length;

  return (
    <div className="space-y-4 pb-24">
      {/* ----- Toolbar ----- */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? "Ocultar" : "Filtros"}
          {(filters.zona || filters.tipo || filters.rango !== "all") && (
            <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[0.6rem] text-emerald-700">
              activos
            </span>
          )}
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-neutral-200 p-0.5">
          <button
            type="button"
            onClick={() => setView("timeline")}
            className={
              "h-8 rounded px-2 text-xs " +
              (view === "timeline"
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-50")
            }
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            className={
              "h-8 rounded px-2 text-xs " +
              (view === "grid"
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-50")
            }
          >
            Grilla
          </button>
        </div>
      </div>

      {/* ----- Filter drawer ----- */}
      {showFilters && (
        <div className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-neutral-700">
                Zona
              </span>
              <Select
                value={filters.zona}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, zona: v ?? "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas las zonas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas las zonas</SelectItem>
                  {ZONAS_ANATOMICAS.map((g) => (
                    <div key={g.group}>
                      <p className="px-2 pt-2 text-[0.6rem] uppercase tracking-wide text-neutral-500">
                        {g.group}
                      </p>
                      {g.zonas.map((z) => (
                        <SelectItem key={z.value} value={z.value}>
                          {z.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-neutral-700">
                Tipo
              </span>
              <Select
                value={filters.tipo}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    tipo: (v ?? "") as Filters["tipo"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="clinica">Clínica</SelectItem>
                  <SelectItem value="dermatoscopia">Dermatoscopia</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-neutral-700">
                Rango
              </span>
              <Select
                value={filters.rango}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    rango: (v ?? "all") as DateRangePreset,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo</SelectItem>
                  <SelectItem value="week">Última semana</SelectItem>
                  <SelectItem value="month">Último mes</SelectItem>
                  <SelectItem value="3months">Últimos 3 meses</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-xs text-neutral-600 underline hover:no-underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ----- Content ----- */}
      {fotoCount === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-600">
          {groups.length === 0
            ? "Aún no hay fotos para este paciente. Agrega fotos desde una consulta."
            : "Ningún resultado con los filtros actuales."}
        </div>
      ) : view === "timeline" ? (
        <TimelineView
          groups={filteredGroups}
          selection={selection}
          onToggle={toggleSelect}
          onRetag={setRetagFor}
        />
      ) : (
        <GridView
          fotos={allFlat}
          selection={selection}
          onToggle={toggleSelect}
          onRetag={setRetagFor}
        />
      )}

      {/* ----- Comparaciones previas ----- */}
      {comparacionesPrevias.length > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Historial de comparaciones ({comparacionesPrevias.length})
          </h2>
          <ul className="space-y-2">
            {comparacionesPrevias.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-neutral-200 p-2"
              >
                <div className="flex gap-1">
                  {c.antesUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.antesUrl}
                      alt="antes"
                      className="h-12 w-12 rounded object-cover"
                    />
                  )}
                  {c.despuesUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.despuesUrl}
                      alt="después"
                      className="h-12 w-12 rounded object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-xs text-neutral-500">
                    {formatFecha(c.fechaCreacion)}
                  </p>
                  {c.notas && (
                    <p className="truncate text-neutral-700">{c.notas}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/pacientes/${pacienteId}/evolucion/comparar?a=${c.fotoAntesId}&b=${c.fotoDespuesId}&comp=${c.id}`,
                    )
                  }
                >
                  Abrir
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ----- Sticky bottom: compare action ----- */}
      {selection.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-full border border-neutral-300 bg-white px-3 py-2 shadow-xl">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {selection.length} seleccionada{selection.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelection([])}
                className="text-xs text-neutral-500 hover:underline"
              >
                Limpiar
              </button>
              <Button
                type="button"
                size="sm"
                disabled={selection.length !== 2}
                onClick={handleCompare}
              >
                Comparar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ----- Retag modal ----- */}
      {retagFor && (
        <RetagModal
          foto={retagFor}
          onClose={() => setRetagFor(null)}
          onSaved={() => {
            setRetagFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Sub-views
// =====================================================================

function TimelineView({
  groups,
  selection,
  onToggle,
  onRetag,
}: {
  groups: ConsultaGroup[];
  selection: string[];
  onToggle: (fotoId: string) => void;
  onRetag: (foto: FotoEntry) => void;
}) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section
          key={g.consultaId}
          className="rounded-md border border-neutral-200 bg-white p-3"
        >
          <header className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              📅 {formatFechaCorta(g.consultaFecha)}
            </p>
            {g.motivo && (
              <p className="truncate text-xs text-neutral-500">{g.motivo}</p>
            )}
          </header>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.fotos.map((f) => (
              <FotoCard
                key={f.id}
                foto={f}
                selected={selection.includes(f.id)}
                onToggle={onToggle}
                onRetag={onRetag}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function GridView({
  fotos,
  selection,
  onToggle,
  onRetag,
}: {
  fotos: FotoEntry[];
  selection: string[];
  onToggle: (fotoId: string) => void;
  onRetag: (foto: FotoEntry) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {fotos.map((f) => (
        <FotoCard
          key={f.id}
          foto={f}
          selected={selection.includes(f.id)}
          onToggle={onToggle}
          onRetag={onRetag}
          showDate
        />
      ))}
    </div>
  );
}

function FotoCard({
  foto,
  selected,
  onToggle,
  onRetag,
  showDate,
}: {
  foto: FotoEntry;
  selected: boolean;
  onToggle: (id: string) => void;
  onRetag: (foto: FotoEntry) => void;
  showDate?: boolean;
}) {
  // Long-press detection: hold for 500ms to open retag.
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  const handlePressStart = () => {
    longPressTimer = setTimeout(() => {
      onRetag(foto);
      longPressTimer = null;
    }, 500);
  };
  const handlePressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onRetag(foto);
  };

  return (
    <button
      type="button"
      onClick={() => onToggle(foto.id)}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      onContextMenu={handleContextMenu}
      className={
        "group relative aspect-square overflow-hidden rounded-md border-2 transition " +
        (selected
          ? "border-emerald-600 ring-2 ring-emerald-600/30"
          : "border-neutral-200 hover:border-neutral-400")
      }
      aria-pressed={selected}
      aria-label={`Foto ${foto.zona ? `de ${labelForZona(foto.zona)}` : "sin etiquetar"}`}
    >
      {foto.signedUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={foto.signedUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          crossOrigin="anonymous"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[0.6rem] text-neutral-500">
          sin URL
        </div>
      )}

      {/* Selection checkmark */}
      {selected && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[0.65rem] text-white">
          ✓
        </span>
      )}

      {/* Zona label (or "sin etiqueta") */}
      <span
        className={
          "absolute bottom-0 left-0 right-0 truncate px-1 py-0.5 text-[0.55rem] text-white " +
          (foto.zona
            ? "bg-gradient-to-t from-black/70 to-transparent"
            : "bg-amber-700/85")
        }
      >
        {foto.zona ? labelForZona(foto.zona) : "Sin etiqueta — mantén presionado"}
      </span>

      {showDate && (
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[0.55rem] text-white">
          {formatFechaCorta(foto.fecha)}
        </span>
      )}

      <span className="absolute right-1 bottom-6 rounded bg-black/55 px-1 py-0.5 text-[0.5rem] uppercase tracking-wide text-white">
        {foto.tipo === "clinica" ? "clínica" : "dermat."}
      </span>
    </button>
  );
}

// =====================================================================
// Retag modal
// =====================================================================

function RetagModal({
  foto,
  onClose,
  onSaved,
}: {
  foto: FotoEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pickedValue, setPickedValue] = useState(foto.zona ?? "");
  const [otraLibre, setOtraLibre] = useState(
    foto.zona?.startsWith("otra:") ? foto.zona.slice(5) : "",
  );
  const [mode, setMode] = useState<"list" | "otra">(
    foto.zona?.startsWith("otra:") ? "otra" : "list",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSave = (value: string | null) => {
    if (value && isSensitiveZona(value) && !confirmSensitive) {
      setError(
        "Marcar como genital exige confirmación: esta foto es especialmente sensible y debe permanecer estrictamente bajo tu custodia.",
      );
      setConfirmSensitive(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateFotoZona(foto.id, value);
      if (result.error) {
        setError(result.error);
      } else {
        onSaved();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl">
        <header>
          <h3 className="text-lg font-semibold">Etiquetar zona anatómica</h3>
          <p className="mt-1 text-xs text-neutral-600">
            Foto del {formatFecha(foto.fecha)} ·{" "}
            {foto.tipo === "clinica" ? "clínica" : "dermatoscopia"}
          </p>
        </header>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("list")}
            className={
              "h-8 rounded-md border px-3 text-xs " +
              (mode === "list"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700")
            }
          >
            Lista canónica
          </button>
          <button
            type="button"
            onClick={() => setMode("otra")}
            className={
              "h-8 rounded-md border px-3 text-xs " +
              (mode === "otra"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700")
            }
          >
            Otra (libre)
          </button>
        </div>

        {mode === "list" ? (
          <Select value={pickedValue} onValueChange={(v) => setPickedValue(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona zona" />
            </SelectTrigger>
            <SelectContent>
              {ZONAS_ANATOMICAS.map((g) => (
                <div key={g.group}>
                  <p className="px-2 pt-2 text-[0.6rem] uppercase tracking-wide text-neutral-500">
                    {g.group}
                  </p>
                  {g.zonas.map((z) => (
                    <SelectItem key={z.value} value={z.value}>
                      {z.label}
                      {z.sensitive && (
                        <span className="ml-1 text-amber-700">⚠</span>
                      )}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={otraLibre}
            onChange={(e) => setOtraLibre(e.target.value)}
            placeholder="Ej: pliegue interglúteo, lecho ungueal pulgar derecho"
            maxLength={110}
          />
        )}

        {error && (
          <p
            className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {foto.zona && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSave(null)}
              disabled={pending}
            >
              Quitar etiqueta
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const value =
                mode === "otra"
                  ? otraLibre.trim()
                    ? otraZona(otraLibre)
                    : null
                  : pickedValue || null;
              if (!value) {
                setError("Selecciona una zona o escribe una libre.");
                return;
              }
              handleSave(value);
            }}
            disabled={pending}
          >
            {pending ? "Guardando…" : confirmSensitive ? "Confirmo — guardar" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
