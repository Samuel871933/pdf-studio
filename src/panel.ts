import { ActiveSelection, Circle, Color, Ellipse, FabricImage, Line, Path, Polygon, Rect, Triangle, type FabricObject, type Textbox } from 'fabric';
import type { Editor, MetaKey } from './editor';
import { FONT_FAMILIES, isBold } from './fonts';
import { columnRects } from './layout';
import { isRound, isText, makeRound, shapeClip } from './shapes';
import { h, type Child } from './ui/dom';
import { uiIcon, type UiIcon } from './ui/icons';

const PALETTE = ['#212a39', '#66747d', '#f9f9f6', '#ffffff', '#000000', '#2f6fed', '#1f9d55', '#e0a526', '#d64545', '#8b5cf6'];
const TEXT_STYLE_KEYS = new Set(['fill', 'fontFamily', 'fontSize', 'fontWeight', 'underline', 'linethrough']);
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function toHex(c: unknown): string {
  if (typeof c !== 'string' || !c) return '#000000';
  try {
    return `#${new Color(c).toHex().slice(0, 6).toLowerCase()}`;
  } catch {
    return '#000000';
  }
}

export function label(o: FabricObject): string {
  if (o instanceof ActiveSelection) return `Sélection (${o.size()} éléments)`;
  if (isText(o)) return 'Texte';
  if (o instanceof FabricImage) return 'Image';
  if (o instanceof Rect) return 'Rectangle';
  if (o instanceof Circle || o instanceof Ellipse) return 'Cercle';
  if (o instanceof Triangle) return 'Triangle';
  if (o instanceof Line) return 'Ligne';
  if (o instanceof Polygon) return 'Forme';
  if (o instanceof Path) return 'Icône';
  return 'Élément';
}

/**
 * Regroupe la liste plate du panneau en sections : chaque intertitre <h2> ouvre une section,
 * le titre principal (h2.title) forme l'en-tête. L'espacement est géré par la mise en page des sections.
 */
function sections(nodes: Node[]): Node[] {
  const out: Node[] = [];
  let sec: HTMLElement | null = null;
  for (const n of nodes) {
    if (n instanceof HTMLHeadingElement) {
      sec = n.classList.contains('title') ? h('header', { class: 'panel-head' }, n) : h('section', { class: 'sec' }, n);
      out.push(sec);
    } else if (sec) sec.append(n);
    else out.push(n);
  }
  return out;
}

export interface PanelActions {
  /** Propriétés du PDF déduites du contenu (remplissage rapide), ou `null` hors modèle relié. */
  autoMeta(): Record<MetaKey, string> | null;
  /** Ajoute une nouvelle image sur la page. */
  addImage(): void;
  replaceImage(img: FabricImage): void;
  /** Remplace la forme par une image découpée à sa forme. */
  fillShape(shape: FabricObject): void;
  replaceIcon(icon: Path): void;
}

export class Panel {
  private refreshers: (() => void)[] = [];
  /**
   * Mémoire des choix appliqués (par élément) : re-cliquer sur une option active
   * restaure l'état précédent. Clé = groupe d'options (ex. « align-x », « fill »).
   */
  private memo = new WeakMap<object, Map<string, () => void>>();

  /** Vrai pendant qu'une option du panneau s'applique (pour distinguer des modifications manuelles). */
  private applying = false;

  constructor(private root: HTMLElement, private ed: Editor, private actions: PanelActions) {
    // Une modification manuelle (déplacement, redimensionnement…) rend la mémoire des choix obsolète.
    ed.canvas.on('object:modified', ({ target }) => {
      if (!this.applying && target) this.memo.delete(target);
    });
    ed.onNudge = (o) => this.memo.delete(o);
  }

  render() {
    this.refreshers = [];
    const a = this.ed.active();
    this.root.replaceChildren(...sections(a ? this.objectPanel(a) : this.documentPanel()));
  }

  /** Met à jour les valeurs affichées sans reconstruire le panneau. */
  refresh() {
    for (const r of this.refreshers) r();
  }

  // ---------------------------------------------------------------- Modifications

  private targets(): FabricObject[] {
    const a = this.ed.active();
    if (!a) return [];
    return a instanceof ActiveSelection ? a.getObjects() : [a];
  }

