import Link from "next/link";
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
 * También aprovecho para incluir `prefetch={false}` cuando la ruta
 * destino es protegida (no Server Component prerendered): evita que
 * Next gaste data prefetcheando rutas auth-protected en mobile.
 */
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
