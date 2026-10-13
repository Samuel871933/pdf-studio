// Barre d'actions flottante au-dessus de la sélection : verrouiller, dupliquer, plans, masquer, supprimer.
// Elle suit l'élément (zoom, défilement) et se cache pendant les déplacements et redimensionnements.
import { ActiveSelection } from 'fabric';
import type { Editor } from '../editor';
import type { PageSection } from '../quickfill';
import { h } from './dom';
import { uiIcon, type UiIcon } from './icons';

const GAP = 10;

export interface QuickBarActions {
  /** Section du modèle sélectionnée en entier (masquée dans la fiche plutôt que sur la page). */
  section(): PageSection | null;
  hideSection(sec: PageSection): void;
}

export function setupQuickBar(ed: Editor, stage: HTMLElement, actions: QuickBarActions) {
  const c = ed.canvas;
  const bar = h('div', { class: 'quickbar', role: 'toolbar', ariaLabel: 'Actions sur la sélection', hidden: true });
  document.body.append(bar);

  const btn = (icon: UiIcon, title: string, onClick: () => void, cls = '') => {
    const b = h('button', { type: 'button', class: `icon ${cls}`, title, ariaLabel: title }, uiIcon(icon, 17));
    // Ne pas voler le focus ni la sélection du canevas.
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      onClick();
      update();
    });
    return b;
  };
  const lockBtn = btn('unlock', 'Verrouiller (Ctrl+Maj+L)', () => ed.toggleLock());
  const others = [
    btn('duplicate', 'Dupliquer (Ctrl+D)', () => void ed.duplicate()),
    btn('front', 'Premier plan', () => ed.arrange('front')),
    btn('back', 'Arrière-plan', () => ed.arrange('back')),
  ];
  // Masquer : une section du modèle dans la fiche ; un élément libre sur la page (réaffichable dans les calques).
  const hideBtn = btn('eyeOff', 'Masquer', () => {
    const sec = actions.section();
    if (sec) return actions.hideSection(sec);
    const objs = c.getActiveObjects();
    c.discardActiveObject();
    for (const o of objs) ed.setVisible(o, false);
  });
  const trashBtn = btn('trash', 'Supprimer (Suppr)', () => ed.removeSelection(), 'danger');
  others.push(hideBtn, trashBtn);
  const groupBtn = btn('group', 'Grouper (Ctrl+G)', () => (ed.selectedGroup() ? ed.ungroup() : ed.group()));
  bar.append(lockBtn, groupBtn, h('span', { class: 'qb-sep' }), ...others);

  let transforming = false;
  let frame = 0;

  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  }

  function place() {
    const a = ed.active() as (ReturnType<Editor['active']> & { isEditing?: boolean }) | undefined;
    if (!a || transforming || a.isEditing) {
      bar.hidden = true;
      return;
    }
    const objs = a instanceof ActiveSelection ? a.getObjects() : [a];
    const locked = objs.every((o) => o.locked);
    lockBtn.replaceChildren(uiIcon(locked ? 'lock' : 'unlock', 17));
    lockBtn.title = lockBtn.ariaLabel = locked ? 'Déverrouiller (Ctrl+Maj+L)' : 'Verrouiller (Ctrl+Maj+L)';
    lockBtn.classList.toggle('on', locked);
    for (const b of others.slice(1, 3)) b.disabled = locked;
    // Grouper une sélection multiple, dégrouper un groupe sélectionné.
    const isGroup = !!ed.selectedGroup();
    groupBtn.hidden = !(isGroup || objs.length > 1);
    groupBtn.replaceChildren(uiIcon(isGroup ? 'ungroup' : 'group', 17));
    groupBtn.title = groupBtn.ariaLabel = isGroup ? 'Dégrouper (Ctrl+Maj+G)' : 'Grouper (Ctrl+G)';

    // Section du modèle : masquée / supprimée dans la fiche. Partie d'une section (page liée) : elle serait
    // recréée au prochain rendu, on invite à sélectionner la section entière.
    const sec = actions.section();
    const partial = !sec && !!ed.fill && (ed.fill as { linked?: boolean }).linked && objs.some((o) => o.tpl);
    hideBtn.disabled = partial || !!sec?.custom;
    hideBtn.title = hideBtn.ariaLabel = sec?.custom
      ? 'Section ajoutée : supprimez-la ou videz-la dans l’onglet Contenu'
      : sec ? `Masquer la section « ${sec.name} » (contenu conservé)`
      : partial ? 'Pour masquer, sélectionnez la section entière (clic simple) ou détachez la page'
      : 'Masquer (réaffichable dans les calques)';
    trashBtn.title = trashBtn.ariaLabel = sec ? `Supprimer la section « ${sec.name} » (Suppr)` : 'Supprimer (Suppr)';

    // Position écran de la sélection (repère de la page × zoom + position du canevas).
    a.setCoords();
    const r = a.getBoundingRect();
    const page = c.wrapperEl.getBoundingClientRect();
    const view = stage.getBoundingClientRect();
    const top = page.top + r.top * ed.zoom;
    const bottom = page.top + (r.top + r.height) * ed.zoom;
    const cx = page.left + (r.left + r.width / 2) * ed.zoom;
    // Sélection hors de la zone visible : rien à afficher.
    if (bottom < view.top || top > view.bottom || cx < view.left || cx > view.right) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const w = bar.offsetWidth;
    const hgt = bar.offsetHeight;
    // Au-dessus de la sélection (en tenant compte de la poignée de rotation), sinon en dessous.
    let y = top - hgt - GAP - 26;
    if (y < view.top + 4) y = bottom + GAP;
    y = Math.min(y, view.bottom - hgt - 4);
    const x = Math.max(view.left + 4, Math.min(cx - w / 2, view.right - w - 4));
    bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  const startTransform = () => {
    transforming = true;
    bar.hidden = true;
  };
  for (const ev of ['object:moving', 'object:scaling', 'object:rotating', 'object:resizing'] as const) c.on(ev, startTransform);
  c.on('mouse:up', () => {
    transforming = false;
    update();
  });
  for (const ev of ['selection:created', 'selection:updated', 'selection:cleared', 'object:modified', 'object:removed', 'text:editing:entered', 'text:editing:exited'] as const)
    c.on(ev, update);
  stage.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  return { update };
}
