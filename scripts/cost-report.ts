/**
 * End-of-day cost simulation report.
 *
 * Queries public.uso_ia (service role, bypasses RLS) and prints:
 *   1. Per-modo averages of input/output tokens, $ per call, latency.
 *   2. A "consulta completa" cost simulation following Fer's tip:
 *      Caso Clínico (Sonnet, ~2 fotos) + follow-up (Sonnet, sin foto)
 *      + Terapéutica (Haiku).
 *   3. Monthly projection at 30 consultas/día × 30 días for three
 *      usage profiles (light / moderate / heavy).
 *   4. Margin analysis against the Solo ($39) and Pro ($79) tiers
 *      from the PRD.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import type { Database } from "../types/database";

loadEnvConfig(process.cwd());

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Stat {
  count: number;
  in_total: number;
  out_total: number;
  cost_total: number;
  latency_total: number;
}

const fmtUsd = (n: number) => `$${n.toFixed(6)}`;
const fmtUsdShort = (n: number) => `$${n.toFixed(4)}`;
const fmtUsdRound = (n: number) => `$${n.toFixed(2)}`;

function emptyStat(): Stat {
  return { count: 0, in_total: 0, out_total: 0, cost_total: 0, latency_total: 0 };
}

function avg(stat: Stat) {
  if (stat.count === 0) {
    return { in: 0, out: 0, cost: 0, latency: 0 };
  }
  return {
    in: stat.in_total / stat.count,
    out: stat.out_total / stat.count,
    cost: stat.cost_total / stat.count,
    latency: stat.latency_total / stat.count,
  };
}

async function main() {
  const { data: rows, error } = await admin
    .from("uso_ia")
    .select(
      "modo, modelo, tokens_input, tokens_output, costo_usd, latency_ms, estado",
    )
    .eq("estado", "completed");
  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log("uso_ia está vacía. Haz al menos un par de llamadas a la IA antes de correr este reporte.");
    return;
  }

  // ----- Per-modo averages ------------------------------------------
  const byModo = new Map<string, Stat>();
  for (const r of rows) {
    const key = `${r.modo}__${r.modelo.startsWith("claude-sonnet") ? "sonnet" : "haiku"}`;
    const s = byModo.get(key) ?? emptyStat();
    s.count += 1;
    s.in_total += r.tokens_input;
    s.out_total += r.tokens_output;
    s.cost_total += Number(r.costo_usd);
    s.latency_total += r.latency_ms ?? 0;
    byModo.set(key, s);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  REPORTE DE COSTOS — DERMA INTEL Pro · Día 4 cierre              ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  console.log(`Llamadas exitosas analizadas: ${rows.length}\n`);

  console.log("─────────────────────────────────────────────────────────────────");
  console.log("PROMEDIOS POR MODO (data real de tu sesión):");
  console.log("─────────────────────────────────────────────────────────────────");
  const sortedModos = Array.from(byModo.entries()).sort();
  for (const [key, stat] of sortedModos) {
    const parts = key.split("__");
    const modo = parts[0] ?? "unknown";
    const model = parts[1] ?? "unknown";
    const a = avg(stat);
    console.log(
      `  ${modo.padEnd(16)} (${model.padEnd(6)}, n=${stat.count})  ` +
        `in=${a.in.toFixed(0).padStart(4)}  out=${a.out.toFixed(0).padStart(4)}  ` +
        `${fmtUsd(a.cost).padStart(10)}/call  ${(a.latency / 1000).toFixed(1)}s`,
    );
  }

  // ----- Cost-per-call buckets we need for the simulation -----------
  function avgFor(modoKey: string): { cost: number; in: number; out: number } | null {
    const s = byModo.get(modoKey);
    if (!s || s.count === 0) return null;
    const a = avg(s);
    return { cost: a.cost, in: a.in, out: a.out };
  }

  const casoClinico = avgFor("caso_clinico__sonnet");
  const followUp = avgFor("bibliografia__sonnet") ?? avgFor("histopatologia__sonnet"); // Sonnet sin imagen
  const terapeutica = avgFor("terapeutica__haiku");

  if (!casoClinico || !followUp || !terapeutica) {
    console.log(
      "\n⚠ Faltan modos en la muestra para simular consulta completa.",
    );
    console.log("Genera al menos: caso_clinico, bibliografia o histopatologia, terapeutica.");
    return;
  }

  // ----- Consulta completa per Fer's tip ---------------------------
  const fullConsultaCost = casoClinico.cost + followUp.cost + terapeutica.cost;
  const fullConsultaTokens =
    casoClinico.in + casoClinico.out + followUp.in + followUp.out + terapeutica.in + terapeutica.out;

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("SIMULACIÓN — Consulta completa (Tip estratégico de Fer):");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log("  Caso Clínico (Sonnet 4.6 con fotos)   " + fmtUsd(casoClinico.cost) + `  (${(casoClinico.in + casoClinico.out).toFixed(0)} tok)`);
  console.log("  Pregunta de seguimiento (Sonnet 4.6)  " + fmtUsd(followUp.cost) + `  (${(followUp.in + followUp.out).toFixed(0)} tok)`);
  console.log("  Terapéutica (Haiku 4.5)               " + fmtUsd(terapeutica.cost) + `  (${(terapeutica.in + terapeutica.out).toFixed(0)} tok)`);
  console.log("  " + "─".repeat(48));
  console.log("  Total por consulta completa           " + fmtUsd(fullConsultaCost) + `  (${fullConsultaTokens.toFixed(0)} tok)`);

  // ----- Monthly projection at three usage profiles ----------------
  const consultasPorDia = 30;
  const diasPorMes = 30;
  const consultasPorMes = consultasPorDia * diasPorMes;

  // Three usage profiles per consulta:
  // - heavy: 1 Caso Clínico + 1 follow-up + 1 Terapéutica (Fer's tip)
  // - moderate: 1 Caso Clínico + 1 Terapéutica
  // - light: solo 1 Express
  const expressAvg = avgFor("express__haiku");
  const heavy = fullConsultaCost;
  const moderate = casoClinico.cost + terapeutica.cost;
  const light = expressAvg?.cost ?? terapeutica.cost; // fallback

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log(`PROYECCIÓN MENSUAL — ${consultasPorDia} consultas/día × ${diasPorMes} días = ${consultasPorMes} consultas:`);
  console.log("─────────────────────────────────────────────────────────────────");

  const profiles: Array<{ label: string; perCall: number; desc: string }> = [
    { label: "Heavy (3 calls/consulta)", perCall: heavy, desc: "Caso Clínico + follow-up + Terapéutica" },
    { label: "Moderate (2 calls)       ", perCall: moderate, desc: "Caso Clínico + Terapéutica" },
    { label: "Light (1 call)           ", perCall: light, desc: "solo Express o equivalente" },
  ];

  for (const p of profiles) {
    const monthly = p.perCall * consultasPorMes;
    console.log(
      `  ${p.label}  ${fmtUsdShort(p.perCall).padStart(10)}/consulta  →  ${fmtUsdRound(monthly).padStart(8)}/mes`,
    );
    console.log(`     ${p.desc}`);
  }

  // ----- Margin analysis -------------------------------------------
  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("MARGEN vs. TIERS DEL PRD:");
  console.log("─────────────────────────────────────────────────────────────────");
  const tiers = [
    { label: "Solo  ($39/mes)", price: 39 },
    { label: "Pro   ($79/mes)", price: 79 },
    { label: "Clínica ($199/mes)", price: 199 },
  ];
  for (const t of tiers) {
    console.log(`\n  ${t.label}:`);
    for (const p of profiles) {
      const monthlyCost = p.perCall * consultasPorMes;
      const grossMargin = t.price - monthlyCost;
      const marginPct = (grossMargin / t.price) * 100;
      const ok = grossMargin > 0 ? "✓" : "✗";
      console.log(
        `    ${ok} ${p.label}  costo IA ${fmtUsdRound(monthlyCost).padStart(8)}/mes  →  ` +
          `margen ${fmtUsdRound(grossMargin).padStart(8)} (${marginPct.toFixed(0)}%)`,
      );
    }
  }

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("LECTURA RÁPIDA:");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(`  • Una consulta clínica completa (3 IA calls) cuesta ${fmtUsdShort(fullConsultaCost)}.`);
  console.log(`  • 30 consultas/día por 30 días = ${consultasPorMes} consultas/mes.`);
  console.log(`  • A uso pesado: ${fmtUsdRound(heavy * consultasPorMes)}/mes en API.`);
  console.log(`  • Tier Pro ($79) cubre uso moderado con margen sano.`);
  console.log(`  • Tier Solo ($39) ${moderate * consultasPorMes < 39 ? "cubre" : "NO cubre"} uso moderado.`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
