import { Circle, Ellipse, FabricImage, Line, Path, Polygon, Rect, Textbox, Triangle, type FabricObject } from 'fabric';
import { mdiCalendarMonth, mdiCar, mdiEmail, mdiGithub, mdiLinkedin, mdiMapMarker, mdiPhone, mdiWeb } from '@mdi/js';
import { DEFAULT_FONT } from './fonts';

export const INK = '#212a39';
export const ACCENT = '#66747d';

/** Icônes de base (Material Design Icons, Apache 2.0) — importées une à une, le reste est chargé à la demande. */
export const ICONS = {
  phone: mdiPhone,
  mail: mdiEmail,
  pin: mdiMapMarker,
  web: mdiWeb,
  linkedin: mdiLinkedin,
  github: mdiGithub,
  car: mdiCar,
  calendar: mdiCalendarMonth,
} as const;
export type IconName = keyof typeof ICONS;

export function text(content: string, opts: Partial<Textbox> = {}) {
  return new Textbox(content, {
    width: 220,
    fontFamily: DEFAULT_FONT,
    fontSize: 11,
    lineHeight: 1.25,
    fill: INK,
    splitByGrapheme: false,
    ...opts,
  } as Partial<Textbox>);
}

export const heading = (content = 'TITRE', opts: Partial<Textbox> = {}) =>
  text(content, { fontFamily: 'Arima', fontWeight: 'bold', fontSize: 26, lineHeight: 1.1, ...opts } as Partial<Textbox>);

export const bullets = (items: string[], opts: Partial<Textbox> = {}) =>
  text(items.map((i) => `•  ${i}`).join('\n'), { fontSize: 9.5, lineHeight: 1.45, ...opts } as Partial<Textbox>);

export const rect = (opts: Partial<Rect> = {}) =>
  new Rect({ width: 160, height: 100, fill: ACCENT, strokeWidth: 0, ...opts } as Partial<Rect>);

export const circle = (opts: Partial<Circle> = {}) =>
  new Circle({ radius: 50, fill: ACCENT, strokeWidth: 0, ...opts } as Partial<Circle>);

export const triangle = (opts: Partial<Triangle> = {}) =>
  new Triangle({ width: 100, height: 90, fill: ACCENT, strokeWidth: 0, ...opts } as Partial<Triangle>);

export const line = (opts: Partial<Line> = {}) =>
  new Line([0, 0, 160, 0], { stroke: INK, strokeWidth: 2, strokeLineCap: 'round', ...opts } as Partial<Line>);

/** Bandeau vertical terminé en pointe (comme la colonne du CV). */
export function banner(w = 120, h = 200, tip = 30, opts: Partial<Polygon> = {}) {
  return new Polygon(
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h - tip },
      { x: w / 2, y: h },
      { x: 0, y: h - tip },
    ],
    { fill: INK, strokeWidth: 0, ...opts } as Partial<Polygon>,
  );
}

export function star(r = 50, opts: Partial<Polygon> = {}) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return { x: r + Math.cos(a) * rr, y: r + Math.sin(a) * rr };
  });
  return new Polygon(pts, { fill: '#e0a526', strokeWidth: 0, ...opts } as Partial<Polygon>);
}

export function iconPath(d: string, size = 14, opts: Partial<Path> = {}) {
  const p = new Path(d, { fill: INK, strokeWidth: 0, ...opts } as Partial<Path>);
  p.scaleToWidth(size);
  return p;
}

export const icon = (name: IconName, size = 14, opts: Partial<Path> = {}) => iconPath(ICONS[name], size, opts);

/** Image recadrée en cercle (photo de profil). */
export function makeRound(img: FabricImage, round: boolean) {
  img.clipPath = round
    ? new Circle({ radius: Math.min(img.width, img.height) / 2, originX: 'center', originY: 'center' })
    : undefined;
  img.dirty = true;
}

export const isRound = (img: FabricImage) => img.clipPath instanceof Circle;

/**
 * Masque reprenant la géométrie d'une forme (sans contour), pour y découper une image.
 * Renvoie `null` si la forme ne peut pas servir de cadre (ligne, icône sans remplissage).
 */
export function shapeClip(o: FabricObject): FabricObject | null {
  const base = { originX: 'center', originY: 'center', left: 0, top: 0, strokeWidth: 0, flipX: o.flipX, flipY: o.flipY } as const;
  let clip: FabricObject | null = null;
  if (o instanceof Circle)
    clip = Math.abs(o.scaleX - o.scaleY) < 1e-3
      ? new Circle({ ...base, radius: o.radius })
      : new Ellipse({ ...base, rx: o.radius, ry: o.radius });
  else if (o instanceof Ellipse) clip = new Ellipse({ ...base, rx: o.rx, ry: o.ry });
  else if (o instanceof Rect) clip = new Rect({ ...base, width: o.width, height: o.height, rx: o.rx, ry: o.ry });
  else if (o instanceof Triangle) clip = new Triangle({ ...base, width: o.width, height: o.height });
  else if (o instanceof Polygon) clip = new Polygon(o.points.map(({ x, y }) => ({ x, y })), base);
  else if (o instanceof Path && o.fill) clip = new Path(structuredClone(o.path), base);
  if (clip) clip.set({ left: 0, top: 0 });
  return clip;
}

/** Ajuste le masque de l'image à son encart : cercle (forme ronde) ou forme étirée au cadre. */
function fitClip(img: FabricImage) {
  const clip = img.clipPath;
  if (!clip) return;
  if (clip instanceof Circle) return makeRound(img, true);
  clip.set({ scaleX: img.width / clip.width, scaleY: img.height / clip.height });
  img.dirty = true;
}

/**
 * Remplit un cadre (largeur × hauteur affichées) avec l'image, comme « object-fit: cover » :
 * l'image est mise à l'échelle puis recadrée, le cadre garde exactement sa taille.
 * `fx`, `fy` (0 à 1) : point de cadrage (0,5 = centre).
 */
export function fillFrame(img: FabricImage, frameW: number, frameH: number, fx = 0.5, fy = 0.5) {
  const { width: nw, height: nh } = img.getOriginalSize();
  const s = Math.max(frameW / nw, frameH / nh);
  const cw = Math.min(nw, frameW / s);
  const ch = Math.min(nh, frameH / s);
  img.set({ cropX: (nw - cw) * fx, cropY: (nh - ch) * fy, width: cw, height: ch, scaleX: s, scaleY: s });
  fitClip(img);
  img.setCoords();
  img.dirty = true;
}

export const isText = (o: FabricObject | undefined): o is Textbox =>
  !!o && (o instanceof Textbox || o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');
