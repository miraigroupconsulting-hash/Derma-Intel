# DERMA INTEL Pro

Asistente clínica con IA para dermatólogos en LATAM. Producto de [Mirai Lab](https://mirailab.lat).

> La IA sugiere. El médico decide. La app ejecuta lo administrativo.

## Stack

- **Next.js 15.5** App Router + Turbopack dev / webpack build
- **React 19** Server Components + Server Actions
- **TypeScript** strict (`noUncheckedIndexedAccess`)
- **Tailwind CSS 4** con `@theme inline` y design tokens en `globals.css`
- **shadcn/ui** sobre Base UI (no Radix)
- **Supabase** Postgres + Auth + Storage + RLS por `medico_id = auth.uid()`
- **Anthropic SDK** — Sonnet 4.6 (clinical) + Haiku 4.5 (parsing)
- **@react-pdf/renderer** generación de récipes client-side
- **@mediapipe/tasks-vision** detección facial lazy para modo anónimo
- **idb** IndexedDB para outbox offline + cache de pacientes
- **@ducanh2912/next-pwa** Service Worker
- **next-themes** modo claro/oscuro
- **react-compare-slider** comparación de fotos antes/después

## Estructura

Ver [`CLAUDE.md §5`](./CLAUDE.md) para el detalle completo. Resumen:

```
app/
  (auth)/        landing, login, signup
  about/         carta del fundador + changelog
  agenda/        calendario semanal de citas y controles
  api/
    cron/        Vercel Cron endpoints
    ia/          6 modos clínicos + parsers Haiku
  bienvenida/    página de entrega (no enlazada)
  consulta/      flujo SOAP + récipes + IA
  dashboard/     home con alertas + resumen + KPIs
  onboarding/    bienvenida + skip
  pacientes/     CRUD + ficha + evolución de fotos
  perfil/        configuración del médico

components/      UI compuesta (logo, alertas, notificación bell, etc.)
lib/             helpers (supabase, claude, voice, anonimizar, fotos, recordatorios, etc.)
scripts/         seeds + checks contra producción
supabase/        migrations versionadas
```

## Setup local

```bash
npm install
cp .env.example .env.local
# rellena las 5 keys: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, CRON_SECRET
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts útiles

```bash
# Verificar tipos
npx tsc --noEmit

# Build de producción
npx next build

# Tests
npx vitest run

# Lint
npx next lint

# Regenerar tipos TS desde el schema real
npx supabase gen types typescript --linked > types/database.ts

# Aplicar migraciones pendientes a producción
npx supabase db push --include-all

# Sembrar pacientes demo (idempotente)
MEDICO_EMAIL=tu@email.com npx tsx scripts/seed-demo-patients.ts

# Borrar pacientes demo (solo los seed-marked, NO toca datos reales)
MEDICO_EMAIL=tu@email.com npx tsx scripts/seed-demo-patients.ts --delete
```

## Documentación interna

- [`CLAUDE.md`](./CLAUDE.md) — Contrato del proyecto: visión, constraints éticos, stack, UX
- [`docs/runbook.md`](./docs/runbook.md) — Operaciones: env vars, crons, scripts, errores comunes
- [`docs/guion-entrega-dia-10.md`](./docs/guion-entrega-dia-10.md) — Guion personal del momento del regalo
- [`prompts/derma-intel-v2.md`](./prompts/derma-intel-v2.md) — Cerebro clínico (6 modos)

## Deploy

Auto-deploy en cada push a `main` vía Vercel. URL producción: https://derma-intel.vercel.app.

Variables de entorno en Vercel (Settings → Environment Variables): mismas 5 del `.env.local`.

## Constraints éticos (no negociables)

Ver [`CLAUDE.md §2`](./CLAUDE.md). Resumen:

- ❌ La app NUNCA firma récipes automáticamente
- ❌ Sustancias controladas exigen doble confirmación (input "CONFIRMO")
- ❌ PII del paciente nunca va a Anthropic sin anonimizar
- ❌ EXIF de fotos se strip antes de subir
- ✅ Disclaimer "Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante." en cada output IA

## Licencia y propiedad

Proyecto interno de Mirai Lab. No abierto al público. © 2026.
