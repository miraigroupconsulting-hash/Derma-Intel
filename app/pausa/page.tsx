import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";

export const metadata = { title: "Servicio en pausa" };
export const dynamic = "force-dynamic";

/**
 * /pausa
 *
 * Adonde manda el middleware cuando el panel de suscripciones de Mirai marca a
 * este médico como suspendido (falta de pago). No es un error: la cuenta y los
 * datos siguen intactos, el acceso se reactiva apenas se regularice el pago.
 */
export default async function PausaPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <LogoLockup orientation="vertical" size="lg" className="mb-8" />

      <p className="text-5xl" aria-hidden>
        🔒
      </p>

      <h1 className="mt-6 font-display text-2xl text-brand-ink dark:text-brand-cream">
        Servicio temporalmente en pausa
      </h1>

      <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-gray">
        {motivo || "Tu suscripción está en pausa por falta de pago."}
      </p>

      <p className="mt-2 max-w-md text-sm leading-relaxed text-brand-gray">
        Tus pacientes, historias y récipes siguen guardados. El acceso se
        restablece apenas se regularice el pago.
      </p>

      <Link
        href="https://wa.me/584143555666"
        className={buttonVariants({ className: "mt-8" })}
      >
        Escribir a Mirai Lab por WhatsApp
      </Link>

      <p className="mt-12 text-xs uppercase tracking-[0.2em] text-brand-gray">
        Un producto de Mirai Lab
      </p>
    </main>
  );
}
