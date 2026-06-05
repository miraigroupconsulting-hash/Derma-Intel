import { PacienteForm } from "../paciente-form";
import { BackLink } from "@/components/back-link";

export const metadata = {
  title: "Nuevo paciente",
};

export default function NuevoPacientePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6">
        <BackLink href="/pacientes" label="Pacientes" />
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo paciente</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Datos demográficos y clínicos del paciente. Puedes completar más
          información después.
        </p>
      </header>

      <PacienteForm mode={{ mode: "create" }} cancelHref="/pacientes" />
    </main>
  );
}
