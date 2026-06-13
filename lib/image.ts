/**
 * lib/image.ts
 *
 * Decodificación + redimensionado + re-encode a JPEG de imágenes en el
 * cliente. Diseñado para ser robusto en Safari iOS, que es donde más
 * se rompe la carga de fotos clínicas.
 *
 * Dos problemas históricos que esto resuelve:
 *
 *  1. HEIC: el iPhone guarda en HEIC por defecto. `new Image().src` a
 *     veces falla decodificando HEIC en Safari (dispara onerror o deja
 *     naturalWidth = 0). `createImageBitmap(file)` tiene mejor soporte
 *     nativo en Safari 17+, así que lo intentamos PRIMERO y caemos al
 *     `<img>` solo si no está disponible o falla.
 *
 *  2. Doble decodificación: el pipeline viejo hacía removeExif (canvas
 *     re-encode) y LUEGO resizeToJpeg (otro canvas) — dos decodes del
 *     mismo archivo, doble superficie de fallo. Acá decodificamos una
 *     sola vez, dibujamos al canvas ya redimensionado y exportamos.
 *
 * El paso por canvas descarta TODA la metadata (EXIF/GPS/orientación
 * embebida) como efecto colateral — los pixeles son lo único que
 * sobrevive. Eso cumple el requisito de anonimización de CLAUDE.md §2.3
 * sin necesitar piexifjs para estos formatos.
 *
 * NOTA orientación: al usar createImageBitmap pasamos
 * `imageOrientation: "from-image"` para respetar el flag EXIF de
 * orientación (si no, las fotos verticales del iPhone salen rotadas).
 */

export interface DecodedSource {
  width: number;
  height: number;
  /** Algo que canvas.drawImage acepta: ImageBitmap o HTMLImageElement. */
  draw: CanvasImageSource;
  /** Liberar recursos (close del bitmap o revoke del objectURL). */
  release: () => void;
}

/**
 * Decodifica un File/Blob a algo dibujable, probando primero la ruta
 * con mejor soporte HEIC. Lanza un Error con mensaje en español si
 * ninguna ruta logra decodificar (típicamente HEIC en un Safari viejo).
 */
async function decodeImage(file: Blob): Promise<DecodedSource> {
  // --- Ruta 1: createImageBitmap (preferida, mejor soporte HEIC) ----
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: bitmap,
          release: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Cae a la ruta 2.
    }
  }

  // --- Ruta 2: HTMLImageElement + objectURL -------------------------
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            "el navegador no pudo decodificar la imagen (formato no soportado, posiblemente HEIC)",
          ),
        );
      el.src = url;
    });
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      throw new Error(
        "la imagen decodificó con tamaño 0 (formato no soportado, posiblemente HEIC)",
      );
    }
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: img,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Decodifica una imagen, la redimensiona para que el lado más largo no
 * exceda `maxDim`, y la exporta como JPEG Blob. Descarta metadata.
 *
 * @throws Error (mensaje en español) si no se puede decodificar o el
 *         canvas no está disponible.
 */
export async function processImageToJpeg(
  file: Blob,
  maxDim: number,
  quality = 0.88,
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("El procesamiento de imágenes solo corre en el navegador");
  }

  const src = await decodeImage(file);
  try {
    const ratio = Math.min(1, maxDim / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * ratio));
    const h = Math.max(1, Math.round(src.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible en este navegador");
    // Fondo blanco por si la fuente tiene alpha (los JPEG no soportan
    // transparencia; sin esto el alpha sale negro).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src.draw, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob devolvió null"))),
        "image/jpeg",
        quality,
      ),
    );
    return blob;
  } finally {
    src.release();
  }
}
