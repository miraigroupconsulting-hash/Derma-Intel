/**
 * GET /api/ping
 *
 * Liveness check para que el cliente pueda verificar si tiene
 * conexión REAL, ignorando un `navigator.onLine` mentiroso (común
 * en Android + VPN, iOS PWA con cambio de red, etc.).
 *
 * Sin auth — solo confirma que el server responde.
 * Sin cache — siempre fresh.
 */
import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
