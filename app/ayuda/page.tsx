import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Guía rápida" };

const PRIMEROS_PASOS = [
  "En el inicio, toca ⚡ Consulta rápida",
  "Toca 📷 Adjuntar imágenes y elige una foto de la lesión",
  "Toca 🧠 Analizar y espera unos segundos",
];

const GUARDAR_CASO = [
  "Crea el paciente una sola vez (Pacientes → + Nuevo): solo nombre y apellido.",
  "Abre la consulta, toca 🎤 Dictar todo y habla de corrido como le hablas al paciente.",
  "Toca Estructurar con IA: ordena solo lo que dijiste en Subjetivo / Objetivo / Análisis / Plan.",
  "Revisa, corrige lo que quieras y toca Guardar.",
];

const TIPS = [
  {
    ic: "🗣️",
    t: "Habla natural, no “bonito”",
    d: "No tienes que dictar en lenguaje médico. Di lo que ves como lo dirías en voz alta; la IA lo traduce a la nota clínica.",
  },
  {
    ic: "🍃",
    t: "No tienes que llenar todo",
    d: "Ningún campo es obligatorio (salvo el nombre del paciente). Usa solo lo que te sirve hoy y deja el resto.",
  },
  {
    ic: "🔄",
    t: "Si algo se ve raro o viejo",
    d: "Cierra la app del todo y ábrela de nuevo. Así siempre carga la última versión.",
  },
];

export default function AyudaPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-12">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gray">
          Guía rápida · 2 minutos
        </p>
        <h1 className="mt-2 font-display text-3xl text-brand-primary dark:text-brand-cream">
          No tienes que aprenderte todo.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-brand-gray">
          Empieza con una sola cosa. La app hace el resto. Lo demás lo vas
          descubriendo sola, sin apuro y sin manual.
        </p>
      </header>

      {/* Primer triunfo */}
      <section className="mb-8 rounded-xl border border-brand-accent bg-brand-cream p-5 dark:border-brand-secondary/40 dark:bg-brand-ink/40">
        <p className="inline-block rounded-full bg-brand-secondary px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-white">
          Tu primer triunfo · 30 segundos
        </p>
        <h2 className="mt-3 font-display text-2xl text-brand-primary dark:text-brand-cream">
          Consulta rápida
        </h2>
        <p className="mt-1 text-sm text-brand-gray">
          No hace falta crear paciente ni llenar nada. Es la forma más rápida de
          sentir para qué sirve.
        </p>
        <ol className="mt-4 space-y-2.5">
          {PRIMEROS_PASOS.map((paso, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-brand-secondary text-xs font-bold text-brand-secondary">
                {i + 1}
              </span>
              <span className="pt-0.5">{paso}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-lg bg-white/70 p-3 text-sm text-brand-ink dark:bg-brand-ink/50 dark:text-brand-cream/90">
          <b>Y ya.</b> La IA te devuelve una lectura del caso: diagnósticos
          diferenciales, banderas rojas y un plan sugerido. Es <b>apoyo</b> — la
          decisión y la firma siempre son tuyas.
        </p>
        <Link
          href="/consulta-rapida"
          className={
            buttonVariants({ size: "lg" }) + " mt-4 flex h-12 w-full items-center justify-center"
          }
        >
          ⚡ Probar ahora con un caso de hoy
        </Link>
      </section>

      {/* Guardar el caso */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-gray">
          Cuando quieras guardar el caso del paciente
        </h2>
        <ol className="space-y-3">
          {GUARDAR_CASO.map((paso, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-lg border border-brand-gray/15 p-3 text-sm"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-1">{paso}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Tips */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-gray">
          3 tips que lo cambian todo
        </h2>
        <div className="space-y-4">
          {TIPS.map((tip) => (
            <div key={tip.t} className="flex gap-3">
              <span className="flex-none text-xl">{tip.ic}</span>
              <div>
                <h3 className="font-medium text-brand-primary dark:text-brand-cream">
                  {tip.t}
                </h3>
                <p className="mt-0.5 text-sm text-brand-gray">{tip.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-brand-gray/20 pt-6 text-center">
        <p className="font-display text-lg text-brand-primary dark:text-brand-cream">
          Meta de esta semana: usa solo la Consulta rápida.
        </p>
        <p className="mt-1 text-sm text-brand-gray">
          Una foto, una lectura. Lo demás llega solo, sin apuro.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block text-sm text-brand-gray underline-offset-4 hover:underline"
        >
          ← Volver a la app
        </Link>
      </footer>
    </main>
  );
}
