// Panneau des calques : la pile des éléments (premier plan en haut), comme dans Figma.
// Clic : sélectionner (Maj / Ctrl : ajouter à la sélection) ; glisser-déposer : changer de plan
// (et entrer dans un groupe ou en sortir) ; boutons : masquer / afficher et verrouiller / déverrouiller.
// Les groupes sont des lignes dépliables : double-clic sur leur nom pour les renommer.
import { Circle, Ellipse, FabricImage, Line, Path, Polygon, Rect, Triangle, type FabricObject } from 'fabric';
import type { Editor } from '../editor';
import { label } from '../panel';
import { isText } from '../shapes';
import { h } from './dom';
import { uiIcon, type UiIcon } from './icons';

function kindIcon(o: FabricObject): UiIcon {
  if (isText(o)) return 'text';
  if (o instanceof FabricImage) return 'image';
  if (o instanceof Rect) return 'square';
  if (o instanceof Circle || o instanceof Ellipse) return 'circle';
  if (o instanceof Triangle) return 'triangle';
  if (o instanceof Line) return 'line';
  if (o instanceof Polygon) return o.points.length === 10 ? 'star' : 'shape';
  if (o instanceof Path) return 'sparkle';
  return 'square';
}

/** Nom affiché : début du texte pour un texte, sinon le type d'élément. */
function layerName(o: FabricObject): string {
  if (isText(o)) {
    const first = o.text.split('\n').find((l) => l.trim()) ?? '';
    const t = first.replace(/^[•\-–]\s*/, '').trim();
    return t ? (t.length > 34 ? `${t.slice(0, 33)}…` : t) : 'Texte vide';
  }
  if (o instanceof FabricImage && o.clipPath) return o.clipPath instanceof Circle ? 'Photo (ronde)' : 'Image (forme)';
  // Grand tracé libre (fond d'un modèle) : une forme, pas une icône.
  if (o instanceof Path && Math.max(o.getScaledWidth(), o.getScaledHeight()) > 120) return 'Forme';
  if (o instanceof Polygon && !(o instanceof Triangle)) return o.points.length === 10 ? 'Étoile' : o.points.length === 5 ? 'Bannière' : 'Forme';
  return label(o);
}

