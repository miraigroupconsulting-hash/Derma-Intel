import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="px-6 py-5">
        <span className="text-sm font-semibold tracking-tight text-neutral-900">
          DERMA INTEL <span className="text-neutral-500">Pro</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Un producto de Mirai Lab
        </p>
        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          La asistente con IA que el dermatólogo solo nunca tuvo.
        </h1>
        <p className="mb-8 text-base leading-relaxed text-neutral-600 sm:text-lg">
          Consulta, historia clínica, récipe y seguimiento — en una sola app.
          La IA sugiere. El médico decide. La app ejecuta lo administrativo.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Iniciar sesión
          </Link>
        </div>
        <p className="mt-12 text-xs text-neutral-500">
          Herramienta de apoyo clínico para dermatólogos licenciados. No reemplaza
          la consulta presencial ni la decisión profesional del médico tratante.
        </p>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} Mirai Lab · mirailab.lat
      </footer>
    </div>
  );
}
