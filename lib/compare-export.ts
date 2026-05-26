/**
 * lib/compare-export.ts
 *
 * Composes a comparison-export image (JPG) using Canvas 2D directly,
 * no html2canvas. Output is fully controlled pixel-by-pixel so we can:
 *
 *   - Guarantee no embedded metadata (EXIF) leaks into the export
 *   - Pixel-perfect placement of header, dates, notes, watermark
 *   - Apply per-image anonymization (black rectangles over eyes)
 *     before drawing into the composite
 *   - Output is a blob → triggers download, no server roundtrip
 *
 * Layout (landscape 1920×1080 default):
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │  Paciente · Caso clínico   (header)              │  ~80px tall
 *   │  Evolución de 28 días                            │
 *   ├────────────────────────┬─────────────────────────┤
 *   │                        │                         │
 *   │     foto antes         │      foto después       │  ~720px tall
 *   │     12 MAY 2026        │      09 JUN 2026        │
 *   │                        │                         │
 *   ├────────────────────────┴─────────────────────────┤
 *   │  Notas: "Mejoría significativa con metronidazol  │  ~200px tall
 *   │  crema. Lesiones eritematosas reducidas."        │
 *   │                                                  │
 *   │                         DERMA INTEL Pro · Mirai  │  watermark
 *   └──────────────────────────────────────────────────┘
 *
 * Portrait (1080×1920) stacks fotos vertically instead.
 */

import {
  detectFacesForAnonymize,
  type AnonymizeBox,
} from "./face-anonymizer";

export type ExportOrientation = "landscape" | "portrait";

export interface ExportInput {
  pacienteNombre: string;
  fechaAntes: string; // ISO
  fechaDespues: string; // ISO
  imgAntes: HTMLImageElement;
  imgDespues: HTMLImageElement;
  notas: string;
  orientation: ExportOrientation;
  /** When true: replace name with "Paciente · Caso clínico" + pixela ojos. */
  anonymize: boolean;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** Faces detected in each image — useful to warn médica before downloading. */
  facesAntes: number;
  facesDespues: number;
}

const WATERMARK = "DERMA INTEL Pro · Mirai Lab";
const FONT_FAMILY = '"Geist", system-ui, -apple-system, "Segoe UI", sans-serif';

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Caracas",
  });
}

