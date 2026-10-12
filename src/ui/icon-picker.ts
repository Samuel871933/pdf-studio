import { importSvg, type ImportedIcon } from '../icons/svg-import';
import { loadCurated, loadFull, searchCurated, searchFull, type CuratedLibrary, type IconHit } from '../icons/library';
import { h, modal, svgPath } from './dom';

const FULL_LIMIT = 320;
const FULL = '__full__';

export interface IconPick {
  name: string;
  d: string;
  color: string;
  /** Présent pour une icône importée (styles de contour d'origine). */
  imported?: ImportedIcon;
}

export async function openIconPicker(opts: {
  color: string;
  title?: string;
  onPick(pick: IconPick): void;
  onError(e: unknown): void;
}) {
  let lib: CuratedLibrary;
  try {
    lib = await loadCurated();
  } catch (e) {
    opts.onError(e);
    return;
  }
  const m = modal(opts.title ?? 'Bibliothèque d’icônes', { wide: true });
  let tab = '';
  let query = '';

  const search = h('input', { type: 'search', placeholder: 'Rechercher (ex. : téléphone, sport, linkedin…)', class: 'icon-search', autocomplete: 'off', spellcheck: false });
  const color = h('input', { type: 'color', value: opts.color, title: 'Couleur de l’icône' });
  const svgInput = h('input', { type: 'file', accept: '.svg,image/svg+xml', hidden: true });
  const importBtn = h('button', { type: 'button', title: 'Importer votre propre icône SVG (seule la forme est conservée)' }, 'Importer un SVG…');
  const tabs = h('div', { class: 'chips', role: 'tablist' });
  const status = h('p', { class: 'hint icon-status' });
  const grid = h('div', { class: 'icon-grid' });
  const more = h('button', { type: 'button', class: 'more', hidden: true });

  const total = Object.keys(lib.paths).length;
  const tabDefs: [string, string][] = [['', `Sélection (${total})`], ...lib.categories.map((c) => [c.id, c.label] as [string, string]), [FULL, 'Bibliothèque complète (7 400+)']];
  const tabBtns = tabDefs.map(([id, label]) => {
    const b = h('button', { type: 'button', role: 'tab' }, label);
    b.addEventListener('click', () => {
      tab = id;
      void render();
    });
    tabs.append(b);
    return [id, b] as const;
  });

  let hits: IconHit[] = [];
  const show = (list: IconHit[]) => {
    hits = list;
    grid.replaceChildren(
      ...list.map((hit, i) => {
        const b = h('button', { type: 'button', title: hit.name, ariaLabel: hit.name });
        b.dataset.i = String(i);
        b.append(svgPath(hit.path, 28));
        return b;
      }),
    );
  };

  let renderId = 0;
  async function render() {
    const id = ++renderId;
    for (const [tid, b] of tabBtns) b.ariaSelected = String(tid === tab);
    more.hidden = true;
    if (tab === FULL) {
      if (query.length < 2) {
        show([]);
        status.textContent = 'Tapez au moins 2 lettres, en anglais (ex. : car, music, coffee, rocket).';
        return;
      }
      status.textContent = 'Chargement de la bibliothèque complète…';
      try {
        const all = await loadFull(lib);
        if (id !== renderId) return;
        const r = searchFull(all, query, FULL_LIMIT);
        show(r.hits);
        status.textContent = r.total
          ? `${r.total} icône(s)${r.total > FULL_LIMIT ? ` — ${FULL_LIMIT} premières affichées, précisez la recherche` : ''}.`
          : 'Aucun résultat. La bibliothèque complète se cherche en anglais.';
      } catch (e) {
        status.textContent = 'Impossible de charger la bibliothèque complète.';
        opts.onError(e);
      }
      return;
    }
    const list = searchCurated(lib, query, tab || undefined);
    show(list);
    status.textContent = query ? `${list.length} résultat(s) dans la sélection.` : '';
    if (query.length >= 2) {
      more.hidden = false;
      more.textContent = `Chercher « ${query} » dans toute la bibliothèque →`;
    }
  }

  let timer = 0;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      query = search.value.trim();
      void render();
    }, 120);
  });
  more.addEventListener('click', () => {
    tab = FULL;
    void render();
  });
  grid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    const hit = b && hits[Number(b.dataset.i)];
    if (!hit) return;
    opts.onPick({ name: hit.name, d: hit.path, color: color.value });
    m.close();
  });
  importBtn.addEventListener('click', () => {
    svgInput.value = '';
    svgInput.click();
  });
  svgInput.addEventListener('change', async () => {
    const f = svgInput.files?.[0];
    if (!f) return;
    try {
      const icon = await importSvg(f);
      opts.onPick({ name: f.name.replace(/\.svg$/i, ''), d: icon.d, color: color.value, imported: icon });
      m.close();
    } catch (e) {
      opts.onError(e);
    }
  });

  m.body.append(
    h('div', { class: 'icon-toolbar' }, search, h('label', { class: 'icon-color' }, 'Couleur', color), importBtn, svgInput),
    tabs,
    status,
    grid,
    more,
    h('p', { class: 'hint' }, 'Icônes Material Design (licence Apache 2.0). Les icônes restent vectorielles dans le PDF.'),
  );
  await render();
  search.focus();
}
