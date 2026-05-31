import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LogoLockup, LogoSymbol } from "@/components/logo";
import { SPECIALTY } from "@/config/specialty";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-cream dark:bg-[#0F1419]">
      <header className="px-6 py-5">
        <LogoLockup size="sm" />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-brand-gray">
          Un producto de Mirai Lab
        </p>
        <h1 className="mb-5 font-display text-4xl leading-[1.1] tracking-tight text-brand-ink dark:text-brand-cream sm:text-5xl">
          {SPECIALTY.brand.tagline}
        </h1>
        <p className="mb-10 text-base leading-relaxed text-brand-ink/70 dark:text-brand-cream/70 sm:text-lg">
          Consulta, historia clínica, récipe y seguimiento — en una sola app.
          La IA sugiere. El médico decide. La app ejecuta lo administrativo.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className={
              buttonVariants({ size: "lg" }) +
              " bg-brand-primary hover:bg-brand-primary/90 text-brand-cream"
            }
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className={
              buttonVariants({ size: "lg", variant: "outline" }) +
              " border-brand-primary/30 text-brand-primary dark:text-brand-cream dark:border-brand-cream/30"
            }
          >
            Iniciar sesión
          </Link>
        </div>
        <p className="mt-14 text-xs text-brand-gray">
          Herramienta de apoyo clínico para dermatólogos licenciados. No
          reemplaza la consulta presencial ni la decisión profesional del
          médico tratante.
        </p>
      </main>

      <footer className="flex items-center justify-between px-6 py-6 text-xs text-brand-gray">
        <span className="flex items-center gap-2">
          <LogoSymbol size={16} className="text-brand-primary dark:text-brand-cream" />
          © {new Date().getFullYear()} Mirai Lab · mirailab.lat
        </span>
        <Link href="/about" className="underline-offset-4 hover:underline">
          Acerca de
        </Link>
      </footer>
    </div>
  );
}
