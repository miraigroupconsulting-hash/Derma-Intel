"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { readCachedPaciente, type CachedPaciente } from "@/lib/offline-db";

/**
 * Error boundary for /pacientes/[id]. Fires when the Server Component
 * throws — most commonly because the Supabase fetch failed (offline,
 * DNS down, intermittent power cut). We attempt to recover by serving
 * a previously-cached snapshot from IndexedDB.
 *
 * If there's no cached entry, we fall through to a generic "retry"
 * screen instead of the default scary stack trace.
 */

const SEXO_LABEL: Record<string, string> = {
  F: "Femenino",
  M: "Masculino",
  O: "Otro",
};

function calcEdad(fechaNac: string | null): string | null {
  if (!fechaNac) return null;
  const b = new Date(fechaNac);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return `${age} años`;
}

function formatFecha(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Caracas",
  });
}

export default function PacienteErrorBoundary({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "fallback"; entry: CachedPaciente }
    | { kind: "nothing" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached = await readCachedPaciente(params.id);
        if (cancelled) return;
        if (cached) {
          setState({ kind: "fallback", entry: cached });
        } else {
          setState({ kind: "nothing" });
        }
      } catch {
        if (!cancelled) setState({ kind: "nothing" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (state.kind === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-4 py-6 text-sm text-neutral-500">
        Buscando datos guardados localmente…
      </main>
    );
  }

  if (state.kind === "nothing") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold">No pudimos cargar al paciente</h1>
        <p className="text-sm text-neutral-600 text-center">
          La conexión falló y no tenemos una copia guardada localmente de
          este paciente. Verifica tu internet y reintenta.
        </p>
        <button
          type="button"
          onClick={reset}
          className={buttonVariants({ size: "sm" })}
        >
          Reintentar
        </button>
        <Link
          href="/pacientes"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Volver a pacientes
        </Link>
      </main>
    );
  }

  const { entry } = state;
  const p = entry.paciente;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <div
        className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        role="status"
      >
        <span className="font-medium">Mostrando datos guardados localmente.</span>{" "}
        Última actualización: {formatFecha(entry.cachedAt)}.{" "}
        <button
          type="button"
          onClick={reset}
          className="underline hover:no-underline"
        >
          Reintentar conexión
        </button>
      </div>

      <header className="mb-6">
        <Link
          href="/pacientes"
          className="text-xs text-neutral-500 hover:underline"
        >
          ← Pacientes
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.apellido}, {p.nombre}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {[
              calcEdad(p.fecha_nacimiento),
              p.sexo ? SEXO_LABEL[p.sexo] : null,
              p.tipo_piel_fitzpatrick
                ? `Fitzpatrick ${p.tipo_piel_fitzpatrick}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin datos demográficos completos."}
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Consultas recientes ({entry.consultas.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Solo se guardan las 3 más recientes localmente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entry.consultas.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No hay consultas guardadas localmente.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {entry.consultas.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{formatFecha(c.fecha)}</p>
                      <p className="truncate text-xs text-neutral-600">
                        {c.motivo || "Sin motivo registrado"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-600">
                      {c.estado}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Cédula" value={p.cedula} />
            <Row label="Teléfono" value={p.telefono} />
            <Row label="Correo" value={p.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos clínicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Block label="Alergias" value={p.alergias} />
            <Block label="Antecedentes" value={p.antecedentes} />
            <Block label="Medicación actual" value={p.medicacion_actual} />
          </CardContent>
        </Card>

        {p.notas && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas del médico</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">
              {p.notas}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mt-8 text-xs text-neutral-500">
        Información clínica bajo responsabilidad del médico tratante.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-neutral-500">{label}</span>
      <span className="text-neutral-900">{value || "—"}</span>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-neutral-900">
        {value || <span className="text-neutral-400">Sin información.</span>}
      </p>
    </div>
  );
}
