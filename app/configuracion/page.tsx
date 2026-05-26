import { redirect } from "next/navigation";

/**
 * Permanent redirect /configuracion → /perfil.
 *
 * The Día 5 brief uses "/configuracion" as the route name. We shipped
 * "/perfil" in Día 4 with all the professional asset fields. This file
 * preserves the brief's URL surface without renaming or duplicating
 * code.
 */
export default function ConfiguracionPage() {
  redirect("/perfil");
}
