"use client";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Medicamento } from "./schema";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#171717",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#171717",
    paddingBottom: 8,
    marginBottom: 14,
  },
  headerText: { flex: 1, paddingRight: 12 },
  headerLogo: { width: 80, height: 80, objectFit: "contain" },
  medicoNombre: { fontSize: 15, fontWeight: 700 },
  medicoEspecialidad: { fontSize: 10, color: "#525252", marginTop: 2 },
  medicoLinea: { fontSize: 9, color: "#525252", marginTop: 6 },
  medicoDireccion: { fontSize: 9, color: "#525252", marginTop: 3 },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  metaLabel: { fontSize: 9, color: "#525252" },
  metaValue: { fontSize: 11, fontWeight: 700 },

  titulo: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
    marginVertical: 12,
    letterSpacing: 2,
  },

  medItem: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d4d4",
  },
  medNombre: { fontSize: 12, fontWeight: 700 },
  medMeta: { fontSize: 10, color: "#525252", marginTop: 2 },
  medSig: { fontSize: 10, marginTop: 4 },

  indicacionesBlock: {
    marginTop: 14,
    padding: 10,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
  },
  indicacionesLabel: {
    fontSize: 9,
    color: "#525252",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  indicacionesText: { fontSize: 10, marginTop: 4, lineHeight: 1.4 },

  firmaBlock: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  firmaBox: { width: 200, alignItems: "center" },
  firmaImage: { width: 180, height: 60, objectFit: "contain", marginBottom: 4 },
  firmaLine: { borderTopWidth: 1, borderTopColor: "#171717", width: 200, paddingTop: 4 },
  firmaLabel: { fontSize: 9, color: "#525252", textAlign: "center" },

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
  /** Signed URL or data URL for the médico's logo. PDF skips if null. */
  logoUrl: string | null;
  /** Signed URL or data URL for the médico's signature. PDF skips if null. */
  firmaUrl: string | null;
}

export interface RecipePdfPaciente {
  nombre: string;
  apellido: string;
  edad: number | null;
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
      <Page size="LETTER" style={styles.page}>
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

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>Paciente</Text>
            <Text style={styles.metaValue}>
              {paciente.apellido}, {paciente.nombre}
              {paciente.edad !== null ? ` · ${paciente.edad} años` : ""}
            </Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Fecha</Text>
            <Text style={styles.metaValue}>{formatFecha(fecha)}</Text>
          </View>
        </View>

        <Text style={styles.titulo}>RÉCIPE</Text>

        {medicamentos.map((m, i) => (
          <View key={i} style={styles.medItem} wrap={false}>
            <Text style={styles.medNombre}>
              {i + 1}. {m.nombre}
              {m.presentacion ? ` — ${m.presentacion}` : ""}
            </Text>
            <Text style={styles.medMeta}>
              {[m.dosis, m.via, m.duracion].filter(Boolean).join(" · ")}
            </Text>
            {m.indicaciones && (
              <Text style={styles.medSig}>Sig.: {m.indicaciones}</Text>
            )}
          </View>
        ))}

        {indicaciones_paciente && indicaciones_paciente.trim().length > 0 && (
          <View style={styles.indicacionesBlock}>
            <Text style={styles.indicacionesLabel}>
              Indicaciones generales al paciente
            </Text>
            <Text style={styles.indicacionesText}>{indicaciones_paciente}</Text>
          </View>
        )}

        <View style={styles.firmaBlock}>
          <View />
          <View style={styles.firmaBox}>
            {medico.firmaUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.firmaImage} src={medico.firmaUrl} />
            )}
            <Text style={styles.firmaLine}> </Text>
            <Text style={styles.firmaLabel}>Firma y sello del médico</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Consulta #{consultaId.slice(0, 8)} · Generado con DERMA INTEL Pro ·
          Mirai Lab · Documento bajo responsabilidad del médico tratante.
        </Text>
      </Page>
    </Document>
  );
}
