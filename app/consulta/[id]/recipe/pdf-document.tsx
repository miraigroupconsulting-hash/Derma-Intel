"use client";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Medicamento } from "./schema";

/**
 * Récipe PDF — versión Día 5.
 *
 * Cambios sobre la versión Día 4:
 *   - Header en Times-Roman (serif) para tono médico tradicional.
 *   - Marca central "Rp/" como en récipes manuscritos venezolanos.
 *   - Numerado con notación "#N (cantidad)" y "S/ indicaciones".
 *   - Badge "[!] Controlado" al lado de medicamentos marcados así.
 *     (Sin emoji: react-pdf usa fuentes WinAnsi-1252 que no cubren
 *     glyphs como U+26A0. Mantener todo el texto del PDF en Latin-1.)
 *   - Línea de acento azul-médico debajo del header.
 *   - Soporta los campos nuevos del schema (concentración, cantidad,
 *     frecuencia, zona) y los muestra como una línea estructurada,
 *     manteniendo backward compat con récipes viejos que solo tienen
 *     `dosis` + `indicaciones`.
 */

const ACCENT_BLUE = "#1d4ed8";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#171717",
  },

  // -------- Header --------
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  headerText: { flex: 1, paddingRight: 12 },
  headerLogo: { width: 78, height: 78, objectFit: "contain" },
  medicoNombre: {
    fontSize: 16,
    fontFamily: "Times-Roman",
    fontWeight: 700,
    color: ACCENT_BLUE,
  },
  medicoEspecialidad: {
    fontSize: 10,
    fontFamily: "Times-Roman",
    color: "#525252",
    marginTop: 2,
  },
  medicoLinea: { fontSize: 9, color: "#525252", marginTop: 6 },
  medicoDireccion: { fontSize: 9, color: "#525252", marginTop: 2 },

  accentBar: {
    height: 2,
    backgroundColor: ACCENT_BLUE,
    marginBottom: 12,
  },

  // -------- Patient meta --------
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  metaBlock: { flexDirection: "column" },
  metaLabel: {
    fontSize: 8,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: { fontSize: 11, fontWeight: 700, marginTop: 1 },
  metaSubValue: { fontSize: 10, color: "#525252", marginTop: 1 },

  // -------- Rp/ central mark --------
  rpMark: {
    fontSize: 28,
    fontFamily: "Times-Roman",
    textAlign: "center",
    marginVertical: 10,
    color: ACCENT_BLUE,
    letterSpacing: 2,
  },

  // -------- Medicamento item --------
  medItem: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d4d4",
  },
  medHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  medNombre: {
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "Times-Roman",
    flex: 1,
    paddingRight: 6,
  },
  controladoBadge: {
    fontSize: 8,
    color: "#9a3412",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#f59e0b",
  },
  medQty: { fontSize: 10, color: "#525252", marginTop: 2 },
  medFreq: { fontSize: 10, color: "#1f2937", marginTop: 2 },
  medSig: { fontSize: 10, marginTop: 3, color: "#171717" },

  // -------- Indicaciones generales --------
  indicacionesBlock: {
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#d4d4d4",
  },
  indicacionesLabel: {
    fontSize: 9,
    color: "#525252",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  indicacionesText: { fontSize: 10, lineHeight: 1.4 },

  // -------- Firma --------
  firmaBlock: {
    marginTop: 36,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  firmaBox: { width: 220, alignItems: "center" },
  firmaImage: { width: 200, height: 60, objectFit: "contain", marginBottom: 4 },
  firmaLine: {
    borderTopWidth: 1,
    borderTopColor: "#171717",
    width: 220,
    paddingTop: 4,
  },
  firmaLabel: { fontSize: 9, color: "#525252", textAlign: "center" },

  // -------- Footer --------
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#d4d4d4",
    paddingTop: 6,
    textAlign: "center",
    fontSize: 8,
    color: "#737373",
  },
});

export interface RecipePdfMedico {
  nombre: string | null;
  apellido: string | null;
  especialidad: string | null;
  cedula_profesional: string | null;
  pais_cedula: string | null;
  telefono: string | null;
  direccion: string | null;
  logoUrl: string | null;
  firmaUrl: string | null;
}

export interface RecipePdfPaciente {
  nombre: string;
  apellido: string;
  edad: number | null;
  cedula: string | null;
  /** Not rendered in the PDF — kept here so the form can build a
   *  wa.me link without a separate prop. */
  telefono: string | null;
}