  /** Texte en cours d'édition avec une portion sélectionnée : le style s'applique à la sélection. */
  private textSelection(o: FabricObject): Textbox | null {
    return isText(o) && o.isEditing && o.selectionStart !== o.selectionEnd ? o : null;
  }

  private setStyle(key: string, value: unknown) {
    for (const o of this.targets()) {
      const sel = this.textSelection(o);
      if (sel && TEXT_STYLE_KEYS.has(key)) {
        sel.setSelectionStyles({ [key]: value });
        sel.initDimensions();
      } else {
        if (isText(o) && TEXT_STYLE_KEYS.has(key)) o.removeStyle(key as Parameters<Textbox['removeStyle']>[0]);
        o.set(key as keyof FabricObject, value as never);
        if (isText(o)) o.initDimensions();
      }
      o.setCoords();
      o.dirty = true;
    }
    this.commit();
  }

  private getStyle<T>(key: string): T {
    const o = this.targets()[0] as FabricObject & Record<string, unknown>;
    const sel = this.textSelection(o);
    if (sel && TEXT_STYLE_KEYS.has(key)) {
      const s = sel.getSelectionStyles(sel.selectionStart, sel.selectionStart + 1)[0] as Record<string, unknown> | undefined;
      if (s && s[key] !== undefined) return s[key] as T;
    }
    return o[key] as T;
  }

  private commit() {
    this.ed.canvas.requestRenderAll();
    this.ed.scheduleCommit(350);
    this.refresh();
  }

  // ---------------------------------------------------------------- Champs

  private num(name: string, get: () => number, set: (v: number) => void, opts: { step?: number; min?: number; max?: number; disabled?: boolean } = {}) {
    const input = h('input', { type: 'number', step: String(opts.step ?? 1), disabled: !!opts.disabled });
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    input.addEventListener('input', () => {
      let v = input.valueAsNumber;
      if (!Number.isFinite(v)) return;
      if (opts.min !== undefined) v = Math.max(opts.min, v);
      if (opts.max !== undefined) v = Math.min(opts.max, v);
      set(v);
      this.commit();
    });
    this.refreshers.push(() => {
      if (document.activeElement !== input) input.value = String(round(get()));
    });
    return h('label', { class: 'field' }, h('span', {}, name), input);
  }

  private range(name: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number) {
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const out = h('span', {});
    input.addEventListener('input', () => {
      set(input.valueAsNumber);
      this.commit();
    });
    this.refreshers.push(() => {
      input.value = String(get());
      out.textContent = `${name} · ${Math.round(get() * 100)} %`;
    });
    return h('label', { class: 'field' }, out, input);
  }

