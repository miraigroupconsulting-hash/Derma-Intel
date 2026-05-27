/**
 * scripts/seed-demo-patients.ts
 *
 * Día 8 — Seed de 5 pacientes demo con historias clínicas completas.
 *
 * Idempotente (Trap 4): solo inserta si el paciente con el apellido
 * exacto + sufijo "(Mirai Demo)" no existe. NO borra datos reales.
 *
 * Cada paciente tiene:
 *   - Demográficos completos
 *   - Antecedentes coherentes con el caso
 *   - 1-3 consultas espaciadas con SOAP realista
 *   - 1+ récipe firmado (donde aplique)
 *   - Recordatorio programado (donde aplique)
 *   - 1 sesión IA guardada en notas_ia (donde aplique)
 *
 * NO incluye fotos clínicas — la médica las agrega después con sus
 * propios casos. La estructura permite que cuando suba la primera
 * foto al paciente demo, todo funcione (galería, comparación, etc.).
 *
 * Uso:
 *   MEDICO_EMAIL=tu@email.com npx tsx scripts/seed-demo-patients.ts
 *
 * Para borrar:
 *   MEDICO_EMAIL=tu@email.com npx tsx scripts/seed-demo-patients.ts --delete
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database } from "../types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const medicoEmail = process.env.MEDICO_EMAIL;
const shouldDelete = process.argv.includes("--delete");

if (!url || !serviceKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!medicoEmail) {
  console.error("Set MEDICO_EMAIL=tu@email.com antes de correr");
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Marker para identificar pacientes demo creados por este script.
// Lo guardamos en notas. Cualquier paciente cuyas notas contengan
// este marker es candidato a --delete.
const DEMO_MARKER = "[MIRAI_DEMO_SEED_v1]";

interface ConsultaSpec {
  diasAtras: number;
  motivo: string;
  anamnesis: string;
  examen_fisico: string;
  diagnostico_diferencial: string;
  plan_terapeutico: string;
  notas_ia_extra?: Record<string, unknown>;
}

interface RecipeSpec {
  consultaIdx: number; // qué consulta del array es padre
  medicamentos: Array<{
    nombre: string;
    presentacion?: string;
    concentracion?: string;
    cantidad?: string;
    frecuencia?: string;
    duracion?: string;
    via?: string;
    zona?: string;
    es_controlado?: boolean;
    indicaciones?: string;
  }>;
  indicaciones_paciente?: string;
}

interface RecordatorioSpec {
  diasDesdeHoy: number; // negativo = pasado (vencido), positivo = futuro
  tipo: "control" | "seguimiento";
  prioridad: "baja" | "media" | "alta";
  mensaje: string;
}

interface PatientSpec {
  nombre: string;
  apellido: string;
  fecha_nacimiento: string; // YYYY-MM-DD
  sexo: "F" | "M" | "O";
  cedula: string | null;
  telefono: string;
  email: string;
  fitzpatrick: number;
  alergias: string;
  antecedentes: string;
  medicacion_actual: string;
  notas_extra: string; // será concatenado con DEMO_MARKER
  consultas: ConsultaSpec[];
  recipes?: RecipeSpec[];
  recordatorios?: RecordatorioSpec[];
}

// =====================================================================
// LOS 5 PACIENTES
// =====================================================================

const PATIENTS: PatientSpec[] = [
  // ---------- 1. MARÍA GONZÁLEZ — rosácea ----------
  {
    nombre: "María",
    apellido: "González (Demo)",
    fecha_nacimiento: "1991-03-22",
    sexo: "F",
    cedula: "V-19.234.567",
    telefono: "+58 414 555 0101",
    email: "maria.gonzalez.demo@example.com",
    fitzpatrick: 3,
    alergias: "Ninguna conocida.",
    antecedentes:
      "Rosácea papulopustulosa de inicio en la treintena. Empeora con sol, alcohol y bebidas calientes. Sin comorbilidades.",
    medicacion_actual: "Metronidazol 0.75% crema 2 v/día + Brimonidina gel 0.5% en mañanas (PRN).",
    notas_extra:
      "Paciente colaboradora, buena adherencia al tratamiento. Foto-evolución muy favorable a 8 semanas.",
    consultas: [
      {
        diasAtras: 60,
        motivo: "Consulta inicial — pápulas y eritema persistente en mejillas",
        anamnesis:
          "Refiere brote de pápulas eritematosas en mejillas desde hace 8 semanas. Empeora con sol, vino y café caliente. Sin antecedente familiar de rosácea conocida. Ya ha intentado limpiadores 'para piel sensible' sin mejoría.",
        examen_fisico:
          "Pápulas y pústulas finas en distribución malar bilateral. Eritema persistente con telangiectasias incipientes. No hay compromiso ocular aparente. Resto del examen sin hallazgos.",
        diagnostico_diferencial:
          "1. Rosácea papulopustulosa (probable)\n2. Dermatitis perioral (descartar — sin compromiso peribucal típico)\n3. Acné del adulto (descartar — sin comedones)",
        plan_terapeutico:
          "Iniciar metronidazol crema 0.75% 2 veces al día por 8 semanas. Fotoprotector SPF 50+ uso diario. Limpiador suave sin sulfatos. Evitar irritantes (alcohol tópico, exfoliantes). Educar sobre triggers. Control en 8 semanas con foto-evolución.",
      },
      {
        diasAtras: 30,
        motivo: "Control intermedio — evolución del tratamiento",
        anamnesis:
          "Mejoría parcial. Refiere reducción de pápulas pero persiste el eritema basal. Tolera bien el tratamiento. Adherente al fotoprotector.",
        examen_fisico:
          "Disminución de pápulas inflamatorias en ~60%. Persiste eritema malar. Sin pústulas activas.",
        diagnostico_diferencial: "Rosácea papulopustulosa — respuesta parcial favorable",
        plan_terapeutico:
          "Continuar metronidazol crema. Agregar brimonidina gel 0.5% en mañanas para el eritema (PRN, máx 1 v/día). Reforzar fotoprotección. Control en 4 semanas.",
      },
      {
        diasAtras: 7,
        motivo: "Control de evolución a 8 semanas",
        anamnesis:
          "Muy satisfecha. Refiere mejoría sostenida. Cumple con el tratamiento. La brimonidina la usa solo en eventos sociales.",
        examen_fisico:
          "Resolución casi completa de lesiones papulopustulosas. Eritema basal significativamente reducido. Telangiectasias residuales evidentes.",
        diagnostico_diferencial: "Rosácea papulopustulosa — buena respuesta al tratamiento",
        plan_terapeutico:
          "Mantener metronidazol como tratamiento de mantenimiento. Considerar IPL para telangiectasias en visita futura. Control en 12 semanas si estable.",
        notas_ia_extra: {
          consulta_ia: [
            {
              modo: "terapeutica",
              modelo: "claude-sonnet-4-5-20251101",
              fecha: new Date().toISOString(),
              messages: [
                {
                  role: "user",
                  content:
                    "Paciente con rosácea papulopustulosa. Buena respuesta a metronidazol tópico + brimonidina PRN. ¿Recomendaciones de mantenimiento?",
                },
                {
                  role: "assistant",
                  content:
                    "Para mantenimiento en rosácea papulopustulosa con buena respuesta:\n\n**Mantenimiento tópico:**\n- Metronidazol 0.75% crema o ácido azelaico 15% gel: 1 vez al día (rotación opcional)\n- Brimonidina solo para eventos sociales o cuando el eritema es perceptible (riesgo de rebote con uso diario)\n\n**Educación al paciente:**\n- Identificar y evitar triggers personales (registro útil 2-4 semanas)\n- Fotoprotección SPF 50+ diaria, no negociable\n- Cosméticos sin alcohol, sin fragancia\n- Limpieza con productos sin sulfatos\n\n**Seguimiento:**\n- Control en 12 semanas\n- IPL/láser vascular puede considerarse para telangiectasias residuales si afectan calidad de vida\n\n*Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante.*",
                },
              ],
            },
          ],
        },
      },
    ],
    recipes: [
      {
        consultaIdx: 0,
        medicamentos: [
          {
            nombre: "Metronidazol",
            presentacion: "Crema",
            concentracion: "0.75%",
            cantidad: "1 tubo de 30g",
            frecuencia: "2 veces al día",
            duracion: "8 semanas",
            via: "Tópica",
            zona: "Mejillas, evitando ojos",
            indicaciones:
              "Aplicar capa fina, suavemente. Lavarse las manos después.",
          },
        ],
        indicaciones_paciente:
          "Fotoprotector SPF 50+ uso diario. Evitar alcohol tópico y exfoliantes. Identificar triggers personales (sol, alcohol, picante, calor).",
      },
    ],
    recordatorios: [
      {
        diasDesdeHoy: 14,
        tipo: "control",
        prioridad: "media",
        mensaje: "Control rutinario de rosácea — evaluar mantenimiento.",
      },
    ],
  },

  // ---------- 2. CARLOS PÉREZ — acné severo con isotretinoína ----------
  {
    nombre: "Carlos",
    apellido: "Pérez (Demo)",
    fecha_nacimiento: "2007-08-15",
    sexo: "M",
    cedula: "V-31.456.789",
    telefono: "+58 412 555 0202",
    email: "carlos.perez.demo@example.com",
    fitzpatrick: 3,
    alergias: "Ninguna conocida.",
    antecedentes:
      "Acné nodulocístico severo de 18 meses de evolución. Tratamientos previos: doxiciclina 100mg/día por 4 meses (respuesta parcial); peróxido de benzoilo 5% + adapalene 0.1% (mejoría leve). Padre con antecedente de acné severo en adolescencia.",
    medicacion_actual:
      "Isotretinoína 40 mg/día (mes 3 de tratamiento). Hidratante labial intensivo.",
    notas_extra:
      "PACIENTE CRÍTICO: bajo isotretinoína oral. Requiere control mensual obligatorio con laboratorio (perfil hepático + lipídico) + foto-evolución + reforzar contracepción si aplica. Dosis acumulada actual ≈ 120 mg/kg (objetivo 120-150 mg/kg).",
    consultas: [
      {
        diasAtras: 90,
        motivo: "Consulta inicial — acné nodulocístico severo",
        anamnesis:
          "Adolescente con acné severo de 18 meses, refractario a tratamientos tópicos y a doxiciclina por 4 meses. Lesiones nodulares dolorosas en mejillas, mandíbula y espalda alta. Impacto psicológico importante referido. Sin contraindicaciones para isotretinoína oral. Educado sobre teratogenicidad y efectos adversos.",
        examen_fisico:
          "Múltiples nódulos eritematosos y quistes en mejillas, mandíbula bilateral. Pústulas confluentes en frente. Comedones cerrados y abiertos en zona T. Cicatrices atróficas tempranas. Espalda alta con compromiso similar.",
        diagnostico_diferencial:
          "Acné nodulocístico severo (Grado IV)",
        plan_terapeutico:
          "Iniciar isotretinoína 0.5 mg/kg/día (40 mg/día para peso 80 kg). Solicitar perfil hepático + lipídico basal + beta-hCG si aplica. Educar sobre fotosensibilidad, queilitis, xerosis. Control mensual obligatorio con laboratorio. Hidratante labial intensivo en ml. Fotoprotector. Objetivo dosis acumulada: 120-150 mg/kg.",
      },
      {
        diasAtras: 60,
        motivo: "Control mes 1 — isotretinoína",
        anamnesis:
          "Tolera el tratamiento. Queilitis moderada, xerosis facial leve. No reporta cefalea, mialgia ni síntomas digestivos.",
        examen_fisico:
          "Reducción ~40% de lesiones inflamatorias. Persistencia de algunos nódulos. Queilitis moderada en labios.",
        diagnostico_diferencial: "Acné nodulocístico — respuesta inicial favorable a isotretinoína",
        plan_terapeutico:
          "Mantener isotretinoína 40 mg/día. Repetir laboratorio (perfil hepático + lipídico) — todos dentro de rango. Continuar hidratante labial intensivo. Próximo control en 30 días con nuevo laboratorio.",
      },
      {
        diasAtras: 30,
        motivo: "Control mes 2 — isotretinoína",
        anamnesis:
          "Muy satisfecho con la evolución. Queilitis controlada con uso continuo de protector labial. Sin otros efectos adversos.",
        examen_fisico:
          "Reducción ~75% de lesiones. Sin nódulos activos nuevos. Eritema y descamación leve facial.",
        diagnostico_diferencial: "Acné nodulocístico — excelente respuesta",
        plan_terapeutico:
          "Mantener isotretinoína 40 mg/día. Laboratorio: transaminasas y triglicéridos discretamente elevados pero dentro de rango aceptable. Continuar 3 meses más para completar dosis acumulada objetivo. Control mensual no negociable.",
      },
    ],
    recipes: [
      {
        consultaIdx: 0,
        medicamentos: [
          {
            nombre: "Isotretinoína",
            presentacion: "Cápsulas",
            concentracion: "20 mg",
            cantidad: "2 cápsulas/día (60 cápsulas para el mes)",
            frecuencia: "40 mg cada día con la cena",
            duracion: "30 días, controlado mensual",
            via: "Oral",
            es_controlado: true,
            indicaciones:
              "Tomar con comida grasa para mejor absorción. NO donar sangre durante el tratamiento ni 30 días después. Fotoprotección obligatoria. Si es mujer en edad fértil: anticoncepción obligatoria.",
          },
        ],
        indicaciones_paciente:
          "Hidratante labial intensivo en mochila para uso continuo. Hidratante facial sin fragancia. NO depilación con cera, peelings ni dermoabrasión durante el tratamiento ni 6 meses después. Control mensual obligatorio con nosotros + laboratorio.",
      },
    ],
    recordatorios: [
      {
        diasDesdeHoy: 5,
        tipo: "control",
        prioridad: "alta",
        mensaje:
          "CONTROL MENSUAL ISOTRETINOÍNA — laboratorio (perfil hepático + lipídico) + evaluación clínica + foto-evolución. NO PUEDE FALTAR.",
      },
    ],
  },

  // ---------- 3. ROSA SÁNCHEZ — queratosis actínicas ----------
  {
    nombre: "Rosa",
    apellido: "Sánchez (Demo)",
    fecha_nacimiento: "1973-11-08",
    sexo: "F",
    cedula: "V-12.345.678",
    telefono: "+58 416 555 0303",
    email: "rosa.sanchez.demo@example.com",
    fitzpatrick: 2,
    alergias: "Penicilina (rash).",
    antecedentes:
      "Trabajó al aire libre durante 25 años. Múltiples episodios de quemaduras solares en juventud. Carcinoma basocelular previo en mejilla derecha (escisión hace 4 años, sin recidiva). Familiar de primer grado con melanoma.",
    medicacion_actual: "Imiquimod 5% crema (en pauta de tratamiento, mes 2 de 3).",
    notas_extra:
      "Sospecha de campo de cancerización en cara y dorso de manos. Caso evaluado con Modo Caso Clínico de la IA. Plan: imiquimod tópico + seguimiento estricto + dermatoscopia 6-monthly.",
    consultas: [
      {
        diasAtras: 45,
        motivo: "Lesiones queratósicas múltiples en cara y manos",
        anamnesis:
          "Refiere aparición progresiva de lesiones ásperas, color piel a rojizas, no dolorosas, en cara y dorso de manos. Algunas sangran con el roce. Sin lesiones que cambien rápidamente. Antecedente de carcinoma basocelular previo.",
        examen_fisico:
          "Dorso de manos: múltiples pápulas hiperqueratósicas color rosa-rojizo, sobre fondo de piel fotodañada con telangiectasias. Cara: pápulas similares en frente, sienes y mejillas, total ~15-20 lesiones contables. Dermatoscopia: vasos en fresa, escamas blanquecinas, pseudored vascular típica. Sin lesiones sospechosas de carcinoma escamocelular invasor en este momento.",
        diagnostico_diferencial:
          "1. Queratosis actínicas múltiples (campo de cancerización confirmado)\n2. Carcinoma escamocelular in situ (descartar por dermatoscopia + clínica)\n3. Queratosis seborreicas (algunas lesiones discutibles)",
        plan_terapeutico:
          "Tratamiento de campo: imiquimod 5% crema 3 veces por semana por 4 semanas en una zona, descanso, luego repetir en zona contigua. Total: 3 ciclos cubriendo cara + dorso de manos. Educación sobre reacción inflamatoria esperada. Foto-protección estricta SPF 50+, sombrero. Dermatoscopia digital de seguimiento. Próximo control en 8 semanas.",
        notas_ia_extra: {
          consulta_ia: [
            {
              modo: "caso_clinico",
              modelo: "claude-sonnet-4-5-20251101",
              fecha: new Date().toISOString(),
              messages: [
                {
                  role: "user",
                  content:
                    "Mujer 52a, fototipo II, antecedente CBC. Múltiples queratosis actínicas en cara y manos. Diagnósticos diferenciales y opciones de tratamiento.",
                },
                {
                  role: "assistant",
                  content:
                    "**Cuadro clínico clásico de campo de cancerización solar.**\n\n**Diagnósticos diferenciales:**\n\n1. **Queratosis actínicas múltiples** (más probable). Hiperqueratosis sobre piel fotodañada en zonas expuestas crónicamente. Riesgo de progresión a SCC ~0.1% por año por lesión.\n\n2. **Carcinoma escamocelular in situ (Enfermedad de Bowen)**. Diferenciar por: tamaño > 1 cm, induración, crecimiento rápido, sangrado espontáneo. Dermatoscopia ayuda.\n\n3. **Queratosis seborreicas**. Bordes bien definidos, aspecto 'pegado'. No suelen estar en zonas fotoexpuestas exclusivamente.\n\n**Opciones de tratamiento de campo:**\n\n- **Imiquimod 5%**: tratamiento de elección para zonas extensas. Aplicación 3 v/sem por 4 semanas. Reacción inflamatoria esperada y necesaria. Buen perfil cosmético.\n- **5-fluorouracilo 5%**: alternativa, ciclos de 2-4 semanas. Más irritante.\n- **Ingenol mebutato**: ya retirado de muchos mercados.\n- **Diclofenaco 3%**: opción más suave, ciclos largos.\n- **Crioterapia**: solo para lesiones individuales visibles, no trata el campo.\n- **Terapia fotodinámica**: excelente cosmesis, requiere equipo.\n\n**Recomendaciones generales:**\n- Foto-protección estricta de por vida\n- Dermatoscopia digital de seguimiento\n- Considerar nicotinamida 500 mg 2 v/día (evidencia ONTRAC trial)\n- Vigilancia anual estricta dado antecedente de CBC\n\n*Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante.*",
                },
              ],
            },
          ],
        },
      },
      {
        diasAtras: 21,
        motivo: "Control de tratamiento con imiquimod — semana 4",
        anamnesis:
          "Refiere reacción inflamatoria intensa en zona de aplicación (frente, sienes), como esperado. Tolera la incomodidad. Adherente al esquema.",
        examen_fisico:
          "Eritema y erosiones superficiales en zonas tratadas con imiquimod. Costras melicéricas en algunas lesiones. Reacción inflamatoria adecuada al tratamiento.",
        diagnostico_diferencial:
          "Queratosis actínicas — reacción inflamatoria al imiquimod (esperada)",
        plan_terapeutico:
          "Completar 1 semana más de aplicación. Iniciar fase de descanso por 3 semanas con cuidados (hidratación, fotoprotección). Re-evaluar para iniciar ciclo en dorso de manos. Control en 3 semanas.",
      },
    ],
    recipes: [
      {
        consultaIdx: 0,
        medicamentos: [
          {
            nombre: "Imiquimod",
            presentacion: "Crema",
            concentracion: "5%",
            cantidad: "Sobres unidosis x 12",
            frecuencia: "3 veces por semana (Lu-Mi-Vi)",
            duracion: "4 semanas, luego pausa 3 semanas",
            via: "Tópica",
            zona: "Cara — frente y sienes en este ciclo",
            indicaciones:
              "Aplicar antes de dormir, capa fina, sin masaje. Lavarse las manos. Retirar al despertar. La reacción inflamatoria es necesaria — no suspender salvo dolor extremo.",
          },
        ],
        indicaciones_paciente:
          "Hidratante simple sin activos. Fotoprotección SPF 50+ y sombrero obligatorios. Documentar evolución con fotos diarias (las suyas, en su teléfono).",
      },
    ],
    recordatorios: [
      {
        diasDesdeHoy: 21,
        tipo: "control",
        prioridad: "media",
        mensaje:
          "Control post-tratamiento de QA con imiquimod. Evaluar resultado del primer ciclo, planear segundo ciclo en dorso de manos.",
      },
    ],
  },

  // ---------- 4. DIEGO MARTÍN — pediátrico, dermatitis atópica ----------
  {
    nombre: "Diego",
    apellido: "Martín (Demo)",
    fecha_nacimiento: "2018-05-12",
    sexo: "M",
    cedula: null,
    telefono: "+58 426 555 0404",
    email: "padres.diego.demo@example.com",
    fitzpatrick: 3,
    alergias: "Refieren posible sensibilidad a fragancias en cremas.",
    antecedentes:
      "Dermatitis atópica desde los 6 meses. Madre con rinitis alérgica, padre sin antecedentes. Sin asma. Brotes principalmente en pliegues. Cumple esquema de vacunación.",
    medicacion_actual:
      "Tacrolimus 0.03% pomada en pliegues durante brotes. Emoliente base diaria.",
    notas_extra:
      "PEDIÁTRICO. Madre como informante principal. Educación a la familia sobre cuidado básico y manejo de brotes. Hidratación intensiva + evitar irritantes. Tacrolimus tópico de segunda línea.",
    consultas: [
      {
        diasAtras: 14,
        motivo: "Brote de dermatitis atópica — primera consulta con nosotros",
        anamnesis:
          "Madre refiere brote desde hace 10 días en flexuras (codos, fosas poplíteas) y cuello. Prurito intenso, especialmente nocturno, que afecta el sueño del niño. Ha usado hidratantes 'que recomendó la farmacia' sin mejoría. Ya tratado previamente con corticoide tópico (no recuerda nombre) con buena respuesta.",
        examen_fisico:
          "Eccema agudo-subagudo en flexuras de codos y fosas poplíteas: eritema, descamación, excoriaciones por rascado. Cuello con compromiso leve. Piel xerótica generalizada. Sin lesiones sobre-infectadas. Resto del examen sin hallazgos.",
        diagnostico_diferencial:
          "1. Dermatitis atópica — brote moderado (probable)\n2. Dermatitis de contacto (descartar por distribución típica)",
        plan_terapeutico:
          "Tacrolimus 0.03% pomada en pliegues afectados 2 v/día por 7-14 días o hasta resolución. Emoliente sin fragancia varias veces al día, especialmente después del baño con piel aún húmeda. Baños cortos (5-10 min), agua tibia, jabón syndet. Ropa de algodón, evitar lana directa. Cortar uñas cortas para minimizar excoriaciones. Educación a los padres. Control en 6 semanas.",
      },
    ],
    recipes: [
      {
        consultaIdx: 0,
        medicamentos: [
          {
            nombre: "Tacrolimus",
            presentacion: "Pomada",
            concentracion: "0.03% (presentación pediátrica)",
            cantidad: "1 tubo de 30g",
            frecuencia: "2 veces al día",
            duracion: "7-14 días o hasta resolución del brote",
            via: "Tópica",
            zona: "Pliegues afectados — codos, rodillas, cuello",
            indicaciones:
              "Aplicar capa muy fina, frotar suavemente. No usar oclusión. Evitar exposición solar de la zona tratada (puede causar fotosensibilidad transitoria).",
          },
        ],
        indicaciones_paciente:
          "PARA LOS PADRES:\n• Emoliente sin fragancia 2-3 veces al día (después del baño con piel húmeda).\n• Baños cortos, agua tibia, syndet pediátrico.\n• Ropa 100% algodón.\n• Uñas muy cortas + manoplas en la noche si rasca.\n• Volver antes si: sobre-infección (pus, costras melicéricas) o sin mejoría en 7 días.",
      },
    ],
    recordatorios: [
      {
        diasDesdeHoy: 42,
        tipo: "control",
        prioridad: "media",
        mensaje: "Control DA Diego. Evaluar respuesta + considerar mantenimiento con tacrolimus 2 v/sem.",
      },
    ],
  },

  // ---------- 5. LUISA RODRÍGUEZ — melasma ----------
  {
    nombre: "Luisa",
    apellido: "Rodríguez (Demo)",
    fecha_nacimiento: "1984-09-30",
    sexo: "F",
    cedula: "V-15.678.901",
    telefono: "+58 414 555 0505",
    email: "luisa.rodriguez.demo@example.com",
    fitzpatrick: 4,
    alergias: "Ninguna conocida.",
    antecedentes:
      "Melasma de 8 años de evolución, peor durante embarazos (G2P2). Tratamientos previos: hidroquinona 2% sola (mejoría parcial); ácido glicólico en consultorio (mejoría leve). No usa anticonceptivos hormonales actualmente.",
    medicacion_actual:
      "Hidroquinona 4% + tretinoína 0.025% (mezcla magistral) nocturna + fotoprotector con filtro físico durante el día.",
    notas_extra:
      "Melasma resistente. Caso evaluado con Modo Bibliografía para revisar evidencia reciente. Plan combinado iniciado con expectativa realista de mejoría — no resolución total. Mantenimiento estricto con fotoprotección.",
    consultas: [
      {
        diasAtras: 45,
        motivo: "Melasma resistente a tratamientos previos",
        anamnesis:
          "Refiere manchas en mejillas, frente y labio superior desde el primer embarazo (8 años). Empeora con exposición solar, mejora levemente en invierno. Ha intentado múltiples cremas con resultados parciales. Buscaba opciones más efectivas. Sin anticoncepción hormonal actual.",
        examen_fisico:
          "Hiperpigmentación simétrica color marrón claro-medio en distribución malar bilateral, frente y labio superior. Patrón mixto (epidérmico + dérmico estimado clínicamente). Wood's: zonas con realce y zonas sin realce — confirma componente mixto. Resto del examen sin hallazgos.",
        diagnostico_diferencial:
          "1. Melasma mixto (epidérmico + dérmico) — diagnóstico clínico\n2. Hiperpigmentación post-inflamatoria (descartado por distribución típica)\n3. Nevo de Hori (descartado — distribución diferente)",
        plan_terapeutico:
          "Fórmula magistral nocturna: hidroquinona 4% + tretinoína 0.025% + (opcional) hidrocortisona 1% para tolerancia inicial. Aplicar en zonas afectadas, evitar contorno de ojos. Fotoprotección con filtro físico (óxido de zinc + dióxido de titanio) cada 2 horas con re-aplicación si está al sol. Tranexámico oral 500 mg 2 v/día como adyuvante (off-label, evidencia creciente). Control en 8 semanas con foto-evolución estandarizada.",
        notas_ia_extra: {
          consulta_ia: [
            {
              modo: "bibliografia",
              modelo: "claude-sonnet-4-5-20251101",
              fecha: new Date().toISOString(),
              messages: [
                {
                  role: "user",
                  content:
                    "Evidencia actual para tratamiento de melasma resistente. ¿Tranexámico oral seguro? ¿Combinaciones más efectivas?",
                },
                {
                  role: "assistant",
                  content:
                    "**Evidencia 2023-2025 en melasma:**\n\n**Tranexámico oral:**\n- Múltiples ensayos clínicos randomizados muestran eficacia significativa (Lee et al. 2016; Karn et al. 2012; ensayos coreanos recientes).\n- Dosis típica: 250-500 mg 2 v/día por 3-6 meses.\n- Mecanismo: inhibe la activación del plasminógeno → reduce inflamación y melanogénesis estimulada por UV.\n- Perfil de seguridad bueno en pacientes sin factores de riesgo trombótico. Screening: antecedente de TVP/TEP, anticonceptivos hormonales, tabaquismo activo, trastornos de coagulación.\n- Efectos adversos comunes: molestias gastrointestinales leves, oligomenorrea.\n\n**Triple combinación tópica (fórmula Kligman modificada):**\n- Hidroquinona 4% + tretinoína 0.025-0.05% + corticoide leve (hidrocortisona 1%) o sin él.\n- Estándar de oro tópico actualmente.\n- Uso nocturno por 8-12 semanas, luego mantenimiento.\n\n**Procedimientos coadyuvantes:**\n- Peelings de ácido glicólico, mandélico, kójico, fítico: útiles como adyuvantes.\n- Microneedling con tranexámico tópico: evidencia creciente.\n- Láser Q-switched Nd:YAG de baja fluencia: con cuidado, riesgo de hiperpigmentación rebote.\n\n**Lo NO recomendado:**\n- Hidroquinona >4% por períodos prolongados (ocronosis exógena).\n- Láser ablativo agresivo en fototipos altos (rebote).\n\n**Clave**: el éxito depende 80% de fotoprotección estricta + manejo de expectativas. La paciente debe entender que es una condición CRÓNICA con manejo, no curación.\n\n*Sugerencia de apoyo clínico. La decisión y firma corresponden al médico tratante.*",
                },
              ],
            },
          ],
        },
      },
    ],
    recipes: [
      {
        consultaIdx: 0,
        medicamentos: [
          {
            nombre: "Hidroquinona + Tretinoína",
            presentacion: "Crema (fórmula magistral)",
            concentracion: "Hidroquinona 4% + Tretinoína 0.025%",
            cantidad: "30 g",
            frecuencia: "1 vez al día (noche)",
            duracion: "12 semanas, luego re-evaluar",
            via: "Tópica",
            zona: "Áreas hiperpigmentadas — evitar contorno de ojos y boca",
            indicaciones:
              "Aplicar capa fina solo en zonas afectadas. NO en piel sana — puede generar hipopigmentación. Si hay irritación significativa, pausar 2-3 noches y reintentar.",
          },
          {
            nombre: "Ácido tranexámico",
            presentacion: "Tabletas",
            concentracion: "500 mg",
            cantidad: "60 tabletas (mes)",
            frecuencia: "1 tableta cada 12 horas (250 mg = ½ tableta)",
            duracion: "3 meses",
            via: "Oral",
            indicaciones:
              "Tomar con comidas. Suspender si dolor de piernas o cualquier signo de TVP — consulta inmediata.",
          },
        ],
        indicaciones_paciente:
          "Fotoprotección con filtro físico (óxido de zinc + dióxido de titanio), SPF 50+, re-aplicar cada 2 horas. Sombrero de ala ancha + lentes oscuros en exteriores. Documentar la evolución con fotos quincenales (con la misma luz, mismo ángulo).",
      },
    ],
    recordatorios: [
      {
        diasDesdeHoy: 11,
        tipo: "control",
        prioridad: "media",
        mensaje:
          "Control 8 semanas tratamiento melasma. Foto-evolución estandarizada + tolerancia al tranexámico.",
      },
    ],
  },
];

// =====================================================================
// SEED EXECUTION
// =====================================================================

async function findMedico() {
  const { data } = await supabase
    .from("medicos")
    .select("id, email, zona_horaria")
    .eq("email", medicoEmail!)
    .maybeSingle();
  if (!data) throw new Error(`Médico no encontrado para email=${medicoEmail}`);
  return data;
}

function daysAgoIso(d: number, hour = 9): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - d);
  // 09:00 Caracas = 13:00 UTC
  date.setUTCHours(hour + 4, 0, 0, 0);
  return date.toISOString();
}

function daysAheadIso(d: number, hour = 9): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + d);
  date.setUTCHours(hour + 4, 0, 0, 0);
  return date.toISOString();
}

async function deleteAll() {
  const medico = await findMedico();
  // Idempotente: solo borra pacientes con el DEMO_MARKER en notas
  const { data: pacientes } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido, notas")
    .eq("medico_id", medico.id);
  const aBorrar = (pacientes ?? []).filter((p) =>
    (p.notas ?? "").includes(DEMO_MARKER),
  );
  if (aBorrar.length === 0) {
    console.log("No hay pacientes demo para borrar.");
    return;
  }
  for (const p of aBorrar) {
    await supabase.from("pacientes").delete().eq("id", p.id);
    console.log(`✓ Borrado: ${p.nombre} ${p.apellido}`);
  }
}

async function seedAll() {
  const medico = await findMedico();
  console.log(`Médico: ${medico.email}`);
  console.log(`Pacientes a sembrar: ${PATIENTS.length}`);
  console.log("");

  for (const spec of PATIENTS) {
    // Idempotente: skip si ya existe con (nombre+apellido) exactos.
    const { data: existing } = await supabase
      .from("pacientes")
      .select("id, notas")
      .eq("medico_id", medico.id)
      .eq("nombre", spec.nombre)
      .eq("apellido", spec.apellido)
      .maybeSingle();

    if (existing) {
      const isDemo = (existing.notas ?? "").includes(DEMO_MARKER);
      console.log(
        `↻ "${spec.nombre} ${spec.apellido}" ya existe (${
          isDemo ? "demo previo" : "datos reales — NO toco"
        }). Skip.`,
      );
      continue;
    }

    const notas = `${spec.notas_extra}\n\n${DEMO_MARKER}`;

    const { data: paciente, error: pErr } = await supabase
      .from("pacientes")
      .insert({
        medico_id: medico.id,
        nombre: spec.nombre,
        apellido: spec.apellido,
        fecha_nacimiento: spec.fecha_nacimiento,
        sexo: spec.sexo,
        cedula: spec.cedula,
        telefono: spec.telefono,
        email: spec.email,
        tipo_piel_fitzpatrick: spec.fitzpatrick,
        alergias: spec.alergias,
        antecedentes: spec.antecedentes,
        medicacion_actual: spec.medicacion_actual,
        notas,
      })
      .select("id")
      .single();
    if (pErr || !paciente) {
      console.error(`✗ Insert paciente "${spec.apellido}" falló: ${pErr?.message}`);
      continue;
    }

    // Consultas
    const consultaIds: string[] = [];
    for (const c of spec.consultas) {
      const { data: consulta, error: cErr } = await supabase
        .from("consultas")
        .insert({
          paciente_id: paciente.id,
          medico_id: medico.id,
          fecha: daysAgoIso(c.diasAtras),
          motivo: c.motivo,
          anamnesis: c.anamnesis,
          examen_fisico: c.examen_fisico,
          diagnostico_diferencial: c.diagnostico_diferencial,
          plan_terapeutico: c.plan_terapeutico,
          estado: "completada",
          notas_ia: (c.notas_ia_extra ?? null) as never,
        })
        .select("id")
        .single();
      if (cErr || !consulta) {
        console.error(`  ✗ consulta falló: ${cErr?.message}`);
        continue;
      }
      consultaIds.push(consulta.id);
    }

    // Récipes
    for (const r of spec.recipes ?? []) {
      const targetConsultaId = consultaIds[r.consultaIdx];
      if (!targetConsultaId) continue;
      const recipeFechaIso = daysAgoIso(
        spec.consultas[r.consultaIdx]?.diasAtras ?? 30,
        10,
      );
      const { error: rErr } = await supabase.from("recipes").insert({
        consulta_id: targetConsultaId,
        paciente_id: paciente.id,
        medico_id: medico.id,
        medicamentos: r.medicamentos.map((m) => ({
          nombre: m.nombre,
          presentacion: m.presentacion ?? null,
          concentracion: m.concentracion ?? null,
          cantidad: m.cantidad ?? null,
          frecuencia: m.frecuencia ?? null,
          duracion: m.duracion ?? null,
          via: m.via ?? null,
          zona: m.zona ?? null,
          es_controlado: m.es_controlado ?? false,
          dosis: null,
          indicaciones: m.indicaciones ?? null,
        })),
        indicaciones_paciente: r.indicaciones_paciente ?? null,
        fecha: recipeFechaIso,
        firmado: true,
        firmado_at: recipeFechaIso,
        pdf_storage_path: null, // PDF no generado en el seed
        revisiones: [
          {
            accion: "firmado",
            fecha: recipeFechaIso,
            pdf_storage_path: null,
          },
        ],
      });
      if (rErr) console.error(`  ✗ recipe falló: ${rErr.message}`);
    }

    // Recordatorios
    for (const rec of spec.recordatorios ?? []) {
      await supabase
        .from("recordatorios")
        .delete()
        .eq("paciente_id", paciente.id)
        .eq("tipo", rec.tipo)
        .eq("estado", "pendiente");
      const { error: recErr } = await supabase.from("recordatorios").insert({
        paciente_id: paciente.id,
        medico_id: medico.id,
        tipo: rec.tipo,
        prioridad: rec.prioridad,
        auto_generado: false,
        fecha_objetivo: daysAheadIso(rec.diasDesdeHoy),
        mensaje: rec.mensaje,
      });
      if (recErr) console.error(`  ✗ recordatorio falló: ${recErr.message}`);
    }

    console.log(
      `✓ ${spec.nombre} ${spec.apellido}: ${spec.consultas.length} consultas, ${spec.recipes?.length ?? 0} récipes, ${spec.recordatorios?.length ?? 0} recordatorios`,
    );
  }

  console.log("");
  console.log("─────────────────────────────────────────────────────────");
  console.log("✓ Seed completo.");
  console.log("");
  console.log("Para validar:");
  console.log("  → /pacientes  (5 pacientes nuevos con sufijo '(Demo)')");
  console.log("  → /dashboard  (alertas de Carlos isotretinoína + María rosácea)");
  console.log(
    "  → /api/cron/evaluar-alertas  (con CRON_SECRET) genera notificaciones",
  );
  console.log("");
  console.log("Para borrar todos los demo:");
  console.log("  npx tsx scripts/seed-demo-patients.ts --delete");
  console.log("─────────────────────────────────────────────────────────");
}

(async () => {
  if (shouldDelete) await deleteAll();
  else await seedAll();
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
