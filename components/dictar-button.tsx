"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Estado = "idle" | "grabando" | "transcribiendo";

/**
 * Botón de dictado por voz tipo "Wispr Flow": graba audio con
 * MediaRecorder y, al detener, lo transcribe en el servidor
 * (/api/ia/transcribir → Whisper). Llama onText(texto) con el resultado.
 *
 * No es en vivo palabra-por-palabra: la médica habla un tramo, detiene,
 * y el texto aparece en ~1-3s con mucha mejor precisión que el dictado
 * nativo del navegador. Reutilizable en cualquier campo.
 */
function extFromMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

export function DictarButton({
  onText,
  label = "Dictar",
  size = "default",
  className,
  disabled = false,
}: {
  onText: (text: string) => void;
  label?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segs, setSegs] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const limpiar = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
  }, []);

  const transcribir = useCallback(
    async (blob: Blob) => {
      setEstado("transcribiendo");
      try {
        const fd = new FormData();
        fd.append("audio", blob, `dictado.${extFromMime(blob.type)}`);
        const res = await fetch("/api/ia/transcribir", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `Error ${res.status}`);
        }
        const text = String(data.text ?? "").trim();
        if (text) onText(text);
        setEstado("idle");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al transcribir.");
        setEstado("idle");
      }
    },
    [onText],
  );

  const iniciar = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Tu navegador no permite grabar audio. Escribe manualmente.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        // Soltar el micrófono antes de transcribir.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recRef.current = null;
        if (blob.size > 0) void transcribir(blob);
        else setEstado("idle");
      };
      rec.start();
      recRef.current = rec;
      setSegs(0);
      setEstado("grabando");
      timerRef.current = setInterval(() => setSegs((s) => s + 1), 1000);
    } catch {
      limpiar();
      setError(
        "No pudimos acceder al micrófono. Da permiso desde la barra del navegador y reintenta.",
      );
      setEstado("idle");
    }
  }, [transcribir, limpiar]);

  const detener = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      setEstado("transcribiendo");
      rec.stop(); // dispara onstop → transcribir
    }
  }, []);

  const onClick = () => {
    if (estado === "idle") void iniciar();
    else if (estado === "grabando") detener();
  };

  const mmss = `${Math.floor(segs / 60)}:${String(segs % 60).padStart(2, "0")}`;

  return (
    <div className={className}>
      <Button
        type="button"
        size={size}
        variant={estado === "grabando" ? "destructive" : "default"}
        disabled={disabled || estado === "transcribiendo"}
        onClick={onClick}
        className="w-full"
      >
        {estado === "idle" && `🎤 ${label}`}
        {estado === "grabando" && `■ Detener · ${mmss}`}
        {estado === "transcribiendo" && "Transcribiendo…"}
      </Button>
      {estado === "grabando" && (
        <p className="mt-1 text-center text-xs text-red-600">
          ● Grabando — habla con normalidad y pulsa “Detener” al terminar.
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
