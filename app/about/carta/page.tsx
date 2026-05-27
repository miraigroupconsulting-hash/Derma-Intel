import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Carta del fundador" };

/**
 * /about/carta — Mensaje personal de Fer.
 *
 * El texto se preserva LITERALMENTE como lo escribió en el brief.
 * Cada párrafo en su propio <p> para garantizar que los saltos de
 * línea se respetan (Trap 3 del Día 8). Ancho máx. 600px, Fraunces
 * para el cuerpo, fondo crema, centrado.
 */
export default function CartaFundador() {
  return (
    <main className="min-h-dvh bg-brand-cream px-6 py-16 text-brand-ink dark:bg-[#1a1a2e] dark:text-brand-cream">
      <article className="mx-auto max-w-[600px] font-display text-[1.05rem] leading-[1.8]">
        <header className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-gray">
            Una carta del fundador
          </p>
        </header>

        <p>
          Esta herramienta nació porque vi a alguien que amo trabajar
          el doble por hacer lo correcto.
        </p>

        <p className="mt-6">
          Construirla fue mi forma de decir: tu tiempo importa, tu
          vocación importa, tu salud mental importa. No deberías
          escribir a mano lo mismo que ya dijiste, ni perseguir
          pacientes en agendas dispersas, ni quedarte hasta las once
          de la noche redactando récipes.
        </p>

        <p className="mt-6">
          DERMA INTEL Pro existe para que vuelvas a hacer lo que
          realmente amas: leer la piel, pensar el caso, decidir el
          plan. Lo demás, lo hace ella por ti.
        </p>

        <p className="mt-6">
          Esta no es una app más. Es un regalo, pero también es la
          primera puerta que se abre: si funciona para ti, va a
          funcionar para cientos de dermatólogos que están exactamente
          donde tú estabas hace una semana. Juntos podemos cambiar eso.
        </p>

        <footer className="mt-12 border-t border-brand-gray/30 pt-8 text-center text-sm not-italic">
          <p>Con admiración y orgullo,</p>
          <p className="mt-2 font-display text-xl text-brand-primary dark:text-brand-secondary">
            Fer
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-brand-gray">
            Mirai Lab
          </p>
        </footer>

        <div className="mt-12 text-center">
          <Link
            href="/dashboard"
            className={
              buttonVariants({ variant: "outline", size: "sm" }) +
              " border-brand-primary/30 text-brand-primary dark:text-brand-cream dark:border-brand-cream/30"
            }
          >
            Volver a la app
          </Link>
        </div>
      </article>
    </main>
  );
}
