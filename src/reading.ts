// Ordre de lecture et structure du document, partagés par l'export PDF et l'analyse IA.
// Les IA de tri (et les ATS) extraient le texte du PDF puis le lisent dans l'ordre du fichier :
// on écrit donc le texte colonne par colonne, de haut en bas, quel que soit l'ordre de création.
import { FabricImage, type Canvas, type FabricObject, type Textbox } from 'fabric';
import { isText } from './shapes';

export type Role = 'H1' | 'H2' | 'H3' | 'P' | 'L';

export interface Item {
  obj: FabricObject;
  /** Index d'empilement (ordre de dessin). */
  z: number;
  kind: 'text' | 'image';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  role: Role;
}

const BULLET = /^\s*[•\-–—▪●◦*·]\s+/;

export function isBulletList(t: Textbox): boolean {
  const lines = t.text.split('\n').filter((l) => l.trim());
  return lines.length > 0 && lines.every((l) => BULLET.test(l));
}

const letters = (s: string) => s.replace(/[^\p{L}]/gu, '');

/** Rôle sémantique d'un texte : nom (H1), titre de section (H2), intitulé (H3), liste ou paragraphe. */
export function textRole(t: Textbox, maxFont: number): Role {
  const txt = t.text.trim();
  if (isBulletList(t)) return 'L';
  const single = !txt.includes('\n') || txt.split('\n').length <= 2;
  const l = letters(txt);
  const upper = l.length > 1 && l === l.toUpperCase();
  const bold = t.fontWeight === 'bold' || Number(t.fontWeight) >= 600;
  if (t.fontSize >= 18 && t.fontSize >= maxFont - 0.5 && single) return 'H1';
  if (single && txt.length <= 40 && upper && t.fontSize >= 8.5 && !/\d{3,}/.test(txt)) return 'H2';
  if (single && txt.length <= 80 && bold && !txt.includes('\n')) return 'H3';
  return 'P';
}

/** Éléments porteurs de contenu (textes non vides, images), avec leur rôle et leur boîte. */
export function collectItems(canvas: Canvas): Item[] {
  const objs = canvas.getObjects();
  const texts = objs.filter((o): o is Textbox => isText(o) && o.visible && !!o.text.trim());
  const maxFont = Math.max(0, ...texts.map((t) => t.fontSize));
  const items: Item[] = [];
  objs.forEach((o, z) => {
    if (!o.visible || o.opacity <= 0) return;
    const r = o.getBoundingRect();
    const box = { x0: r.left, y0: r.top, x1: r.left + r.width, y1: r.top + r.height };
    if (isText(o) && o.text.trim()) items.push({ obj: o, z, kind: 'text', ...box, role: textRole(o, maxFont) });
    else if (o instanceof FabricImage) items.push({ obj: o, z, kind: 'image', ...box, role: 'P' });
  });
  return items;
}

// ------------------------------------------------------------------ Découpage en colonnes

const MIN_GUTTER = 8;
const ROW_TOLERANCE = 4;

/** Plus long intervalle vertical libre à l'abscisse x (aucune boîte ne traverse x). */
function freeRun(items: Item[], x: number, top: number, bottom: number): [number, number] {
  const spans = items.filter((b) => b.x0 < x && b.x1 > x).map((b) => [b.y0, b.y1]).sort((a, b) => a[0] - b[0]);
  let best: [number, number] = [0, 0];
  let cursor = top;
  for (const [a, b] of spans) {
    if (a - cursor > best[1] - best[0]) best = [cursor, a];
    cursor = Math.max(cursor, b);
  }
  if (bottom - cursor > best[1] - best[0]) best = [cursor, bottom];
  return best;
}

function leafSort(items: Item[]): Item[] {
  return [...items].sort((a, b) => (Math.abs(a.y0 - b.y0) < ROW_TOLERANCE ? a.x0 - b.x0 : a.y0 - b.y0));
}

/**
 * Ordre de lecture par découpage récursif : on cherche d'abord une gouttière verticale
 * (couloir vide occupant une grande partie de la hauteur) qui sépare des colonnes ;
 * à défaut, on découpe en bandes horizontales.
 */
