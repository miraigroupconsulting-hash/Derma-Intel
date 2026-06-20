"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  saveIaSession,
  type IaModoWire,
  type IaSessionMessage,
} from "./ia-actions";

interface Mode {
  key: IaModoWire;
  label: string;
  icon: string;
  desc: string;
  usesImage: boolean;
}

const MODES: Mode[] = [
  {
    key: "caso_clinico",
    label: "Caso Clínico",
    icon: "🩺",
    desc: "Análisis completo: imagen + contexto → diferenciales, plan, banderas.",
    usesImage: true,
  },
  {
    key: "express",
    label: "Express",
    icon: "⚡",
    desc: "Top 3 diferenciales rápidos. Ideal entre pacientes.",
    usesImage: true,
  },
  {
    key: "bibliografia",
    label: "Bibliografía",
    icon: "📚",
    desc: "Pregunta clínica → referencias con nivel de evidencia.",
    usesImage: false,
  },
  {
    key: "histopatologia",
    label: "Histopatología",
    icon: "🔬",
    desc: "Lectura de informe histo + correlación clínico-patológica.",
    usesImage: true,
  },
  {
    key: "terapeutica",
    label: "Terapéutica",
    icon: "💊",
    desc: "Diagnóstico ya hecho → plan farmacológico estructurado.",
    usesImage: false,
  },
  {
    key: "docente",
    label: "Docente",
    icon: "🎓",
    desc: "Modo educativo: criterios, ddx, puntos high-yield.",
    usesImage: false,
  },
];

interface DonePayload {
  type: "done";
  usage: { input: number; output: number; total: number; estimated_cost_usd: number };
  model: string;
  disclaimer_injected: boolean;
  latency_ms: number;
}

