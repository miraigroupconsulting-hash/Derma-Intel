# Agregar una nueva especialidad al chasis

Este documento es el playbook para spinear una nueva especialidad médica usando el chasis de DERMA INTEL Pro como base. Diseñado para el día que llegue un oftalmólogo, cardiólogo, ginecólogo, o cualquier otro especialista pidiendo lo mismo que la dermatóloga.

## Decisión inicial — A o B

### Opción A — Repo separado (recomendado para 1-2 especialidades)

Forkás el repo `Derma-Intel` a un nuevo repo `Oftal-Intel` (o el nombre que sea). Vercel separa los deploys, los dominios, las DBs si quisieras (recomendado: cada especialidad tiene su propio Supabase project para aislar datos legalmente).

**Pros**: aislamiento total, branding distinto desde el dominio, cero riesgo de mezclar pacientes entre especialidades, escalado independiente.

**Contras**: si fixás un bug en el core (auth, récipes, agenda), tenés que cherry-pickearlo entre repos. Manejable hasta 3 forks; doloroso con 5+.

### Opción B — Mismo repo, múltiples instancias Vercel

Un solo repo. Cada Vercel project apunta al mismo GitHub pero usa una env var distinta:
- `derma-intel` project: `NEXT_PUBLIC_SPECIALTY=derma`
- `oftal-intel` project: `NEXT_PUBLIC_SPECIALTY=oftal`

**Pros**: un solo lugar donde fixear bugs del core.

**Contras**: build de cada deploy contiene el código de todas las especialidades (más bundle). Si una especialidad pide cambios incompatibles, el core empieza a llenarse de feature flags.

**Recomendación**: arranca con **A**. Si llegás a 4+ especialidades, considera consolidar.

---

## Checklist técnico para una nueva especialidad

Suponiendo que vamos por **Opción A** (repo separado) y el nuevo especialista es oftalmólogo (`id="oftal"`).

### 1. Fork el repo

```bash
gh repo create miraigroupconsulting-hash/Oftal-Intel --template miraigroupconsulting-hash/Derma-Intel --private
git clone https://github.com/miraigroupconsulting-hash/Oftal-Intel
cd Oftal-Intel
```

### 2. Brand identity — `config/specialty/`

Editar **`config/specialty/derma.ts`** ya no — crear el nuevo y borrar el viejo:

```bash
cp config/specialty/derma.ts config/specialty/oftal.ts
rm config/specialty/derma.ts
```

Edita `oftal.ts`:

```ts
export const OFTAL_SPECIALTY: SpecialtyConfig = {
  id: "oftal",
  nombre: "Oftalmología",
  brand: {
    name: "OFTAL INTEL Pro",
    shortName: "Oftal Intel",
    tagline: "La asistente con IA que el oftalmólogo solo nunca tuvo.",
    description: "...",
    especialidadPlural: "oftalmólogos",
    especialidadIndividual: "oftalmólogo/a",
    colors: { primary: "#003049", secondary: "#669BBC" }, // ajustá
  },
  features: {
    fotoEvolucion: true,         // oftal usa retinografía + lámpara hendidura: sí
    dermatoscopia: false,        // no
    fototipo: false,             // no aplica
    modoHistopatologia: false,   // no aplica
    anonimizacionFacial: true,   // sí, oftal toma fotos cara
    zonasAnatomicas: true,       // anatomía ocular: párpado, conjuntiva, córnea, etc.
    consultaRapida: true,
  },
  promptsFile: "oftal-intel-v2.md",
};
```

Editar **`config/specialty/index.ts`**:

```ts
import { OFTAL_SPECIALTY } from "./oftal";
const REGISTRY = { oftal: OFTAL_SPECIALTY };
// quita la línea de derma
```

### 3. Catálogo de medicamentos — `lib/medicamentos.ts`

El array `MEDICAMENTOS` actual tiene ~70 dermatofármacos. Reemplazá todo el array por meds oftálmológicos (colirios, antiglaucomatosos, etc.). Mantené la estructura del tipo `MedicamentoCatalogo`. Trabajo con el oftalmólogo de cabecera para validar la lista.

### 4. Zonas anatómicas — `lib/zonas-anatomicas.ts`

Reemplazá `ZONAS_ANATOMICAS` con la anatomía ocular relevante:

```ts
export const ZONAS_ANATOMICAS: ZonaGroup[] = [
  {
    group: "Segmento anterior",
    zonas: [
      { value: "parpado_superior_d", label: "Párpado superior derecho" },
      { value: "parpado_superior_i", label: "Párpado superior izquierdo" },
      { value: "conjuntiva_bulbar_d", label: "Conjuntiva bulbar derecha" },
      { value: "cornea_d", label: "Córnea derecha" },
      // ...
    ],
  },
  {
    group: "Segmento posterior",
    zonas: [
      { value: "retina_d", label: "Retina derecha" },
      { value: "macula_d", label: "Mácula derecha" },
      // ...
    ],
  },
];
```

### 5. Prompt clínico — `prompts/`

Crear `prompts/oftal-intel-v2.md` basado en el formato de `prompts/derma-intel-v2.md`:
- Misma estructura: base común (§2) + 6 modos (§3-§8 — Caso, Express, Bibliografía, Histopatología, Terapéutica, Docente)
- Contenido clínico reescrito por completo por el oftalmólogo de cabecera
- Mantener disclaimer "La IA sugiere. El médico decide."

Eliminar `prompts/derma-intel-v2.md` para no confundir.

### 6. Demos sintéticos — `scripts/seed-demo-patients.ts`

