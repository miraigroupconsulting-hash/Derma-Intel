# DERMA INTEL Pro — Runbook operativo

Last updated: 2026-05-27 (cierre Día 9)

---

## Stack en producción

| Capa | Servicio | Plan | Notas |
|---|---|---|---|
| Hosting | Vercel | Pro trial (9 días restantes al 2026-05-27) | Auto-deploy desde `main` |
| Dominio | derma-intel.vercel.app | — | Subdominio derma.mirailab.lat opcional para futuro |
| BaaS | Supabase | Free | URL en NEXT_PUBLIC_SUPABASE_URL |
| IA | Anthropic | Pay-as-you-go | Sonnet 4.6 + Haiku 4.5, mix por modo |
| Source | GitHub | — | miraigroupconsulting-hash/Derma-Intel |

---

## Variables de entorno (Vercel + .env.local)

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public, Vercel + local | Cliente Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public, Vercel + local | Auth + RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, Vercel + local | Crons + seeds (bypassa RLS) |
| `ANTHROPIC_API_KEY` | Server-only, Vercel + local | Todas las llamadas a Claude |
| `CRON_SECRET` | Server-only, Vercel + local | Authn Bearer del cron diario |

**Rotación de keys:** si necesitas rotar Supabase service role o Anthropic key, hazlo desde sus respectivos dashboards y actualiza en Vercel Settings → Environment Variables + redeploy.

---

## Crons programados (Vercel)

Configurados en `vercel.json`:

| Path | Cron | Hora Caracas | Qué hace |
|---|---|---|---|
| `/api/cron/evaluar-alertas` | `0 10 * * *` (10:00 UTC) | 06:00 | Genera notificaciones para recordatorios próximos (24h) y pacientes perdidos (>60d sin consulta) |

**Disparar manualmente:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://derma-intel.vercel.app/api/cron/evaluar-alertas
```

**Verificar último run:** Vercel Dashboard → Project → Logs → filtrar por `[cron evaluar-alertas]`.

---

## Scripts útiles

Corren contra producción Supabase (usan `SUPABASE_SERVICE_ROLE_KEY` del `.env.local`).

| Script | Uso | Notas |
|---|---|---|
| `scripts/seed-demo-patients.ts` | Crea/asegura los 5 pacientes demo del Día 8 | Idempotente — skip si ya existen. Marker `[MIRAI_DEMO_SEED_v1]` en notas. |
| `scripts/seed-demo-patients.ts --delete` | Borra los pacientes demo (solo los marker-flagged) | NO toca datos reales. CASCADE elimina consultas/récipes/notifs. |
| `scripts/seed-maria-demo.ts` | Demo viejo del Día 7 (María Demo Mirai). Mantenido para legacy | Usar `--delete` antes de la entrega final. |
| `scripts/check-notificaciones.ts` | Imprime las últimas 20 notifs activas por médico | Debug |
| `scripts/find-medico-email.ts` | Lista todos los médicos en la DB | Útil cuando no sabes el email |

**Ejecutar:**
```powershell
$env:MEDICO_EMAIL="jennimed.frias@gmail.com"
npx tsx scripts/seed-demo-patients.ts
```

---

## Migraciones SQL

Vienen versionadas en `supabase/migrations/`. Aplicación:

```bash
npx supabase db push --include-all
```

Esto solo aplica las que no están en la `supabase_migrations.schema_migrations` de prod. Es seguro correr múltiples veces.

**Lista actual (cierre Día 9):**
- `20260524120000` extensions
- `20260524120100..20260524120800` capa base (médicos, pacientes, consultas, fotos, récipes, etc.)
- `20260525120000` fotos-consultas bucket
- `20260525130000` uso_ia table
- `20260525140000` recetas-pdf bucket
- `20260526120000` médico profile assets
- `20260526120100` médico-assets bucket
- `20260526130000` paciente cédula
- `20260526140000` récipes revisiones
- `20260527120000` fotos zona_anatomica + comparaciones
- `20260527130000` Día 7 — recordatorios extended + notificaciones + zona_horaria

---

## Buckets de Storage

| Bucket | Path pattern | Acceso |
|---|---|---|
| `fotos-consultas` | `{medico_id}/{consulta_id}/{foto_uuid}.jpg` | RLS por owner |
| `medico-assets` | `{medico_id}/logo.png`, `{medico_id}/firma.png` | RLS por owner |
| `recetas-pdf` | `{medico_id}/{consulta_id}/{recipe_uuid}.pdf` | RLS por owner |

**URLs firmadas:** Todas las queries de fotos/PDFs generan signed URLs con TTL 1h. Si necesitas que duren más para un caso particular, ajusta `SIGNED_URL_TTL` en los page.tsx correspondientes.

---

## Comandos de mantenimiento más comunes

```powershell
# Verificar estado de producción
curl https://derma-intel.vercel.app/

# Regenerar tipos TS desde el schema actual de Supabase
npx supabase gen types typescript --linked > types/database.ts

# Limpiar .next stale si dev server da 500 tras un next build
Remove-Item -Recurse -Force .next; npm run dev

# Disparar cron manualmente en prod
curl -H "Authorization: Bearer $CRON_SECRET" https://derma-intel.vercel.app/api/cron/evaluar-alertas

# Generar nueva CRON_SECRET (si por algún motivo necesitas rotar)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Errores comunes y cómo resolverlos

### "ERR_CONNECTION_REFUSED" en localhost
- El dev server murió o no arrancó. `taskkill /PID <pid> /F` y `npm run dev`.

### "Cannot find module '../chunks/ssr/[turbopack]_runtime.js'"
- Cache stale tras `next build`. Borra `.next` y reinicia dev.

### Cron responde 401
- Falta `CRON_SECRET` en Vercel env vars o no coincide con el del `.env.local`. Ya configurado al cierre Día 9 — `a55ad66e...`.

### Récipe PDF no se genera en dev
- @react-pdf/renderer puede dar problemas con Turbopack. Probar `npx next build && npx next start` en local. En producción funciona.

### Service worker sirve página vieja
- `chrome://serviceworker-internals/` → unregister el SW de derma-intel.vercel.app
- O navegación privada para ver fresh

---

## Plan B si Vercel se cae el día de la entrega

1. Arranca el dev server local con producción Supabase (el `.env.local` ya apunta ahí):
   ```
   npm run dev
   ```
2. Comparte tu pantalla / pásale acceso vía ngrok o cloudflare tunnel
3. Asegúrate que el cron de producción no sea crítico para el demo — los datos demo ya están sembrados y las funciones core no dependen del cron

---

## Roadmap post-entrega

### Sprint inmediato (post-entrega)
- Anotar todo el feedback de la médica durante uso real
- Hotfixes según severidad

### Sprint corto (próximas 2 semanas)
- RAG sobre PubMed + DermNet (capa 2 del PRD)
- Digest semanal automático de novedades (auto-curado con IA)
- Integración Gamma para presentaciones académicas
- Importador de pacientes desde Excel/CSV
- Cálculo automático de dosis acumulada para isotretinoína

### Sprint largo (mes 2-3)
- Vercel Pro permanent (cuando se acabe el trial)
- Custom domain derma.mirailab.lat
- Tier de precios + paywall manual (Stripe no aplica VE)
- Multi-consultorio
- Onboarding de los primeros 10 dermatólogos VE
