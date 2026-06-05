/**
 * lib/anonimizar.ts
 *
 * Privacy utilities applied BEFORE any patient data leaves the
 * client/server boundary toward an external API (Claude, search,
 * embeddings, etc.).
 *
 * Two functions:
 *
 *   removeExif(file)   → returns a copy of the file with EXIF/GPS/camera
 *                        metadata stripped. JPEG uses piexifjs;
 *                        PNG/WebP/GIF use canvas re-encode (which
 *                        also discards any sidecar metadata).
 *
 *   anonymizeText(t,n) → replaces all variations of the patient's name
 *                        in `t` with the token "Paciente". Title prefixes
 *                        (Sr./Sra./Dr./Dra.) are also stripped.
 *
 * Both are pure (no side effects beyond returning a new value).
 */

import piexif from "piexifjs";

// =====================================================================
// removeExif
// =====================================================================

/**
 * Read a File as a binary data URL ("data:<mime>;base64,...").
 * Used as the input to piexifjs.remove() which only accepts that shape.
 */
function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Malformed data URL");
  const base64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Canvas re-encode for non-JPEG formats. The act of drawing the image
 * to a canvas and exporting it as a new blob discards any embedded
 * EXIF or XMP metadata (canvas image data is just pixels).
 *
 * Returns a JPEG by default because it's smaller than PNG and we don't
 * need transparency for clinical photos. Caller can override.
 */
async function reencodeViaCanvas(
  file: File,
  outMime = "image/jpeg",
  quality = 0.92,
): Promise<File> {
  if (typeof document === "undefined") {
    // SSR / Node: cannot canvas re-encode. Return as-is and let caller
    // decide. Tests cover this branch by asserting we throw.
    throw new Error("Canvas re-encode is only available in the browser");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to load image for re-encode"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outMime, quality),
    );
    if (!blob) throw new Error("canvas.toBlob returned null");
    return new File([blob], renameForMime(file.name, outMime), {
      type: outMime,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renameForMime(name: string, mime: string): string {
  const ext = mime === "image/jpeg" ? ".jpg" : mime === "image/png" ? ".png" : "";
  const stem = name.replace(/\.[^.]+$/, "");
  return ext ? stem + ext : name;
}

/**
 * Return a copy of the file with all EXIF/GPS/camera metadata removed.
 *
 * JPEGs are processed in place with piexifjs (preserves pixel data
 * exactly). PNG/WebP/GIF are re-encoded through a canvas which drops
 * any sidecar metadata as a side effect.
 *
 * If we fail for any reason, we throw — the caller MUST handle the
 * error and either retry or refuse to upload. Silently uploading
 * metadata-bearing files would violate CLAUDE.md §2.3.
 */
export async function removeExif(file: File): Promise<File> {
  const mime = (file.type || "").toLowerCase();

  if (mime === "image/jpeg" || mime === "image/jpg") {
    const dataUrl = await fileToDataUrl(file);
    const stripped = piexif.remove(dataUrl);
    const blob = dataUrlToBlob(stripped, "image/jpeg");
    return new File([blob], file.name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  if (
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif" ||
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/avif"
  ) {
    // HEIC/HEIF (iPhone default), AVIF (Android moderno) y formatos PNG/
    // WebP/GIF: el canvas decodifica si el browser tiene soporte nativo
    // (Safari iOS sí decodifica HEIC). Si el browser no puede decodificar,
    // reencodeViaCanvas lanza error y el caller lo reporta.
    return reencodeViaCanvas(file, "image/jpeg", 0.92);
  }

  // Caso edge: iOS a veces entrega archivos sin mime type seteado
  // (vacío) cuando los selecciona del Photos library. En ese caso,
  // intentamos el canvas re-encode — si es decodificable, sale JPEG.
  if (!mime) {
    return reencodeViaCanvas(file, "image/jpeg", 0.92);
  }

  throw new Error(`Tipo de imagen no soportado para anonimización: ${mime || "desconocido"}`);
}

// =====================================================================
// anonymizeText
// =====================================================================

const TITLE_PREFIXES = [
  "sra\\.",
  "sra",
  "sr\\.",
  "sr",
  "srta\\.",
  "srta",
  "doña",
  "dona",
  "don",
  "dr\\.",
  "dra\\.",
  "dr",
  "dra",
] as const;

/**
 * Lowercase + strip combining diacritics. Used so "María" and "maria"
 * both match the same canonical token.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tokenize a patient's full name into searchable name parts.
 * Drops punctuation and tokens shorter than 2 chars (avoids replacing
 * stray initials that would match common Spanish words).
 */
function nameTokens(fullName: string): string[] {
  return fullName
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

/**
 * Replace every mention of the patient's name with the literal
 * "Paciente". Matches are case-insensitive and accent-insensitive.
 * Title prefixes (Sr./Sra./Dr./Dra.) immediately preceding the name
 * are absorbed into the replacement so "la Sra. Gómez" becomes
 * "la Paciente" instead of "la Sra. Paciente".
 *
 * Pure function. Returns a new string. Empty / whitespace-only names
 * leave the input untouched.
 */
export function anonymizeText(text: string, fullName: string): string {
  if (!text) return text;
  if (!fullName || !fullName.trim()) return text;

  const tokens = nameTokens(fullName);
  if (tokens.length === 0) return text;

  // First pass: full name (longest match wins, e.g. "María Gómez" before
  // "Gómez" alone — so we don't end up replacing twice).
  // We work on a normalized shadow string to find match positions, then
  // apply the replacement on the original.
  const normText = normalize(text);

  // Sort tokens by length descending to avoid partial-match overrides.
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  const fullPattern = sortedTokens.map((t) => escapeRegex(normalize(t))).join("\\s+");
  const titlePrefix = `(?:\\b(?:${TITLE_PREFIXES.join("|")})\\s+)?`;

  const fullRegex = new RegExp(`${titlePrefix}\\b${fullPattern}\\b`, "g");
  const out = replaceWithNormalizedRegex(text, normText, fullRegex);

  // Second pass: individual tokens still left in the text (e.g. mentions
  // of just the first name elsewhere in the paragraph).
  let pass2 = out.text;
  let pass2Norm = out.norm;
  for (const tok of sortedTokens) {
    const tokRegex = new RegExp(
      `${titlePrefix}\\b${escapeRegex(normalize(tok))}\\b`,
      "g",
    );
    const r = replaceWithNormalizedRegex(pass2, pass2Norm, tokRegex);
    pass2 = r.text;
    pass2Norm = r.norm;
  }
  return pass2;
}

/**
 * Run a regex on the normalized-shadow version of the string and apply
 * the resulting span replacements ("Paciente") back onto the original.
 * Returns both the modified original and its (re)normalized form so
 * callers can chain passes.
 */
function replaceWithNormalizedRegex(
  original: string,
  normalized: string,
  regex: RegExp,
): { text: string; norm: string } {
  const matches: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length });
    // Guard against zero-width matches looping forever.
    if (m[0].length === 0) regex.lastIndex += 1;
  }
  if (matches.length === 0) return { text: original, norm: normalized };

  // Apply replacements right-to-left so positions stay valid.
  let result = original;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end } = matches[i]!;
    result = result.slice(0, start) + "Paciente" + result.slice(end);
  }
  return { text: result, norm: normalize(result) };
}
