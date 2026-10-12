// Import d'images sécurisé : le fichier est décodé puis entièrement ré-encodé via un canvas.
// Cela supprime les métadonnées (EXIF, position GPS, profils…) et neutralise tout contenu
// non-image. Les SVG sont refusés (ils peuvent contenir du script ou des liens externes).

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 80_000_000;
/** Côté maximal conservé dans l'éditeur (≈ pleine page A4 à 300 dpi). */
const MAX_SIDE = 2600;

export interface CleanImage {
  url: string;
  width: number;
  height: number;
}

export async function sanitizeImage(file: File): Promise<CleanImage> {
  if (!ACCEPTED.has(file.type)) throw new Error('Format non pris en charge (PNG, JPEG, WebP ou GIF).');
  if (file.size > MAX_FILE_BYTES) throw new Error('Image trop lourde (25 Mo maximum).');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Ce fichier n'est pas une image valide.");
  }
  try {
    if (bmp.width * bmp.height > MAX_PIXELS) throw new Error('Image trop grande (80 mégapixels maximum).');
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const alpha = file.type !== 'image/jpeg' && hasTransparency(ctx, w, h);
    return { url: alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92), width: w, height: h };
  } finally {
    bmp.close();
  }
}

export function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/** Photo factice pour le modèle (aucune donnée personnelle dans le dépôt). */
export function placeholderPhoto(size = 400): string {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#c9d3dc');
  g.addColorStop(1, '#9aa8b5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#eef2f5';
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.4, size * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size / 2, size * 0.98, size * 0.33, size * 0.34, 0, Math.PI, 0);
  ctx.fill();
  return cv.toDataURL('image/jpeg', 0.9);
}
