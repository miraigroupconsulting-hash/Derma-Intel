# Guion de entrega — Día 10

Para uso interno (Fer). No commitear este archivo cargado de comentarios personales a otros lados.

---

## 30 min antes de la entrega — checklist técnico

**Desde tu laptop, en este orden:**

```powershell
# 1. Verifica que el deploy de Vercel está sano
curl -s -o /dev/null -w "%{http_code}\n" https://derma-intel.vercel.app/
# Esperado: 200

# 2. Verifica que el cron de producción autentica (Vercel ya tiene CRON_SECRET)
$secret = (Get-Content .env.local | Select-String "CRON_SECRET=").ToString().Split("=")[1]
curl -s -H "Authorization: Bearer $secret" `
  https://derma-intel.vercel.app/api/cron/evaluar-alertas
# Esperado: {"ok":true,...}

# 3. Asegúrate que el seed de pacientes demo está en su cuenta
$env:MEDICO_EMAIL="jennimed.frias@gmail.com"
npx tsx scripts/seed-demo-patients.ts
# Esperado: skip de los 5 (ya existen) o crear faltantes

# 4. Limpia notificaciones leídas viejas para que el dashboard luzca fresco
#    (opcional — solo si el dashboard se ve cargado con basura vieja)
```

**Antes de pasarle el link, verifica visualmente:**

1. Abre https://derma-intel.vercel.app/bienvenida en una ventana privada
2. Carta del fundador rendea limpia
3. Click "Entrar a la app" → te lleva a /login
4. Login con su cuenta → dashboard con 5 pacientes demo

Si todo OK: copia el link `https://derma-intel.vercel.app/bienvenida` y prepáralo para mandárselo.

---

## El momento de la entrega

### Opción A — Cara a cara
- Pídele que se siente con su laptop/tablet con buena conexión
- Dile algo como: "Tengo algo para ti. ¿Puedes abrir este link?"
- Mándale `https://derma-intel.vercel.app/bienvenida` por WhatsApp/Telegram (lo que use normalmente)
- **Quédate callado mientras lee la carta.** No expliques, no apresures. Que sea ella la que reaccione.
- Cuando llegue a "Entrar a la app", asegúrate que su email/contraseña están a mano

### Opción B — Por mensaje
- Mismo link
- Acompáñalo con: *"Llevas una semana sin saber qué he estado haciendo en las noches. Esto. Abre el link cuando puedas sentarte un rato."*
- Resiste la tentación de explicar nada antes de que ella lo vea

---

## Qué dejarle descubrir sola

**No hagas tour.** El producto está diseñado para revelarse poco a poco.

Si te pregunta cosas específicas:
- **"¿Cómo me grabo una consulta?"** → "Tap en 🎤 Nueva consulta. Es por voz. Hablale como si me dictaras a mí."
- **"¿Esto guarda receta?"** → "Sí. Mira el botón 📄 Récipe en cualquier consulta. Buscador con autocomplete + dictado."
- **"¿Puedo comparar fotos?"** → "Sí. Entra a cualquier paciente con fotos → 📷 Evolución → marca dos → Comparar."
- **"¿Funciona offline?"** → "Sí. Probá: corta el WiFi, firma un récipe, prendé otra vez. Verás cómo sincroniza."

Si no pregunta nada y solo explora: **déjala**. La app habla sola.

---

## Plan B si algo se rompe en vivo

### Síntoma 1 — La página de bienvenida no carga
- Fallback: comparte el screenshot/PDF de la carta (te lo paso si lo necesitas) + el link directo a `/login`

### Síntoma 2 — Login falla
- Verifica que su email está bien escrito
- Si no funciona desde Vercel: probar desde localhost (te paso instrucciones rápidas)
- Si urge: reset password desde Supabase dashboard → Auth → Users → Reset password

### Síntoma 3 — Dashboard sale en blanco
- Probable: SW cache viejo. Pídele que haga refresh forzado (Ctrl+Shift+R o Cmd+Shift+R)
- Si persiste: prueba en navegación privada

### Síntoma 4 — No ve los pacientes demo
- Significa que el seed no corrió en su cuenta. Desde tu terminal:
  ```
  $env:MEDICO_EMAIL="jennimed.frias@gmail.com"
  npx tsx scripts/seed-demo-patients.ts
  ```
- Refresca su dashboard

### Síntoma 5 — Una feature da error 500
- No intentes debugging en vivo
- Anótalo y dile: *"Le voy a echar un vistazo en un rato. Sigue probando lo demás."*
- En privado: revisa Vercel logs (https://vercel.com/mirai-lab/derma-intel/logs)

---

## Qué decir si te pregunta cosas que tu yo del futuro va a tener que contestar

### "¿Cuánto cuesta esto?"
> Para ti, nada. Es un regalo. Para el mundo, ya veremos — primero quiero que funcione para vos.

### "¿Quién más lo usa?"
> Solo tú, por ahora. Si funciona, vamos a salir con esto a otros dermatólogos en Caracas. Tu feedback es la fuente.

### "¿Esto manda info al exterior?"
> Cuando hablamos con la IA sí, pero anonimizado: la app borra nombres, cédulas y EXIF de fotos antes de enviar a Anthropic. La historia clínica completa queda en Supabase (Postgres, encriptado en reposo).

### "¿Y si lo rompo?"
> Lo arreglamos. Esa es la idea de la versión 1.0. Cada cosa que rompas es algo que mejoramos antes de la 1.1.

### "¿Cómo paso pacientes que ya tengo en mi otro sistema?"
> Por ahora a mano. Si te lo pide la vida, en Día 11 hacemos importador.

---

## Después de la entrega

### Día siguiente
- Pregúntale qué sintió cuando abrió la carta. Anótalo. Eso lo necesitarás para el copy de la landing pública.
- Pregúntale qué hizo primero. Eso te dice si el onboarding está calibrado o no.
- No le preguntes qué cosas mejorar. Eso sale sola en uso.

### Semana siguiente
- Si la usa: estás en algo grande
- Si no la usa: pregunta sin defensividad qué la frena. Probable: muy distinta a su flujo actual; necesita un puente

### Roadmap inmediato post-entrega
- Día 11+: RAG sobre PubMed/DermNet, integración Gamma para presentaciones, actualizaciones médicas semanales (auto-curated)
- Cuando sea hora de monetizar: trial 2 días → handoff manual a Mirai Lab (Stripe no aplica VE)

---

## Recordatorios personales (Fer-to-Fer)

- **No sobre-vendas.** El producto habla solo. Tu rol es entregar y observar.
- **No defiendas bugs.** Cada cosa que ella encuentre rota es un regalo informacional invaluable.
- **No expliques arquitectura.** A ella le importa el flujo clínico, no el stack.
- **Sí escucha.** Apunta todo lo que diga durante las primeras 2 horas — esa es la voz del usuario que vas a usar en el GTM.
