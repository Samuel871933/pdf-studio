// Import d'une icône SVG personnelle. Le fichier n'est jamais interprété par le navigateur :
// on en extrait uniquement la géométrie (tracés et formes simples) par analyse du texte.
// Scripts, liens, images, styles externes ou polices sont ignorés par construction.

const MAX_BYTES = 512 * 1024;
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;

export interface ImportedIcon {
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  warnings: string[];
}

type Attrs = Record<string, string>;

function parseAttrs(src: string): Attrs {
  const out: Attrs = {};
  for (const m of src.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  // Propriétés de présentation déclarées dans style="…"
  for (const decl of (out.style ?? '').split(';')) {
    const [k, v] = decl.split(':').map((s) => s?.trim());
    if (k && v && !(k in out)) out[k.toLowerCase()] = v;
  }
  return out;
}

const n = (v: string | undefined, d = 0) => {
  const x = parseFloat(v ?? '');
  return Number.isFinite(x) ? x : d;
};

function points(v: string | undefined): number[] {
  return (v ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
}

function shapeToPath(tag: string, a: Attrs): string | null {
  switch (tag) {
    case 'path':
      return a.d && PATH_DATA.test(a.d) ? a.d : null;
    case 'rect': {
      const [x, y, w, h] = [n(a.x), n(a.y), n(a.width), n(a.height)];
      return w > 0 && h > 0 ? `M${x} ${y}h${w}v${h}h${-w}Z` : null;
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n(a.cx), n(a.cy)];
      const rx = tag === 'circle' ? n(a.r) : n(a.rx);
      const ry = tag === 'circle' ? n(a.r) : n(a.ry);
      return rx > 0 && ry > 0 ? `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z` : null;
    }
    case 'line':
      return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const p = points(a.points);
      if (p.length < 4) return null;
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === 'polygon' ? `${d}Z` : d;
    }
  }
  return null;
}

const color = (v: string | undefined) => {
  if (!v) return undefined;
  if (v === 'none') return null;
  if (v === 'currentColor') return 'currentColor';
  return COLOR.test(v) ? v : undefined;
};

export async function importSvg(file: File): Promise<ImportedIcon> {
  if (file.size > MAX_BYTES) throw new Error('Fichier SVG trop lourd (512 Ko maximum).');
  const src = (await file.text()).replace(/<!--[\s\S]*?-->/g, '');
  if (!/<svg[\s>]/i.test(src)) throw new Error("Ce fichier n'est pas un SVG.");
  const warnings = new Set<string>();
  const parts: string[] = [];
  // Styles hérités : racine <svg>, puis groupes <g>, puis forme.
  let style: Attrs = {};
  for (const m of src.matchAll(/<(svg|g|path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const a = parseAttrs(m[2]);
    if (a.transform) warnings.add('Les transformations SVG sont ignorées.');
    if (tag === 'svg' || tag === 'g') {
      style = { ...style, ...a };
      continue;
    }
    if (!parts.length) style = { ...style, ...a };
    const d = shapeToPath(tag, a);
    if (d) parts.push(d);
  }
  if (!parts.length) throw new Error('Aucune forme exploitable dans ce SVG.');
  const fill = color(style.fill);
  const stroke = color(style.stroke);
  const cap = style['stroke-linecap'];
  const join = style['stroke-linejoin'];
  return {
    d: parts.join(' '),
    fill: fill === undefined ? '#000000' : fill,
    stroke: stroke ?? null,
    strokeWidth: stroke ? n(style['stroke-width'], 1) : 0,
    lineCap: cap === 'round' || cap === 'square' ? cap : 'butt',
    lineJoin: join === 'round' || join === 'bevel' ? join : 'miter',
    warnings: [...warnings],
  };
}
