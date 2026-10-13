// Retouches durables des éléments d'un modèle. Chaque élément généré porte une clé stable (tplKey)
// et ses propriétés d'origine (tplBase) ; l'écart avec l'état affiché est enregistré dans la fiche
// et réappliqué à chaque régénération : couleur, police, position ou suppression survivent aux
// modifications du contenu. Les positions sont gardées en décalage, pour suivre la mise en page.
type Json = Record<string, any>;

export interface Retouch {
  dx?: number;
  dy?: number;
  /** Facteurs d'échelle appliqués à ceux du modèle. */
  sx?: number;
  sy?: number;
  /** Écart de largeur d'un bloc de texte. */
  dw?: number;
  removed?: true;
  set?: Json;
}
export type Retouches = Record<string, Retouch>;

/** Propriétés de style reprises telles quelles. */
export const STYLE_KEYS = ['angle', 'fill', 'stroke', 'strokeWidth', 'opacity', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'textAlign', 'charSpacing', 'lineHeight', 'underline', 'visible', 'rx', 'ry'] as const;
const BASE_KEYS = ['left', 'top', 'scaleX', 'scaleY', 'width', ...STYLE_KEYS];
const KEY = /^[a-z0-9:.#-]{1,80}$/i;

/** Clés stables (champ du texte, sinon section + type + rang) et propriétés d'origine. Renvoie les clés. */
export function stamp(objects: Json[]): string[] {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  for (const o of objects) {
    if (!o.tpl) continue;
    const root = o.field ? `f:${o.field}` : `${o.sectionKey ?? 'page'}:${String(o.type).toLowerCase()}`;
    const n = seen.get(root) ?? 0;
    seen.set(root, n + 1);
    o.tplKey = n ? `${root}#${n}` : root;
    o.tplBase = Object.fromEntries(BASE_KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    keys.push(o.tplKey);
  }
  return keys;
}

const same = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.01 : (a ?? null) === (b ?? null);

/** Écart entre un élément du modèle et sa version générée, `null` s'il n'est pas retouché. */
export function retouchOf(o: Json): Retouch | null {
  const base = o.tplBase;
  if (!o.tpl || !o.tplKey || !base || typeof base !== 'object') return null;
  const r: Retouch = {};
  if (!same(o.left, base.left)) r.dx = o.left - base.left;
  if (!same(o.top, base.top)) r.dy = o.top - base.top;
  if (!same(o.scaleX ?? 1, base.scaleX ?? 1)) r.sx = (o.scaleX ?? 1) / (base.scaleX ?? 1);
  if (!same(o.scaleY ?? 1, base.scaleY ?? 1)) r.sy = (o.scaleY ?? 1) / (base.scaleY ?? 1);
  if (typeof o.text === 'string' && !same(o.width, base.width)) r.dw = o.width - base.width;
  const set = Object.fromEntries(STYLE_KEYS.filter((k) => !same(o[k], base[k])).map((k) => [k, o[k]]));
  if (Object.keys(set).length) r.set = set;
  return Object.keys(r).length ? r : null;
}

/**
 * Retouches de la page affichée : écarts des éléments présents, suppression des éléments générés
 * absents. Les retouches d'éléments non générés cette fois (section vidée) sont gardées pour plus tard.
 */
export function capture(objects: Json[], previous: Retouches, keys: string[]): Retouches {
  const out: Retouches = {};
  const present = new Set<string>();
  for (const o of objects) {
    if (!o.tpl || !o.tplKey) continue;
    present.add(o.tplKey);
    const r = retouchOf(o);
    if (r) out[o.tplKey] = r;
  }
  for (const key of keys) if (!present.has(key)) out[key] = { removed: true };
  for (const [key, r] of Object.entries(previous)) if (!(key in out) && !keys.includes(key)) out[key] = r;
  return out;
}

/** Réapplique les retouches à une page fraîchement générée (et marquée par `stamp`). */
export function retouch(objects: Json[], retouches: Retouches): Json[] {
  return objects.filter((o) => !(o.tplKey && retouches[o.tplKey]?.removed)).map((o) => {
    const r = o.tplKey ? retouches[o.tplKey] : undefined;
    if (!r) return o;
    const out = { ...o, ...r.set };
    if (r.dx) out.left = (o.left ?? 0) + r.dx;
    if (r.dy) out.top = (o.top ?? 0) + r.dy;
    if (r.sx) out.scaleX = (o.scaleX ?? 1) * r.sx;
    if (r.sy) out.scaleY = (o.scaleY ?? 1) * r.sy;
    if (r.dw && typeof o.width === 'number') out.width = Math.max(10, o.width + r.dw);
    return out;
  });
}

const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Retouches d'un fichier ouvert : clés, nombres et styles validés ; `style` vérifie chaque valeur de style. */
export function cleanRetouches(v: unknown, style: (key: string, value: unknown) => boolean): Retouches | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Retouches = {};
  for (const [key, raw] of Object.entries(v).slice(0, 500)) {
    if (!KEY.test(key) || !raw || typeof raw !== 'object') continue;
    const r = raw as Json;
    const clean: Retouch = {};
    if (r.removed === true) clean.removed = true;
    for (const k of ['dx', 'dy'] as const) if (finite(r[k], -2000, 2000)) clean[k] = r[k];
    for (const k of ['sx', 'sy'] as const) if (finite(r[k], 0.01, 100)) clean[k] = r[k];
    if (finite(r.dw, -1200, 1200)) clean.dw = r.dw;
    if (r.set && typeof r.set === 'object') {
      const set = Object.fromEntries(STYLE_KEYS.filter((k) => k in r.set && style(k, r.set[k])).map((k) => [k, r.set[k]]));
      if (Object.keys(set).length) clean.set = set;
    }
    if (Object.keys(clean).length) out[key] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Propriétés de marquage d'un objet lu depuis un fichier. */
export function cleanStamp(o: Json) {
  if (typeof o.tplKey !== 'string' || !KEY.test(o.tplKey) || !o.tplBase || typeof o.tplBase !== 'object' || Array.isArray(o.tplBase)) {
    delete o.tplKey;
    delete o.tplBase;
    return;
  }
  o.tplBase = Object.fromEntries(BASE_KEYS.filter((k) => ['number', 'string', 'boolean'].includes(typeof o.tplBase[k])).map((k) => [k, o.tplBase[k]]));
}