/** `pane` : onglet des calques ; `count` : compteur affiché dans l'onglet ; `shown` : l'onglet est visible. */
export function setupLayers(ed: Editor, pane: HTMLElement, count: HTMLElement, shown: () => boolean) {
  const c = ed.canvas;
  const list = h('ul', { class: 'layer-list', role: 'tree', ariaLabel: 'Calques', ariaMultiSelectable: 'true' });
  pane.append(list);

  /** Bloc en cours de glisser : un élément seul, ou tous les membres d'un groupe. */
  let dragged: { block: FabricObject[]; group?: string } | null = null;
  /** Groupes dépliés (repliés par défaut ; mémoire de session uniquement). */
  const expanded = new Set<string>();
  const isOpen = (id: string) => expanded.has(id);
  let renaming = false;
  let frame = 0;

  /** Clic sur une ligne : sélection simple, ou ajout / retrait avec Maj / Ctrl. */
  function pick(objs: FabricObject[], add: boolean, direct: boolean) {
    if (!add) return ed.select(objs, direct);
    const current = c.getActiveObjects();
    const all = objs.every((o) => current.includes(o));
    ed.select(all ? current.filter((o) => !objs.includes(o)) : [...current, ...objs.filter((o) => !current.includes(o))], direct);
  }

  function iconToggle(icon: UiIcon, title: string, on: boolean, onClick: () => void) {
    const b = h('button', { type: 'button', class: `icon layer-tog${on ? ' on' : ''}`, title, ariaLabel: title, ariaPressed: String(on) }, uiIcon(icon, 15));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  const top = (id: string) => ed.groupMembers(id).at(-1)!;
  const bottom = (id: string) => ed.groupMembers(id)[0];

  /**
   * Dépôt sur une ligne. `where` : au-dessus (plus en avant) ou en dessous.
   * Ligne d'élément : on prend son groupe (ou on quitte le sien) ; ligne de groupe : au-dessus = hors du groupe,
   * en dessous = en tête du groupe s'il est déplié, sinon après lui.
   */
  function drop(target: { obj?: FabricObject; group?: string }, where: 'above' | 'below') {
    if (!dragged) return;
    const { block, group } = dragged;
    if (target.group) {
      const g = target.group;
      if (group === g) return;
      if (group || where === 'above' || !isOpen(g)) {
        if (!group) ed.setGroup(block[0]);
        ed.moveBlock(block, where === 'above' ? top(g) : bottom(g), where);
      } else {
        ed.setGroup(block[0], g);
        ed.moveBlock(block, top(g), 'above');
      }
    } else if (target.obj) {
      const t = target.obj;
      if (group) {
        // Un groupe ne s'emboîte pas : il se place autour du groupe de la ligne visée.
        const g = t.groupId;
        if (g === group) return;
        ed.moveBlock(block, g ? (where === 'above' ? top(g) : bottom(g)) : t, where);
      } else {
        ed.setGroup(block[0], t.groupId);
        ed.moveBlock(block, t, where);
      }
    }
    ed.normalizeGroups();
    ed.scheduleCommit(0);
  }

  /** Glisser-déposer commun aux lignes d'élément et de groupe. */
  function draggable(li: HTMLLIElement, block: () => FabricObject[], target: { obj?: FabricObject; group?: string }) {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      dragged = { block: block(), group: target.group };
      li.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', '');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      dragged = null;
      render();
    });
    const above = (e: DragEvent) => {
      const r = li.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    };
    li.addEventListener('dragover', (e) => {
      if (!dragged || (target.obj && dragged.block.includes(target.obj)) || (target.group && dragged.group === target.group)) return;
      e.preventDefault();
      li.classList.toggle('drop-above', above(e));
      li.classList.toggle('drop-below', !above(e));
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-above', 'drop-below'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drop-above', 'drop-below');
      drop(target, above(e) ? 'above' : 'below');
    });
  }

  function itemRow(o: FabricObject, child: boolean): HTMLLIElement {
    const selected = c.getActiveObjects().includes(o);
    const li = h('li', {
      class: `layer${child ? ' child' : ''}${selected ? ' selected' : ''}${o.visible ? '' : ' hidden-layer'}${o.locked ? ' locked' : ''}`,
      role: 'treeitem',
      ariaSelected: String(selected),
      tabIndex: 0,
      title: 'Clic : sélectionner · Maj/Ctrl + clic : ajouter à la sélection · glisser : changer de plan',
    },
      uiIcon(kindIcon(o), 15),
      h('span', { class: 'layer-name' }, layerName(o)),
      iconToggle(o.locked ? 'lock' : 'unlock', o.locked ? 'Déverrouiller' : 'Verrouiller', !!o.locked, () => ed.toggleLock([o], !o.locked)),
      iconToggle(o.visible ? 'eye' : 'eyeOff', o.visible ? 'Masquer (ni affiché ni exporté)' : 'Afficher', !o.visible, () => ed.setVisible(o, !o.visible)),
    );
    // Dans un groupe, la ligne sélectionne l'élément seul (comme un double-clic sur la page).
    const choose = (e: MouseEvent | KeyboardEvent) => pick([o], e.shiftKey || e.ctrlKey || e.metaKey, child);
    li.addEventListener('click', choose);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(e);
      }
    });
    draggable(li, () => [o], { obj: o });
    return li;
  }

  function groupRow(id: string, members: FabricObject[]): HTMLLIElement {
    const open = isOpen(id);
    const selected = ed.selectedGroup() === id;
    const allLocked = members.every((o) => o.locked);
    const allHidden = members.every((o) => !o.visible);
    const chevron = h('button', { type: 'button', class: 'icon layer-chevron', title: open ? 'Replier le groupe' : 'Déplier le groupe', ariaLabel: open ? 'Replier le groupe' : 'Déplier le groupe' }, uiIcon('chevron', 14));
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open) expanded.delete(id);
      else expanded.add(id);
      render();
    });
    const name = h('span', { class: 'layer-name', title: 'Double-clic pour renommer' }, members[0].groupName || 'Groupe');
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      renaming = true;
      const input = h('input', { type: 'text', value: members[0].groupName || 'Groupe', maxLength: 60, ariaLabel: 'Nom du groupe' });
      const done = (save: boolean) => {
        if (!renaming) return;
        renaming = false;
        if (save) ed.renameGroup(id, input.value);
        render();
      };
      input.addEventListener('keydown', (k) => {
        k.stopPropagation();
        if (k.key === 'Enter') done(true);
        if (k.key === 'Escape') done(false);
      });
      input.addEventListener('blur', () => done(true));
      input.addEventListener('click', (k) => k.stopPropagation());
      name.replaceWith(input);
      input.select();
    });
    const li = h('li', {
      class: `layer group-row${selected ? ' selected' : ''}${allHidden ? ' hidden-layer' : ''}${allLocked ? ' locked' : ''}`,
      role: 'treeitem',
      ariaExpanded: String(open),
      ariaSelected: String(selected),
      tabIndex: 0,
      title: 'Clic : sélectionner le groupe · glisser : déplacer tout le groupe',
    },
      chevron,
      uiIcon('folder', 15),
      name,
      h('span', { class: 'layer-count' }, String(members.length)),
      iconToggle(allLocked ? 'lock' : 'unlock', allLocked ? 'Déverrouiller le groupe' : 'Verrouiller le groupe', allLocked, () => ed.toggleLock(members, !allLocked)),
      iconToggle(allHidden ? 'eyeOff' : 'eye', allHidden ? 'Afficher le groupe' : 'Masquer le groupe', allHidden, () => {
        for (const o of members) ed.setVisible(o, allHidden);
      }),
    );
    const choose = (e: MouseEvent | KeyboardEvent) => pick(members, e.shiftKey || e.ctrlKey || e.metaKey, false);
    li.addEventListener('click', choose);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(e);
      }
      if (e.key === 'ArrowRight' && !open) chevron.click();
      if (e.key === 'ArrowLeft' && open) chevron.click();
    });
    draggable(li, () => ed.groupMembers(id), { group: id });
    return li;
  }

  function render() {
    cancelAnimationFrame(frame);
    const objs = c.getObjects();
    count.textContent = String(objs.length);
    if (!shown() || dragged || renaming) return;
    // Un élément sélectionné seul dans un groupe : on déplie ce groupe pour le montrer.
    if (!ed.selectedGroup()) for (const o of c.getActiveObjects()) if (o.groupId) expanded.add(o.groupId);
    const rows: HTMLLIElement[] = [];
    const seen = new Set<string>();
    for (const o of [...objs].reverse()) {
      const g = o.groupId;
      if (!g) rows.push(itemRow(o, false));
      else if (!seen.has(g)) {
        seen.add(g);
        const members = objs.filter((x) => x.groupId === g);
        rows.push(groupRow(g, members));
        if (isOpen(g)) rows.push(...[...members].reverse().map((m) => itemRow(m, true)));
      }
    }
    list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'layer-empty' }, 'Aucun élément sur la page.')]));
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  };

  for (const ev of ['object:added', 'object:removed', 'object:modified', 'selection:created', 'selection:updated', 'selection:cleared', 'text:changed'] as const)
    c.on(ev, schedule);
  return { refresh: schedule };
}
