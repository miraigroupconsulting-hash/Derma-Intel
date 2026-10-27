# Roadmap — Actualización de IA (modelo + evidencia en vivo)

> Estado: **EN ESPERA.** Ejecutar cuando Mirai Lab tenga **5 clientes
> validados** de DERMA INTEL Pro. Hasta entonces la app queda como está
> (Sonnet 4.6 + Haiku 4.5). Decidido con Fer el 2026-07-12.
>
> Motivo del diferimiento: validar mercado primero; las mejoras de IA no
> son bloqueantes para vender ni cambian el encuadre ético ("la IA
> sugiere, el médico decide"). La médica (esposa de Fer) aporta hoy el
> criterio clínico actualizado, así que el modelo congelado es aceptable
> en el ínterin.

Este documento nace de una pregunta de Fer: *"¿tenemos el modelo
actualizado? ¿la IA tiene actualización en terapéutica o tratamientos
nuevos?"*. La respuesta corta: hay **dos cosas distintas** —el modelo y
el conocimiento del modelo— y se mejoran por caminos distintos. Este
roadmap cubre ambos.

---

## Contexto — cómo está hoy (verificado en código, 2026-07-12)

- **Router de modelo:** `lib/claude.ts` → `pickModel()` / `pickModelForMode()`.
  - `clinical` + `vision` → `claude-sonnet-4-6`
  - `light` (Express, Terapéutica, parseos, structured output) → `claude-haiku-4-5`
- **Todas** las llamadas pasan por `runClinicalCall`, `runStructuredClinicalCall`
  y `streamClinicalCall` en ese mismo archivo. **Un solo punto de cambio.**
- **No hay `temperature`, `top_p`, `top_k`, `thinking` ni `output_config`**
  en ningún endpoint (`grep` limpio en `app/api/**`). Las llamadas solo
  fijan `model`, `max_tokens`, `system`, `messages`, y (en structured)
  `tools` + `tool_choice`.
- `max_tokens` actuales: 2048 (clinical), 3000 (structured), 2500 (stream).
- **No existe búsqueda web / recuperación de evidencia en vivo.** En el
  `CLAUDE.md §4` figura como *"Tavily o Brave — a decidir en capa 3"*,
  planificada pero nunca construida. Hoy la terapéutica que sugiere la IA
  = lo que Sonnet 4.6 trae de entrenamiento, **congelado a su fecha de
  corte.**
- El autocompletar de medicamentos del récipe (`lib/medicamentos.ts`) es
  **data local estática**, no algo que el modelo consulte en vivo.

**Conclusión clave:** subir de modelo mejora el razonamiento y da un
snapshot un poco más nuevo, pero **NO** hace que la IA "sepa" de una guía
publicada la semana pasada. Eso solo lo logra la **búsqueda de evidencia
en vivo** (Track B).

---

## Track A — Subir el modelo a Sonnet 5 (quick win)

**Qué es:** reemplazar `claude-sonnet-4-6` por `claude-sonnet-5`
(sucesor directo, calidad casi de Opus en razonamiento y visión, **mismo
precio** $3/$15 por millón de tokens). Haiku 4.5 **se queda** — ya es el
Haiku más reciente, no hay nada que subir ahí.

**Esfuerzo:** chico (medio día con pruebas). No requiere dependencias
nuevas ni tocar el SDK.

### Cambios de código

1. **`lib/claude.ts` → `pickModel()`** — cambiar el string:
   ```ts
   case "clinical":
   case "vision":
     return "claude-sonnet-5"; // era "claude-sonnet-4-6"
   ```
   Y actualizar los comentarios/JSDoc del router. Nada más en este archivo
   cambia estructuralmente.

2. **Decidir el modo de "thinking"** (⚠️ punto de decisión, no automático):
   - En Sonnet 4.6, **omitir** `thinking` corría **sin** pensamiento.
   - En Sonnet 5, **omitir** `thinking` corre **adaptive thinking por
     defecto** → más latencia y más tokens de los que gastamos hoy.
   - **Recomendación para esta app** (uso entre paciente y paciente, la
     latencia importa, `CLAUDE.md §3/§7`): fijar explícitamente
     `thinking: { type: "disabled" }` en las tres funciones de
     `lib/claude.ts` para **preservar el comportamiento actual y el
     costo**. Si más adelante queremos más profundidad de razonamiento en
     Caso Clínico, se puede probar `thinking: { type: "adaptive" }` +
     `output_config: { effort: "medium" }` **solo en ese modo** y medir.
   - Los `structured`/`light` calls: dejar `thinking` **disabled**
     siempre (extracción estructurada no lo necesita y es más barato).

3. **`max_tokens`** — si en algún modo se activa adaptive thinking, el
   pensamiento consume del mismo presupuesto → subir el `max_tokens` de
   ese modo (p.ej. 2048 → 4096) para no truncar la respuesta. Si dejamos
   thinking disabled (recomendado), **no hace falta tocar** los actuales.

4. **Sin cambios por sampling params** — no hay `temperature`/`top_p`/
   `top_k` que quitar. (En Sonnet 5 esos parámetros dan error 400; como
   no los usamos, no hay riesgo.)

### Costo — re-línea base obligatoria

- Sonnet 5 usa **tokenizer nuevo**: el mismo texto cuenta **~30% más
  tokens** que en 4.6. El **precio por token es igual**, pero el costo
  por consulta sube ~30% por el mayor conteo.
- **Acción:** tras el cambio, revisar el panel `/mirai-admin` (telemetría
  de tokens/costo) sobre casos reales y re-calibrar los números de costo
  del reporte de fin de día. No aplicar un multiplicador a ciegas —
  medir.

### Visión (fotos dermatológicas) — decisión opcional

- Sonnet 5 soporta **alta resolución (2576px** lado largo, vs 1568px en
  4.6). Para lesiones de piel esto **puede** dar mejor detalle
  diagnóstico… a costa de ~3x tokens de imagen.
- Hoy la app **comprime** las imágenes antes de enviarlas (optimización
  de costo previa). **Recomendación:** dejar la compresión como está en
  el arranque; si la médica pide más detalle en algún tipo de lesión,
  subir resolución **solo** para el modo Caso Clínico y medir costo. No
  cambiar por defecto.

### Checklist Track A

- [ ] `pickModel()` → `claude-sonnet-5` (clinical + vision)
- [ ] Fijar `thinking: { type: "disabled" }` en `runClinicalCall`,
      `runStructuredClinicalCall`, `streamClinicalCall`
- [ ] Correr `npm run typecheck` + `npm run build`
- [ ] Prueba E2E: Caso Clínico con foto, Express, Terapéutica, récipe
      estructurado, informe → verificar que nada truncó (`stop_reason`
      distinto de `max_tokens`)
- [ ] Re-línea base de costo en `/mirai-admin` con 5–10 casos reales
- [ ] Actualizar `CLAUDE.md §4` (tabla de modelos + política de uso) a
      Sonnet 5
- [ ] Commit local + push con OK de Fer

---

## Track B — Búsqueda de evidencia en vivo (la mejora "de verdad")

**Qué es:** darle al cerebro clínico acceso a **búsqueda web en tiempo
real** para que sus sugerencias terapéuticas reflejen guías y tratamientos
**actuales**, con **fuentes citadas**. Esta es la respuesta real a la
pregunta de Fer sobre "terapéutica/tratamientos nuevos".

**Herramienta:** el **server tool nativo de Anthropic**
`web_search_20260209` (con filtrado dinámico). Ventajas para este repo:
- Es parte del **SDK oficial** → **no viola** `CLAUDE.md §9` ("solo SDK
  oficial, sin proxies de terceros"). **Reemplaza** el plan viejo de
  Tavily/Brave del `§4` — mejor, sin dependencia nueva.
- Corre **server-side**; devuelve resultados con **citas**.
- Ya está disponible **tanto en Sonnet 4.6 como en Sonnet 5**, así que se
  puede prototipar aunque no hayamos hecho Track A.

**Esfuerzo:** mediano (2–3 días con UI de citas + guardarraíles).

### Diseño propuesto

1. **Nueva variante en `lib/claude.ts`** — una función tipo
   `runClinicalCallWithSearch()` que agregue al `messages.create`:
   ```ts
   tools: [{ type: "web_search_20260209", name: "web_search",
             max_uses: 3,
             allowed_domains: MEDICAL_SOURCE_ALLOWLIST }]
   ```
2. **Allowlist de fuentes confiables** (`MEDICAL_SOURCE_ALLOWLIST`) —
   restringir la búsqueda a dominios médicos serios (guías de sociedades
   dermatológicas, PubMed/NCBI, UpToDate público, DermNet, consensos,
   etc.) para evitar basura/foros. Definir la lista **con la médica**.
3. **Gatear por modo** — activar búsqueda solo donde aporta:
   - `TERAPEUTICA` (plan/tratamiento) y `BIBLIOGRAFIA` → SÍ.
   - `CASO_CLINICO` → opcional, con toggle "Buscar evidencia actual".
   - `EXPRESS` → NO (es el modo rápido/barato).
4. **UI de citas** — renderizar las fuentes citadas debajo de la
   respuesta (título + link), reforzando el encuadre "apoyo con
   evidencia". El banner de `§2.4` se mantiene.

### Guardarraíles NO NEGOCIABLES (`CLAUDE.md §2`)

- **PII (§2.3):** la **query de búsqueda nunca** puede contener identidad
  del paciente (nombre, cédula, teléfono, rostro). Las búsquedas se
  construyen **solo** con el texto clínico ya anonimizado
  (`lib/anonimizar.ts`). Enviar una consulta web con datos del paciente
  sería una fuga a un tercero → prohibido. Auditar este punto en pruebas.
- **Encuadre ético (§2.1/§2.4):** sigue siendo "sugiere, no diagnostica".
  La evidencia se presenta como **apoyo citado**, la decisión y firma son
  del médico. Nunca presentar un resultado de búsqueda como indicación
  definitiva.
- **Sustancias controladas (§2.2):** la búsqueda no cambia el flujo de
  confirmación `CONFIRMO` para controladas.

### Costo y latencia

- Cada búsqueda tiene costo (por uso del server tool) y suma latencia
  (segundos). Por eso: `max_uses` acotado (2–3), gatear por modo, y no
  activarla en Express. Medir en `/mirai-admin`.

### Checklist Track B

- [ ] Definir `MEDICAL_SOURCE_ALLOWLIST` **con la médica**
- [ ] `runClinicalCallWithSearch()` en `lib/claude.ts` con el server tool
- [ ] Manejo del `stop_reason: "pause_turn"` (loop server-side de tools)
- [ ] Gatear por modo (Terapéutica/Bibliografía; toggle en Caso Clínico)
- [ ] UI: render de citas/fuentes bajo la respuesta
- [ ] **Auditoría PII:** confirmar que ninguna query lleva identidad del
      paciente (usar solo texto anonimizado)
- [ ] Medir costo/latencia en `/mirai-admin`
- [ ] Actualizar `CLAUDE.md §4` (reemplazar Tavily/Brave por web_search
      nativo) y `§2` si hace falta afinar el copy
- [ ] Commit local + push con OK de Fer

---

## Secuencia recomendada

1. **Track A primero** (medio día): quick win, sube calidad general,
   deja la base en Sonnet 5.
2. **Track B después** (2–3 días): la mejora sustancial que responde de
   verdad "terapéutica/tratamientos nuevos".

Ambos son opt-in y no bloquean la venta. Ejecutar tras los 5 clientes
validados.

---

*Creado 2026-07-12 por Claude, a pedido de Fer. Mantener vivo: si el
código o los modelos cambian antes de ejecutar, re-verificar los
touchpoints de `lib/claude.ts` y los IDs de modelo antes de empezar.*
