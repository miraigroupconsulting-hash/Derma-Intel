import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import type { Database } from "@/types/database";

export const metadata = { title: "Mirai Admin · Costos IA" };
export const dynamic = "force-dynamic";

/**
 * /mirai-admin
 *
 * Panel privado de telemetría para Mirai Lab (Fer y nadie más).
 * NO está linkeado desde la UI del producto — se entra a mano.
 * Gated por MIRAI_ADMIN_EMAILS env var; si no estás en la lista,
 * notFound(). Si la variable no está seteada, NADIE entra.
 *
 * Lee `public.uso_ia` con service role para ver TODOS los médicos
 * (la RLS de uso_ia limita a uno mismo, lo cual es correcto para la
 * UI normal). Mostramos:
 *   - Totales 30d / mes en curso
 *   - Breakdown por médico (top 20)
 *   - Breakdown por modo
 *   - Últimas 50 llamadas
 *
 * El panel asume que estamos en pocos médicos por ahora. Cuando
 * crezcamos, paginamos.
 */

const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
const fmtUsdShort = (n: number) => `$${n.toFixed(2)}`;
const fmtInt = (n: number) => n.toLocaleString("en-US");

function startOfMonthUtc(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString();
}
function thirtyDaysAgoUtc(): string {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function adminClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface AggRow {
  medico_id: string;
  modo: string;
  modelo: string;
  tokens_input: number;
  tokens_output: number;
  costo_usd: number;
  latency_ms: number | null;
  estado: string;
  fecha: string;
}

interface MedicoInfo {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
}

interface Totals {
  calls: number;
  tokIn: number;
  tokOut: number;
  cost: number;
}
function emptyTotals(): Totals {
  return { calls: 0, tokIn: 0, tokOut: 0, cost: 0 };
}
function add(t: Totals, r: AggRow) {
  t.calls += 1;
  t.tokIn += r.tokens_input;
  t.tokOut += r.tokens_output;
  t.cost += Number(r.costo_usd);
}

export default async function MiraiAdminPage() {
  // ----- Auth gate ---------------------------------------------------
  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mirai-admin");
  if (!isAdminEmail(user.email)) {
    notFound();
  }

  // ----- Pull last 30d of uso_ia (service role bypasses RLS) ---------
  const admin = adminClient();
  const since30 = thirtyDaysAgoUtc();
  const sinceMonth = startOfMonthUtc();

  const { data: rows30Raw } = await admin
    .from("uso_ia")
    .select(
      "medico_id, modo, modelo, tokens_input, tokens_output, costo_usd, latency_ms, estado, fecha",
    )
    .gte("fecha", since30)
    .order("fecha", { ascending: false });

  const rows30: AggRow[] = (rows30Raw ?? []).map((r) => ({
    medico_id: r.medico_id,
    modo: r.modo,
    modelo: r.modelo,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    costo_usd: Number(r.costo_usd),
    latency_ms: r.latency_ms,
    estado: r.estado,
    fecha: r.fecha,
  }));

  // ----- Totals: this-month, last-30d, all-time -----------------------
  const totalMonth = emptyTotals();
  const total30 = emptyTotals();
  for (const r of rows30) {
    if (r.estado === "error") continue; // billing-aligned: skip errors
    add(total30, r);
    if (r.fecha >= sinceMonth) add(totalMonth, r);
  }

  // All-time totals from a separate cheap aggregate.
  const { data: lifetimeRows } = await admin
    .from("uso_ia")
    .select("costo_usd, tokens_input, tokens_output")
    .neq("estado", "error");
  const totalLifetime = emptyTotals();
  for (const r of lifetimeRows ?? []) {
    totalLifetime.calls += 1;
    totalLifetime.cost += Number(r.costo_usd);
    totalLifetime.tokIn += r.tokens_input;
    totalLifetime.tokOut += r.tokens_output;
  }

  // ----- Per-médico breakdown (last 30d) ------------------------------
  const byMedico = new Map<string, Totals>();
  for (const r of rows30) {
    if (r.estado === "error") continue;
    const t = byMedico.get(r.medico_id) ?? emptyTotals();
    add(t, r);
    byMedico.set(r.medico_id, t);
  }
  const medicoIds = Array.from(byMedico.keys());

  // Resolve médico names/emails (best-effort).
  let medicoInfo: Map<string, MedicoInfo> = new Map();
  if (medicoIds.length > 0) {
    const { data: medicos } = await admin
      .from("medicos")
      .select("id, nombre, apellido")
      .in("id", medicoIds);
    medicoInfo = new Map(
      (medicos ?? []).map((m) => [
        m.id,
        { id: m.id, nombre: m.nombre, apellido: m.apellido, email: null },
      ]),
    );
    // Augment con email vía auth.admin.listUsers — paginamos hasta cubrir.
    try {
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (list?.users) {
        for (const u of list.users) {
          if (medicoInfo.has(u.id)) {
            const cur = medicoInfo.get(u.id)!;
            medicoInfo.set(u.id, { ...cur, email: u.email ?? null });
          }
        }
      }
    } catch {
      // Si listUsers falla (rate limit, etc.) seguimos sin email.
    }
  }

  const medicoRows = medicoIds
    .map((id) => {
      const info = medicoInfo.get(id);
      const t = byMedico.get(id)!;
      const displayName = info
        ? [info.nombre, info.apellido].filter(Boolean).join(" ") || "(sin nombre)"
        : "(médico desconocido)";
      return { id, displayName, email: info?.email ?? "", ...t };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  // ----- Per-modo breakdown (last 30d) --------------------------------
  const byModo = new Map<string, Totals>();
  for (const r of rows30) {
    if (r.estado === "error") continue;
    const key = `${r.modo} · ${r.modelo.startsWith("claude-sonnet") ? "sonnet" : r.modelo.startsWith("claude-haiku") ? "haiku" : r.modelo}`;
    const t = byModo.get(key) ?? emptyTotals();
    add(t, r);
    byModo.set(key, t);
  }
  const modoRows = Array.from(byModo.entries())
    .map(([key, t]) => ({ key, ...t }))
    .sort((a, b) => b.cost - a.cost);

  // ----- Últimas 50 llamadas ------------------------------------------
  const recentRaw = rows30.slice(0, 50);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Mirai Lab · privado
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Telemetría de costos IA
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Datos de últimos 30 días salvo donde se indique. Médicos NO ven
            este panel; vive fuera de la nav del producto.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 hover:underline"
        >
          Ir al producto →
        </Link>
      </header>

      {/* ----- Totals row ----- */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Mes en curso"
          value={fmtUsdShort(totalMonth.cost)}
          sub={`${fmtInt(totalMonth.calls)} llamadas · ${fmtInt(totalMonth.tokIn + totalMonth.tokOut)} tok`}
        />
        <KpiCard
          label="Últimos 30 días"
          value={fmtUsdShort(total30.cost)}
          sub={`${fmtInt(total30.calls)} llamadas · ${fmtInt(total30.tokIn + total30.tokOut)} tok`}
        />
        <KpiCard
          label="Todo-tiempo"
          value={fmtUsdShort(totalLifetime.cost)}
          sub={`${fmtInt(totalLifetime.calls)} llamadas · ${fmtInt(totalLifetime.tokIn + totalLifetime.tokOut)} tok`}
        />
      </section>

      {/* ----- Per-médico ----- */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Por médico — últimos 30 días (top 20 por costo)
        </h2>
        {medicoRows.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Sin actividad en los últimos 30 días.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Médico</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2 text-right">Llamadas</th>
                  <th className="px-3 py-2 text-right">Tok in</th>
                  <th className="px-3 py-2 text-right">Tok out</th>
                  <th className="px-3 py-2 text-right">Costo USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {medicoRows.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 font-medium">{m.displayName}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {m.email || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInt(m.calls)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInt(m.tokIn)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInt(m.tokOut)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {fmtUsd(m.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ----- Per-modo ----- */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Por modo / modelo — últimos 30 días
        </h2>
        {modoRows.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin datos.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Modo · modelo</th>
                  <th className="px-3 py-2 text-right">Llamadas</th>
                  <th className="px-3 py-2 text-right">Tok in</th>
                  <th className="px-3 py-2 text-right">Tok out</th>
                  <th className="px-3 py-2 text-right">Costo USD</th>
                  <th className="px-3 py-2 text-right">USD/call</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {modoRows.map((m) => (
                  <tr key={m.key}>
                    <td className="px-3 py-2 font-medium">{m.key}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInt(m.calls)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInt(m.tokIn)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtInt(m.tokOut)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {fmtUsd(m.cost)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtUsd(m.cost / m.calls)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ----- Últimas llamadas ----- */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Últimas 50 llamadas
        </h2>
        {recentRaw.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin llamadas registradas.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-left uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Médico</th>
                  <th className="px-3 py-2">Modo</th>
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Tok in</th>
                  <th className="px-3 py-2 text-right">Tok out</th>
                  <th className="px-3 py-2 text-right">USD</th>
                  <th className="px-3 py-2 text-right">ms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {recentRaw.map((r, i) => {
                  const info = medicoInfo.get(r.medico_id);
                  const who = info
                    ? [info.nombre, info.apellido].filter(Boolean).join(" ") ||
                      r.medico_id.slice(0, 8)
                    : r.medico_id.slice(0, 8);
                  return (
                    <tr key={`${r.fecha}-${i}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap text-neutral-600">
                        {new Date(r.fecha).toLocaleString("es-VE", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "America/Caracas",
                        })}
                      </td>
                      <td className="px-3 py-1.5">{who}</td>
                      <td className="px-3 py-1.5">{r.modo}</td>
                      <td className="px-3 py-1.5 text-neutral-500">
                        {r.modelo.replace("claude-", "")}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={
                            r.estado === "completed"
                              ? "text-emerald-700"
                              : r.estado === "error"
                              ? "text-red-700"
                              : "text-amber-700"
                          }
                        >
                          {r.estado}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {fmtInt(r.tokens_input)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {fmtInt(r.tokens_output)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {fmtUsd(Number(r.costo_usd))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">
                        {r.latency_ms ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-neutral-400">
        Errores no facturan — los excluimos de los totales y per-médico, pero
        siguen visibles en últimas-50 para diagnóstico. Para un reporte CLI más
        rico corre <code>npx tsx scripts/cost-report.ts</code>.
      </p>
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>
    </div>
  );
}
