"use client";

import { Button } from "@/components/ui/button";
import { archivePaciente, unarchivePaciente } from "../actions";

/**
 * Archive button with a native confirm() dialog. We use the browser's
 * built-in dialog instead of pulling in a shadcn AlertDialog component
 * because (a) zero dependencies, (b) blocks the form submit on cancel,
 * (c) good enough for a destructive-but-reversible action.
 */
export function ArchivePacienteButton({
  id,
  pacienteLabel,
}: {
  id: string;
  pacienteLabel: string;
}) {
  const action = archivePaciente.bind(null, id);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Archivar a ${pacienteLabel}?\n\nDejará de aparecer en la lista principal pero podrás desarchivarlo después. La data clínica no se borra.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Archivar
      </Button>
    </form>
  );
}

export function UnarchivePacienteButton({ id }: { id: string }) {
  const action = unarchivePaciente.bind(null, id);

  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm">
        Desarchivar
      </Button>
    </form>
  );
}
