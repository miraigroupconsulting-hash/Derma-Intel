import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  analizarCasoResponseSchema,
  type AnalizarCasoResponse,
} from "../schema";
import { AnalisisIaPanel } from "../nueva/analisis-ia-panel";
import { IaPanel } from "./ia-panel";
import { SavedIaSessions } from "./saved-ia-sessions";
import { RecipeRow } from "./recipe-row";
import { parseRevisiones } from "./recipe/revisiones";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

const ESTADO_LABEL = {
  borrador: "Borrador",
  completada: "Completada",
  archivada: "Archivada",
} as const;

const FOTO_TIPO_LABEL = {
  clinica: "Foto clínica",
  dermatoscopia: "Dermatoscopia",
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConsultaDetallePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      `
      id, fecha, motivo, anamnesis, examen_fisico,
      diagnostico_diferencial, plan_terapeutico, notas_ia, estado, created_at,
      paciente:pacientes ( id, nombre, apellido, fecha_nacimiento, sexo, tipo_piel_fitzpatrick )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (!consulta) notFound();

  const paciente = consulta.paciente;

  const { data: fotos } = await supabase
    .from("fotos")
    .select("id, storage_path, tipo, zona_anatomica, fecha")
    .eq("consulta_id", id)
    .order("fecha", { ascending: true });

  // Sign URLs for the private photos so we can render <img>.
  const photoUrls: Array<{
    id: string;
    url: string | null;
    tipo: "clinica" | "dermatoscopia";
    zona: string | null;
  }> = [];
  if (fotos && fotos.length > 0) {
    for (const f of fotos) {
      const { data: signed } = await supabase.storage
        .from("fotos-consultas")
        .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SECONDS);
      photoUrls.push({
        id: f.id,
        url: signed?.signedUrl ?? null,
        tipo: f.tipo,
        zona: f.zona_anatomica,
      });
    }
  }

  const transcripcionRaw = extractTranscripcion(consulta.notas_ia);
  const analisisIa = extractAnalisisIa(consulta.notas_ia);
  const savedSessions = extractSavedSessions(consulta.notas_ia);

  // Récipes ya generados para esta consulta.
  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, medicamentos, firmado, fecha, pdf_storage_path, revisiones",
    )
    .eq("consulta_id", id)
    .order("fecha", { ascending: false });

  const recipeRows: Array<{
    id: string;
    fecha: string;
    num: number;
    firmado: boolean;
    url: string | null;
    revisiones: import("./recipe/revisiones").RevisionEntry[];
  }> = [];
  for (const r of recipes ?? []) {
    let url: string | null = null;
    if (r.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from("recetas-pdf")
        .createSignedUrl(r.pdf_storage_path, SIGNED_URL_TTL_SECONDS);
      url = signed?.signedUrl ?? null;
    }
    const meds = Array.isArray(r.medicamentos) ? r.medicamentos.length : 0;
    recipeRows.push({
      id: r.id,
      fecha: r.fecha,
      num: meds,
      firmado: r.firmado,
      url,
      revisiones: parseRevisiones(r.revisiones),
    });
  }
  const fechaConsulta = new Date(consulta.fecha);
  const fechaTexto = fechaConsulta.toLocaleString("es-VE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Caracas",
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6">
        <Link
          href={paciente ? `/pacientes/${paciente.id}` : "/dashboard"}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {paciente ? `${paciente.apellido}, ${paciente.nombre}` : "Dashboard"}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Consulta del {fechaTexto}
            </h1>
            {consulta.motivo && (
              <p className="mt-1 text-sm text-neutral-600">
                {consulta.motivo}
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              Estado: {ESTADO_LABEL[consulta.estado]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/consulta/${consulta.id}/recipe`}
              className={buttonVariants({ size: "sm" })}
            >
              📄 Récipe
            </Link>
            <Link
              href={`/consulta/nueva?paciente=${paciente?.id ?? ""}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              + Otra consulta
            </Link>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <SoapCard title="Subjetivo" text={consulta.anamnesis} />
        <SoapCard title="Objetivo" text={consulta.examen_fisico} />
        <SoapCard title="Análisis" text={consulta.diagnostico_diferencial} />
        <SoapCard title="Plan" text={consulta.plan_terapeutico} />

        {photoUrls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                Fotos ({photoUrls.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Privadas. URLs firmadas válidas por 1 hora.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photoUrls.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-neutral-200 p-2"
                  >
                    {p.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.url}
                        alt={p.zona ?? FOTO_TIPO_LABEL[p.tipo]}
                        className="aspect-square w-full rounded object-cover"
                      />
                    ) : (
                      <div className="aspect-square w-full rounded bg-neutral-100" />
                    )}
                    <p className="mt-1 text-[0.7rem] text-neutral-500">
                      {FOTO_TIPO_LABEL[p.tipo]}
                      {p.zona ? ` · ${p.zona}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {recipeRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                Récipes ({recipeRows.length})
              </CardTitle>
              <CardDescription className="text-xs">
                PDFs generados para esta consulta. Puedes desfirmar y
                re-firmar si necesitas corregir uno; el historial queda
                registrado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-neutral-200">
                {recipeRows.map((r) => (
                  <li key={r.id} className="py-3">
                    <RecipeRow
                      recipeId={r.id}
                      consultaId={consulta.id}
                      fecha={r.fecha}
                      num={r.num}
                      firmado={r.firmado}
                      url={r.url}
                      revisiones={r.revisiones}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {analisisIa && <AnalisisIaPanel data={analisisIa} />}

        <IaPanel consultaId={consulta.id} />

        {savedSessions.length > 0 && (
          <SavedIaSessions sessions={savedSessions} />
        )}

        {transcripcionRaw && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                Transcripción original del dictado
              </CardTitle>
              <CardDescription className="text-xs">
                Texto crudo capturado por el dictado, antes de estructurar.
              </CardDescription>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-neutral-700">
              {transcripcionRaw}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mt-8 text-xs text-neutral-500">
        Sugerencia de apoyo clínico. La decisión y firma corresponden al
        médico tratante.
      </p>
    </main>
  );
}

function SoapCard({
  title,
  text,
}: {
  title: string;
  text: string | null;
}) {
  if (!text || !text.trim()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-400">
          Sin información registrada.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="whitespace-pre-wrap text-sm text-neutral-700">
        {text}
      </CardContent>
    </Card>
  );
}

function extractTranscripcion(notasIa: unknown): string | null {
  if (!notasIa || typeof notasIa !== "object") return null;
  const t = (notasIa as { transcripcion_raw?: unknown }).transcripcion_raw;
  return typeof t === "string" && t.trim() ? t : null;
}

function extractAnalisisIa(notasIa: unknown): AnalizarCasoResponse | null {
  if (!notasIa || typeof notasIa !== "object") return null;
  const a = (notasIa as { analisis_ia?: unknown }).analisis_ia;
  if (!a || typeof a !== "object") return null;
  const parsed = analizarCasoResponseSchema.safeParse(a);
  return parsed.success ? parsed.data : null;
}

interface SavedSession {
  modo: string;
  modelo: string;
  fecha: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function extractSavedSessions(notasIa: unknown): SavedSession[] {
  if (!notasIa || typeof notasIa !== "object") return [];
  const raw = (notasIa as { consulta_ia?: unknown }).consulta_ia;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SavedSession => {
    if (!s || typeof s !== "object") return false;
    const obj = s as Record<string, unknown>;
    return (
      typeof obj.modo === "string" &&
      typeof obj.modelo === "string" &&
      typeof obj.fecha === "string" &&
      Array.isArray(obj.messages)
    );
  });
}
