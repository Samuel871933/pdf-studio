// Outils de mise en page libre pour l'assistant : lecture compacte de la page et opérations
// appliquées sur une copie (brouillon JSON). Rien ne touche la page réelle avant Appliquer.
import { Path, type FabricObject } from 'fabric';
import { PAGE, type CanvasJSON } from '../editor';
import { FONT_FAMILIES } from '../fonts';
import { ICONS, banner, circle, icon, line, rect, star, text, triangle, type IconName } from '../shapes';
import { retouchOf } from '../retouch';
import { array, object, text as str, validate, type Schema } from './schema';

type Json = Record<string, any>;

/** Brouillon de page : identifiants stables pendant une demande, même après ajouts et suppressions. */
export interface PageDraft {
  background: unknown;
  objects: Json[];
  ids: string[];
  next: number;
  /** Un élément du modèle a été modifié ou supprimé (retouche, remplacée si la fiche régénère la page). */
  retouched: boolean;
}

export function createDraft(json: CanvasJSON): PageDraft {
  const objects = structuredClone(json.objects) as Json[];
  return { background: json.background, objects, ids: objects.map((_, i) => `e${i + 1}`), next: 1, retouched: false };
}

export const draftJSON = (d: PageDraft): CanvasJSON => ({ background: d.background, objects: d.objects });

const r = (n: unknown) => Math.round(Number(n) || 0);
const size = (o: Json) => ({ w: r((o.width ?? 0) * (o.scaleX ?? 1)), h: r((o.height ?? 0) * (o.scaleY ?? 1)) });

