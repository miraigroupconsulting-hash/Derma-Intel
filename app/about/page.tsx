import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";

export const metadata = { title: "Acerca de" };

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center px-6 py-16 text-center">
      <LogoLockup orientation="vertical" size="lg" className="mb-8" />

      <p className="text-xs uppercase tracking-[0.2em] text-brand-gray">
        Versión 1.0
      </p>

      <p className="mt-8 max-w-md font-display text-lg leading-relaxed text-brand-ink dark:text-brand-cream">
        Diseñado para dermatólogos que ejercen sin asistente y aman su
        profesión demasiado como para reducirla a papeleo.
      </p>

      <p className="mt-6 max-w-md text-sm leading-relaxed text-brand-gray">
        IA clínica. Historia ordenada. Récipes firmados. Pacientes seguidos.
      </p>

      <p className="mt-12 text-xs uppercase tracking-[0.2em] text-brand-gray">
        Un producto de
      </p>
      <p className="mt-1 font-display text-lg text-brand-primary dark:text-brand-secondary">
        Mirai Lab
      </p>

      <nav className="mt-12 flex flex-col items-center gap-3 text-sm">
        <Link
          href="/about/carta"
          className={
            buttonVariants({ variant: "outline" }) +
            " border-brand-primary/30 text-brand-primary hover:bg-brand-cream dark:text-brand-cream dark:border-brand-cream/30"
          }
        >
          ✉ Ver carta del fundador
        </Link>
        <Link
          href="/about/changelog"
          className="text-brand-gray underline-offset-4 hover:underline"
        >
          Notas de versión
        </Link>
        <Link
          href="/dashboard"
          className="text-brand-gray underline-offset-4 hover:underline"
        >
          ← Volver a la app
        </Link>
      </nav>

      <footer className="mt-16 text-xs text-brand-gray">
        <p>
          mirailab.lat · © 2026 Mirai Lab
        </p>
      </footer>
    </main>
  );
}
