/**
 * lib/anonimizar.test.ts
 *
 * Unit tests for removeExif() and anonymizeText().
 *
 * EXIF strip is verified end-to-end: we build a JPEG buffer with
 * piexifjs that contains a fake GPS tag + a make/model + a datetime,
 * run it through removeExif, then re-read the output and assert all
 * three tag blocks are empty.
 */
import { describe, expect, it } from "vitest";
import piexif from "piexifjs";
import { anonymizeText, removeExif } from "./anonimizar";

// ----- helpers --------------------------------------------------------

/**
 * Minimal valid JPEG (white 1x1 pixel) base64. Source: a tiny JPEG
 * encoded once, hardcoded here so the test suite has no runtime image
 * dependency. Verified to round-trip through piexifjs.
 */
// Minimal valid 1x1 JPEG with a complete JFIF header. Round-trip
// verified against piexifjs. Source: re-encode of an empty white pixel
// via libjpeg-turbo at default quality.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhE" +
  "PERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh" +
  "4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wgARCAABAAEDA" +
  "SIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAM" +
  "AwEAAhADEAAAAH8AAAAAH//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCH//EABQRAQA" +
  "AAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQ" +
  "E/AR//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ah//xAAUEAEAAAAAAAAAAAAAAAAAA" +
  "AAA/9oACAEBAAE/IR//2gAMAwEAAgADAAAAEP8A/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgB" +
  "AwEBPxAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxAf/8QAFBABAAAAAAAAAAAAAAA" +
  "AAAAAAP/aAAgBAQABPxAf/9k=";

function tinyJpegDataUrl(): string {
  return `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;
}

function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("not string"));
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(blob);
  });
}

/** Build a JPEG with rich EXIF (GPS + camera + datetime) for testing. */
function makeJpegWithExif(): File {
  const zerothIfd: Record<number, unknown> = {};
  zerothIfd[piexif.ImageIFD.Make] = "Apple";
  zerothIfd[piexif.ImageIFD.Model] = "iPhone 15 Pro";
  zerothIfd[piexif.ImageIFD.Software] = "iOS 17.4.1";

  const exifIfd: Record<number, unknown> = {};
  exifIfd[piexif.ExifIFD.DateTimeOriginal] = "2026:05:25 14:30:00";

  const gpsIfd: Record<number, unknown> = {};
  // Caracas coordinates as a known fingerprint we can later assert is gone.
  gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = "N";
  gpsIfd[piexif.GPSIFD.GPSLatitude] = [
    [10, 1],
    [30, 1],
    [0, 1],
  ];
  gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = "W";
  gpsIfd[piexif.GPSIFD.GPSLongitude] = [
    [66, 1],
    [55, 1],
    [0, 1],
  ];

  const exifObj = { "0th": zerothIfd, Exif: exifIfd, GPS: gpsIfd };
  const exifBytes = piexif.dump(exifObj);
  const withExifDataUrl = piexif.insert(exifBytes, tinyJpegDataUrl());
  const blob = dataUrlToBlob(withExifDataUrl, "image/jpeg");
  return new File([blob], "test.jpg", { type: "image/jpeg" });
}

// =====================================================================
// removeExif
// =====================================================================

describe("removeExif()", () => {
  it("returns a JPEG with the same pixel data but no EXIF/GPS/camera tags", async () => {
    const input = makeJpegWithExif();

    // Sanity: the input does carry EXIF.
    const inputDataUrl = await blobToDataUrl(input);
    const inputExif = piexif.load(inputDataUrl);
    expect(Object.keys(inputExif["0th"] ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(inputExif["GPS"] ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(inputExif["Exif"] ?? {}).length).toBeGreaterThan(0);

    const stripped = await removeExif(input);
    expect(stripped.type).toBe("image/jpeg");
    expect(stripped.name).toBe("test.jpg");

    const strippedDataUrl = await blobToDataUrl(stripped);
    const strippedExif = piexif.load(strippedDataUrl);
    expect(Object.keys(strippedExif["0th"] ?? {}).length).toBe(0);
    expect(Object.keys(strippedExif["GPS"] ?? {}).length).toBe(0);
    expect(Object.keys(strippedExif["Exif"] ?? {}).length).toBe(0);
  });

  it("rejects unsupported MIME types so the caller refuses to upload", async () => {
    const f = new File(["fake"], "x.pdf", { type: "application/pdf" });
    await expect(removeExif(f)).rejects.toThrow(/no soportado/i);
  });
});

// =====================================================================
// anonymizeText
// =====================================================================

describe("anonymizeText()", () => {
  it("replaces full name with 'Paciente'", () => {
    const out = anonymizeText(
      "María Gómez consulta por una lesión en mejilla.",
      "María Gómez",
    );
    expect(out).toBe("Paciente consulta por una lesión en mejilla.");
  });

  it("replaces standalone first name elsewhere in the text", () => {
    const out = anonymizeText(
      "La señora María refiere prurito desde hace dos semanas. Le indicamos a María que evite jabones perfumados.",
      "María Gómez",
    );
    expect(out).toBe(
      "La señora Paciente refiere prurito desde hace dos semanas. Le indicamos a Paciente que evite jabones perfumados.",
    );
  });

  it("absorbs Sra./Sr./Dra. title prefixes into the replacement", () => {
    const text = "La Sra. Gómez acude por control. La Dra. Pérez la atendió.";
    const out = anonymizeText(text, "María Gómez");
    // Only the paciente's last name should be replaced; the médico's
    // title (Dra. Pérez) is left intact.
    expect(out).toBe("La Paciente acude por control. La Dra. Pérez la atendió.");
  });

  it("is case- and accent-insensitive", () => {
    const out = anonymizeText(
      "Maria gomez vino hoy. MARIA preguntó por crema.",
      "María Gómez",
    );
    expect(out).toBe("Paciente vino hoy. Paciente preguntó por crema.");
  });

  it("does not replace partial substrings", () => {
    // "Mar" is the first 3 chars of "María" but should not match because
    // we require word boundaries.
    const out = anonymizeText(
      "Mar Caribe. El mar está cerca.",
      "María Gómez",
    );
    expect(out).toBe("Mar Caribe. El mar está cerca.");
  });

  it("returns the input unchanged when the name is empty", () => {
    expect(anonymizeText("paciente femenina de 34 años", "")).toBe(
      "paciente femenina de 34 años",
    );
    expect(anonymizeText("texto", "   ")).toBe("texto");
  });

  it("returns empty input unchanged", () => {
    expect(anonymizeText("", "María Gómez")).toBe("");
  });

  it("ignores name tokens shorter than 2 characters (initials)", () => {
    // Single-letter "L." should not be turned into "Paciente" — would
    // wreck normal text. Verify we drop short tokens.
    const out = anonymizeText(
      "El laboratorio L. confirmó el resultado.",
      "L. María González",
    );
    expect(out).toBe("El laboratorio L. confirmó el resultado.");
  });

  it("collapses repeated mentions of the full name within one pass", () => {
    const out = anonymizeText(
      "María Gómez y María Gómez (sí, dos veces) consultaron.",
      "María Gómez",
    );
    expect(out).toBe("Paciente y Paciente (sí, dos veces) consultaron.");
  });
});