// Couleurs et contraste (WCAG) pour signaler à l'assistant un texte peu lisible, sans image de la page.
function luminance(color: unknown): number | null {
  if (typeof color !== 'string') return null;
  let hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const [rr, gg, bb] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const box = (o: Json) => { const { w, h } = size(o); return { x0: o.left ?? 0, y0: o.top ?? 0, x1: (o.left ?? 0) + w, y1: (o.top ?? 0) + h }; };
const opaque = (o: Json) => typeof o.text !== 'string' && o.visible !== false && (o.opacity ?? 1) >= 0.5
  && (String(o.type).toLowerCase() === 'image' || luminance(o.fill) !== null);

/**
 * Lecture compacte de la page, tirée de son JSON : une ligne par élément, regroupée par section du modèle.
 * Pour chaque texte : couleur réellement dessous, contraste insuffisant, éléments qui le recouvrent.
 */
export function describePage(d: PageDraft): string {
  const background = typeof d.background === 'string' ? d.background : '#ffffff';
  const sections = new Map<string, string[]>();
  d.objects.forEach((o, i) => {
    const { w, h } = size(o);
    const b = box(o);
    const parts = [d.ids[i], `z=${i}`, String(o.type).toLowerCase(), `x=${r(o.left)} y=${r(o.top)} w=${w} h=${h}`];
    if (o.angle) parts.push(`angle=${r(o.angle)}`);
    if (typeof o.fill === 'string' && o.fill) parts.push(`fill=${o.fill}`);
    if (typeof o.stroke === 'string' && o.strokeWidth) parts.push(`stroke=${o.stroke}/${o.strokeWidth}`);
    if (o.opacity != null && o.opacity < 1) parts.push(`opacity=${o.opacity}`);
    if (o.rx) parts.push(`radius=${r(o.rx)}`);
    if (typeof o.text === 'string') {
      const t = o.text.replace(/\s+/g, ' ').trim();
      parts.push(`"${t.length > 48 ? `${t.slice(0, 48)}…` : t}"`, `${o.fontFamily} ${o.fontSize}${o.fontWeight === 'bold' || Number(o.fontWeight) >= 600 ? ' bold' : ''}${o.fontStyle === 'italic' ? ' italic' : ''}`);
      if (o.textAlign && o.textAlign !== 'left') parts.push(`align=${o.textAlign}`);
      // Fond sous le centre du texte : la forme opaque la plus haute en dessous, sinon la page.
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const under = d.objects.slice(0, i).reverse().find((u) => { const ub = box(u); return opaque(u) && ub.x0 <= cx && ub.x1 >= cx && ub.y0 <= cy && ub.y1 >= cy; });
      const below = under ? (String(under.type).toLowerCase() === 'image' ? 'image' : under.fill) : background;
      parts.push(`sur=${below}`);
      const fg = luminance(o.fill), bg = luminance(below);
      if (fg !== null && bg !== null && contrast(fg, bg) < 3) parts.push(`contraste=${contrast(fg, bg).toFixed(1)}!`);
      const covering = d.objects.slice(i + 1).flatMap((u, k) => {
        if (!opaque(u)) return [];
        const ub = box(u);
        const area = Math.max(0, Math.min(b.x1, ub.x1) - Math.max(b.x0, ub.x0)) * Math.max(0, Math.min(b.y1, ub.y1) - Math.max(b.y0, ub.y0));
        return area > 0.3 * Math.max(1, w * h) ? [d.ids[i + 1 + k]] : [];
      });
      if (covering.length) parts.push(`recouvert par ${covering.join(',')}!`);
    }
    if (b.x1 < 0 || b.y1 < 0 || b.x0 > PAGE.w || b.y0 > PAGE.h) parts.push('hors page!');
    if (o.field) parts.push(`champ=${o.field}`);
    if (o.tpl && retouchOf(o)) parts.push('retouché');
    if (o.locked) parts.push('verrouillé');
    if (o.visible === false) parts.push('masqué');
    const section = o.tpl ? `${o.groupName ?? o.sectionKey ?? 'Modèle'}${o.sectionKey ? ` (${o.sectionKey})` : ''}` : 'Ajoutés hors modèle';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(parts.join(' '));
  });
  return `Page ${r(PAGE.w)}×${r(PAGE.h)} pt, origine en haut à gauche, fond ${background}. z : ordre d’empilement (0 = arrière-plan). « ! » signale un problème de lecture.\n`
    + [...sections].map(([name, lines]) => `[${name}]\n${lines.join('\n')}`).join('\n');
}

const num = (minimum: number, maximum: number): Schema => ({ type: 'number', minimum, maximum });
const SHAPES = ['rect', 'ellipse', 'triangle', 'star', 'banner', 'line', 'path', 'text', 'icon'];
const OPERATION = object({
  action: { type: 'string', enum: ['add', 'update', 'remove', 'front', 'back', 'restore', 'background'] },
  ids: array(str(12), 80), shape: { type: 'string', enum: SHAPES },
  x: num(-600, 1200), y: num(-900, 1700), w: num(1, 1200), h: num(1, 1700), dx: num(-900, 900), dy: num(-900, 900),
  angle: num(-360, 360), fill: str(40), stroke: str(40), strokeWidth: num(0, 40), opacity: num(0, 1), radius: num(0, 400),
  d: str(6000), text: str(3000), fontFamily: { type: 'string', enum: FONT_FAMILIES }, fontSize: num(4, 120),
  bold: { type: 'boolean' }, italic: { type: 'boolean' }, align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
  lineHeight: num(0.8, 3), charSpacing: num(-200, 1000), icon: { type: 'string', enum: Object.keys(ICONS) },
}, ['action']);
export const PAGE_SCHEMA = object({ summary: str(1200), operations: array(OPERATION, 60) }, ['summary', 'operations']);

export const PAGE_TOOLS = [
  { name: 'read_page', description: 'Renvoie la liste des éléments de la page (identifiant, type, position et taille en points, couleurs, texte, police). À appeler avant edit_page.', schema: object({}) },
  {
    name: 'edit_page',
    description: 'Prépare des modifications visuelles libres sur une copie de la page, affichée en aperçu jusqu’au clic Appliquer. '
      + 'add : shape + x, y, w, h (path : d au format SVG, redimensionné à w×h ; text : text, fontFamily, fontSize… ; icon : icon). '
      + 'update : ids + propriétés à changer (dx, dy pour déplacer). remove, front, back : ids. restore : ids d’éléments du modèle, rendus à leur aspect d’origine. background : fill. Couleurs en #rrggbb.',
    schema: PAGE_SCHEMA,
  },
];

const COLOR = /^(#[0-9a-f]{6}|#[0-9a-f]{3}|transparent)$/i;
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;

/** Applique les opérations au brouillon, dans l'ordre. Une opération invalide annule tout l'appel. */
export function editDraft(d: PageDraft, args: unknown, linked: boolean): string[] {
  validate(PAGE_SCHEMA, args);
  const { operations } = args as { operations: Json[] };
  const work: PageDraft = structuredClone(d);
  const report: string[] = [];
  const find = (id: string) => {
    const i = work.ids.indexOf(id);
    if (i < 0) throw new Error(`Élément ${id} introuvable : relis la page avec read_page.`);
    return i;
  };
  operations.forEach((op, n) => {
    const where = `opération ${n + 1}`;
    for (const k of ['fill', 'stroke'] as const) if (op[k] !== undefined && !COLOR.test(op[k])) throw new Error(`${where} : couleur ${k} invalide (#rrggbb).`);
    if (op.action === 'background') {
      if (!op.fill) throw new Error(`${where} : fill requis.`);
      work.background = op.fill;
    } else if (op.action === 'add') {
      const o = build(op, where);
      work.objects.push(o);
      work.ids.push(`n${work.next++}`);
      report.push(`${work.ids.at(-1)} ajouté`);
    } else {
      const ids: string[] = op.ids ?? [];
      if (!ids.length) throw new Error(`${where} : ids requis.`);
      const indexes = ids.map(find);
      for (const i of indexes) if (work.objects[i].locked) throw new Error(`${where} : ${work.ids[i]} est verrouillé par l’utilisateur.`);
      if (indexes.some((i) => work.objects[i].tpl)) work.retouched = true;
      if (op.action === 'update') for (const i of indexes) update(work.objects[i], op, linked, `${where} (${work.ids[i]})`);
      else if (op.action === 'restore') for (const i of indexes) {
        const o = work.objects[i];
        if (!o.tpl || !o.tplBase) throw new Error(`${where} : ${work.ids[i]} n’est pas un élément du modèle.`);
        Object.assign(o, o.tplBase);
      }
      else {
        const picked = indexes.sort((a, b) => a - b).map((i) => [work.objects[i], work.ids[i]] as const);
        for (const i of [...indexes].sort((a, b) => b - a)) { work.objects.splice(i, 1); work.ids.splice(i, 1); }
        if (op.action === 'front') picked.forEach(([o, id]) => { work.objects.push(o); work.ids.push(id); });
        if (op.action === 'back') picked.reverse().forEach(([o, id]) => { work.objects.unshift(o); work.ids.unshift(id); });
      }
    }
  });
  Object.assign(d, work);
  return report;
}

function build(op: Json, where: string): Json {
  if (!op.shape) throw new Error(`${where} : shape requis pour add.`);
  const fill = op.fill;
  let o: FabricObject;
  switch (op.shape) {
    case 'rect': o = rect(fill ? { fill } : {}); break;
    case 'ellipse': o = circle(fill ? { fill } : {}); break;
    case 'triangle': o = triangle(fill ? { fill } : {}); break;
    case 'star': o = star(50, fill ? { fill } : {}); break;
    case 'banner': o = banner(120, 200, 30, fill ? { fill } : {}); break;
    case 'line': o = line(op.stroke ? { stroke: op.stroke } : {}); break;
    case 'icon': o = icon((op.icon ?? 'web') as IconName, op.w ?? 14, fill ? { fill } : {}); break;
    case 'path':
      if (!op.d || !PATH.test(op.d)) throw new Error(`${where} : d doit être un tracé SVG (commandes M, L, C, Q, A, Z… et nombres).`);
      o = new Path(op.d, { fill: fill ?? '#66747d', strokeWidth: 0 });
      break;
    default: o = text(op.text ?? 'Texte', op.w ? { width: op.w } : {});
  }
  const json = o.toObject() as Json;
  // Sans position : centré sur la page.
  const { w, h } = size(json);
  json.left = op.x ?? (PAGE.w - w) / 2;
  json.top = op.y ?? (PAGE.h - h) / 2;
  update(json, { ...op, x: undefined, y: undefined, ...(op.shape === 'icon' ? { w: undefined, h: undefined } : {}) }, false, where);
  return json;
}

function update(o: Json, op: Json, linked: boolean, where: string) {
  const isText = typeof o.text === 'string';
  if (op.x !== undefined) o.left = op.x;
  if (op.y !== undefined) o.top = op.y;
  if (op.dx !== undefined) o.left = (o.left ?? 0) + op.dx;
  if (op.dy !== undefined) o.top = (o.top ?? 0) + op.dy;
  if (op.w !== undefined) {
    if (isText) o.width = op.w / (o.scaleX ?? 1);
    else if (o.width) o.scaleX = op.w / o.width;
  }
  if (op.h !== undefined && !isText && o.height) o.scaleY = op.h / o.height;
  if (op.angle !== undefined) o.angle = op.angle;
  if (op.opacity !== undefined) o.opacity = op.opacity;
  if (op.fill !== undefined) o.fill = op.fill;
  if (op.stroke !== undefined) o.stroke = op.stroke;
  if (op.strokeWidth !== undefined) o.strokeWidth = op.strokeWidth;
  if (op.radius !== undefined && String(o.type).toLowerCase() === 'rect') { o.rx = op.radius; o.ry = op.radius; }
  const textProps = ['text', 'fontFamily', 'fontSize', 'bold', 'italic', 'align', 'lineHeight', 'charSpacing'].filter((k) => op[k] !== undefined);
  if (!textProps.length) return;
  if (!isText) throw new Error(`${where} : ${textProps.join(', ')} ne s’applique qu’à un texte.`);
  if (op.text !== undefined) {
    // Le texte d'un champ vient de la fiche : le modifier ici serait écrasé à la prochaine régénération.
    if (linked && o.field) throw new Error(`${where} : texte relié au champ ${o.field}, modifie-le avec propose_document.`);
    o.text = op.text;
    o.styles = [];
  }
  if (op.fontFamily !== undefined) o.fontFamily = op.fontFamily;
  if (op.fontSize !== undefined) o.fontSize = op.fontSize;
  if (op.bold !== undefined) o.fontWeight = op.bold ? 'bold' : 'normal';
  if (op.italic !== undefined) o.fontStyle = op.italic ? 'italic' : 'normal';
  if (op.align !== undefined) o.textAlign = op.align;
  if (op.lineHeight !== undefined) o.lineHeight = op.lineHeight;
  if (op.charSpacing !== undefined) o.charSpacing = op.charSpacing;
}
