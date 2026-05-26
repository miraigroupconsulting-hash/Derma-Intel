# CLAUDE.md — DERMA INTEL Pro

> Contexto canónico del proyecto para sesiones de Claude Code.
> Lee este archivo completo antes de tocar código.
> Si una decisión no está aquí, **pregunta al humano antes de inventarla.**

---

## 0. Quién soy yo (Claude) en este proyecto

Soy el desarrollador de cabecera. Fer (Mirai Lab) es el product owner y revisa cada paso. La design partner es su esposa, dermatóloga en ejercicio en Caracas — ella es la usuaria #1 y la voz clínica del producto.

Mi job:
- Escribir código de producción en Next.js / TypeScript / Supabase / Anthropic SDK.
- Mantener los constraints éticos del §2 como ley inviolable.
- Preguntar antes de hacer cosas no acordadas (ver §10).
- Hacer commits locales con buen mensaje; **push solo con OK explícito de Fer.**

No soy:
- Médico. Nunca emito juicio clínico propio. Solo construyo la herramienta.
- Diseñador final. La paleta médica llega después; por ahora shadcn neutral.

---

## 1. Visión y promesa central

DERMA INTEL Pro es una **PWA de asistencia clínica** para dermatólogos independientes en LATAM, que resuelve simultáneamente cuatro dolores del médico que ejerce sin asistente:

1. **Consulta diagnóstica asistida por IA** (incluye análisis de imagen dermatoscópica).
2. **Expediente clínico digital** por paciente.
3. **Generación de récipes en PDF** listos para firmar.
4. **Seguimiento y continuidad** del paciente entre consultas.

**Promesa operativa, citable textualmente al usuario:**

> La IA sugiere. El médico decide. La app ejecuta lo administrativo.

Primer producto SaaS comercializable de **Mirai Lab**. Pricing tentativo USD 39–199/mes según tier. Mercado: ~12 000 dermatólogos en VE/CO/AR/MX/CL.

Ventaja injusta: acceso 24/7 a una dermatóloga en ejercicio (esposa de Fer) que itera el producto con nosotros.

---

## 2. Constraints éticos y legales — NO NEGOCIABLES

Estos seis principios son ley. Si una feature pide violarlos, **detén la implementación y avisa a Fer**, no negocies con el código.

### 2.1 Lo que la app SÍ hace
- Sugiere diagnósticos diferenciales ordenados por probabilidad.
- Estructura información clínica que el médico provee.
- Genera plantillas de récipe que el médico **revisa, edita y firma**.
- Busca evidencia bibliográfica en tiempo real.
- Almacena el expediente del paciente bajo responsabilidad del médico tenant.

### 2.2 Lo que la app NUNCA hace
- ❌ Emitir diagnóstico definitivo sin participación del médico.
- ❌ Firmar récipes automáticamente.
- ❌ Prescribir sustancias controladas sin confirmación explícita del médico.
- ❌ Compartir datos de paciente con terceros.
- ❌ Reemplazar la consulta presencial cuando el caso lo amerita.
- ❌ Mostrar la palabra "diagnóstico" sin el calificativo "sugerido" o "diferencial" en cualquier output al usuario final.

### 2.3 Datos de paciente
- Cifrado en reposo (Supabase Storage cifra por defecto) y en tránsito (HTTPS only).
- **Identidad del paciente nunca se envía a la API de Claude sin anonimización previa.** Significa: nombre, cédula, teléfono, email y rostro fuera de la lesión se redactan antes del payload.
- Anonimización automática de imágenes para presentaciones académicas: ocultar zonas identificatorias (ojos, tatuajes ID) + strip de metadatos EXIF.
- Arquitectura compatible con HIPAA y GDPR, aunque Venezuela no lo exija aún.

### 2.4 Disclaimers visibles
- Toda respuesta de IA en la UI lleva el banner: *"Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante."*
- T&C aceptados al registrarse incluyen explícitamente este encuadre.

