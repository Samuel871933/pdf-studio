// Grilles de colonnes (repères de mise en page, jamais exportés dans le PDF).
import { PAGE } from './editor';

export interface ColumnLayout {
  preset: string;
  fractions: number[];
  margin: number;
  gutter: number;
  /** Nombre de rangées (0 = aucune) : avec les colonnes, elles forment une grille de modules. */
  rows: number;
  /** Les éléments ne peuvent pas sortir de la zone de contenu (marges). */
  contain: boolean;
}

export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ColumnPreset {
  id: string;
  label: string;
  hint: string;
  fractions: number[];
}

export const COLUMN_PRESETS: ColumnPreset[] = [
  { id: '1', label: '1 colonne', hint: 'Le plus lisible pour les logiciels de recrutement (ATS)', fractions: [1] },
  { id: '1-2', label: 'Barre latérale gauche', hint: '1/3 – 2/3 : contact et compétences à gauche', fractions: [1, 2] },
  { id: '2-1', label: 'Barre latérale droite', hint: '2/3 – 1/3 : le parcours est lu en premier', fractions: [2, 1] },
  { id: '1-3', label: 'Colonne étroite', hint: '1/4 – 3/4 : barre latérale discrète', fractions: [1, 3] },
  { id: '1-4', label: 'Colonne de dates', hint: '1/5 – 4/5 : dates à gauche, contenu à droite', fractions: [1, 4] },
  { id: '2', label: '2 colonnes égales', hint: '1/2 – 1/2', fractions: [1, 1] },
  { id: '3', label: '3 colonnes', hint: 'Blocs de compétences, portfolio', fractions: [1, 1, 1] },
  { id: '12', label: 'Grille 12 colonnes', hint: 'Grille fine pour aligner librement', fractions: Array(12).fill(1) },
];

export const DEFAULT_LAYOUT: ColumnLayout = { preset: '1-2', fractions: [1, 2], margin: 36, gutter: 18, rows: 0, contain: true };

/** Zone de contenu (page moins les marges). */
export function contentZone(l: ColumnLayout): Zone {
  return { x0: l.margin, y0: l.margin, x1: PAGE.w - l.margin, y1: PAGE.h - l.margin };
}

/** Positions verticales des rangées (en points). */
export function rowRects(l: ColumnLayout): { y: number; h: number }[] {
  const n = Math.max(0, Math.round(l.rows));
  if (!n) return [];
  const usable = PAGE.h - 2 * l.margin - l.gutter * (n - 1);
  return Array.from({ length: n }, (_, i) => ({ y: l.margin + i * (usable / n + l.gutter), h: usable / n }));
}

/**
 * Zone de référence d'un élément : les colonnes (et rangées) qu'il occupe.
 * Un élément dans une colonne s'aligne sur cette colonne ; à cheval sur plusieurs, sur leur ensemble.
 */
export function zoneFor(l: ColumnLayout, b: Zone): Zone {
  const span = <T extends { a: number; b: number }>(cells: T[], lo: number, hi: number, min: number, max: number) => {
    if (!cells.length) return [min, max];
    const mid = (lo + hi) / 2;
    // Cellules réellement recouvertes (au moins 30 % de la cellule ou de l'objet).
    const hit = cells.filter((c) => {
      const overlap = Math.min(hi, c.b) - Math.max(lo, c.a);
      return overlap > 0.3 * Math.min(c.b - c.a, hi - lo);
    });
    const list = hit.length ? hit : [cells.reduce((best, c) => (Math.abs((c.a + c.b) / 2 - mid) < Math.abs((best.a + best.b) / 2 - mid) ? c : best))];
    return [Math.min(...list.map((c) => c.a)), Math.max(...list.map((c) => c.b))];
  };
  const z = contentZone(l);
  const [x0, x1] = span(columnRects(l).map((c) => ({ a: c.x, b: c.x + c.w })), b.x0, b.x1, z.x0, z.x1);
  const [y0, y1] = span(rowRects(l).map((r) => ({ a: r.y, b: r.y + r.h })), b.y0, b.y1, z.y0, z.y1);
  return { x0, y0, x1, y1 };
}

/** Positions horizontales des colonnes (en points). */
export function columnRects(l: ColumnLayout): { x: number; w: number }[] {
  const n = l.fractions.length;
  const total = l.fractions.reduce((a, b) => a + b, 0);
  const usable = PAGE.w - 2 * l.margin - l.gutter * (n - 1);
  let x = l.margin;
  return l.fractions.map((f) => {
    const w = (usable * f) / total;
    const r = { x, w };
    x += w + l.gutter;
    return r;
  });
}

/** Bords de colonnes et marges servant au magnétisme. */
export function layoutSnapTargets(l: ColumnLayout): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  for (const c of columnRects(l)) xs.push(c.x, c.x + c.w / 2, c.x + c.w);
  const ys = [l.margin, PAGE.h - l.margin];
  for (const r of rowRects(l)) ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  return { xs, ys };
}

export function sanitizeLayout(v: unknown): ColumnLayout | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const fr = Array.isArray(o.fractions) ? o.fractions.map(Number).filter((x) => x > 0 && x <= 12).slice(0, 12) : [];
  if (!fr.length) return null;
  const clamp = (x: unknown, min: number, max: number, d: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  return {
    preset: typeof o.preset === 'string' ? o.preset.slice(0, 10) : 'custom',
    fractions: fr,
    margin: clamp(o.margin, 0, 150, 36),
    gutter: clamp(o.gutter, 0, 80, 18),
    rows: Math.round(clamp(o.rows, 0, 24, 0)),
    contain: o.contain !== false,
  };
}