export function IaPanel({ consultaId }: { consultaId: string }) {
  const [activeMode, setActiveMode] = useState<IaModoWire | null>(null);
  const [messages, setMessages] = useState<IaSessionMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedSessionAt, setSavedSessionAt] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<DonePayload | null>(null);
  const [lastModel, setLastModel] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the chat as new text streams in.
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [streamingText, messages]);

  // Abort any active stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const startCall = useCallback(
    async (
      mode: IaModoWire,
      preguntaSeguimiento: string | null,
      historial: IaSessionMessage[],
    ) => {
      setError(null);
      setIsStreaming(true);
      setStreamingText("");
      setSavedSessionAt(null);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/ia/consultar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consulta_id: consultaId,
            modo: mode,
            pregunta_seguimiento: preguntaSeguimiento ?? undefined,
            historial: historial.length > 0 ? historial : undefined,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          setError(`Error ${res.status}: ${text || "respuesta vacía"}`);
          setIsStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let donePayload: DonePayload | null = null;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const ev of events) {
            const dataLine = ev
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            let payload: unknown;
            try {
              payload = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }
            const p = payload as { type: string };
            if (p.type === "chunk") {
              const chunk = (payload as { text: string }).text;
              accumulated += chunk;
              setStreamingText(accumulated);
            } else if (p.type === "done") {
              donePayload = payload as DonePayload;
            } else if (p.type === "error") {
              setError(
                (payload as { message: string }).message ?? "Error desconocido.",
              );
            }
          }
        }

        // Commit the assistant turn to history.
        if (accumulated.trim().length > 0) {
          setMessages((prev) => [
            ...prev,
            ...(preguntaSeguimiento
              ? [{ role: "user" as const, content: preguntaSeguimiento }]
              : []),
            { role: "assistant" as const, content: accumulated },
          ]);
        }
        if (donePayload) {
          setLastUsage(donePayload);
          setLastModel(donePayload.model);
        }
        setStreamingText("");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User cancelled — discard partial; keep history clean.
          setStreamingText("");
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Error de red al hablar con la IA.",
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [consultaId],
  );

  const handleModeClick = (mode: IaModoWire) => {
    if (isStreaming) return;
    if (activeMode === mode) return; // already showing this mode
    if (activeMode && messages.length > 0) {
      const ok = confirm(
        `¿Iniciar nueva conversación en modo ${mode.toUpperCase()}? La conversación actual queda visible pero el contexto se reinicia.`,
      );
      if (!ok) return;
    }
    setActiveMode(mode);
    setMessages([]);
    setFollowUp("");
    setError(null);
    setSavedSessionAt(null);
    setLastUsage(null);
    setLastModel("");
    void startCall(mode, null, []);
  };

  const handleAskFollowUp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeMode || isStreaming) return;
    const question = followUp.trim();
    if (!question) return;
    setFollowUp("");
    void startCall(activeMode, question, messages);
  };

  const handleStop = () => abortRef.current?.abort();

  const handleSave = async () => {
    if (!activeMode || messages.length === 0) return;
    const result = await saveIaSession(consultaId, {
      modo: activeMode,
      modelo: lastModel || "unknown",
      messages,
    });
    if (result.ok) {
      setSavedSessionAt(new Date().toISOString());
    } else {
      setError(result.error ?? "No pudimos guardar la sesión.");
    }
  };

  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          🧠 DERMA INTEL Pro
        </h2>
        {activeMode && (
          <button
            type="button"
            onClick={() => {
              if (isStreaming) handleStop();
              setActiveMode(null);
              setMessages([]);
              setStreamingText("");
              setFollowUp("");
              setError(null);
              setSavedSessionAt(null);
              setLastUsage(null);
              setLastModel("");
            }}
            className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Cerrar conversación
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MODES.map((m) => {
          const isActive = activeMode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              disabled={isStreaming && !isActive}
              onClick={() => handleModeClick(m.key)}
              className={
                "rounded-md border p-3 text-left transition-colors disabled:opacity-50 " +
                (isActive
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white hover:bg-neutral-50")
              }
            >
              <div className="text-base font-semibold">
                {m.icon} {m.label}
              </div>
              <p
                className={
                  "mt-1 text-[0.7rem] leading-snug " +
                  (isActive ? "text-neutral-300" : "text-neutral-500")
                }
              >
                {m.desc}
              </p>
            </button>
          );
        })}
      </div>

      {activeMode && (
        <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Sugerencia de apoyo clínico. La decisión y firma corresponden al
            médico tratante. Nada en este panel constituye diagnóstico
            definitivo.
          </p>

          <div className="max-h-[60vh] overflow-y-auto rounded-md bg-neutral-50 p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  "mb-3 rounded-md p-3 text-sm " +
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

            {isStreaming && streamingText && (
              <div className="mb-3 rounded-md bg-white p-3 text-sm shadow-sm">
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-500">
                  DERMA INTEL <span className="animate-pulse">▍</span>
                </p>
                <div className="prose prose-sm max-w-none prose-neutral">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingText}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {isStreaming && !streamingText && (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-neutral-500" />
                Consultando a la IA…
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {error && (
            <p
              className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
              role="alert"
            >
              {error}
            </p>
          )}

          {!isStreaming && messages.length > 0 && (
            <form onSubmit={handleAskFollowUp} className="space-y-2">
              <Textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Preguntar más sobre este caso…  (¿y si fuera pediátrico? ¿qué pasa con embarazo?)"
                rows={2}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[0.65rem] text-neutral-500">
                  {/* Tokens/costo/latencia NO se muestran al clínico — esa
                      telemetría vive solo en /mirai-admin. Conservamos solo
                      el aviso de disclaimer inyectado (señal de seguridad
                      clínica, no de costo). */}
                  {lastUsage?.disclaimer_injected && (
                    <span title="El servidor inyectó el disclaimer al final">
                      ⚠ disclaimer inyectado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {savedSessionAt ? (
                    <span className="text-[0.65rem] text-emerald-700">
                      ✓ Guardado en historia
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSave}
                    >
                      💾 Guardar en historia
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!followUp.trim()}
                  >
                    Preguntar
                  </Button>
                </div>
              </div>
            </form>
          )}

          {isStreaming && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStop}
            >
              Parar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
