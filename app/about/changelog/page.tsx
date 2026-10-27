import Link from "next/link";
import { LogoLockup } from "@/components/logo";
import { RELEASES } from "@/lib/releases";

export const metadata = { title: "Notas de versión" };

export default function ChangelogPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-12">
      <header className="mb-10 text-center">
        <LogoLockup orientation="vertical" size="md" className="mb-4" />
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gray">
          Notas de versión
        </p>
        <h1 className="mt-2 font-display text-2xl">Evolución del producto</h1>
      </header>

      <div className="space-y-12">
        {RELEASES.map((r) => (
          <article key={r.version}>
            <header className="mb-4 border-l-4 border-brand-primary pl-4 dark:border-brand-secondary">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-gray">
                {r.fecha}
              </p>
              <h2 className="mt-1 font-display text-3xl text-brand-primary dark:text-brand-secondary">
                Versión {r.version}
              </h2>
            </header>

            <p className="mb-4 text-base text-brand-ink dark:text-brand-cream">
              {r.highlight}
            </p>

            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
              Incluye
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {r.incluye.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-brand-success">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {r.proximamente && r.proximamente.length > 0 && (
              <>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-brand-gray">
                  En próximas versiones
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-brand-gray">
                  {r.proximamente.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span>·</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </div>

      <footer className="mt-12 border-t border-brand-gray/20 pt-6 text-center text-xs text-brand-gray">
        <p>
          Este es solo el comienzo. Cada versión nace de lo que tú nos
          enseñes en tu práctica diaria.
        </p>
        <Link
          href="/about"
          className="mt-3 inline-block underline-offset-4 hover:underline"
        >
          ← Volver a Acerca de
        </Link>
      </footer>
    </main>
  );
}
