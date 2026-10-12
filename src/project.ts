// Sauvegarde / ouverture de projet. Rien n'est stocké par l'application : l'utilisateur
// télécharge son projet en .json et le rouvre quand il le souhaite. Le fichier ouvert
// est traité comme non fiable : seules les propriétés et types connus sont conservés.
import { DEFAULT_FONT, isFontFamily } from './fonts';
import type { CanvasJSON, DocMeta } from './editor';
import { sanitizeLayout, type ColumnLayout } from './layout';

const APP = 'pdf-studio';
const FORMAT = 1;
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_OBJECTS = 3000;

const SHAPES = new Set(['rect', 'circle', 'ellipse', 'triangle', 'polygon', 'polyline', 'line', 'path']);
const TEXTS = new Set(['textbox', 'i-text', 'text']);
const CLIPS = new Set(['rect', 'circle', 'ellipse', 'triangle', 'polygon', 'path']);
const IMAGE_SRC = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;

export interface ProjectFile {
  app: typeof APP;
  format: typeof FORMAT;
  meta: DocMeta;
  canvas: CanvasJSON;
  layout?: ColumnLayout | null;
}

export function serializeProject(canvas: CanvasJSON, meta: DocMeta, layout: ColumnLayout): Blob {
  const file: ProjectFile = { app: APP, format: FORMAT, meta, canvas, layout };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const cleanColor = (v: unknown) => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : null);
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanObject(o: unknown, depth = 0): Obj | null {
  if (!isObj(o) || typeof o.type !== 'string') return null;
  const type = o.type.toLowerCase();
  const isImage = type === 'image';
  const isText = TEXTS.has(type);
  if (!SHAPES.has(type) && !isImage && !isText) return null;
  if (depth > 0 && !CLIPS.has(type)) return null;

  const out: Obj = { ...o };
  // Propriétés potentiellement dangereuses ou non gérées par l'export.
  for (const k of ['objects', 'filters', 'resizeFilter', 'crossOrigin', 'shadow', '__proto__', 'constructor'])
    delete out[k];
  out.fill = cleanColor(o.fill);
  out.stroke = cleanColor(o.stroke);
  out.backgroundColor = cleanColor(o.backgroundColor);
  // Groupe logique : identifiant et nom courts, en texte simple.
  if (typeof o.groupId === 'string' && /^[a-z0-9]{1,40}$/i.test(o.groupId)) out.groupName = cleanText(o.groupName, 60) || 'Groupe';
  else {
    delete out.groupId;
    delete out.groupName;
  }

  if (isImage) {
    if (typeof o.src !== 'string' || !IMAGE_SRC.test(o.src)) return null;
  } else {
    delete out.src;
  }
  if (isText) {
    out.text = cleanText(o.text, 20000);
    if (!isFontFamily(o.fontFamily)) out.fontFamily = DEFAULT_FONT;
    out.styles = Array.isArray(o.styles)
      ? o.styles.filter(isObj).map((s) => {
          const style = isObj(s.style) ? { ...s.style } : {};
          if ('fontFamily' in style && !isFontFamily(style.fontFamily)) style.fontFamily = DEFAULT_FONT;
          if ('fill' in style) style.fill = cleanColor(style.fill) ?? undefined;
          delete style.stroke;
          return { start: Number(s.start) || 0, end: Number(s.end) || 0, style };
        })
      : [];
    delete out.path; // texte sur un tracé : non pris en charge
  }
  if (o.clipPath !== undefined) {
    const clip = cleanObject(o.clipPath, depth + 1);
    if (clip) {
      clip.absolutePositioned = false;
      out.clipPath = clip;
    } else delete out.clipPath;
  }
  return out;
}

export async function readProject(file: File): Promise<{ project: ProjectFile; dropped: number }> {
  if (file.size > MAX_BYTES) throw new Error('Fichier trop volumineux.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier n'est pas un projet valide (JSON illisible).");
  }
  if (!isObj(data) || data.app !== APP || !isObj(data.canvas) || !Array.isArray(data.canvas.objects))
    throw new Error("Ce fichier n'est pas un projet PDF Studio.");
  if (data.format !== FORMAT) throw new Error('Version de projet non prise en charge.');
  const raw = data.canvas.objects.slice(0, MAX_OBJECTS);
  const objects = raw.map((o) => cleanObject(o)).filter((o): o is Obj => o !== null);
  const meta = isObj(data.meta) ? data.meta : {};
  return {
    project: {
      app: APP,
      format: FORMAT,
      meta: {
        title: cleanText(meta.title, 300),
        author: cleanText(meta.author, 300),
        subject: cleanText(meta.subject, 1000),
        keywords: cleanText(meta.keywords, 1000),
        kind: meta.kind === 'cv' || meta.kind === 'letter' ? meta.kind : undefined,
      },
      canvas: { background: cleanColor(data.canvas.background) ?? '#ffffff', objects },
      layout: sanitizeLayout(data.layout),
    },
    dropped: data.canvas.objects.length - objects.length,
  };
}

/** Déclenche le téléchargement d'un fichier généré localement. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function slug(s: string, fallback: string) {
  const v = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return v || fallback;
}
