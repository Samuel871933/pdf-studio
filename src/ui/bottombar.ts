import { Rect } from 'fabric';
import { PAGE, type Editor } from '../editor';
import { COLUMN_PRESETS, columnRects } from '../layout';
import { h, modal } from './dom';
import { uiIcon } from './icons';

const SHORTCUTS: [string, string][] = [
  ['Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'],
  ['Ctrl+C / Ctrl+V', 'Copier / coller'],
  ['Ctrl+D', 'Dupliquer'],
  ['Ctrl+A', 'Tout sélectionner'],
  ['Ctrl+Maj+L', 'Verrouiller / déverrouiller la sélection'],
  ['Ctrl+G / Ctrl+Maj+G', 'Grouper / dégrouper'],
  ['Double-clic (groupe)', 'Sélectionner un élément du groupe (ou Ctrl + clic)'],
  ['Suppr', 'Supprimer'],
  ['Flèches', 'Déplacer de 1 pt (Maj : 10 pt)'],
  ['Échap', 'Désélectionner'],
  ['Maj + poignée', 'Redimensionner en conservant les proportions (images, icônes et textes : toujours)'],
  ['G', 'Afficher / masquer la grille'],
  ['M', 'Activer / désactiver le magnétisme'],
  ['Clic maintenu + molette', 'Zoomer / dézoomer sur le curseur (ou Ctrl + molette)'],
  ['Glisser dans le vide', 'Déplacer la vue (ou bouton du milieu, partout)'],
  ['Ctrl+S', 'Enregistrer le projet (.json)'],
  ['Ctrl+E', 'Exporter le PDF'],
  ['Double-clic', 'Modifier un texte, remplacer une image ou une icône'],
];

export function showShortcuts() {
  const m = modal('Raccourcis clavier');
  m.body.append(
    h('table', { class: 'shortcuts' }, ...SHORTCUTS.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))),
  );
}