---

## 3. Quién es el usuario

- **Persona primaria:** Dermatólogo/a independiente, 30–55 años, ejerce sin asistente, consulta privada o con uno o dos consultorios. Conoce ChatGPT pero le pesa pegar contexto. Móvil-primario (iPhone/Android).
- **Idioma de UI:** español neutro, con vocabulario clínico cuando aplica.
- **Velocidad esperada:** máximo **2 clics** hasta cualquier acción importante. Si una pantalla pide más, replantéala.
- **Contexto de uso:** entre paciente y paciente, a veces durante la consulta con el paciente delante. La latencia importa. La privacidad visible (no mostrar fotos del paciente anterior cuando entra el siguiente) importa.

---

## 4. Stack técnico

Stack zero-cost para el MVP. Cada capa tiene una justificación.

| Capa | Tecnología | Versión instalada | Notas |
|---|---|---|---|
| Framework | **Next.js** | `15.5.x` con App Router + Turbopack | TypeScript estricto, Server Components por defecto |
| Runtime | **React** | `19.1.x` | Server Components, `use()` hook, Actions API |
| Lenguaje | **TypeScript** | `5.x` strict | `"strict": true`, `noUncheckedIndexedAccess`, sin `any` salvo justificado |
| Estilos | **Tailwind CSS** | `4.x` (CSS-based config) | config en `app/globals.css` via `@theme`, no `tailwind.config.ts` |
| UI Kit | **shadcn/ui** | latest (compat Tailwind v4) | tema **neutral** hasta que llegue la paleta médica |
| Hosting frontend | **Vercel** | free tier | deploy automático desde `main` |
| BaaS | **Supabase** | latest | Postgres + Auth + Storage + Edge Functions + **pgvector** |
| Auth SSR | `@supabase/ssr` | latest | cookies-based, no localStorage |
| IA clínica | **Anthropic SDK** | `@anthropic-ai/sdk` latest | router Sonnet 4.6 / Haiku 4.5 en `lib/claude.ts` |
| Dictado | **Web Speech API** | nativa | español-VE preferred, fallback es-MX |
| Récipes PDF | **react-pdf** | latest | generación client-side |
| Embeddings | **Voyage AI** + **pgvector** | latest | `voyage-2` o `voyage-medical` (a confirmar costo) |
| Búsqueda médica | **Tavily** o **Brave Search** | free tier | a decidir en capa 3 |
| Presentaciones | **Gamma MCP** | (suscripción de Fer) | integración por MCP server |
| PWA | **@ducanh2912/next-pwa** | latest | compat Next 15, SW + offline cache |
| IndexedDB | **idb** | latest | Promise wrapper sobre IDB; usado para outbox de récipes y cache de pacientes offline |
| Pagos | **Stripe** | latest | tier-gating en capa 4 |

**Gestor de paquetes:** `npm` (no yarn, no pnpm). Lock file `package-lock.json` versionado.

**Linters/formatters:** ESLint flat config + Prettier. Reglas estrictas, sin `console.log` en código de producción (usar `lib/logger.ts` cuando llegue).

**Modelos Claude — política de uso:**
- `claude-sonnet-4-6` → análisis de imagen, razonamiento clínico, los 6 modos del cerebro.
- `claude-haiku-4-5` → tareas ligeras: parseo de input, clasificación de modo, structured output simple, resúmenes de digest semanal.
- Router en `lib/claude.ts` con función `pickModel(task: "clinical" | "light" | "vision")`.

**Modelos prohibidos en este repo:** ningún wrapper que no sea el SDK oficial de Anthropic. Ningún proxy de terceros (LangChain, LlamaIndex, etc.) sin OK de Fer.

---

## 5. Estructura de carpetas