export function readingOrder(items: Item[]): Item[] {
  if (items.length <= 1) return items;
  const top = Math.min(...items.map((b) => b.y0));
  const bottom = Math.max(...items.map((b) => b.y1));
  const left = Math.min(...items.map((b) => b.x0));
  const right = Math.max(...items.map((b) => b.x1));
  const height = bottom - top;

  // 1. Gouttière verticale
  let gutter: { x: number; run: [number, number] } | null = null;
  for (let x = left + 2; x < right - 2; x += 2) {
    const run = freeRun(items, x, top, bottom);
    const len = run[1] - run[0];
    if (len < Math.max(30, height * 0.45)) continue;
    // Couloir assez large et contenu des deux côtés dans la zone libre.
    const inZone = items.filter((b) => (b.y0 + b.y1) / 2 >= run[0] && (b.y0 + b.y1) / 2 <= run[1]);
    const l = inZone.filter((b) => b.x1 <= x);
    const r = inZone.filter((b) => b.x0 >= x);
    if (!l.length || !r.length) continue;
    const gap = Math.min(...r.map((b) => b.x0)) - Math.max(...l.map((b) => b.x1));
    if (gap < MIN_GUTTER) continue;
    if (!gutter || len > gutter.run[1] - gutter.run[0]) gutter = { x, run };
  }
  if (gutter) {
    const [ya, yb] = gutter.run;
    const mid = (b: Item) => (b.y0 + b.y1) / 2;
    const above = items.filter((b) => mid(b) < ya);
    const below = items.filter((b) => mid(b) > yb);
    const zone = items.filter((b) => mid(b) >= ya && mid(b) <= yb);
    const leftCol = zone.filter((b) => (b.x0 + b.x1) / 2 < gutter.x);
    const rightCol = zone.filter((b) => (b.x0 + b.x1) / 2 >= gutter.x);
    // En-tête d'une colonne : ce qui finit avant le premier contenu de l'autre colonne
    // (ex. le nom en haut à droite, au-dessus d'une colonne gauche qui commence plus bas) est lu en premier.
    // Seul le texte compte : une photo en haut d'une colonne n'empêche pas de lire le nom d'abord.
    const textTop = (col: Item[]) => Math.min(...col.filter((b) => isText(b.obj)).map((b) => b.y0));
    const headL = leftCol.filter((b) => isText(b.obj) && b.y1 <= textTop(rightCol));
    const headR = rightCol.filter((b) => isText(b.obj) && b.y1 <= textTop(leftCol));
    const rest = (col: Item[], head: Item[]) => col.filter((b) => !head.includes(b));
    const parts = [above, headL, headR, rest(leftCol, headL), rest(rightCol, headR), below];
    if (parts.every((p) => p.length < items.length)) return parts.flatMap(readingOrder);
  }

  // 2. Bandes horizontales (coupures nettes)
  const sorted = [...items].sort((a, b) => a.y0 - b.y0);
  const bands: Item[][] = [];
  let band: Item[] = [];
  let bandBottom = -Infinity;
  for (const b of sorted) {
    if (band.length && b.y0 > bandBottom + 0.5) {
      bands.push(band);
      band = [];
    }
    band.push(b);
    bandBottom = Math.max(bandBottom, b.y1);
  }
  bands.push(band);
  if (bands.length > 1) return bands.flatMap(readingOrder);
  return leafSort(items);
}

// ------------------------------------------------------------------ Texte tel que lu par une IA

/** Texte brut dans l'ordre de lecture, avec la structure en Markdown léger. */
export function toPlainText(ordered: Item[]): string {
  const out: string[] = [];
  for (const it of ordered) {
    if (it.kind === 'image') {
      out.push('[image]');
      continue;
    }
    const t = (it.obj as Textbox).text.trim();
    if (it.role === 'H1') out.push(`# ${t.replace(/\n/g, ' ')}`);
    else if (it.role === 'H2') out.push(`## ${t.replace(/\n/g, ' ')}`);
    else if (it.role === 'H3') out.push(`### ${t}`);
    else if (it.role === 'L') out.push(t.split('\n').filter((l) => l.trim()).map((l) => `- ${l.replace(BULLET, '')}`).join('\n'));
    else out.push(t);
  }
  // Un bloc par ligne vide : c'est ainsi que les outils d'extraction séparent les paragraphes.
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Liens détectables dans une ligne de texte (e-mail, site, profil, téléphone). */
export interface FoundLink {
  start: number;
  end: number;
  uri: string;
}

const LINK_PATTERNS: [RegExp, (m: string) => string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => `mailto:${m}`],
  [/\bhttps?:\/\/[^\s,;)]+/g, (m) => m],
  [/\b(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s,;)]+/g, (m) => `https://${m}`],
  [/\bwww\.[\w-]+(?:\.[\w-]+)+[^\s,;)]*/g, (m) => `https://${m}`],
  [/(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g, (m) => `tel:${m.replace(/[\s.-]/g, '').replace(/^0/, '+33')}`],
];

export function findLinks(line: string): FoundLink[] {
  const found: FoundLink[] = [];
  for (const [re, uri] of LINK_PATTERNS) {
    for (const m of line.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].replace(/[.,]$/, '').length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      found.push({ start, end, uri: uri(line.slice(start, end)) });
    }
  }
  return found;
}
