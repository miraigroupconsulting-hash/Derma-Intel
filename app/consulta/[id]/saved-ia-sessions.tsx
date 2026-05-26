"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SavedSession {
  modo: string;
  modelo: string;
  fecha: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

const MODE_LABEL: Record<string, string> = {
  caso_clinico: "Caso Clínico",
  express: "Express",
  bibliografia: "Bibliografía",
  histopatologia: "Histopatología",
  terapeutica: "Terapéutica",
  docente: "Docente",
};

const MODE_ICON: Record<string, string> = {
  caso_clinico: "🩺",
  express: "⚡",
  bibliografia: "📚",
  histopatologia: "🔬",
  terapeutica: "💊",
  docente: "🎓",
};

/**
 * Read-only rendering of every IA conversation the médico explicitly
 * saved to the consulta via the "💾 Guardar en historia" button.
 * Each session collapses by default to keep the page short; tap to
 * expand and read.
 */
export function SavedIaSessions({ sessions }: { sessions: SavedSession[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">
          Consultas a la IA guardadas ({sessions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.map((s, i) => (
          <SessionItem key={i} session={s} />
        ))}
      </CardContent>
    </Card>
  );
}

function SessionItem({ session }: { session: SavedSession }) {
  const [open, setOpen] = useState(false);
  const icon = MODE_ICON[session.modo] ?? "🧠";
  const label = MODE_LABEL[session.modo] ?? session.modo;
  const fecha = formatFecha(session.fecha);

  return (
    <div className="rounded-md border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-neutral-50"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="text-xs text-neutral-500">
          {fecha} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-neutral-200 bg-neutral-50 p-3">
          {session.messages.map((m, j) => (
            <div
              key={j}
              className={
                "rounded-md p-2 text-sm " +
                (m.role === "user"
                  ? "bg-neutral-200 text-neutral-900"
                  : "bg-white text-neutral-800 shadow-sm")
              }
            >
              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-500">
                {m.role === "user" ? "Tú" : "DERMA INTEL"}
              </p>
              <div className="prose prose-sm max-w-none prose-neutral">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          <p className="text-[0.65rem] text-neutral-500">
            Modelo: {session.modelo}
          </p>
        </div>
      )}
    </div>
  );
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
