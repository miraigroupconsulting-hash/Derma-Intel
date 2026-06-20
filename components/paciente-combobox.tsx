"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface PacienteOption {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * Selector de paciente BUSCABLE (combobox), sin dependencias nuevas.
 *
 * Reemplaza al <Select> plano en /consulta/nueva: cuando la médica
 * tenga decenas de pacientes, escribir 3 letras es más rápido que
 * scrollear un dropdown. Nunca muestra el UUID — solo "Apellido, Nombre".
 *
 * - Filtra por nombre+apellido, insensible a mayúsculas y acentos.
 * - Touch targets de 44px (CLAUDE.md §7).
 * - Cierra con click-afuera o Escape.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function PacienteCombobox({
  pacientes,
  value,
  onChange,
  placeholder = "Selecciona paciente",
}: {
  pacientes: PacienteOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = pacientes.find((p) => p.id === value) ?? null;
  const selectedLabel = selected
    ? `${selected.apellido}, ${selected.nombre}`
    : "";

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return pacientes;
    return pacientes.filter((p) =>
      normalize(`${p.apellido} ${p.nombre}`).includes(q),
    );
  }, [pacientes, query]);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Autofocus el buscador al abrir.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs hover:bg-accent"
      >
        <span className={selectedLabel ? "truncate" : "truncate text-neutral-500"}>
          {selectedLabel || placeholder}
        </span>
        <span aria-hidden className="shrink-0 text-neutral-500">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-input bg-background shadow-lg">
          <div className="border-b border-neutral-200 p-2 dark:border-white/10">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length === 1 && filtered[0]) {
                  e.preventDefault();
                  onChange(filtered[0].id);
                  setOpen(false);
                  setQuery("");
                }
              }}
              placeholder="Buscar por nombre o apellido…"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-500">
                Sin coincidencias.
              </li>
            ) : (
              filtered.map((p) => {
                const isSel = p.id === value;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(p.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={
                        "flex min-h-11 w-full items-center px-3 py-2 text-left text-sm hover:bg-accent " +
                        (isSel ? "font-semibold text-brand-ink dark:text-brand-cream" : "")
                      }
                    >
                      {p.apellido}, {p.nombre}
                      {isSel && <span className="ml-auto text-brand-gray">✓</span>}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
