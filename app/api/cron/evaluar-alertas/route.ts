/**
 * GET /api/cron/evaluar-alertas
 *
 * Vercel Cron job (daily, 06:00 Caracas via cron expression in UTC).
 * Secured with CRON_SECRET — Vercel adds Authorization: Bearer <secret>
 * to each invocation. Reject anything else.
 *
 * Manual invocation (for testing):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://derma.mirailab.lat/api/cron/evaluar-alertas
 */
import { NextResponse } from "next/server";
import { evaluarAlertasDiarias } from "@/lib/evaluar-alertas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const result = await evaluarAlertasDiarias();
    const ms = Date.now() - t0;
    console.log(
      `[cron evaluar-alertas] processed=${result.recordatoriosProcessed} perdidos=${result.pacientesPerdidosFlagged} created=${result.notificacionesCreated} errors=${result.errors.length} took=${ms}ms`,
    );
    return NextResponse.json({ ok: true, ...result, latencyMs: ms });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron evaluar-alertas] FAILED: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