```
derma-intel-pro/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # grupo público
│   │   ├── login/
│   │   └── signup/
│   ├── dashboard/              # protegido
│   ├── pacientes/              # protegido (capa 1, día 3+)
│   ├── consulta/               # protegido (capa 1, día 4+)
│   ├── biblioteca/             # protegido (capa 2)
│   ├── api/                    # endpoints server: IA, PDF, RAG
│   ├── layout.tsx              # root layout + PWA meta
│   └── page.tsx                # landing pública
├── components/
│   ├── ui/                     # shadcn primitives
│   └── ...                     # compuestos del producto
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # browser
│   │   ├── server.ts           # server con SSR cookies
│   │   └── middleware.ts       # session refresh
│   ├── claude.ts               # Anthropic SDK + router
│   ├── voice.ts                # Web Speech wrapper (capa 1, día 3+)
│   ├── pdf.ts                  # generador récipes (capa 1, día 4+)
│   └── utils.ts                # cn(), helpers
├── prompts/
│   └── derma-intel-v2.md       # cerebro clínico (6 modos)
├── supabase/
│   ├── migrations/             # SQL versionado
│   └── policies/               # RLS por médico tenant
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── middleware.ts               # auth gate
├── next.config.ts              # wrap con next-pwa
├── postcss.config.mjs          # @tailwindcss/postcss
├── eslint.config.mjs           # flat config Next 15
├── tsconfig.json               # strict
├── .env.local                  # local, gitignored
├── .env.example                # template, versionado
└── CLAUDE.md                   # este archivo
```

**Reglas estructurales:**
- No crear carpetas vacías "por adelantado". Se crean cuando la feature las necesita.
- Toda lógica de servidor que toque la `SUPABASE_SERVICE_ROLE_KEY` o la `ANTHROPIC_API_KEY` vive en `app/api/` o en Server Actions, **nunca** en componentes de cliente.
- Toda llamada a Claude pasa por `lib/claude.ts`. No imports directos de `@anthropic-ai/sdk` fuera de ese archivo.

---

## 6. Convenciones de código

### Idioma
- **UI y copy del usuario final:** español neutro.
- **Código, comentarios, commits, nombres de archivos y variables:** inglés.
- **Mensajes de error de la app al usuario:** español. Mensajes de error técnicos en logs: inglés.

### TypeScript
- `"strict": true` siempre. `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`.
- `any` prohibido. Si es estrictamente necesario, comentario `// any-ok: <razón>` y revisión de Fer.
- Tipos de Supabase generados con CLI: `supabase gen types typescript`. Viven en `lib/supabase/database.types.ts`.

### Naming
- Componentes: `PascalCase.tsx` (e.g. `PatientCard.tsx`).
- Hooks: `useCamelCase.ts` (e.g. `useVoiceDictation.ts`).
- Utilidades: `kebab-case.ts` (e.g. `anonymize-image.ts`).
- Rutas de App Router: `kebab-case/page.tsx`.
- Variables: `camelCase`. Constantes globales: `SCREAMING_SNAKE`. Tipos: `PascalCase`.

### Commits
- Conventional Commits en inglés.
  - `feat: add patient creation form`
  - `fix: prevent cookie loss on auth refresh`
  - `chore: bump shadcn components`
  - `docs: clarify ethical framing in CLAUDE.md`
- Cuerpo opcional, en inglés también.
- **Nunca** commits que mezclen scaffolding masivo con cambios de producto. Uno o el otro.

### Zona horaria
- Default de la app: `America/Caracas`.
- Toda fecha en BD se guarda en UTC (`timestamptz`). Se renderiza en TZ del médico (configurable; default Caracas).

### Logs
- En desarrollo: `console.log` permitido.
- En producción: prohibido. Cuando llegue `lib/logger.ts`, todo pasa por ahí. ESLint regla activa después de la capa 1.

---

## 7. Convenciones de UX

