import { cn } from "@/lib/utils";
import { SPECIALTY } from "@/config/specialty";

/**
 * Wordmark splits: derivamos las dos partes del brand.name a partir
 * del último token (asumimos formato "<MARCA> <SUFIJO>", ej. "DERMA
 * INTEL Pro" → "DERMA INTEL" + "Pro"). Si no hay espacio, mostramos
 * el nombre completo sin sufijo.
 */
const FULL_NAME = SPECIALTY.brand.name;
const LAST_SPACE = FULL_NAME.lastIndexOf(" ");
const WORD_MAIN =
  LAST_SPACE > 0 ? FULL_NAME.slice(0, LAST_SPACE) : FULL_NAME;
const WORD_SUFFIX =
  LAST_SPACE > 0 ? FULL_NAME.slice(LAST_SPACE + 1) : "";

/**
 * DERMA INTEL Pro brand components. Tres variantes:
 *
 *   <LogoSymbol size={32} />            → just the lens symbol
 *   <LogoLockup orientation="horizontal" /> → symbol + wordmark
 *   <LogoLockup orientation="vertical" />   → stacked
 *
 * Color: el symbol usa currentColor para que herede del parent
 * (text-brand-primary, text-white, etc.). El dot central es siempre
 * brand-secondary (#5FA8D3) por consistencia de marca.
 */

interface SymbolProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}

export function LogoSymbol({
  size = 32,
  className,
  "aria-hidden": ariaHidden = true,
}: SymbolProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden={ariaHidden}
      role={ariaHidden ? undefined : "img"}
    >
      <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="3.8" />
      <line x1="32" y1="14" x2="32" y2="22" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="32" y1="42" x2="32" y2="50" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="14" y1="32" x2="22" y2="32" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="42" y1="32" x2="50" y2="32" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3.5" fill="#5FA8D3" />
    </svg>
  );
}

interface LockupProps {
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SYM_SIZE: Record<NonNullable<LockupProps["size"]>, number> = {
  sm: 22,
  md: 32,
  lg: 56,
};
const WORD_SIZE: Record<NonNullable<LockupProps["size"]>, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};
const PRO_SIZE: Record<NonNullable<LockupProps["size"]>, string> = {
  sm: "text-[0.55rem]",
  md: "text-[0.65rem]",
  lg: "text-[0.85rem]",
};

export function LogoLockup({
  orientation = "horizontal",
  size = "md",
  className,
}: LockupProps) {
  const stack = orientation === "vertical";
  return (
    <div
      className={cn(
        "inline-flex items-center text-brand-primary dark:text-brand-cream",
        stack ? "flex-col gap-1.5" : "gap-2.5",
        className,
      )}
    >
      <LogoSymbol size={SYM_SIZE[size]} />
      <div className="flex items-baseline gap-0.5">
        <span
          className={cn(
            "font-display tracking-tight",
            WORD_SIZE[size],
          )}
        >
          {WORD_MAIN}
        </span>
        {WORD_SUFFIX && (
          <span
            className={cn(
              "font-display font-normal text-brand-secondary",
              PRO_SIZE[size],
            )}
          >
            {WORD_SUFFIX}
          </span>
        )}
      </div>
    </div>
  );
}
