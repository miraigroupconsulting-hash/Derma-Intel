/**
 * lib/image-to-png.ts
 *
 * Client-only helper: take any browser-supported image file
 * (JPG/PNG/WebP/GIF) and re-encode it as PNG via canvas, capped to a
 * maximum dimension. Preserves transparency for already-PNG inputs.
 *
 * Used by /perfil to normalize logo + firma uploads before pushing
 * to Supabase Storage.
 */
export interface ImageToPngOptions {
  maxDimension?: number; // longest edge in pixels, default 800
  quality?: number; // 0-1, default 0.95 (PNG ignores but kept for API symmetry)
}

export async function convertImageToPng(
  file: File,
  opts: ImageToPngOptions = {},
): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("convertImageToPng can only run in the browser.");
  }
  const max = opts.maxDimension ?? 800;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No pudimos leer la imagen."));
      el.src = url;
    });

    const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * ratio);
    const h = Math.round(img.naturalHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible.");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Falló la conversión a PNG.");
    const stem = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${stem}.png`, {
      type: "image/png",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
