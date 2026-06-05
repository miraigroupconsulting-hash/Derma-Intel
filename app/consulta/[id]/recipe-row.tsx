"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { unsignRecipe } from "./recipe/actions";
import type { RevisionEntry } from "./recipe/revisiones";
import { normalizePhoneForWhatsapp } from "@/lib/phone";

interface Props {
  recipeId: string;
  consultaId: string;
  fecha: string;
  num: number;
  firmado: boolean;
  url: string | null;
  revisiones: RevisionEntry[];
  // Datos para construir el link de WhatsApp del récipe ya firmado.
  // Si falta el teléfono del paciente, el botón se oculta.
  pacienteNombre: string;
  pacienteTelefono: string | null;
  medicoFullName: string;
}

const ACCION_LABEL: Record<RevisionEntry["accion"], string> = {
  firmado: "Firmado",
  desfirmado: "Desfirmado",
  re_firmado: "Re-firmado",
};

const ACCION_COLOR: Record<RevisionEntry["accion"], string> = {
  firmado: "text-emerald-700",
  desfirmado: "text-amber-700",
  re_firmado: "text-emerald-700",
};

function formatFecha(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Caracas",
  });
}

/**
 * One row in the récipes list of /consulta/[id]. Handles the unsign
 * confirmation modal and the re-firmar link. The actual PDF
 * regeneration on re-firma happens at /consulta/[id]/recipe?from=<id>.
 */
export function RecipeRow({
  recipeId,
  consultaId,
  fecha,
  num,
  firmado,
  url,
  revisiones,
  pacienteNombre,
  pacienteTelefono,
  medicoFullName,
}: Props) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingUnsign, setConfirmingUnsign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ----- WhatsApp link (solo si firmado + teléfono presente) ---------
  // Reusa el patrón ya existente en recipe-form.tsx así la médica
  // tiene un atajo de re-envío sin tener que abrir el récipe primero.
  const whatsapp = useMemo(() => {
    if (!firmado || !url || !pacienteTelefono) return null;
    const { e164NoPlus } = normalizePhoneForWhatsapp(pacienteTelefono);
    if (!e164NoPlus) return null;
    const fechaTxt = new Date(fecha).toLocaleDateString("es-VE", {
      timeZone: "America/Caracas",
    });
    const msg =
      `Hola ${pacienteNombre.trim() || "buenas"}, aquí va el récipe ` +
      `de tu consulta del ${fechaTxt}. Adjúntalo desde tu galería en este chat. ` +
      `Cualquier duda, escríbeme. — ${medicoFullName}`;
    return `https://wa.me/${e164NoPlus}?text=${encodeURIComponent(msg)}`;
  }, [firmado, url, pacienteTelefono, pacienteNombre, medicoFullName, fecha]);

  const handleUnsign = () => {
    setError(null);
    startTransition(async () => {
      const result = await unsignRecipe(recipeId);
      if (result.error) {
        setError(result.error);
      } else {
        setConfirmingUnsign(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900">{formatFecha(fecha)}</p>
          <p className="text-xs text-neutral-500">
            {num} fármaco{num === 1 ? "" : "s"} ·{" "}
            <span
              className={
                firmado ? "text-emerald-700" : "text-amber-700"
              }
            >
              {firmado ? "Firmado" : "Borrador (desfirmado)"}
            </span>
            {revisiones.length > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="underline hover:no-underline"
                >
                  {showHistory ? "Ocultar" : "Ver"} historial (
                  {revisiones.length})
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Descargar PDF
            </a>
          )}
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              aria-label={`Enviar récipe a ${pacienteNombre} por WhatsApp`}
            >
              📱 WhatsApp
            </a>
          )}
          {firmado ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingUnsign(true)}
              disabled={pending}
              className="text-amber-700 hover:bg-amber-50"
            >
              Desfirmar
            </Button>
          ) : (
            <Link
              href={`/consulta/${consultaId}/recipe?from=${recipeId}`}
              className={buttonVariants({ size: "sm" })}
            >
              Editar y re-firmar
            </Link>
          )}
        </div>
      </div>

      {showHistory && revisiones.length > 0 && (
        <ul className="ml-1 space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-2 text-xs">
          {revisiones.map((rev, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className={"font-medium " + ACCION_COLOR[rev.accion]}>
                {ACCION_LABEL[rev.accion]}
              </span>
              <span className="text-neutral-700">{formatFecha(rev.fecha)}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      {confirmingUnsign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Desfirmar récipe</h3>
            <p className="text-sm text-neutral-700">
              El récipe pasará a borrador y dejará de estar firmado. El PDF
              actual se conserva en el expediente como evidencia. Podrás
              editarlo y re-firmarlo después.
            </p>
            <p className="text-xs text-neutral-500">
              Si ya entregaste este récipe al paciente, recuerda informarle
              que la versión vigente cambió.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingUnsign(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleUnsign}
                disabled={pending}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {pending ? "Procesando…" : "Sí, desfirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
