// Export PDF vectoriel, chargé à la demande (import dynamique).
// Chaque objet Fabric est retranscrit en opérateurs PDF natifs : formes et texte restent
// vectoriels, le texte est sélectionnable et les polices sont embarquées.
import {
  Circle,
  Color,
  Ellipse,
  FabricImage,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
  Triangle,
  type Canvas,
  type FabricObject,
  type TMat2D,
  type Textbox,
} from 'fabric';
import type { DocMeta } from './editor';
import { fontUrl } from './fonts';
import { hasTransparency } from './images';
import { PdfDocument, num, type LinkAnnot, type StructNode } from './pdf/document';
import { collectItems, findLinks, readingOrder, type Item, type Role } from './reading';
import { TrueTypeFont } from './pdf/ttf';
import { isText } from './shapes';

/** Résolution cible des images dans le PDF. */
const IMAGE_DPI = 300;
const JPEG_QUALITY = 0.88;
/** Approximation d'un quart d'ellipse par une courbe de Bézier. */
const KAPPA = 0.5522847498;

type Tf = (x: number, y: number) => [number, number];
const matTf = (m: TMat2D): Tf => (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(c: unknown): Rgba | null {
  if (typeof c !== 'string' || !c || c === 'transparent' || c === 'none') return null;
  const [r, g, b, a] = new Color(c).getSource();
  return a > 0 ? { r: r / 255, g: g / 255, b: b / 255, a } : null;
}
const rgb = (c: Rgba) => `${num(c.r)} ${num(c.g)} ${num(c.b)}`;
const cm = (m: readonly number[]) => `${m.map(num).join(' ')} cm`;

// ------------------------------------------------------------------ Tracés

/** Construit un tracé PDF ; les quadratiques sont converties en cubiques. */
class PathBuilder {
  readonly ops: string[] = [];
  private x = 0;
  private y = 0;
  constructor(private tf?: Tf) {}
  private pt(x: number, y: number) {
    const [a, b] = this.tf ? this.tf(x, y) : [x, y];
    return `${num(a)} ${num(b)}`;
  }
  m(x: number, y: number) {
    this.ops.push(`${this.pt(x, y)} m`);
    [this.x, this.y] = [x, y];
    return this;
  }
  l(x: number, y: number) {
    this.ops.push(`${this.pt(x, y)} l`);
    [this.x, this.y] = [x, y];
    return this;
  }
  c(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.ops.push(`${this.pt(x1, y1)} ${this.pt(x2, y2)} ${this.pt(x, y)} c`);
    [this.x, this.y] = [x, y];
    return this;
  }
  q(qx: number, qy: number, x: number, y: number) {
    const k = 2 / 3;
    return this.c(this.x + k * (qx - this.x), this.y + k * (qy - this.y), x + k * (qx - x), y + k * (qy - y), x, y);
  }
  h() {
    this.ops.push('h');
    return this;
  }
  ellipse(rx: number, ry: number) {
    const kx = rx * KAPPA;
    const ky = ry * KAPPA;
    return this.m(rx, 0).c(rx, ky, kx, ry, 0, ry).c(-kx, ry, -rx, ky, -rx, 0).c(-rx, -ky, -kx, -ry, 0, -ry).c(kx, -ry, rx, -ky, rx, 0).h();
  }
  rect(w: number, h: number, rx = 0, ry = 0) {
    const x = -w / 2;
    const y = -h / 2;
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    if (!rx || !ry) return this.m(x, y).l(x + w, y).l(x + w, y + h).l(x, y + h).h();
    const kx = rx * (1 - KAPPA);
    const ky = ry * (1 - KAPPA);
    return this.m(x + rx, y)
      .l(x + w - rx, y).c(x + w - kx, y, x + w, y + ky, x + w, y + ry)
      .l(x + w, y + h - ry).c(x + w, y + h - ky, x + w - kx, y + h, x + w - rx, y + h)
      .l(x + rx, y + h).c(x + kx, y + h, x, y + h - ky, x, y + h - ry)
      .l(x, y + ry).c(x, y + ky, x + kx, y, x + rx, y)
      .h();
  }
}

/** Tracé d'une forme dans son repère local (origine au centre, y vers le bas). */
function shapePath(o: FabricObject, tf?: Tf): string[] | null {
  const p = new PathBuilder(tf);
  if (o instanceof Rect) return p.rect(o.width, o.height, o.rx, o.ry).ops;
  if (o instanceof Circle) return p.ellipse(o.radius, o.radius).ops;
  if (o instanceof Ellipse) return p.ellipse(o.rx, o.ry).ops;
  if (o instanceof Triangle) {
    const w = o.width / 2;
    const h = o.height / 2;
    return p.m(-w, h).l(0, -h).l(w, h).h().ops;
  }
  if (o instanceof Line) {
    const { x1, y1, x2, y2 } = o.calcLinePoints();
    return p.m(x1, y1).l(x2, y2).ops;
  }
  if (o instanceof Polyline) {
    if (!o.points.length) return null;
    const { x: ox, y: oy } = o.pathOffset;
    o.points.forEach((pt, i) => (i ? p.l(pt.x - ox, pt.y - oy) : p.m(pt.x - ox, pt.y - oy)));
    if (o instanceof Polygon) p.h();
    return p.ops;
  }
  if (o instanceof Path) {
    const { x: ox, y: oy } = o.pathOffset;
    for (const cmd of o.path as unknown as (string | number)[][]) {
      const n = (cmd.slice(1) as number[]).map((v, i) => v - (i % 2 ? oy : ox));
      switch (cmd[0]) {
        case 'M': p.m(n[0], n[1]); break;
        case 'L': p.l(n[0], n[1]); break;
        case 'C': p.c(n[0], n[1], n[2], n[3], n[4], n[5]); break;
        case 'Q': p.q(n[0], n[1], n[2], n[3]); break;
        case 'Z': p.h(); break;
      }
    }
    return p.ops;
  }
  return null;
}

// ------------------------------------------------------------------ Export

/** Accès aux mesures internes de Fabric : positions exactes des caractères à l'écran. */
interface TextLayout {
  _textLines: string[][];
  __charBounds: { left: number; width: number }[][];
  _fontSizeFraction: number;
  offsets: { underline: number; linethrough: number };
  textDecorationThickness?: number;
  fontSize: number;
  opacity: number;
  _getLeftOffset(): number;
  _getTopOffset(): number;
  _getLineLeftOffset(i: number): number;
  getHeightOfLineImpl(i: number): number;
  getHeightOfLine(i: number): number;
  getValueOfPropertyAt(i: number, j: number, p: string): unknown;
  _styleMap?: Record<number, { line: number }>;
}

interface Run {
  x: number;
  end: number;
  baseline: number;
  /** Ligne affichée (après retour automatique) et ligne d'origine (paragraphe / puce). */
  line: number;
  src: number;
  text: string;
  family: unknown;
  weight: unknown;
  size: number;
  fill: unknown;
  underline: boolean;
  linethrough: boolean;
  dy: number;
}

/** Contenu balisé produit par un objet (pour l'arbre de structure). */
interface Tagged {
  mcids: number[];
  /** Pour une liste : MCID par ligne d'origine (une puce). */
  bySource: Map<number, number[]>;
  links: { src: number; index: number }[];
}

class Writer {
  readonly out: string[] = [];
  readonly links: LinkAnnot[] = [];
  private fonts = new Map<string, Promise<TrueTypeFont>>();
  private mcid = 0;

  constructor(private pdf: PdfDocument, private pageH: number) {}

  private font(family: unknown, weight: unknown): Promise<TrueTypeFont> {
    const url = fontUrl(family, weight);
    let f = this.fonts.get(url);
    if (!f) {
      f = fetch(url).then(async (r) => {
        if (!r.ok) throw new Error('Police introuvable.');
        return new TrueTypeFont(new Uint8Array(await r.arrayBuffer()));
      });
      this.fonts.set(url, f);
    }
    return f;
  }

  private opacity(fill: number, stroke: number) {
    if (fill < 1 || stroke < 1) this.out.push(`/${this.pdf.opacityState(Math.min(fill, 1), Math.min(stroke, 1))} gs`);
  }

  /** Entre dans le repère local de l'objet et applique son masque éventuel. */
  private enter(o: FabricObject) {
    this.out.push('q', cm(o.calcTransformMatrix()));
    const clip = o.clipPath as FabricObject | undefined;
    const path = clip && shapePath(clip, matTf(clip.calcOwnMatrix()));
    if (path) this.out.push(...path, 'W n');
  }

  private begin(tag: string): number {
    const id = this.mcid++;
    this.out.push(`/${tag} <</MCID ${id}>> BDC`);
    return id;
  }

  /** Formes décoratives : marquées comme artefacts, ignorées à la lecture. */
  shape(o: FabricObject) {
    if (!o.visible || o.opacity <= 0) return;
    const path = shapePath(o);
    if (!path) return;
    const open = o instanceof Line || (o instanceof Polyline && !(o instanceof Polygon));
    const fill = open ? null : parseColor(o.fill);
    const stroke = o.strokeWidth > 0 ? parseColor(o.stroke) : null;
    if (!fill && !stroke) return;
    this.out.push('/Artifact BMC');
    this.enter(o);
    this.opacity(o.opacity * (fill?.a ?? 1), o.opacity * (stroke?.a ?? 1));
    if (fill) this.out.push(`${rgb(fill)} rg`);
    if (stroke) {
      const cap = { butt: 0, round: 1, square: 2 }[o.strokeLineCap] ?? 0;
      const join = ({ miter: 0, round: 1, bevel: 2 } as Record<string, number>)[o.strokeLineJoin] ?? 0;
      this.out.push(`${rgb(stroke)} RG`, `${num(o.strokeWidth)} w`, `${cap} J`, `${join} j`);
      if (o.strokeDashArray?.length) this.out.push(`[${o.strokeDashArray.map(num).join(' ')}] ${num(o.strokeDashOffset || 0)} d`);
    }
    const evenOdd = o.fillRule === 'evenodd' ? '*' : '';
    this.out.push(...path, fill && stroke ? `B${evenOdd}` : fill ? `f${evenOdd}` : 'S', 'Q', 'EMC');
  }

  async text(t: Textbox, role: Role): Promise<Tagged> {
    const tagged: Tagged = { mcids: [], bySource: new Map(), links: [] };
    const tx = t as unknown as TextLayout;
    const left = tx._getLeftOffset();
    const top = tx._getTopOffset();
    const runs: Run[] = [];
    const lineStarts: { left: number; baseline: number; size: number; src: number }[] = [];
    let acc = 0;
    for (let i = 0; i < tx._textLines.length; i++) {
      const line = tx._textLines[i];
      const bounds = tx.__charBounds[i];
      const baseline = top + acc + tx.getHeightOfLineImpl(i) * (1 - tx._fontSizeFraction);
      const lineLeft = left + tx._getLineLeftOffset(i);
      const src = tx._styleMap?.[i]?.line ?? i;
      lineStarts.push({ left: lineLeft, baseline, size: tx.getHeightOfLineImpl(i) / 1.13, src });
      let run: Run | null = null;
      for (let j = 0; j < line.length; j++) {
        const at = (p: string) => tx.getValueOfPropertyAt(i, j, p);
        const style = {
          family: at('fontFamily'),
          weight: at('fontWeight'),
          size: Number(at('fontSize')),
          fill: at('fill'),
          underline: !!at('underline'),
          linethrough: !!at('linethrough'),
          dy: Number(at('deltaY')) || 0,
        };
        const b = bounds[j];
        // Un segment par mot et par style : chaque mot est placé exactement à la position
        // calculée par l'éditeur (alignements justifié / centré compris).
        const newWord = j > 0 && /\s/.test(line[j - 1]) && !/\s/.test(line[j]);
        const same = run && !newWord && run.family === style.family && run.weight === style.weight && run.size === style.size
          && run.fill === style.fill && run.underline === style.underline && run.linethrough === style.linethrough && run.dy === style.dy;
        if (!run || !same) runs.push((run = { x: lineLeft + b.left, end: 0, baseline, line: i, src, text: '', ...style }));
        run.text += line[j];
        run.end = lineLeft + b.left + b.width;
      }
      // Liens cliquables (e-mail, site, profil, téléphone) repérés sur la ligne affichée.
      const str = line.join('');
      for (const link of findLinks(str)) {
        const x0 = lineLeft + bounds[link.start].left;
        const last = bounds[link.end - 1];
        const x1 = lineLeft + last.left + last.width;
        const size = Number(tx.getValueOfPropertyAt(i, link.start, 'fontSize'));
        tagged.links.push({ src, index: this.links.length });
        this.links.push({ rect: this.pageRect(t, x0, baseline - size * 0.85, x1, baseline + size * 0.25), uri: link.uri, label: str.slice(link.start, link.end) });
      }
      acc += tx.getHeightOfLine(i);
    }
    if (!runs.length) return tagged;
    // Retour à la ligne automatique : l'espace de coupure est restitué (invisible) pour que
    // les mots ne soient pas collés à l'extraction (« du cadrage » et non « ducadrage »).
    for (let k = 0; k < runs.length - 1; k++) {
      const r = runs[k];
      const next = runs[k + 1];
      if (next.line !== r.line && next.src === r.src && !/\s$/.test(r.text)) r.text += ' ';
    }
    const fonts = await Promise.all(runs.map((r) => this.font(r.family, r.weight)));

    this.enter(t);
    const thick = (tx.fontSize * (tx.textDecorationThickness ?? 66.667)) / 1000;
    let openSrc = -1;
    const close = () => openSrc >= 0 && this.out.push('EMC');
    if (role !== 'L') tagged.mcids.push(this.begin(role));
    runs.forEach((r, k) => {
      if (role === 'L' && r.src !== openSrc) {
        close();
        openSrc = r.src;
        const id = this.begin('LBody');
        tagged.bySource.set(r.src, [...(tagged.bySource.get(r.src) ?? []), id]);
      }
      const c = parseColor(r.fill);
      if (!c) return;
      const font = fonts[k];
      const y = r.baseline + r.dy;
      this.out.push('q');
      this.opacity(tx.opacity * c.a, 1);
      this.out.push(`${rgb(c)} rg`);
      if (r.text.trim()) {
        // Matrice de texte inversée en y : les glyphes restent à l'endroit dans le repère « y vers le bas ».
        this.out.push(`BT /${this.pdf.fontName(font)} ${num(r.size)} Tf 1 0 0 -1 ${num(r.x)} ${num(y)} Tm ${font.encode(r.text)} Tj ET`);
      }
      const deco = (offset: number, align: number) =>
        this.out.push(`${num(r.x)} ${num(y + offset * r.size - align * thick)} ${num(r.end - r.x)} ${num(thick)} re f`);
      if (r.underline) deco(tx.offsets.underline, 0);
      if (r.linethrough) deco(tx.offsets.linethrough, 0.5);
      this.out.push('Q');
    });
    if (role === 'L') close();
    else this.out.push('EMC');
    this.out.push('Q');
    return tagged;
  }

  /** Rectangle local d'un objet → rectangle de page PDF (origine en bas à gauche). */
  private pageRect(o: FabricObject, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
    const tf = matTf(o.calcTransformMatrix());
    const pts = [tf(x0, y0), tf(x1, y0), tf(x1, y1), tf(x0, y1)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => this.pageH - p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  async image(o: FabricImage): Promise<number | null> {
    if (!o.visible || o.opacity <= 0) return null;
    const name = await this.embedImage(o);
    if (!name) return null;
    const id = this.begin('Figure');
    this.enter(o);
    this.opacity(o.opacity, 1);
    // Carré unité de l'image → rectangle local (y vers le bas).
    this.out.push(cm([o.width, 0, 0, -o.height, -o.width / 2, o.height / 2]), `/${name} Do`, 'Q', 'EMC');
    return id;
  }

  /** Ré-échantillonne l'image à la résolution utile (300 dpi) puis l'intègre au PDF. */
  private async embedImage(o: FabricImage): Promise<string | null> {
    const el = o.getElement() as CanvasImageSource;
    const targetW = Math.ceil((o.getScaledWidth() * IMAGE_DPI) / 72);
    const scale = Math.min(1, targetW / o.width);
    const w = Math.max(1, Math.round(o.width * scale));
    const h = Math.max(1, Math.round(o.height * scale));
    const key = `${o.getSrc()}|${o.cropX}|${o.cropY}|${w}x${h}`;
    const existing = this.pdf.hasImage(key);
    if (existing) return existing;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(el, o.cropX, o.cropY, o.width, o.height, 0, 0, w, h);
    if (hasTransparency(ctx, w, h)) {
      const px = ctx.getImageData(0, 0, w, h).data;
      const rgbData = new Uint8Array(w * h * 3);
      const alpha = new Uint8Array(w * h);
      for (let i = 0, j = 0, k = 0; i < px.length; i += 4) {
        rgbData[j++] = px[i];
        rgbData[j++] = px[i + 1];
        rgbData[j++] = px[i + 2];
        alpha[k++] = px[i + 3];
      }
      return this.pdf.image(key, { width: w, height: h, rgb: rgbData, alpha });
    }
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return null;
    return this.pdf.image(key, { width: w, height: h, jpeg: new Uint8Array(await blob.arrayBuffer()) });
  }
}

/** Un objet de dessin plus haut dans la pile recouvre-t-il ce texte ? */
function covered(item: Item, objs: FabricObject[]): boolean {
  for (let z = item.z + 1; z < objs.length; z++) {
    const o = objs[z];
    if (!o.visible || isText(o)) continue;
    const r = o.getBoundingRect();
    if (r.left < item.x1 && r.left + r.width > item.x0 && r.top < item.y1 && r.top + r.height > item.y0) return true;
  }
  return false;
}

export async function exportPdf(canvas: Canvas, size: { w: number; h: number }, meta: DocMeta): Promise<Uint8Array> {
  const pdf = new PdfDocument();
  const writer = new Writer(pdf, size.h);
  const objs = canvas.getObjects();
  const items = collectItems(canvas);
  const ordered = readingOrder(items);
  // Les textes non recouverts sont écrits à la fin, dans l'ordre de lecture : c'est l'ordre
  // dans lequel les IA et les ATS les extrairont. Le rendu visuel est inchangé.
  const late = new Set(items.filter((it) => it.kind === 'text' && !covered(it, objs)).map((it) => it.obj));
  const itemOf = new Map(items.map((it) => [it.obj, it]));
  const tags = new Map<FabricObject, Tagged | number>();

  // Repère global : origine en haut à gauche, y vers le bas (comme le canevas).
  writer.out.push('q', cm([1, 0, 0, -1, 0, size.h]));
  const bg = parseColor(canvas.backgroundColor);
  if (bg && rgb(bg) !== '1 1 1') writer.out.push('/Artifact BMC', `${rgb(bg)} rg`, `0 0 ${num(size.w)} ${num(size.h)} re f`, 'EMC');
  for (const o of objs) {
    if (late.has(o)) continue;
    if (isText(o)) {
      const it = itemOf.get(o);
      if (it) tags.set(o, await writer.text(o, it.role));
    } else if (o instanceof FabricImage) {
      const id = await writer.image(o);
      if (id !== null) tags.set(o, id);
    } else writer.shape(o);
  }
  for (const it of ordered) if (late.has(it.obj)) tags.set(it.obj, await writer.text(it.obj as Textbox, it.role));
  writer.out.push('Q');

  // Arbre de structure dans l'ordre de lecture.
  const nodes: StructNode[] = [];
  for (const it of ordered) {
    const tag = tags.get(it.obj);
    if (tag === undefined) continue;
    if (typeof tag === 'number') {
      nodes.push({ type: 'Figure', mcids: [tag], alt: it.obj.clipPath instanceof Circle ? 'Photo de profil' : 'Image' });
    } else if (it.role === 'L') {
      const items = [...tag.bySource].map(([src, mcids]) => ({ mcids, links: tag.links.filter((l) => l.src === src).map((l) => l.index) }));
      nodes.push({ type: 'L', mcids: [], items });
    } else if (tag.mcids.length) {
      nodes.push({ type: it.role, mcids: tag.mcids, links: tag.links.map((l) => l.index) });
    }
  }

  return pdf.page(size.w, size.h, writer.out.join('\n'), {
    title: meta.title || 'Document',
    author: meta.author,
    subject: meta.subject,
    keywords: meta.keywords,
    lang: 'fr-FR',
  }, { nodes, links: writer.links });
}
