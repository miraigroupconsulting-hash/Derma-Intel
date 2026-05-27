import Link from "next/link";
import { LogoLockup } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "Tu regalo",
  robots: { index: false, follow: false },
};

/**
 * /bienvenida — Carta de entrega.
 *
 * Esta es la primera página que tu esposa abre el día de la entrega.
 * No requiere login. Lleva al login con un solo click. Tipografía
 * Fraunces, fondo crema, ritmo de carta personal.
 *
 * La página existe en producción pero no está enlazada desde ningún
 * otro lugar — el enlace se le pasa específicamente a ella en el
 * momento del regalo.
 */
export default function CartaEntrega() {
  return (
    <main className="min-h-dvh bg-brand-cream px-6 py-12 text-brand-ink">
      <article className="mx-auto max-w-[640px]">
        <header className="mb-12 text-center">
          <LogoLockup orientation="vertical" size="lg" className="mb-6" />
          <p className="text-xs uppercase tracking-[0.3em] text-brand-gray">
            Para ti
          </p>
        </header>

        <section className="space-y-6 font-display text-[1.08rem] leading-[1.85] text-brand-ink/90">
          <p className="text-center text-2xl text-brand-primary">
            Doctora.
          </p>

          <p>
            Lo que tienes en frente lleva una semana de mi vida y un
            pedazo grande del corazón. No es una app más. Es algo que
            construí pensando en ti, en tus noches largas, en las
            consultas que terminaban siendo tres horas porque la
            historia no se escribía sola.
          </p>

          <p>
            Te presento <span className="font-semibold text-brand-primary">DERMA INTEL Pro</span>. Una
            asistente clínica para dermatólogos que ejercen sin asistente
            — diseñada con la voz, el ritmo y la prioridad de tu
            práctica.
          </p>

          <p>
            Es tuya. Para que la uses cada día. Para que la rompas, me
            digas qué no funciona, y juntos la convirtamos en lo que
            necesitan cientos de dermatólogos en LATAM que están
            exactamente donde tú estabas hace una semana.
          </p>
        </section>

        <section className="mt-12 rounded-xl border border-brand-primary/15 bg-white p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray">
            Lo que incluye
          </h2>
          <ul className="space-y-3 text-sm text-brand-ink/80">
            <Feature emoji="📋" title="Historia clínica completa">
              Pacientes con datos demográficos, antecedentes, alergias,
              cédula, contacto. Cédula libre para los formatos venezolanos.
            </Feature>
            <Feature emoji="🎤" title="Dictado por voz con estructuración SOAP">
              Hablas, la app estructura. Anonimiza antes de enviar a la IA.
              Funciona en español de Venezuela.
            </Feature>
            <Feature emoji="🧠" title="IA clínica con 6 modos especializados">
              Caso Clínico (vision + texto), Express, Bibliografía,
              Histopatología, Terapéutica, Docente. Sonnet 4.6 para
              razonamiento complejo, Haiku 4.5 para tareas ligeras.
            </Feature>
            <Feature emoji="💊" title="Récipes profesionales en PDF">
              Autocomplete con ~70 medicamentos VE. Dictado libre que se
              estructura con IA. Doble confirmación para sustancias
              controladas. Firma digital. Envío directo por WhatsApp con
              normalización de números venezolanos.
            </Feature>
            <Feature emoji="📷" title="Galería de evolución con comparación">
              Timeline por consulta, comparación lado a lado con slider
              arrastrable, exportación JPG para presentaciones —
              con modo anónimo automático (detección facial + ojos pixelados).
            </Feature>
            <Feature emoji="📅" title="Dashboard proactivo + alertas">
              Resumen del día, controles pendientes, pacientes sin contacto,
              recordatorios automáticos. La app trabaja sola para ti
              entre paciente y paciente.
            </Feature>
            <Feature emoji="📡" title="PWA con modo offline">
              Funciona sin internet. Los récipes que firmes sin señal se
              guardan localmente y se sincronizan automáticamente cuando
              vuelve la red. Pacientes recientes cacheados 7 días.
            </Feature>
            <Feature emoji="🌙" title="Modo oscuro">
              Para las noches largas. Las fotos clínicas siempre con fondo
              blanco — la percepción cromática de la piel no se negocia.
            </Feature>
          </ul>
        </section>

        <section className="mt-12 space-y-6 font-display text-[1.08rem] leading-[1.85] text-brand-ink/90">
          <p>
            La promesa del producto, en una sola línea, es esta:
          </p>

          <p className="border-l-4 border-brand-primary pl-5 italic text-brand-primary">
            La IA sugiere. El médico decide. La app ejecuta lo
            administrativo.
          </p>

          <p>
            No reemplaza tu criterio. No firma por ti. No te dice qué
            recetar. Pero estructura tu anamnesis, te sugiere
            diferenciales razonables, te ahorra escribir el mismo récipe
            por décima vez esta semana, te recuerda que Carlos Pérez tiene
            laboratorio pendiente de su isotretinoína, te muestra que María
            González lleva 30 días sin contacto.
          </p>

          <p>
            Y cuando un paciente nuevo te pregunte por evolución, le
            puedes mostrar la comparación antes/después con el slider, o
            mandársela por WhatsApp lista para imprimir.
          </p>
        </section>

        <section className="mt-12 rounded-xl border border-brand-secondary/30 bg-brand-accent/40 p-6 text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-primary">
            Cómo empezar
          </h2>
          <ol className="list-decimal space-y-2 pl-4 text-brand-ink/85">
            <li>
              Entra con tu correo y contraseña en{" "}
              <Link
                href="/login"
                className="font-medium text-brand-primary underline-offset-4 hover:underline"
              >
                /login
              </Link>
              . Ya creé tu cuenta y dejé 5 pacientes de ejemplo con
              historias completas (rosácea, acné severo, queratosis,
              dermatitis pediátrica, melasma).
            </li>
            <li>
              Recorre el dashboard. Mira las alertas. Abre cualquier
              paciente demo y explora su historia, recetas y evolución.
            </li>
            <li>
              Cuando estés cómoda, crea tu primer paciente real. Dicta la
              consulta. Genera un récipe. Mándatelo por WhatsApp a ti
              misma para ver el flujo completo.
            </li>
            <li>
              Lo que rompa, lo arreglamos juntos. Lo que falte, lo agrego.
              Esto es la versión 1.0 — vamos a iterar mucho juntos.
            </li>
          </ol>
        </section>

        <footer className="mt-12 text-center">
          <Link
            href="/login"
            className={
              buttonVariants({ size: "lg" }) +
              " bg-brand-primary text-brand-cream hover:bg-brand-primary/90"
            }
          >
            Entrar a la app →
          </Link>

          <div className="mt-12 border-t border-brand-gray/20 pt-8 text-sm">
            <p className="font-display text-base text-brand-primary">
              Con admiración y orgullo,
            </p>
            <p className="mt-2 font-display text-2xl text-brand-ink">Fer</p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-brand-gray">
              Mirai Lab
            </p>
          </div>

          <p className="mt-8 text-[0.7rem] text-brand-gray">
            Esta página fue hecha para ti específicamente. No se enlaza
            desde ningún otro lugar.
          </p>
        </footer>
      </article>
    </main>
  );
}

function Feature({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="text-lg leading-none" aria-hidden>
        {emoji}
      </span>
      <div>
        <p className="font-medium text-brand-ink">{title}</p>
        <p className="text-brand-ink/70">{children}</p>
      </div>
    </li>
  );
}
