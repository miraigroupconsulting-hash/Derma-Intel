"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Botón de "volver" usado en todos los headers de la app.
 *
 * Cumple Apple HIG + CLAUDE.md §7: touch target mínimo 44×44pt.
 * Antes era `text-xs text-neutral-500` (~12px de alto) que en iPhone
 * requería tocar con precisión exacta — la médica reportó que tenía
 * que darle varias veces. Ahora el área tappable es ~44px sin verse
 * agresivo visualmente (padding generoso + texto sm, sin background).
 *
 * --- Smart referrer override ---
 *
 * Si la URL trae `?from=/ruta&fromLabel=Texto`, BackLink usa ESOS
 * valores en vez del `href`/`label` por defecto. Esto resuelve el
 * caso "vine desde /agenda, regresar debería llevarme a /agenda y
 * no a la ficha del paciente". Las páginas que enlazan a otras
 * añaden `?from=` para preservar el contexto de navegación. Solo
 * acepta rutas que empiezan con "/" (validación anti open-redirect).
 *
 * Implementado con Suspense interno para no forzar dynamic rendering
 * en páginas estáticas que monten BackLink — el fallback es el botón
 * "tonto" (default href) y el hijo client component lee searchParams.
 */
function BackLinkInner({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const params = useSearchParams();
  const from = params.get("from");
  const fromLabel = params.get("fromLabel");

  // Anti open-redirect: solo paths same-origin que empiezan con "/"
  // y no "//" (que es protocol-relative). Si no cumple, ignoramos.
  const safeFrom =
    from && from.startsWith("/") && !from.startsWith("//") ? from : null;

  const resolvedHref = safeFrom ?? href;
  const resolvedLabel = safeFrom && fromLabel ? fromLabel : label;

  return (
    <Link
      href={resolvedHref}
      className={cn(
        "-ml-2 inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm text-brand-gray hover:bg-neutral-100 hover:text-brand-ink dark:hover:bg-white/5 dark:hover:text-brand-cream",
        className,
      )}
    >
      <span aria-hidden className="text-base">
        ←
      </span>
      <span className="truncate">{resolvedLabel}</span>
    </Link>
  );
}

function BackLinkFallback({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-ml-2 inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm text-brand-gray hover:bg-neutral-100 hover:text-brand-ink dark:hover:bg-white/5 dark:hover:text-brand-cream",
        className,
      )}
    >
      <span aria-hidden className="text-base">
        ←
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function BackLink({
  href,
  label = "Volver",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Suspense
      fallback={
        <BackLinkFallback href={href} label={label} className={className} />
      }
    >
      <BackLinkInner href={href} label={label} className={className} />
    </Suspense>
  );
}
