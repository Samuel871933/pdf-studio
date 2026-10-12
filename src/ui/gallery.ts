import { StaticCanvas } from 'fabric';
import type { CanvasJSON } from '../editor';
import { PAGE } from '../editor';
import { KINDS, PALETTES, SOURCES, TEMPLATES, TIPS, type Palette, type TemplateDef, type TemplateKind } from '../templates';
import { h, modal } from './dom';

const thumbs = new Map<string, Promise<string>>();
/** Filtre conservé d'une ouverture à l'autre (le temps de la session). */
let kind: TemplateKind | 'all' = 'all';

/** Miniature JPEG d'un modèle (mise en cache par modèle et palette). */
function thumbnail(def: TemplateDef, p: Palette): Promise<string> {
  const key = `${def.id}|${p.id}`;
  let t = thumbs.get(key);
  if (!t) {
    t = (async () => {
      const json: CanvasJSON = await def.build(p);
      const sc = new StaticCanvas(document.createElement('canvas'), {
        width: PAGE.w,
        height: PAGE.h,
        enableRetinaScaling: false,
        renderOnAddRemove: false,
      });
      await sc.loadFromJSON(json);
      sc.renderAll();
      const url = sc.toDataURL({ format: 'jpeg', quality: 0.82, multiplier: 0.4 });
      await sc.dispose();
      return url;
    })();
    thumbs.set(key, t);
  }
  return t;
}

export function openGallery(opts: {
  palette: Palette;
  onChoose(def: TemplateDef, palette: Palette): void;
  onBlank(): void;
}) {
  const m = modal('Modèles', { wide: true });
  let palette = opts.palette;

  const chips = h('div', { class: 'chips' });
  const paletteBtns = PALETTES.map((p) => {
    const dot = h('span', { class: 'dot' });
    dot.style.background = `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)`;
    const b = h('button', { type: 'button', role: 'radio', title: `Palette ${p.label}` }, dot, p.label);
    b.addEventListener('click', () => {
      palette = p;
      refresh();
    });
    chips.append(b);
    return [p, b] as const;
  });

  const filters = h('div', { class: 'chips', role: 'tablist', ariaLabel: 'Type de modèle' });
  const filterBtns = KINDS.map(([id, label]) => {
    const count = id === 'all' ? TEMPLATES.length : TEMPLATES.filter((t) => t.kind === id).length;
    const b = h('button', { type: 'button', role: 'tab' }, `${label} (${count})`);
    b.addEventListener('click', () => {
      kind = id;
      applyFilter();
    });
    filters.append(b);
    return [id, b] as const;
  });

  const grid = h('div', { class: 'tpl-grid' });
  const blank = h('button', { type: 'button', class: 'tpl-card blank' },
    h('div', { class: 'tpl-thumb' }, h('span', {}, '+')),
    h('strong', {}, 'Page vierge'),
    h('span', { class: 'hint' }, 'Partir de zéro, avec les repères de colonnes si besoin.'),
  );
  blank.addEventListener('click', () => {
    m.close();
    opts.onBlank();
  });

  const cards = TEMPLATES.map((def) => {
    const img = h('img', { alt: `Aperçu du modèle ${def.name}`, width: 220, height: 311, decoding: 'async' });
    const atsCls = def.ats === 'Idéal ATS' ? 'ok' : def.ats === 'Compatible ATS' ? 'mid' : 'low';
    const card = h('button', { type: 'button', class: 'tpl-card' },
      h('div', { class: 'tpl-thumb' }, img),
      h('strong', {}, def.name),
      h('div', { class: 'badges' }, h('span', { class: `badge ${atsCls}` }, def.ats), ...def.badges.map((t) => h('span', { class: 'badge' }, t))),
      h('span', { class: 'hint' }, def.description),
    );
    card.addEventListener('click', () => {
      m.close();
      opts.onChoose(def, palette);
    });
    grid.append(card);
    return [def, img, card] as const;
  });
  grid.append(blank);

  function applyFilter() {
    for (const [id, b] of filterBtns) b.ariaSelected = String(id === kind);
    for (const [def, , card] of cards) card.hidden = kind !== 'all' && def.kind !== kind;
  }

  let gen = 0;
  async function refresh() {
    const id = ++gen;
    for (const [p, b] of paletteBtns) b.ariaChecked = String(p === palette);
    // Génération séquentielle : l'interface reste fluide.
    for (const [def, img] of cards) {
      img.classList.add('loading');
      const url = await thumbnail(def, palette);
      if (id !== gen) return;
      img.src = url;
      img.classList.remove('loading');
    }
  }

  const tips = h('details', { class: 'tips' },
    h('summary', {}, 'Ce qui fonctionne auprès des recruteurs'),
    h('ul', {}, ...TIPS.map((t) => h('li', {}, t))),
    h('p', { class: 'hint' }, 'Sources : ', ...SOURCES.flatMap(([label, url], i) => [
      i ? ' · ' : '',
      h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label),
    ])),
  );

  m.body.append(
    h('div', { class: 'row' }, filters),
    h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Palette :'), chips),
    tips,
    grid,
  );
  applyFilter();
  void refresh();
}
