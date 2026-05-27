"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";

interface PacienteRow {
  id: string;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string | null;
  sexo: string | null;
  tipo_piel_fitzpatrick: number | null;
  telefono: string | null;
  updated_at: string;
}

function calcEdad(fechaNac: string | null): string | null {
  if (!fechaNac) return null;
  const birth = new Date(fechaNac);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age} a`;
}

export function PacientesList({ pacientes }: { pacientes: PacienteRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((p) =>
      `${p.nombre} ${p.apellido}`.toLowerCase().includes(q),
    );
  }, [pacientes, query]);

  return (
    <div className="space-y-4">
      <Input
        type="search"
        placeholder="Buscar por nombre o apellido…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {pacientes.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          Ningún paciente coincide con “{query}”.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {filtered.map((p) => {
            const edad = calcEdad(p.fecha_nacimiento);
            return (
              <li key={p.id}>
                <Link
                  href={`/pacientes/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {p.apellido}, {p.nombre}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {[
                        edad,
                        p.sexo === "F"
                          ? "Femenino"
                          : p.sexo === "M"
                            ? "Masculino"
                            : p.sexo === "O"
                              ? "Otro"
                              : null,
                        p.tipo_piel_fitzpatrick
                          ? `Fitzpatrick ${p.tipo_piel_fitzpatrick}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos demográficos"}
                    </p>
                  </div>
                  <span className="shrink-0 text-neutral-400">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 px-4 py-12 text-center">
      <p className="text-sm font-medium text-neutral-900">
        Aún no ha registrado pacientes.
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        Cuando agregue el primero, aparecerá aquí su historia clínica completa.
      </p>
    </div>
  );
}