  private color(name: string, get: () => unknown, set: (v: string | null) => void, allowNone = false) {
    const picker = h('input', { type: 'color' });
    const hex = h('input', { type: 'text', maxLength: 7, spellcheck: false });
    picker.addEventListener('input', () => {
      set(picker.value);
      this.commit();
    });
    hex.addEventListener('change', () => {
      const v = hex.value.trim();
      if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) set(v.startsWith('#') ? v : `#${v}`);
      this.commit();
    });
    const swatches = h('div', { class: 'swatches' });
    const has = () => {
      const v = get();
      return typeof v === 'string' && v !== '' && v !== 'transparent';
    };
    const capture = () => {
      const prev = get();
      return () => set(typeof prev === 'string' && prev ? prev : null);
    };
    const group = `color:${name}`;
    for (const c of this.documentColors()) {
      const b = h('button', { type: 'button', title: c, ariaLabel: c });
      b.style.background = c;
      swatches.append(this.choice(b, group, () => has() && toHex(get()) === c, () => set(c), capture));
    }
    if (allowNone) {
      const none = h('button', { type: 'button', class: 'none', title: 'Aucune couleur', ariaLabel: 'Aucune couleur' });
      swatches.append(this.choice(none, group, () => !has(), () => set(null), capture));
    }
    this.refreshers.push(() => {
      picker.value = toHex(get());
      if (document.activeElement !== hex) hex.value = has() ? toHex(get()) : 'aucune';
    });
    return h('div', { class: 'field' }, h('span', {}, name), h('div', { class: 'color' }, picker, hex), swatches);
  }

  /** Palette : couleurs déjà utilisées dans le document, puis couleurs par défaut. */
  private documentColors(): string[] {
    const set = new Set<string>();
    for (const o of this.ed.canvas.getObjects())
      for (const c of [o.fill, o.stroke]) if (typeof c === 'string' && c) set.add(toHex(c));
    for (const c of PALETTE) set.add(c);
    return [...set].slice(0, 14);
  }

  /** Élément concerné par la mémoire des choix (sélection, ou la page s'il n'y en a pas). */
  private memoTarget(): object {
    return this.ed.active() ?? this.ed.canvas;
  }

  /**
   * Option à état : elle s'affiche active quand elle correspond à l'élément,
   * et un nouveau clic sur l'option active annule ce choix (retour à l'état d'avant).
   */
  private choice(el: HTMLButtonElement, group: string, isActive: () => boolean, apply: () => void, capture: () => () => void) {
    el.addEventListener('click', () => {
      const target = this.memoTarget();
      let m = this.memo.get(target);
      if (!m) this.memo.set(target, (m = new Map()));
      const restore = m.get(group);
      this.applying = true;
      try {
        if (isActive() && restore) {
          restore();
          m.delete(group);
        } else {
          // Clics successifs dans un même groupe (ex. gauche puis centre) : on garde l'état d'origine.
          if (!restore) m.set(group, capture());
          apply();
        }
      } finally {
        this.applying = false;
      }
      this.commit();
    });
    this.refreshers.push(() => {
      const on = isActive();
      el.classList.toggle('active', on);
      el.ariaPressed = String(on);
    });
    return el;
  }

  /** Capture de la géométrie (position, taille) pour pouvoir l'annuler. */
  private captureGeometry(): () => void {
    const o = this.ed.active();
    if (!o) return () => {};
    const state = { left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY, width: o.width };
    return () => {
      o.set(state);
      if (isText(o)) o.initDimensions();
      o.setCoords();
      this.ed.canvas.fire('object:modified', { target: o });
    };
  }

  /** Capture de la position dans la pile (plan). */
  private captureIndex(): () => void {
    const o = this.ed.active();
    if (!o || o instanceof ActiveSelection) return () => {};
    const index = this.ed.canvas.getObjects().indexOf(o);
    return () => {
      this.ed.canvas.moveObjectTo(o, index);
      this.ed.canvas.requestRenderAll();
    };
  }

  private button(text: string, title: string, onClick: () => void, cls = '', icon?: UiIcon) {
    const b = h('button', { type: 'button', title, class: cls }, icon && uiIcon(icon), text);
    b.addEventListener('click', onClick);
    return b;
  }

  /** Bouton d'icône seule (le titre sert d'étiquette accessible). */
  private iconButton(icon: UiIcon, title: string, onClick: () => void) {
    const b = this.button('', title, onClick, 'ico', icon);
    b.ariaLabel = title;
    return b;
  }

  private toggle(text: string, title: string, get: () => boolean, set: (v: boolean) => void) {
    const b = this.button(text, title, () => {
      set(!get());
      this.commit();
    });
    b.ariaPressed = 'false';
    this.refreshers.push(() => {
      b.classList.toggle('active', get());
      b.ariaPressed = String(get());
    });
    return b;
  }

  // ---------------------------------------------------------------- Panneaux

  private columnChoice(label: string, title: string, from: number, to: number) {
    const cols = columnRects(this.ed.columns);
    const isActive = () => {
      const a = this.ed.active();
      if (!a) return false;
      const b = a.getBoundingRect();
      return Math.abs(b.left - cols[from].x) < 0.75 && Math.abs(b.left + b.width - (cols[to].x + cols[to].w)) < 0.75;
    };
    return this.choice(this.button(label, title, () => {}), 'columns', isActive, () => this.ed.placeInColumns(from, to), () => this.captureGeometry());
  }

  /** Alignement : actif quand l'élément est déjà aligné ainsi dans sa zone de référence. */
  private alignChoice(icon: UiIcon, title: string, where: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const isActive = () => {
      const a = this.ed.active();
      if (!a) return false;
      const b = a.getBoundingRect();
      const z = this.ed.referenceZone(a);
      const d = {
        left: b.left - z.x0,
        hcenter: b.left + b.width / 2 - (z.x0 + z.x1) / 2,
        right: b.left + b.width - z.x1,
        top: b.top - z.y0,
        vcenter: b.top + b.height / 2 - (z.y0 + z.y1) / 2,
        bottom: b.top + b.height - z.y1,
      }[where];
      return Math.abs(d) < 0.75;
    };
    const group = ['left', 'hcenter', 'right'].includes(where) ? 'align-x' : 'align-y';
    return this.choice(this.iconButton(icon, title, () => {}), group, isActive, () => this.ed.align(where), () => this.captureGeometry());
  }

  /** Plan : premier plan / arrière-plan actifs quand l'élément y est déjà. */
  private layerChoice(icon: UiIcon, title: string, action: 'front' | 'back') {
    const isActive = () => {
      const a = this.ed.active();
      const objs = this.ed.canvas.getObjects();
      if (!a || a instanceof ActiveSelection || objs.length < 2) return false;
      return action === 'front' ? objs.at(-1) === a : objs[0] === a;
    };
    return this.choice(this.iconButton(icon, title, () => {}), 'layer', isActive, () => this.ed.arrange(action), () => this.captureIndex());
  }

  /** Placement dans la grille de colonnes (affichée uniquement si les colonnes sont visibles). */
  private gridSection(a: FabricObject): Node[] {
    const ed = this.ed;
    if (!ed.showColumns) return [];
    const cols = columnRects(ed.columns);
    const n = cols.length;
    const nodes: Node[] = [h('h2', {}, 'Grille')];
    if (n <= 4) {
      nodes.push(
        h('p', { class: 'hint' }, 'Placer dans :'),
        h('div', { class: 'btns' },
          ...cols.map((_, i) => this.columnChoice(`Col. ${i + 1}`, `Largeur et position de la colonne ${i + 1}`, i, i)),
          n > 1 && this.columnChoice('Tout', 'Toute la largeur de la grille', 0, n - 1),
        ),
      );
    } else {
      // Grille fine : choix de la première et de la dernière colonne occupées.
      const b = a.getBoundingRect();
      const centerCol = (x: number) => cols.reduce((best, c, i) => (Math.abs(c.x + c.w / 2 - x) < Math.abs(cols[best].x + cols[best].w / 2 - x) ? i : best), 0);
      const options = () => cols.map((_, i) => h('option', { value: String(i) }, String(i + 1)));
      const from = h('select', {}, ...options());
      const to = h('select', {}, ...options());
      from.value = String(centerCol(b.left + Math.min(b.width, cols[0].w) / 2));
      to.value = String(centerCol(b.left + b.width - Math.min(b.width, cols[0].w) / 2));
      const apply = this.button('Placer', 'Placer sur ces colonnes', () => ed.placeInColumns(Number(from.value), Number(to.value)));
      nodes.push(h('div', { class: 'row grid-span' }, h('span', { class: 'hint' }, 'Colonnes'), from, h('span', { class: 'hint' }, 'à'), to, apply));
    }
    nodes.push(h('p', { class: 'hint' }, ed.columns.contain ? 'Les éléments restent dans les marges de la grille.' : 'Les éléments peuvent sortir des marges.'));
    return nodes;
  }

  /**
   * Propriété du PDF : remplie automatiquement depuis le contenu (remplissage rapide) tant qu'on ne la
   * modifie pas ; modifiée à la main, elle est conservée et un bouton « Auto » la rend de nouveau automatique.
   */
  private metaField(key: MetaKey, label: string, el: HTMLInputElement | HTMLTextAreaElement) {
    const ed = this.ed;
    const reset = h('button', { type: 'button', class: 'meta-auto', title: 'Revenir à la valeur déduite du contenu' }, '↺ Auto');
    const tag = h('em', { class: 'meta-tag' });
    el.addEventListener('input', () => {
      ed.meta[key] = el.value;
      // Valeur identique à la valeur automatique : le champ reste automatique.
      const auto = this.actions.autoMeta()?.[key];
      ed.meta.manual = { ...ed.meta.manual };
      if (auto !== undefined && el.value === auto) delete ed.meta.manual[key];
      else ed.meta.manual[key] = true;
      ed.dirty = true;
      sync();
    });
    reset.addEventListener('click', () => {
      const auto = this.actions.autoMeta();
      if (!auto) return;
      ed.meta.manual = { ...ed.meta.manual };
      delete ed.meta.manual[key];
      ed.meta[key] = auto[key];
      ed.dirty = true;
      this.refresh();
    });
    const sync = () => {
      const linked = !!this.actions.autoMeta();
      const manual = !!ed.meta.manual?.[key];
      reset.hidden = !linked || !manual;
      tag.textContent = linked ? (manual ? ' · modifié à la main' : ' · automatique') : '';
      tag.classList.toggle('manual', manual);
    };
    this.refreshers.push(() => {
      if (document.activeElement !== el) el.value = ed.meta[key];
      sync();
    });
    return h('label', { class: 'field' }, h('span', { class: 'meta-label' }, h('span', {}, label, tag), reset), el);
  }

  private documentPanel(): Node[] {
    const ed = this.ed;
    const c = ed.canvas;
    const title = h('input', { type: 'text', placeholder: 'Document', maxLength: 300 });
    const author = h('input', { type: 'text', placeholder: '(vide)', maxLength: 300 });
    const subject = h('textarea', { rows: 3, placeholder: 'Ex. : Développeur full-stack, 6 ans d’expérience, PHP / React', maxLength: 1000 });
    const keywords = h('textarea', { rows: 2, placeholder: 'Ex. : PHP, Symfony, React, gestion de projet', maxLength: 1000 });
    const linked = !!this.actions.autoMeta();
    const nodes = [
      h('h2', { class: 'title' }, 'Document'),
      h('h2', {}, 'Insérer'),
      this.button('Ajouter une image…', 'Ajouter une image sur la page (ou glisser-déposer, coller)', () => this.actions.addImage(), 'wide', 'image'),
      h('h2', {}, 'Page'),
      this.color('Fond de page', () => c.backgroundColor, (v) => c.set('backgroundColor', v ?? '#ffffff')),
      h('h2', {}, 'Propriétés du PDF'),
      linked && h('p', { class: 'hint' }, 'Remplies automatiquement depuis le contenu (onglet « Contenu ») : elles suivent vos modifications. Un champ modifié à la main est conservé.'),
      this.metaField('title', 'Titre', title),
      this.metaField('author', 'Auteur', author),
      this.metaField('subject', 'Résumé (sujet)', subject),
      this.metaField('keywords', 'Mots-clés', keywords),
      h('p', { class: 'hint' }, 'Ces informations sont intégrées au fichier PDF et lues par les logiciels de recrutement. Videz l’auteur pour ne pas l’indiquer.'),
      h('h2', {}, 'Astuces'),
      h('p', { class: 'hint' }, 'Double-cliquez sur un texte pour le modifier, sur une image pour la remplacer. Sélectionnez une partie du texte pour la mettre en gras ou la colorer.'),
      h('p', { class: 'hint' }, 'Glissez-déposez ou collez une image directement sur la page.'),
      h('p', { class: 'hint' }, 'Raccourcis clavier : touche ', h('kbd', {}, '?'), ' ou bouton ? en bas à droite.'),
      h('h2', {}, 'Confidentialité'),
      h('p', { class: 'hint' }, 'Tout est traité dans votre navigateur : aucun envoi, aucun cookie, aucun stockage. Fermer la page efface tout — pensez à enregistrer votre projet.'),
    ];
    queueMicrotask(() => this.refresh());
    return nodes.filter((n): n is Exclude<typeof n, false> => n !== false);
  }

  private objectPanel(a: FabricObject): Node[] {
    const ed = this.ed;
    const objs = this.targets();
    const first = objs[0];
    const isSel = a instanceof ActiveSelection;
    const texts = objs.filter(isText);
    const allText = texts.length === objs.length;
    const image = !isSel && a instanceof FabricImage ? a : null;
    const locked = !!a.locked;
    const groupId = ed.selectedGroup();
    const title = groupId ? `Groupe « ${ed.groupMembers(groupId)[0].groupName ?? 'Groupe'} »` : label(a);
    const nodes: Child[] = [h('h2', { class: 'title' }, title + (locked ? ' 🔒' : ''))];

    // Position & taille
    const textbox = !isSel && isText(a);
    nodes.push(
      h('h2', {}, 'Position et taille'),
      h('div', { class: 'grid2' },
        this.num('X', () => a.left, (v) => a.set('left', v)),
        this.num('Y', () => a.top, (v) => a.set('top', v)),
        this.num('Largeur', () => a.getScaledWidth(), (v) => {
          if (v <= 0) return;
          if (textbox) a.set('width', v / a.scaleX);
          else a.set('scaleX', v / a.width);
        }, { min: 1 }),
        this.num('Hauteur', () => a.getScaledHeight(), (v) => {
          if (v > 0) a.set('scaleY', v / a.height);
        }, { min: 1, disabled: textbox }),
        this.num('Rotation', () => a.angle, (v) => a.rotate(v), { min: -360, max: 360 }),
      ),
    );
    this.refreshers.push(() => a.setCoords());

    // Texte
    if (texts.length && allText) {
      const family = h('select', {}, ...FONT_FAMILIES.map((f) => h('option', { value: f }, f)));
      family.addEventListener('change', () => this.setStyle('fontFamily', family.value));
      this.refreshers.push(() => (family.value = this.getStyle<string>('fontFamily')));
      const align = h('div', { class: 'seg' },
        ...([['left', 'Gauche', '⯇'], ['center', 'Centré', '≡'], ['right', 'Droite', '⯈'], ['justify-left', 'Justifié', '☰']] as const).map(([v, t, s]) => {
          const b = this.button(s, t, () => this.setStyle('textAlign', v));
          this.refreshers.push(() => b.classList.toggle('active', (first as Textbox).textAlign.split('-')[0] === v.split('-')[0]));
          return b;
        }),
      );
      nodes.push(
        h('h2', {}, 'Texte'),
        h('label', { class: 'field' }, h('span', {}, 'Police'), family),
        h('div', { class: 'grid2' },
          this.num('Taille (pt)', () => this.getStyle<number>('fontSize'), (v) => this.setStyle('fontSize', v), { min: 4, max: 200, step: 0.5 }),
          this.num('Interligne', () => (first as Textbox).lineHeight, (v) => this.setStyle('lineHeight', v), { min: 0.6, max: 4, step: 0.05 }),
        ),
        h('div', { class: 'row' },
          this.toggle('G', 'Gras', () => isBold(this.getStyle('fontWeight')), (v) => this.setStyle('fontWeight', v ? 'bold' : 'normal')),
          this.toggle('S', 'Souligné', () => !!this.getStyle('underline'), (v) => this.setStyle('underline', v)),
          this.toggle('B', 'Barré', () => !!this.getStyle('linethrough'), (v) => this.setStyle('linethrough', v)),
          align,
        ),
        this.color('Couleur du texte', () => this.getStyle('fill'), (v) => this.setStyle('fill', v ?? '#000000')),
      );
    }

    // Formes
    const shapeImage: Child[] = [];
    const shapes = objs.filter((o) => !isText(o) && !(o instanceof FabricImage));
    if (shapes.length && shapes.length === objs.length) {
      const lineOnly = shapes.every((o) => o instanceof Line);
      nodes.push(h('h2', {}, 'Apparence'));
      if (!lineOnly) nodes.push(this.color('Remplissage', () => first.fill, (v) => this.setStyle('fill', v), true));
      nodes.push(
        this.color(lineOnly ? 'Couleur' : 'Contour', () => first.stroke, (v) => {
          this.setStyle('stroke', v);
          if (v && !first.strokeWidth) this.setStyle('strokeWidth', 2);
        }, !lineOnly),
        h('div', { class: 'grid2' },
          this.num('Épaisseur', () => first.strokeWidth, (v) => this.setStyle('strokeWidth', v), { min: 0, max: 100, step: 0.5 }),
          !isSel && a instanceof Rect && this.num('Arrondi', () => a.rx, (v) => a.set({ rx: v, ry: v }), { min: 0, max: 500 }),
        ),
      );
      if (!isSel && !a.locked && shapeClip(a))
        shapeImage.push(
          h('h2', {}, 'Image'),
          this.button('Remplir avec une image…', 'Remplacer la forme par une image découpée à sa forme', () => this.actions.fillShape(a), 'wide', 'image'),
          h('p', { class: 'hint' }, 'La forme sert de cadre : l’image la remplit et prend son contour.'),
        );
    }

    // Image
    if (image) {
      nodes.push(
        h('h2', {}, 'Image'),
        h('div', { class: 'row' },
          this.toggle('Forme ronde', 'Recadrer en cercle', () => isRound(image), (v) => makeRound(image, v)),
          this.toggle('Miroir', 'Retourner horizontalement', () => image.flipX, (v) => image.set('flipX', v)),
        ),
        this.button('Remplacer l’image…', 'Choisir une autre image', () => this.actions.replaceImage(image), 'wide', 'image'),
      );
      // Cadrage : choisir la partie visible quand l'image déborde de son encart.
      const orig = image.getOriginalSize();
      const roomX = orig.width - image.width;
      const roomY = orig.height - image.height;
      if (roomX > 1) nodes.push(this.range('Cadrage horizontal', () => image.cropX / roomX, (v) => image.set({ cropX: v * roomX, dirty: true }), 0, 1, 0.01));
      if (roomY > 1) nodes.push(this.range('Cadrage vertical', () => image.cropY / roomY, (v) => image.set({ cropY: v * roomY, dirty: true }), 0, 1, 0.01));
    }

    if (!isSel && a instanceof Path) {
      nodes.push(h('div', { class: 'row' }, this.button('Changer d’icône…', 'Choisir une autre icône dans la bibliothèque', () => this.actions.replaceIcon(a))));
    }

    nodes.push(this.range('Opacité', () => (isSel ? first.opacity : a.opacity), (v) => this.setStyle('opacity', v), 0, 1, 0.01), ...shapeImage);

    // Disposition
    nodes.push(
      h('h2', {}, 'Plan'),
      h('div', { class: 'btns' },
        this.layerChoice('front', 'Premier plan (re-cliquer pour annuler)', 'front'),
        this.iconButton('forward', 'Avancer d’un plan', () => ed.arrange('forward')),
        this.iconButton('backward', 'Reculer d’un plan', () => ed.arrange('backward')),
        this.layerChoice('back', 'Arrière-plan (re-cliquer pour annuler)', 'back'),
      ),
      ...this.gridSection(a),
      h('h2', {}, ed.showColumns ? 'Aligner dans la colonne' : 'Aligner sur la page'),
      h('div', { class: 'btns three' },
        this.alignChoice('alignLeft', 'Aligner à gauche', 'left'),
        this.alignChoice('alignHCenter', 'Centrer horizontalement', 'hcenter'),
        this.alignChoice('alignRight', 'Aligner à droite', 'right'),
        this.alignChoice('alignTop', 'Aligner en haut', 'top'),
        this.alignChoice('alignVCenter', 'Centrer verticalement', 'vcenter'),
        this.alignChoice('alignBottom', 'Aligner en bas', 'bottom'),
      ),
      h('h2', {}, 'Actions'),
      h('div', { class: 'btns three' },
        this.button('Dupliquer', 'Dupliquer (Ctrl+D)', () => void ed.duplicate()),
        this.button(locked ? 'Déverrouiller' : 'Verrouiller', 'Empêche tout déplacement ou modification (Ctrl+Maj+L)', () => ed.toggleLock()),
      ),
      (isSel || first.groupId) && h('div', { class: 'btns two' },
        isSel && !groupId && this.button('Grouper', 'Regrouper la sélection (Ctrl+G)', () => ed.group(), '', 'group'),
        objs.some((o) => o.groupId) && this.button('Dégrouper', 'Dissoudre le groupe (Ctrl+Maj+G)', () => ed.ungroup(), '', 'ungroup'),
        this.button('Supprimer', 'Supprimer (Suppr)', () => ed.removeSelection(), 'danger'),
      ),
    );

    queueMicrotask(() => this.refresh());
    return nodes.filter((n): n is Node => n instanceof Node);
  }
}