function deltaDias(antes: string, despues: string): number {
  const a = new Date(antes).getTime();
  const b = new Date(despues).getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

/** Wrap text to fit a max width by inserting line breaks. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw an image into a rectangle, letterboxing to preserve aspect ratio
 * (black bars). Returns the rect actually filled with image content,
 * so callers (e.g. anonymizer overlay) know where to draw on top.
 */
function drawLetterboxed(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number; w: number; h: number } {
  ctx.fillStyle = "#000";
  ctx.fillRect(rx, ry, rw, rh);
  const ratio = Math.min(rw / img.naturalWidth, rh / img.naturalHeight);
  const drawW = img.naturalWidth * ratio;
  const drawH = img.naturalHeight * ratio;
  const dx = rx + (rw - drawW) / 2;
  const dy = ry + (rh - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
  return { x: dx, y: dy, w: drawW, h: drawH };
}

/**
 * Detect faces in `img` (image-space coords) and convert each eye
 * bounding box to the destination rectangle on the canvas (so we can
 * paint black rectangles aligned to the drawn image).
 */
async function getMappedEyeBoxes(
  img: HTMLImageElement,
  drawn: { x: number; y: number; w: number; h: number },
): Promise<{ faces: number; boxes: AnonymizeBox[] }> {
  const result = await detectFacesForAnonymize(img);
  const sx = drawn.w / img.naturalWidth;
  const sy = drawn.h / img.naturalHeight;
  const boxes = result.eyeBoxes.map((b) => ({
    x: drawn.x + b.x * sx,
    y: drawn.y + b.y * sy,
    w: b.w * sx,
    h: b.h * sy,
  }));
  return { faces: result.faces, boxes };
}

export async function composeComparisonExport(
  input: ExportInput,
): Promise<ExportResult> {
  const landscape = input.orientation === "landscape";
  const width = landscape ? 1920 : 1080;
  const height = landscape ? 1080 : 1920;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible.");

  // Background
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, width, height);

  // Header strip
  const headerH = landscape ? 110 : 140;
  ctx.fillStyle = "#171717";
  ctx.fillRect(0, 0, width, headerH);

  const headerName = input.anonymize
    ? "Paciente · Caso clínico"
    : input.pacienteNombre;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${landscape ? 36 : 44}px ${FONT_FAMILY}`;
  ctx.fillText(headerName, 40, landscape ? 56 : 70);

  ctx.font = `400 ${landscape ? 20 : 24}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#cbd5e1";
  const dias = deltaDias(input.fechaAntes, input.fechaDespues);
  ctx.fillText(
    `Evolución de ${dias} día${dias === 1 ? "" : "s"}`,
    40,
    landscape ? 90 : 115,
  );

  // Photos layout
  const padding = 40;
  const photosY = headerH + 30;
  const notesH = landscape ? 220 : 320;
  const photosBottomY = height - notesH - 30;
  const photosH = photosBottomY - photosY;

  let antesRect: { x: number; y: number; w: number; h: number };
  let despuesRect: { x: number; y: number; w: number; h: number };

  if (landscape) {
    const slotW = (width - padding * 3) / 2;
    antesRect = drawLetterboxed(
      ctx,
      input.imgAntes,
      padding,
      photosY,
      slotW,
      photosH,
    );
    despuesRect = drawLetterboxed(
      ctx,
      input.imgDespues,
      padding * 2 + slotW,
      photosY,
      slotW,
      photosH,
    );
  } else {
    const slotH = (photosH - padding) / 2;
    antesRect = drawLetterboxed(
      ctx,
      input.imgAntes,
      padding,
      photosY,
      width - padding * 2,
      slotH,
    );
    despuesRect = drawLetterboxed(
      ctx,
      input.imgDespues,
      padding,
      photosY + slotH + padding,
      width - padding * 2,
      slotH,
    );
  }

  // Anonymize: detect faces and paint black rectangles over eyes
  let facesAntes = 0;
  let facesDespues = 0;
  if (input.anonymize) {
    try {
      const a = await getMappedEyeBoxes(input.imgAntes, antesRect);
      facesAntes = a.faces;
      const b = await getMappedEyeBoxes(input.imgDespues, despuesRect);
      facesDespues = b.faces;
      ctx.fillStyle = "#000";
      for (const box of [...a.boxes, ...b.boxes]) {
        ctx.fillRect(box.x, box.y, box.w, box.h);
      }
    } catch (err) {
      console.warn("[compare-export] face detection failed:", err);
    }
  }

  // Date labels (top-left of each photo)
  ctx.font = `500 ${landscape ? 18 : 22}px ${FONT_FAMILY}`;
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  const labelPad = 10;
  for (const [rect, label, side] of [
    [antesRect, formatFecha(input.fechaAntes), "ANTES"],
    [despuesRect, formatFecha(input.fechaDespues), "DESPUÉS"],
  ] as const) {
    const labelText = `${side} · ${label}`;
    const m = ctx.measureText(labelText);
    const padBox = labelPad;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(
      rect.x + 10,
      rect.y + 10,
      m.width + padBox * 2,
      (landscape ? 30 : 36) + padBox,
    );
    ctx.fillStyle = "#fff";
    ctx.fillText(
      labelText,
      rect.x + 10 + padBox,
      rect.y + 10 + (landscape ? 24 : 30),
    );
  }

  // Notes block
  if (input.notas.trim().length > 0) {
    ctx.fillStyle = "#171717";
    ctx.font = `500 ${landscape ? 16 : 20}px ${FONT_FAMILY}`;
    ctx.fillText("Notas clínicas", padding, photosBottomY + 50);

    ctx.fillStyle = "#404040";
    ctx.font = `400 ${landscape ? 22 : 26}px ${FONT_FAMILY}`;
    const lines = wrapText(ctx, input.notas, width - padding * 2);
    let textY = photosBottomY + 90;
    for (const line of lines.slice(0, landscape ? 4 : 6)) {
      ctx.fillText(line, padding, textY);
      textY += landscape ? 32 : 38;
    }
  }

  // Watermark
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.font = `400 ${landscape ? 14 : 18}px ${FONT_FAMILY}`;
  const wmMetrics = ctx.measureText(WATERMARK);
  ctx.fillText(WATERMARK, width - padding - wmMetrics.width, height - 24);

  // Encode to JPEG. Use 0.92 quality for a good size/quality tradeoff.
  // Canvas.toBlob does NOT embed EXIF — output is clean by construction.
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Falló la generación del JPG."));
      },
      "image/jpeg",
      0.92,
    );
  });

  return { blob, width, height, facesAntes, facesDespues };
}

/**
 * Convenience: load an image from a URL with CORS so it can be drawn
 * into a Canvas without tainting it. Returns a fully-loaded HTMLImageElement.
 */
export function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`No pudimos cargar la imagen: ${src}`));
    img.src = src;
  });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
