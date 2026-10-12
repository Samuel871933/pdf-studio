// Outils de construction des modèles : palette de couleurs + mise en page « en flux »
// (chaque bloc renvoie sa position basse, le suivant se place dessous : aucun chevauchement).
// Les objets sont créés dans l'ordre de lecture : le texte du PDF reste ainsi bien
// ordonné pour les logiciels de recrutement (ATS).
import { Circle, FabricImage, Line, Polygon, Rect, Textbox, type FabricObject } from 'fabric';
import { applyLock, type CanvasJSON } from '../editor';
import { placeholderPhoto } from '../images';
import { iconPath, makeRound } from '../shapes';

export const W = 595.28;
export const H = 841.89;

export interface Palette {
  id: string;
  label: string;
  /** Couleur principale (fonds sombres, titres). */
  primary: string;
  /** Couleur d'accent (bandeaux, filets, puces). */
  secondary: string;
  /** Fond des panneaux clairs. */
  panel: string;
  text: string;
  muted: string;
  /** Texte sur fond principal. */
  onPrimary: string;
  /** Texte secondaire sur fond principal. */
  onPrimarySoft: string;
}

export const PALETTES: Palette[] = [
  { id: 'ardoise', label: 'Ardoise', primary: '#212a39', secondary: '#66747d', panel: '#f6f6f3', text: '#212a39', muted: '#5d6672', onPrimary: '#ffffff', onPrimarySoft: '#c3cad3' },
  { id: 'ocean', label: 'Océan', primary: '#14365d', secondary: '#2f6fb0', panel: '#f1f5fa', text: '#18263a', muted: '#55657a', onPrimary: '#ffffff', onPrimarySoft: '#b9cde6' },
  { id: 'foret', label: 'Forêt', primary: '#1f3d32', secondary: '#3c7a5c', panel: '#f2f6f3', text: '#1c2b25', muted: '#55665e', onPrimary: '#ffffff', onPrimarySoft: '#bcd6c8' },
  { id: 'bordeaux', label: 'Bordeaux', primary: '#4f1a29', secondary: '#9b3b50', panel: '#faf4f5', text: '#2c1a20', muted: '#6e5a60', onPrimary: '#ffffff', onPrimarySoft: '#e3c2ca' },
  { id: 'terracotta', label: 'Terracotta', primary: '#3a2a24', secondary: '#bd6240', panel: '#fbf5f1', text: '#2e221d', muted: '#6d5d55', onPrimary: '#ffffff', onPrimarySoft: '#e8cbbd' },
  { id: 'graphite', label: 'Graphite', primary: '#1d1d1f', secondary: '#55565c', panel: '#f4f4f5', text: '#1d1d1f', muted: '#5f6066', onPrimary: '#ffffff', onPrimarySoft: '#c9c9cf' },
];

export interface Entry {
  title: string;
  org: string;
  dates: string;
  bullets?: string[];
  text?: string;
}

export type HeadingStyle = 'rule' | 'bar' | 'big' | 'caps' | 'onDark';

type TextOpts = Partial<Textbox>;

export class Builder {
  readonly objs: FabricObject[] = [];
  private flowStart = 0;
  private marks: number[] = [];
  private sameRowNext = false;
  private current: { id: string; name: string; locked: boolean } | null = null;
  private groupCount = 0;

  constructor(readonly P: Palette) {}

  /**
   * Les éléments ajoutés ensuite forment un groupe dans les calques (`null` : fin du groupe).
   * Les groupes se suivent dans l'ordre de création : ils restent contigus dans la pile.
   */
  group(name: string | null, opts: { locked?: boolean } = {}) {
    this.current = name ? { id: `t${++this.groupCount}`, name, locked: !!opts.locked } : null;
  }

  add<T extends FabricObject>(o: T): T {
    if (this.current) {
      o.set({ groupId: this.current.id, groupName: this.current.name });
      if (this.current.locked) applyLock(o, true);
    }
    this.objs.push(o);
    return o;
  }

  rect(x: number, y: number, w: number, h: number, fill: string, rx = 0) {
    return this.add(new Rect({ left: x, top: y, width: w, height: h, fill, rx, ry: rx, strokeWidth: 0 }));
  }

