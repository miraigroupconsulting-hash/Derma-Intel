/**
 * lib/admin.ts
 *
 * Server-only helper to check si el usuario autenticado actual está en
 * la lista de admins de Mirai Lab (controlada por MIRAI_ADMIN_EMAILS).
 *
 * Estos admins son YO (Fer) — los dueños de Mirai Lab, NO los médicos
 * tenant del producto. La médica (esposa, design partner) y cualquier
 * dermatólogo cliente NO debe ver ninguna pantalla gated por este
 * helper. El panel /mirai-admin no aparece en la nav: se entra a mano.
 *
 * Si la variable de entorno no está seteada o está vacía, NADIE es
 * admin — la página devuelve 404. Fail-closed.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.MIRAI_ADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}
