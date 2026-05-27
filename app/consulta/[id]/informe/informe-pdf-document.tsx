"use client";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InformeContenido } from "./schema";

/**
 * Informe médico PDF.
 *
 * Layout estándar LATAM:
 *   Encabezado: logo + nombre + especialidad + cédula + contacto
 *   Acento azul
 *   Bloque paciente
 *   Secciones numeradas en romano
 *   Firma + sello
 *   Footer pie de página DERMA INTEL Pro · Mirai Lab
 *
 * Patrón visual idéntico al récipe (Times-Roman + accent azul) para
 * que se vea coherente con el resto de la documentación que firma.
 *
 * IMPORTANTE: react-pdf usa fuentes built-in WinAnsi-1252. NO incluir
 * emojis ni caracteres fuera de Latin-1 (issue del Día 5).
 */

const ACCENT_BLUE = "#1B4965";
const SECONDARY = "#5FA8D3";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#171717",
    lineHeight: 1.5,
  },

  // ----- Header -----
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 12,
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
    marginBottom: 14,
  },

  // ----- Título -----
  tituloDoc: {
    fontSize: 14,
    fontFamily: "Times-Roman",
    fontWeight: 700,
    textAlign: "center",
    color: ACCENT_BLUE,
    marginBottom: 14,
    letterSpacing: 1,
  },

  // ----- Bloque paciente -----
  pacienteBlock: {
    borderWidth: 0.5,
    borderColor: "#d4d4d4",
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
    backgroundColor: "#fafafa",
  },
  pacienteRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  pacienteLabel: {
    fontSize: 9,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    width: 100,
  },
  pacienteValue: {
    fontSize: 11,
    fontWeight: 700,
    flex: 1,
  },

  // ----- Secciones -----
  seccion: {
    marginBottom: 10,
  },
  seccionTitulo: {
    fontSize: 11,
    fontFamily: "Times-Roman",
    fontWeight: 700,
    color: ACCENT_BLUE,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: SECONDARY,
  },
  seccionContenido: {
    fontSize: 10.5,
    color: "#1f2937",
    textAlign: "justify",
  },

  // ----- Firma -----
  firmaBlock: {
    marginTop: 32,
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
  firmaMedicoNombre: {
    fontSize: 10.5,
    fontWeight: 700,
    textAlign: "center",
    marginTop: 2,
  },
  firmaCedula: {
    fontSize: 9,
    color: "#525252",
    textAlign: "center",
  },

  // ----- Footer -----
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#d4d4d4",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#737373",
  },
});

export interface InformePdfMedico {
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

export interface InformePdfPaciente {
  nombre: string;
  apellido: string;
  edad: number | null;
  sexo: string | null;
  cedula: string | null;
  fitzpatrick: number | null;
}

export interface InformePdfProps {
  medico: InformePdfMedico;
  paciente: InformePdfPaciente;
  contenido: InformeContenido;
  fechaConsulta: Date;
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

const SEXO_LABEL: Record<string, string> = {
  F: "Femenino",
  M: "Masculino",
  O: "Otro",
};

export function InformePdfDocument({
  medico,
  paciente,
  contenido,
  fechaConsulta,
  consultaId,
}: InformePdfProps) {
  const medicoLine = [
    medico.cedula_profesional
      ? `Cedula profesional ${medico.cedula_profesional}${medico.pais_cedula ? " - " + medico.pais_cedula : ""}`
      : null,
    medico.telefono ? `Tel. ${medico.telefono}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  const pacienteEdad =
    paciente.edad !== null ? `${paciente.edad} anos` : "Edad no registrada";
  const pacienteSexo =
    paciente.sexo && SEXO_LABEL[paciente.sexo]
      ? SEXO_LABEL[paciente.sexo]
      : "No especificado";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ----- HEADER ----- */}
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

        {/* ----- TITULO ----- */}
        <Text style={styles.tituloDoc}>INFORME MEDICO</Text>

        {/* ----- BLOQUE PACIENTE ----- */}
        <View style={styles.pacienteBlock}>
          <View style={styles.pacienteRow}>
            <Text style={styles.pacienteLabel}>Paciente</Text>
            <Text style={styles.pacienteValue}>
              {paciente.apellido}, {paciente.nombre}
            </Text>
          </View>
          <View style={styles.pacienteRow}>
            <Text style={styles.pacienteLabel}>Edad / Sexo</Text>
            <Text style={styles.pacienteValue}>
              {pacienteEdad} - {pacienteSexo}
            </Text>
          </View>
          {paciente.cedula && (
            <View style={styles.pacienteRow}>
              <Text style={styles.pacienteLabel}>Cedula</Text>
              <Text style={styles.pacienteValue}>{paciente.cedula}</Text>
            </View>
          )}
          {paciente.fitzpatrick !== null && (
            <View style={styles.pacienteRow}>
              <Text style={styles.pacienteLabel}>Fototipo</Text>
              <Text style={styles.pacienteValue}>
                Fitzpatrick {paciente.fitzpatrick}
              </Text>
            </View>
          )}
          <View style={styles.pacienteRow}>
            <Text style={styles.pacienteLabel}>Fecha</Text>
            <Text style={styles.pacienteValue}>{formatFecha(fechaConsulta)}</Text>
          </View>
        </View>

        {/* ----- SECCIONES ----- */}
        <Seccion
          numero="I"
          titulo="Motivo de consulta"
          contenido={contenido.motivo_consulta}
        />
        <Seccion
          numero="II"
          titulo="Antecedentes"
          contenido={contenido.antecedentes}
        />
        <Seccion
          numero="III"
          titulo="Anamnesis"
          contenido={contenido.anamnesis}
        />
        <Seccion
          numero="IV"
          titulo="Examen fisico"
          contenido={contenido.examen_fisico}
        />
        <Seccion
          numero="V"
          titulo="Diagnostico"
          contenido={contenido.diagnostico}
        />
        <Seccion
          numero="VI"
          titulo="Plan terapeutico"
          contenido={contenido.plan}
        />
        <Seccion
          numero="VII"
          titulo="Recomendaciones y seguimiento"
          contenido={contenido.recomendaciones}
        />

        {/* ----- FIRMA ----- */}
        <View style={styles.firmaBlock}>
          <View style={styles.firmaBox}>
            {medico.firmaUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.firmaImage} src={medico.firmaUrl} />
            )}
            <View style={styles.firmaLine} />
            <Text style={styles.firmaMedicoNombre}>
              Dr/a. {medico.nombre} {medico.apellido}
            </Text>
            {medico.cedula_profesional && (
              <Text style={styles.firmaCedula}>
                Cedula profesional {medico.cedula_profesional}
              </Text>
            )}
            <Text style={styles.firmaLabel}>Firma y sello del medico</Text>
          </View>
        </View>

        {/* ----- FOOTER ----- */}
        <View style={styles.footer} fixed>
          <Text>Consulta #{consultaId.slice(0, 8)}</Text>
          <Text>DERMA INTEL Pro - Mirai Lab</Text>
        </View>
      </Page>
    </Document>
  );
}

function Seccion({
  numero,
  titulo,
  contenido,
}: {
  numero: string;
  titulo: string;
  contenido: string;
}) {
  return (
    <View style={styles.seccion} wrap={false}>
      <Text style={styles.seccionTitulo}>
        {numero}. {titulo}
      </Text>
      <Text style={styles.seccionContenido}>
        {contenido && contenido.trim().length > 0
          ? contenido
          : "Sin informacion registrada."}
      </Text>
    </View>
  );
}