  poly(points: { x: number; y: number }[], fill: string) {
    return this.add(new Polygon(points, { fill, strokeWidth: 0 }));
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1) {
    return this.add(new Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width, strokeLineCap: 'butt' }));
  }

  circle(cx: number, cy: number, r: number, fill: string) {
    return this.add(new Circle({ left: cx - r, top: cy - r, radius: r, fill, strokeWidth: 0 }));
  }

  icon(d: string, x: number, y: number, size: number, fill: string) {
    return this.add(iconPath(d, size, { left: x, top: y, fill }));
  }

  text(str: string, x: number, y: number, w: number, opts: TextOpts = {}) {
    return this.add(
      new Textbox(str, {
        left: x,
        top: y,
        width: w,
        fontFamily: 'Lato',
        fontSize: 10,
        lineHeight: 1.3,
        fill: this.P.text,
        ...opts,
      } as TextOpts),
    );
  }

  /** Texte puis position basse (+ espacement). */
  para(str: string, x: number, y: number, w: number, opts: TextOpts = {}, gap = 0) {
    const t = this.text(str, x, y, w, opts);
    return y + t.height + gap;
  }

  /** Met en gras le début des lignes jusqu'au séparateur (ex. « Outils : »). */
  boldPrefix(t: Textbox, sep: string) {
    let offset = 0;
    for (const line of t.text.split('\n')) {
      const end = line.indexOf(sep);
      if (end > 0) t.setSelectionStyles({ fontWeight: 'bold' }, offset, offset + end + sep.length);
      offset += line.length + 1;
    }
  }

  /** Démarre une colonne : ses sections pourront être espacées par `spread`. */
  flow() {
    this.flowStart = this.objs.length;
    this.marks = [];
  }

  /** Début de section : l'espace supplémentaire éventuel s'insère ici. */
  mark() {
    if (this.sameRowNext) this.sameRowNext = false;
    else if (this.objs.length > this.flowStart) this.marks.push(this.objs.length);
  }

  /** La prochaine section est sur la même rangée que la précédente (pas d'espace inséré). */
  sameRow() {
    this.sameRowNext = true;
  }

  /**
   * Répartit l'espace libre sous la colonne entre ses sections (au plus `maxExtra` par section),
   * pour une page équilibrée quelle que soit la longueur du contenu.
   */
  spread(bottom: number, limit: number, maxExtra = 14) {
    const n = this.marks.length;
    if (!n || bottom >= limit) return;
    const extra = Math.min(maxExtra, (limit - bottom) / n);
    let k = 0;
    for (let i = this.flowStart; i < this.objs.length; i++) {
      while (k < n && this.marks[k] <= i) k++;
      if (k) this.objs[i].top += extra * k;
    }
  }

  heading(str: string, x: number, y: number, w: number, style: HeadingStyle = 'rule', color = this.P.primary) {
    const P = this.P;
    this.mark();
    switch (style) {
      case 'rule': {
        const t = this.text(str.toUpperCase(), x, y, w, { fontWeight: 'bold', fontSize: 10.5, fill: color });
        const ly = y + t.height + 3;
        this.line(x, ly, x + w, ly, P.secondary, 0.8);
        return ly + 7;
      }
      case 'bar': {
        const t = this.text(str.toUpperCase(), x + 10, y, w - 10, { fontWeight: 'bold', fontSize: 10.5, fill: color });
        this.rect(x, y + 1, 4, t.height - 2, P.secondary);
        return y + t.height + 6;
      }
      case 'big': {
        const t = this.text(str.toUpperCase(), x, y, w, { fontFamily: 'Arima', fontWeight: 'bold', fontSize: 19, lineHeight: 1, fill: color });
        return y + t.height + 7;
      }
      case 'caps': {
        const t = this.text(str.toUpperCase(), x, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 9.5, fill: P.secondary });
        return y + t.height + 6;
      }
      case 'onDark': {
        const t = this.text(str.toUpperCase(), x, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 9.5, fill: P.onPrimary });
        const ly = y + t.height + 3;
        this.line(x, ly, x + 28, ly, P.onPrimarySoft, 1.5);
        return ly + 8;
      }
    }
  }

  bullets(items: string[], x: number, y: number, w: number, opts: TextOpts = {}, gap = 0) {
    return this.para(items.map((i) => `•  ${i}`).join('\n'), x, y, w, { lineHeight: 1.4, ...opts }, gap);
  }

  /** Poste / diplôme : titre (+ dates à droite), organisation, puis détails. */
  entry(e: Entry, x: number, y: number, w: number, opts: { datesRight?: boolean; gap?: number } = {}) {
    const P = this.P;
    const datesRight = opts.datesRight ?? true;
    const dw = 120;
    const title = this.text(e.title, x, y, datesRight ? w - dw : w, { fontWeight: 'bold', fontSize: 11 });
    if (datesRight) this.text(e.dates, x + w - dw, y + 1.5, dw, { fontSize: 9.5, fill: P.muted, textAlign: 'right' });
    y += title.height + 1;
    y = this.para(datesRight ? e.org : `${e.org}  ·  ${e.dates}`, x, y, w, { fontSize: 9.5, fill: P.secondary }, 3);
    if (e.text) y = this.para(e.text, x, y, w, {}, 2);
    if (e.bullets?.length) y = this.bullets(e.bullets, x, y, w);
    return y + (opts.gap ?? 9);
  }

  /** Variante « colonne de dates » : dates à gauche, contenu à droite. */
  entryDated(e: Entry, x: number, y: number, dateW: number, w: number, gap = 9) {
    const P = this.P;
    this.text(e.dates, x, y + 1.5, dateW - 10, { fontSize: 9.5, fill: P.muted });
    const cx = x + dateW;
    const cw = w - dateW;
    const title = this.text(e.title, cx, y, cw, { fontWeight: 'bold', fontSize: 11 });
    y += title.height + 1;
    y = this.para(e.org, cx, y, cw, { fontSize: 9.5, fill: P.secondary }, 3);
    if (e.text) y = this.para(e.text, cx, y, cw, {}, 2);
    if (e.bullets?.length) y = this.bullets(e.bullets, cx, y, cw);
    return y + gap;
  }

  /** Liste « icône + texte » (coordonnées, centres d'intérêt). */
  iconList(items: [d: string, text: string][], x: number, y: number, w: number, color: string, iconColor: string, size = 9.5, gap = 7) {
    for (const [d, str] of items) {
      const t = this.text(str, x + size + 8, y, w - size - 8, { fontSize: size, fill: color });
      this.icon(d, x, y + (size * 1.13 - size * 1.05) / 2 + 0.5, size * 1.05, iconColor);
      y += t.height + gap;
    }
    return y;
  }

  /** Étiquettes arrondies qui passent à la ligne automatiquement. */
  tags(items: string[], x: number, y: number, w: number, fill: string, color: string, size = 8.5) {
    const padX = 6;
    const padY = 3;
    const gap = 5;
    let cx = x;
    let lineH = 0;
    for (const item of items) {
      const t = new Textbox(item, { fontFamily: 'Lato', fontSize: size, fill: color, width: 400, lineHeight: 1.1 } as TextOpts);
      const tw = Math.ceil(t.getLineWidth(0)) + 1;
      const bw = tw + padX * 2;
      const bh = t.height + padY * 2;
      if (cx + bw > x + w && cx > x) {
        cx = x;
        y += lineH + gap;
      }
      this.rect(cx, y, bw, bh, fill, bh / 2);
      t.set({ left: cx + padX, top: y + padY, width: tw });
      this.add(t);
      cx += bw + gap;
      lineH = bh;
    }
    return y + lineH + 8;
  }

  /** Barres de niveau (compétences). */
  bars(items: [label: string, level: number][], x: number, y: number, w: number, color: string, track: string, fill: string) {
    for (const [label, level] of items) {
      const t = this.text(label, x, y, w, { fontSize: 9, fill: color });
      y += t.height + 3;
      this.rect(x, y, w, 4, track, 2);
      this.rect(x, y, Math.max(4, w * level), 4, fill, 2);
      y += 10;
    }
    return y + 2;
  }

  /** Points de niveau sur 5 (langues). */
  dots(items: [label: string, level: number][], x: number, y: number, w: number, color: string, on: string, off: string) {
    for (const [label, level] of items) {
      const t = this.text(label, x, y, w - 60, { fontSize: 9, fill: color });
      for (let i = 0; i < 5; i++) this.circle(x + w - 52 + i * 11 + 3.5, y + t.height / 2, 3.5, i < level ? on : off);
      y += t.height + 6;
    }
    return y + 2;
  }

  async photo(x: number, y: number, size: number) {
    const img = await FabricImage.fromURL(placeholderPhoto());
    img.set({ left: x, top: y });
    img.scaleToWidth(size);
    makeRound(img, true);
    return this.add(img);
  }

  json(background = '#ffffff'): CanvasJSON {
    // Un groupe d'un seul élément n'a pas d'intérêt : l'élément reste seul.
    const count = new Map<string, number>();
    for (const o of this.objs) if (o.groupId) count.set(o.groupId, (count.get(o.groupId) ?? 0) + 1);
    for (const o of this.objs) if (o.groupId && count.get(o.groupId)! < 2) o.set({ groupId: undefined, groupName: undefined });
    return { background, objects: this.objs.map((o) => o.toObject() as Record<string, unknown>) };
  }
}