export function setupBottomBar(ed: Editor) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const colBtn = $<HTMLButtonElement>('bb-columns');
  const gridBtn = $<HTMLButtonElement>('bb-grid');
  const snapBtn = $<HTMLButtonElement>('bb-snap');
  const context = $('bb-context');
  const info = $('bb-info');
  const dock = $('columns-dock');
  const c = ed.canvas;

  gridBtn.addEventListener('click', () => ed.setAids({ showGrid: !ed.showGrid }));
  snapBtn.addEventListener('click', () => ed.setAids({ snapEnabled: !ed.snapEnabled }));
  $('bb-help').addEventListener('click', showShortcuts);

  // ---------------------------------------------------------- Actions rapides
  context.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')?.dataset.act;
    const a = ed.active();
    if (!act || !a) return;
    if (act === 'duplicate') void ed.duplicate();
    if (act === 'front') ed.arrange('front');
    if (act === 'back') ed.arrange('back');
    if (act === 'hcenter') ed.align('hcenter');
    if (act === 'delete') ed.removeSelection();
    if (act === 'lock') ed.toggleLock();
    update();
  });

  // ---------------------------------------------------------- Colonnes
  const presetBtns = COLUMN_PRESETS.map((p) => {
    const diagram = h('span', { class: 'col-diagram' }, ...p.fractions.map((f) => {
      const s = h('span', {});
      s.style.flexGrow = String(f);
      return s;
    }));
    const b = h('button', { type: 'button', class: 'col-preset', title: `${p.label} — ${p.hint}`, ariaLabel: p.label }, diagram);
    b.addEventListener('click', () => ed.setAids({ showColumns: true, columns: { ...ed.columns, preset: p.id, fractions: [...p.fractions] } }));
    return [p.id, b] as const;
  });
  const num = (label: string, key: 'margin' | 'gutter' | 'rows', max: number) => {
    const input = h('input', { type: 'number', min: '0', max: String(max), step: '1' });
    input.addEventListener('input', () => {
      const v = input.valueAsNumber;
      if (Number.isFinite(v)) ed.setAids({ columns: { ...ed.columns, [key]: Math.min(max, Math.max(0, key === 'rows' ? Math.round(v) : v)) } });
    });
    return [input, h('label', { class: 'field' }, h('span', {}, label), input)] as const;
  };
  const [marginInput, marginField] = num('Marges', 'margin', 150);
  const [gutterInput, gutterField] = num('Gouttière', 'gutter', 80);
  marginInput.title = 'Marges de la page, en points';
  gutterInput.title = 'Espace entre les colonnes, en points';
  const [rowsInput, rowsField] = num('Rangées', 'rows', 24);
  rowsInput.title = '0 = pas de rangées ; avec les colonnes, les rangées forment une grille de modules';
  const containToggle = h('input', { type: 'checkbox' });
  containToggle.addEventListener('change', () => ed.setAids({ columns: { ...ed.columns, contain: containToggle.checked } }));
  const showToggle = h('input', { type: 'checkbox' });
  showToggle.addEventListener('change', () => ed.setAids({ showColumns: showToggle.checked }));

  const addBlocks = h('button', { type: 'button', title: 'Ajoute un rectangle de fond par colonne (à l’arrière-plan)' }, 'Fonds de colonnes');
  addBlocks.addEventListener('click', () => {
    const m = ed.columns.margin;
    const rects = columnRects(ed.columns).map((r) => new Rect({ left: r.x, top: m, width: r.w, height: PAGE.h - 2 * m, fill: '#f4f5f7', strokeWidth: 0 }));
    for (const r of rects.reverse()) {
      c.add(r);
      c.sendObjectToBack(r);
    }
    c.requestRenderAll();
  });
  const addSidebar = h('button', { type: 'button', title: 'Fond sombre pleine hauteur sous la colonne la plus étroite' }, 'Barre latérale');
  addSidebar.addEventListener('click', () => {
    const cols = columnRects(ed.columns);
    if (cols.length < 2) return;
    const i = cols.reduce((best, r, k) => (r.w < cols[best].w ? k : best), 0);
    const half = ed.columns.gutter / 2;
    const left = i === 0 ? 0 : cols[i].x - half;
    const right = i === cols.length - 1 ? PAGE.w : cols[i].x + cols[i].w + half;
    const r = new Rect({ left, top: 0, width: right - left, height: PAGE.h, fill: '#212a39', strokeWidth: 0 });
    c.add(r);
    c.sendObjectToBack(r);
    c.requestRenderAll();
  });

  const presetName = h('p', { class: 'hint preset-name' });
  // Panneau ancré sous les propriétés : toujours présent, repliable (ouvert par défaut).
  // L'état replié n'est gardé que pendant la session (l'application ne stocke rien).
  const dockToggle = h('button', { type: 'button', class: 'dock-toggle', ariaExpanded: 'true', title: 'Replier / déplier le colonnage' },
    uiIcon('chevron', 16), h('span', {}, 'Colonnage'));
  const dockBody = h('div', { class: 'dock-body', id: 'columns-dock-body' },
    h('div', { class: 'col-presets' }, ...presetBtns.map(([, b]) => b)),
    presetName,
    h('div', { class: 'grid3' }, marginField, gutterField, rowsField),
    h('label', { class: 'check' }, containToggle, 'Contenir les éléments dans les marges'),
    h('div', { class: 'row' }, addBlocks, addSidebar),
  );
  dockToggle.setAttribute('aria-controls', dockBody.id);
  dock.append(h('div', { class: 'dock-head' }, dockToggle, h('label', { class: 'check' }, showToggle, 'Repères')), dockBody);

  const setDock = (open: boolean) => {
    dock.classList.toggle('collapsed', !open);
    dockToggle.ariaExpanded = String(open);
    dockBody.hidden = !open;
  };
  dockToggle.addEventListener('click', () => setDock(dock.classList.contains('collapsed')));
  // Déplié par défaut, sauf sur petit écran où la place manque.
  setDock(!matchMedia('(max-width: 860px)').matches);

  /** Affiche les repères et déplie le colonnage. */
  const openColumns = () => {
    setDock(true);
    if (!ed.showColumns) ed.setAids({ showColumns: true });
    update();
  };
  colBtn.addEventListener('click', () => {
    if (ed.showColumns) ed.setAids({ showColumns: false });
    else openColumns();
    update();
  });

  // ---------------------------------------------------------- État
  function update() {
    gridBtn.ariaPressed = String(ed.showGrid);
    snapBtn.ariaPressed = String(ed.snapEnabled);
    colBtn.ariaPressed = String(ed.showColumns);
    showToggle.checked = ed.showColumns;
    for (const [id, b] of presetBtns) b.classList.toggle('active', ed.showColumns && ed.columns.preset === id);
    const preset = COLUMN_PRESETS.find((p) => p.id === ed.columns.preset);
    presetName.textContent = !ed.showColumns ? 'Repères masqués : cliquez sur une grille pour l’afficher (jamais exportée).' : preset ? `${preset.label} — ${preset.hint}` : 'Grille personnalisée';
    if (document.activeElement !== marginInput) marginInput.value = String(ed.columns.margin);
    if (document.activeElement !== gutterInput) gutterInput.value = String(ed.columns.gutter);
    if (document.activeElement !== rowsInput) rowsInput.value = String(ed.columns.rows);
    containToggle.checked = ed.columns.contain;

    const a = ed.active();
    context.hidden = !a;
    const lockBtn = context.querySelector<HTMLButtonElement>('[data-act=lock]')!;
    lockBtn.textContent = a?.locked ? 'Déverrouiller' : 'Verrouiller';
    if (a) {
      const r = a.getBoundingRect();
      const f = (n: number) => Math.round(n);
      info.textContent = `X ${f(r.left)}  Y ${f(r.top)}  ·  ${f(r.width)} × ${f(r.height)} pt`;
    } else {
      const n = c.getObjects().length;
      info.textContent = `${n} élément${n > 1 ? 's' : ''}  ·  A4 210 × 297 mm`;
    }
  }

  for (const ev of ['selection:created', 'selection:updated', 'selection:cleared', 'object:moving', 'object:scaling', 'object:rotating', 'object:modified', 'object:added', 'object:removed'] as const)
    c.on(ev, update);
  return { update, openColumns };
}