export interface RecipePdfProps {
  medico: RecipePdfMedico;
  paciente: RecipePdfPaciente;
  medicamentos: Medicamento[];
  indicaciones_paciente?: string | null;
  fecha: Date;
  consultaId: string;
}

function formatFecha(d: Date): string {
  return d.toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Caracas",
  });
}

/**
 * Build the "frecuencia + duración + vía + zona" line. Joins only
 * present pieces with bullets so old récipes (Día-4 schema with only
 * "dosis" filled) keep rendering cleanly.
 */
function buildFrecuenciaLine(m: Medicamento): string {
  const parts = [
    m.frecuencia ?? null,
    m.duracion ?? null,
    m.via ?? null,
    m.zona ? `Zona: ${m.zona}` : null,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  if (parts.length > 0) return parts.join(" · ");
  return m.dosis ?? "";
}

function buildCantidadLine(m: Medicamento): string {
  if (m.cantidad && m.cantidad.trim().length > 0) return `# ${m.cantidad}`;
  return "";
}

function buildNombreLine(m: Medicamento): string {
  const bits = [
    m.nombre,
    m.presentacion ? m.presentacion : null,
    m.concentracion ? m.concentracion : null,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  return bits.join(" — ");
}

export function RecipePdfDocument({
  medico,
  paciente,
  medicamentos,
  indicaciones_paciente,
  fecha,
  consultaId,
}: RecipePdfProps) {
  const medicoLine = [
    medico.cedula_profesional
      ? `Cédula profesional ${medico.cedula_profesional}${medico.pais_cedula ? " — " + medico.pais_cedula : ""}`
      : null,
    medico.telefono ? `Tel. ${medico.telefono}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.medicoNombre}>
              Dr/a. {medico.nombre} {medico.apellido}
            </Text>
            {medico.especialidad && (
              <Text style={styles.medicoEspecialidad}>{medico.especialidad}</Text>
            )}
            {medicoLine && <Text style={styles.medicoLinea}>{medicoLine}</Text>}
            {medico.direccion && (
              <Text style={styles.medicoDireccion}>{medico.direccion}</Text>
            )}
          </View>
          {medico.logoUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={styles.headerLogo} src={medico.logoUrl} />
          )}
        </View>

        <View style={styles.accentBar} />

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Paciente</Text>
            <Text style={styles.metaValue}>
              {paciente.apellido}, {paciente.nombre}
            </Text>
            {paciente.cedula && (
              <Text style={styles.metaSubValue}>Cédula {paciente.cedula}</Text>
            )}
            {paciente.edad !== null && (
              <Text style={styles.metaSubValue}>{paciente.edad} años</Text>
            )}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Fecha</Text>
            <Text style={styles.metaValue}>{formatFecha(fecha)}</Text>
          </View>
        </View>

        <Text style={styles.rpMark}>Rp/</Text>

        {medicamentos.map((m, i) => {
          const nombreLine = buildNombreLine(m);
          const qtyLine = buildCantidadLine(m);
          const freqLine = buildFrecuenciaLine(m);
          return (
            <View key={i} style={styles.medItem} wrap={false}>
              <View style={styles.medHeaderRow}>
                <Text style={styles.medNombre}>
                  {i + 1}. {nombreLine}
                </Text>
                {m.es_controlado && (
                  <Text style={styles.controladoBadge}>[!] Controlado</Text>
                )}
              </View>
              {qtyLine && <Text style={styles.medQty}>{qtyLine}</Text>}
              {freqLine && <Text style={styles.medFreq}>{freqLine}</Text>}
              {m.indicaciones && (
                <Text style={styles.medSig}>S/ {m.indicaciones}</Text>
              )}
            </View>
          );
        })}

        {indicaciones_paciente && indicaciones_paciente.trim().length > 0 && (
          <View style={styles.indicacionesBlock}>
            <Text style={styles.indicacionesLabel}>
              Indicaciones generales al paciente
            </Text>
            <Text style={styles.indicacionesText}>{indicaciones_paciente}</Text>
          </View>
        )}

        <View style={styles.firmaBlock}>
          <View style={styles.firmaBox}>
            {medico.firmaUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.firmaImage} src={medico.firmaUrl} />
            )}
            <View style={styles.firmaLine} />
            <Text style={styles.firmaLabel}>Firma y sello del médico</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Consulta #{consultaId.slice(0, 8)} · Documento generado con DERMA INTEL Pro · Mirai Lab
        </Text>
      </Page>
    </Document>
  );
}