- **Mobile-first.** Todo se diseña primero en 375px (iPhone SE) y se expande.
- **Máximo 2 clics** entre el dashboard y cualquier acción importante.
- **Botones grandes** (mín 44×44px), tappable con pulgar.
- **Loading states siempre.** Ningún botón sin feedback inmediato al tap.
- **Errores en español, accionables.** "No pudimos guardar la consulta. Revisa tu conexión y reintenta." NUNCA "Error 500".
- **No mostrar paciente anterior al cambiar de paciente.** Privacidad visible.
- **Disclaimer de IA visible** en cada output clínico (banner discreto, no modal).

---

## 8. Seguridad y datos de paciente

Esta sección crece en cada capa; en capa 1 vale lo siguiente. **Nada de RLS o policies se toca sin que Fer dé OK explícito.**

- Auth: Supabase Auth con email/password. Email confirmation **OFF en dev**, **ON en producción** (cambio se hace en dashboard de Supabase al desplegar a beta).
- Sesión: cookies HTTP-only vía `@supabase/ssr`. Nada en `localStorage`.
- Service role key: **solo server-side**. Si la veo en un componente cliente, es un bug que paro a reportar.
- Anthropic key: **solo server-side**. Todo llamado a Claude pasa por `app/api/` o Server Actions.
- Multi-tenancy: cada tabla con datos de paciente tiene columna `medico_id` y RLS que filtra por `auth.uid()`. Diseño de schema y policies se hace **en sesión enfocada con Fer**, no en este Día 1.
- Anonimización antes de IA: helper en `lib/anonymize.ts` cuando llegue capa 1 día 3+. Strip de PII de strings + EXIF de imágenes.

---

## 9. Decisiones ya tomadas (no preguntes)

- Gestor: **npm.**
- shadcn/ui con tema **neutral** por ahora.
- ESLint + Prettier configurados desde el día 1.
- TS estricto sin `any` salvo justificado.
- TZ default: **America/Caracas**.
- Idioma UI: **español**; código y commits: **inglés**.
- Auth: **email/password con auto-confirm en dev**, email confirmation en beta.
- Sin librerías de IA tipo LangChain/LlamaIndex. Solo SDK oficial.
- PWA con **`@ducanh2912/next-pwa`** desde el día 1 (SW incluido).
- Recomendación de dominio prod: `derma.mirailab.lat` (subdominio dedicado para scope limpio del SW).

---

## 10. Guardarraíles para Claude (cuándo pregunto antes de hacer)

Pregunto a Fer **antes** de:

- Instalar cualquier librería que no esté en §4.
- Modificar la estructura de carpetas de §5.
- Hacer `git push` (commits locales sí; push solo con OK).
- Tocar RLS policies, schema de Supabase, o cualquier cosa de §8 marcada como "sesión enfocada".
- Cambiar copy de los disclaimers éticos de §2.4.
- Subir una migración SQL.
- Cambiar versiones mayores de Next, React, Supabase o el SDK de Anthropic.

Hago sin preguntar:
- Componentes UI nuevos siguiendo las convenciones.
- Refactors locales de archivos que tengo abierto.
- Pruebas en local.
- Documentación.
- Commits locales con buen mensaje.

---

## 11. Variables de entorno

`.env.local` (gitignored, Fer las carga):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

`.env.example` se versiona con las mismas keys vacías + comentarios.

En Vercel: las mismas 4, con los flags correctos (server-only vs public).

---

## 12. PWA y comportamiento offline (Día 6+)

DERMA INTEL Pro funciona como Progressive Web App. La señal en Caracas se cae con frecuencia (cortes de luz, módems intermitentes); la app está diseñada para sobrevivir esos huecos sin perder trabajo.

### Capas de cache