Reemplazá los 5 pacientes demo (María González con rosácea, Carlos con isotretinoína, etc.) por 5 pacientes representativos de oftalmología (glaucoma, retinopatía diabética, conjuntivitis, etc.) con sus consultas, récipes oftálmicos y recordatorios.

### 7. Assets visuales — `public/`

Reemplazar:
- `public/favicon.svg` — nuevo símbolo (¿una pupila? ¿una "O"?)
- `public/logo-symbol.svg` — mismo símbolo, sin fondo
- `public/og-image.svg` — actualizar texto del wordmark
- `public/manifest.webmanifest` — `theme_color`, `background_color`, name

### 8. CLAUDE.md

Editar el §1 Visión y §3 (Quién es el usuario) para reflejar la nueva especialidad. Mantener §2 (constraints éticos) intactos — son universales médicos.

Actualizar `prompts/derma-intel-v2.md` → `prompts/oftal-intel-v2.md` en las referencias.

### 9. Branding de la carta del fundador — `app/about/carta/page.tsx`

El texto actual menciona "leer la piel". Reemplazar por "ver el ojo" o lo que aplique. Mantener el tono personal.

### 10. Supabase project nuevo

**Crítico para aislamiento legal**: crear un nuevo Supabase project para esta especialidad. NO compartir DB con derma. Razones:
- Datos clínicos de pacientes oftálmicos no deben mezclarse con datos derma
- RLS funciona por médico_id, pero si los buckets de Storage son compartidos hay riesgo de cross-contamination
- Backups y exports legales separados por especialidad

Pasos:
1. Crear nuevo Supabase project (free tier es suficiente al inicio)
2. Aplicar todas las migrations: `npx supabase link --project-ref <new-ref> && npx supabase db push --include-all`
3. Crear los buckets (`fotos-consultas`, `medico-assets`, `recetas-pdf`, `informes-pdf`) con sus policies
4. Actualizar `.env.local` y Vercel env vars con las URLs/keys nuevas

### 11. Vercel project nuevo

1. Importar el repo nuevo a Vercel
2. Setear env vars (incluyendo `NEXT_PUBLIC_SPECIALTY=oftal`, `CRON_SECRET` nuevo, las 3 Supabase keys, `ANTHROPIC_API_KEY`)
3. Setear Custom Domain (ej. `oftal.mirailab.lat`)
4. Verificar cron job sigue corriendo: `vercel.json` ya está

### 12. Smoke test

- Landing rendea con el nombre y tagline nuevos
- Signup crea un usuario, confirma email → cae en `/onboarding` con copy del nuevo brand
- Onboarding completo → dashboard rendea sin features deshabilitadas
- Crear paciente → form sin Fitzpatrick (oftal lo apagó)
- Crear consulta → IA con prompt oftal responde apropiadamente
- Generar récipe → autocomplete con meds oftálmicos
- Si `fotoEvolucion=true`: galería funciona con fotos oculares
- Cron de alertas dispara correctamente

---

## Lo que NO toca el fork (core agnóstico médico)

Estos archivos quedan idénticos entre derma, oftal, cardio, etc. Si los modificás en una especialidad, considerá hacerlo en TODAS las demás (mejor aún: contribuir el fix upstream al template).

- `app/(auth)/` — login, signup, logout (genérico)
- `app/pacientes/` — CRUD multi-tenant
- `app/consulta/[id]/` — SOAP, récipes, recordatorios, informes
- `app/dashboard/page.tsx` — solo wrappea con feature flags, no contenido derma
- `app/agenda/` — calendario semanal genérico
- `lib/supabase/` — clients SSR + browser
- `lib/claude.ts` — runClinicalCall (provider-agnostic)
- `lib/voice.ts` — Web Speech API (idioma configurable a futuro)
- `lib/anonimizar.ts` — EXIF + name redaction (universal)
- `lib/recordatorios.ts` — alertas + paciente perdido logic
- `lib/evaluar-alertas.ts` — cron handler
- `lib/offline-db.ts` — PWA outbox
- `components/` — UI shadcn base + logo dinámico + temas
- `supabase/migrations/` — schema universal médico

---

## Tiempo estimado para un nuevo fork

| Paso | Esfuerzo realista |
|---|---|
| 1. Fork repo | 5 min |
| 2. Brand identity | 30 min (con paleta + tagline decididas) |
| 3. Medicamentos catálogo | 4-8 horas **con el médico de cabecera** |
| 4. Zonas anatómicas | 1-2 horas con el médico |
| 5. Prompts clínicos | **1-2 semanas con el médico** (el cuello de botella real) |
| 6. Demos sintéticos | 2-4 horas con el médico |
| 7. Assets visuales | 4-8 horas (si querés logo nuevo decente) |
| 8. CLAUDE.md | 30 min |
| 9. Carta del fundador | 1 hora |
| 10. Supabase nuevo | 1 hora (migrations + buckets) |
| 11. Vercel nuevo | 30 min |
| 12. Smoke test | 2-4 horas |
| **TOTAL** | **2-4 semanas si el médico de cabecera es proactivo** |

El **cuello de botella siempre es el prompt clínico**. Sin un especialista que valide los 6 modos contra casos reales, la IA va a sonar genérica o decir cosas incorrectas. No tomes atajos en ese paso.

---

## Cuándo NO hacer un nuevo fork

- Si el especialista no se compromete al menos 10 horas de validación clínica
- Si no tenés convicción comercial de que esa especialidad da retorno (mercado, willingness to pay)
- Si una versión "lite" del producto actual ya resuelve su pain (ej. un cardiólogo podría usar el chasis con `fotoEvolucion=false` y zonas anatómicas universales — sin necesidad de fork)

Una especialidad nueva es un commitment a mantenerla para siempre. No la spinneés por curiosidad.