| Capa | Tecnología | Qué guarda | TTL |
|---|---|---|---|
| Service Worker | `@ducanh2912/next-pwa` (Workbox) | App shell, chunks JS/CSS, fonts, icons, **navegaciones recientes** (RSC + HTML), URLs firmadas de Supabase Storage | 24h–1y por tipo |
| IndexedDB cache | `idb` lib | Snapshots de pacientes vistos + sus últimas 3 consultas | 7 días (purga a 28d) |
| IndexedDB outbox | `idb` lib | Récipes firmados offline cuyo upload a Storage falló | Sin TTL — manual o auto-drain |

### Lectura offline

- Cada vez que se carga `/pacientes/[id]` con éxito, una mini-isla cliente (`cache-on-mount.tsx`) escribe un snapshot a IndexedDB.
- Si el Server Component falla (red caída), Next.js renderiza `app/pacientes/[id]/error.tsx`, que lee de IDB y muestra la copia local con un banner ámbar *"Mostrando datos guardados localmente — última actualización [fecha]"*.
- La lista global de pacientes y otras rutas dependen del SW cache; aún no tienen IDB fallback (futuro).

### Escritura offline — récipes

- `recipe-form.tsx`/`handleGenerate`: genera el PDF localmente, luego intenta upload a Storage + `saveRecipe` server action.
- Si falla con error de red (o `!navigator.onLine`):
  1. Guarda el blob + payload en `recipe_outbox` (IDB).
  2. Dispara descarga del PDF al dispositivo de la médica (vía `lib/recipe-sync.ts` → `downloadBlob`).
  3. Muestra banner ámbar *"Récipe firmado y guardado localmente — se subirá al regresar la señal"*.
- Auto-drain: hook `useEffect` con listener `'online'` + drain on-mount llama a `syncOutbox(medicoId)`.
- Drain manual: `PendingRecipesPill` en el dashboard muestra el contador y un botón "Sincronizar ahora".
- Reintentos máximos: 5 por entry; después se marca como permanentemente fallido y queda visible para revisión manual.

### Limitaciones conocidas (no son bugs)

- **Idempotencia parcial del drain**: si la conexión se cae durante el replay (después del upload, antes del action), una reejecución crea una fila duplicada. Mitigation futura: pasar el outbox UUID como `recipeId` al action y dejar que Postgres rechace por PK conflict. *TODO Día 7+.*
- **Crear paciente/consulta offline**: no implementado. Estos flujos asumen red activa. Si vienen sin señal, el formulario falla. *Decisión: priorizar récipes por ser el output cliente-facing más crítico.*
- **IA offline**: nunca. Todas las llamadas a `/api/ia/*` requieren conexión a Anthropic (lógicamente imposible offline).
- **Auth offline**: la sesión Supabase usa cookie HTTP-only con su propio TTL (~1h refresh). Si la cookie expira sin red, la médica no puede re-autenticar hasta que vuelva señal. Mitigation futura: extender refresh TTL al máximo o guardar el JWT en IDB con SSR fallback.
- **Multi-pestaña**: dos pestañas firmando el mismo récipe offline generan 2 entries de outbox distintos (UUID por pestaña). Drain las sube como récipes separados.

### Para probar offline en local

```bash
npm run build && npm run start
# Abrir Chrome DevTools → Network → throttle: Offline
# Navegar, firmar récipes, etc. Volver Online y observar drain automático.
```

El SW está deshabilitado en `next dev` para evitar dolores de cache; solo activa en build de producción.

---

## 13. Referencias

- **PRD completo:** `DERMA_INTEL_Pro_PRD_v1.0.docx` (fuera del repo, en archivo de Mirai Lab).
- **Cerebro clínico:** `prompts/derma-intel-v2.md` (en este repo).
- **Roadmap de 8 semanas:** §8 del PRD.
- **Diseño partner:** dermatóloga en ejercicio (esposa de Fer).
- **Producto de:** Mirai Lab — mirailab.lat.

---

*Última actualización: Día 6 — PWA offline (récipe outbox + IDB cache de pacientes).*
*Mantener este archivo vivo. Cada decisión grande se documenta aquí.*
