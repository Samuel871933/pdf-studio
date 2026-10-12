import { ActiveSelection, Canvas, Circle, FabricImage, FabricObject, Path, Point, type Textbox } from 'fabric';
import { DEFAULT_LAYOUT, columnRects, contentZone, layoutSnapTargets, rowRects, zoneFor, type ColumnLayout, type Zone } from './layout';
import { isText } from './shapes';

declare module 'fabric' {
  interface FabricObject {
    locked?: boolean;
    /** Groupe logique (les éléments restent séparés dans le PDF : ordre de lecture et balisage intacts). */
    groupId?: string;
    groupName?: string;
    /** Élément généré par un modèle (remplacé quand le remplissage rapide régénère la page). */
    tpl?: boolean;
    /** Champ de la fiche affiché par ce texte (« experience.0.title ») et sa mise en forme. */
    field?: string;
    codec?: string;
  }
  interface SerializedObjectProps {
    locked?: boolean;
    groupId?: string;
    groupName?: string;
    tpl?: boolean;
    field?: string;
    codec?: string;
  }
}

/** Format A4 en points PDF (1 unité du canevas = 1 pt). */
export const PAGE = { w: 595.28, h: 841.89 } as const;

export interface DocMeta {
  title: string;
  author: string;
  /** Résumé du document (métadonnées PDF lues par les outils d'indexation). */
  subject: string;
  keywords: string;
  /** Type de document (fixé par le modèle choisi), utilisé par l'analyse IA. */
  kind?: 'cv' | 'letter';
  /** Propriétés modifiées à la main : le remplissage rapide ne les remplace plus. */
  manual?: Partial<Record<MetaKey, true>>;
}

export type MetaKey = 'title' | 'author' | 'subject' | 'keywords';
export const META_KEYS: MetaKey[] = ['title', 'author', 'subject', 'keywords'];

export const emptyMeta = (title = '', kind?: DocMeta['kind']): DocMeta => ({ title, author: '', subject: '', keywords: '', kind });

export interface CanvasJSON {
  version?: string;
  background?: unknown;
  objects: Record<string, unknown>[];
}

FabricObject.customProperties = ['locked', 'groupId', 'groupName', 'tpl', 'field', 'codec'];
Object.assign(FabricObject.ownDefaults, {
  originX: 'left',
  originY: 'top',
  transparentCorners: false,
  cornerColor: '#ffffff',
  cornerStrokeColor: '#2f6fed',
  borderColor: '#2f6fed',
  cornerStyle: 'circle',
  cornerSize: 10,
  borderScaleFactor: 1.5,
  padding: 2,
});

const HISTORY_LIMIT = 60;
const newGroupId = () => `g${Math.random().toString(36).slice(2, 10)}`;

/** Un bouton de la souris est-il maintenu ? (suivi global : la molette zoome seulement dans ce cas) */
let pointerPressed = false;
for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'pointercancel'] as const)
  window.addEventListener(ev, (e) => (pointerPressed = ev !== 'pointercancel' && e.buttons !== 0), { capture: true, passive: true });
window.addEventListener('blur', () => (pointerPressed = false));
const SNAP_PX = 6;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

export function applyLock(obj: FabricObject, locked: boolean) {
  obj.set({
    locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hasControls: !locked,
    editable: !locked,
  } as Partial<FabricObject>);
}

export class Editor {
  readonly canvas: Canvas;
  zoom = 1;
  meta: DocMeta = emptyMeta();
  dirty = false;
  /** État du remplissage rapide (fiche + modèle), enregistré dans l'historique avec la page. */
  fill: unknown = null;
  /** Appelé après annuler / rétablir (l'état du remplissage a pu changer). */
  onRestore: () => void = () => {};
  /** Aides visuelles (jamais exportées). */
  snapEnabled = true;
  showGrid = false;
  gridSize = 10;
  showColumns = false;
  columns: ColumnLayout = { ...DEFAULT_LAYOUT };
  /** Appelé quand l'historique ou le zoom change (mise à jour de l'interface). */
  onStateChange: () => void = () => {};
  /** Appelé quand les aides (grille, colonnes…) changent. */
  onAidsChange: () => void = () => {};
  /** Appelé après un déplacement au clavier. */
  onNudge: (o: FabricObject) => void = () => {};
  /** Appelé par la touche « ? ». */
  onHelp: () => void = () => {};

  private history: string[] = [];
  private historyIndex = -1;
  private restoring = false;
  private commitTimer = 0;
  private clipboard: FabricObject | null = null;
  // Les images (data URL, potentiellement lourdes) sont stockées une seule fois
  // et remplacées par une clé dans les instantanés d'historique.
  private imageKeys = new Map<string, string>();
  private imageData = new Map<string, string>();
  private guides = { v: [] as number[], h: [] as number[] };
  /** Dernier état valide pendant un redimensionnement (contrainte de grille). */
  private lastValid = new WeakMap<FabricObject, Record<string, number>>();
  /** Déplacement de la vue en cours (glisser dans le vide). */
  private pan: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  /** Rapport hauteur / largeur au début d'une transformation. */
  private ratio = 1;

  static keepsProportions(o: FabricObject): boolean {
    return o instanceof FabricImage || o instanceof Path || o instanceof Circle || o instanceof ActiveSelection || isText(o);
  }

  constructor(el: HTMLCanvasElement, private stage: HTMLElement) {
    this.canvas = new Canvas(el, {
      width: PAGE.w,
      height: PAGE.h,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selectionColor: 'rgba(47,111,237,0.08)',
      selectionBorderColor: '#2f6fed',
      selectionLineWidth: 1,
      fireRightClick: false,
      // Maj = conserver les proportions (et jamais d'inclinaison).
      uniformScaling: false,
      uniScaleKey: 'shiftKey',
      altActionKey: null,
    });
    const c = this.canvas;
    const changed = () => this.scheduleCommit(0);
    c.on('object:added', changed);
    c.on('object:removed', changed);
    c.on('object:modified', changed);
    c.on('text:changed', () => this.scheduleCommit(400));
    c.on('object:moving', (e) => {
      // Fabric a déplacé l'objet sans recalculer ses coordonnées : on les met à jour avant de mesurer.
      e.target.setCoords();
      this.snap(e.target);
      this.contain(e.target);
    });
    c.on('before:transform', ({ transform }) => {
      const t = transform.target;
      this.saveValid(t);
      this.ratio = t.scaleY / t.scaleX;
      // Images, icônes, textes, cercles : proportions toujours conservées ; formes : Maj pour les conserver.
      const proportional = Editor.keepsProportions(t);
      c.uniformScaling = proportional;
      c.uniScaleKey = proportional ? null : 'shiftKey';
    });
    c.on('object:scaling', (e) => this.onResize(e.target, e.transform, !!(e.e as MouseEvent | undefined)?.shiftKey));
    c.on('object:resizing', (e) => this.onResize(e.target, e.transform, !!(e.e as MouseEvent | undefined)?.shiftKey));
    c.on('mouse:up', () => this.clearGuides());
    c.on('after:render', ({ ctx }) => this.drawOverlay(ctx));

    // Molette : zoom (centré sur le curseur) quand un bouton de la souris est maintenu, ou avec Ctrl.
    stage.addEventListener(
      'wheel',
      (e) => {
        if (!Editor.isZoomWheel(e)) return;
        e.preventDefault();
        // Pavé tactile (pincement) : petits pas ; molette : 10 % par cran.
        const step = Math.abs(e.deltaY) < 40 ? Math.exp(-e.deltaY / 100) : e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.setZoom(this.zoom * step, { x: e.clientX, y: e.clientY });
        // Zoom pendant un déplacement de la vue : on repart de la nouvelle position (pas de saut).
        if (this.pan) Object.assign(this.pan, { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop });
      },
      { passive: false },
    );
    this.setupPan();
    this.setupGroups();
  }

  /** Vrai si la molette doit zoomer (clic maintenu, ou Ctrl / Cmd) ; sinon elle fait défiler. */
  static isZoomWheel(e: WheelEvent): boolean {
    return pointerPressed || e.ctrlKey || e.metaKey;
  }

  /**
   * Déplacement de la vue : glisser sur l'espace vide autour de la page (ou bouton du milieu partout).
   * Un simple clic dans le vide désélectionne.
   */
  private setupPan() {
    const stage = this.stage;
    stage.addEventListener('pointerdown', (e) => {
      const onPage = !!(e.target as Element).closest('.page-wrap');
      if (!(e.button === 1 || (e.button === 0 && !onPage))) return;
      e.preventDefault();
      this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('panning');
    });
    stage.addEventListener('pointermove', (e) => {
      const pan = this.pan;
      if (!pan || e.pointerId !== pan.id) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
      stage.scrollLeft = pan.left - dx;
      stage.scrollTop = pan.top - dy;
    });
    const end = (e: PointerEvent) => {
      const pan = this.pan;
      if (!pan || e.pointerId !== pan.id) return;
      if (!pan.moved && e.button === 0 && this.active()) {
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
      }
      this.pan = null;
      stage.classList.remove('panning');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // Le clic du milieu ne doit pas lancer le défilement automatique du navigateur.
    stage.addEventListener('auxclick', (e) => e.button === 1 && e.preventDefault());
  }

  // ---------------------------------------------------------------- Zoom

  /** Change le zoom ; avec `at` (coordonnées écran), le point sous le curseur reste immobile. */
  setZoom(z: number, at?: { x: number; y: number }) {
    const wrap = this.canvas.wrapperEl;
    const before = at && wrap.getBoundingClientRect();
    const old = this.zoom;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    this.canvas.setDimensions({
      width: Math.round(PAGE.w * this.zoom),
      height: Math.round(PAGE.h * this.zoom),
    });
    this.canvas.setZoom(this.zoom);
    // Redimensionner le canevas l'efface : on redessine tout de suite (sinon une image vide clignote).
    this.canvas.renderAll();
    if (at && before) {
      const after = wrap.getBoundingClientRect();
      const k = this.zoom / old;
      this.stage.scrollLeft += after.left - at.x + (at.x - before.left) * k;
      this.stage.scrollTop += after.top - at.y + (at.y - before.top) * k;
    }
    this.onStateChange();
  }

  zoomToFit() {
    const r = this.stage.getBoundingClientRect();
    const pad = r.width < 600 ? 32 : 64;
    this.setZoom(Math.min((r.width - pad) / PAGE.w, (r.height - pad) / PAGE.h, 1.5));
  }

  // ---------------------------------------------------------------- Objets

  /** Ajoute un objet centré sur la page et le sélectionne. */
  add(obj: FabricObject, center = true) {
    if (center) obj.setPositionByOrigin(new Point(PAGE.w / 2, PAGE.h / 2), 'center', 'center');
    this.canvas.add(obj);
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
  }

  active(): FabricObject | undefined {
    return this.canvas.getActiveObject();
  }

  removeSelection() {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...objs);
    this.normalizeGroups();
    this.canvas.requestRenderAll();
  }

  async copy() {
    const a = this.active();
    if (a) this.clipboard = await a.clone();
  }

  async paste() {
    if (!this.clipboard) return;
    const clone = await this.clipboard.clone();
    this.canvas.discardActiveObject();
    clone.set({ left: clone.left + 12, top: clone.top + 12, evented: true });
    if (clone instanceof ActiveSelection) {
      clone.canvas = this.canvas;
      clone.forEachObject((o) => this.canvas.add(o));
      clone.setCoords();
    } else {
      this.canvas.add(clone);
    }
    // Les éléments collés forment de nouveaux groupes (un élément seul quitte le sien).
    const pasted = clone instanceof ActiveSelection ? clone.getObjects() : [clone];
    const ids = new Map<string, string>();
    for (const o of pasted)
      if (o.groupId) {
        if (!ids.has(o.groupId)) ids.set(o.groupId, newGroupId());
        o.groupId = ids.get(o.groupId);
        if (o.groupName && !o.groupName.endsWith(' copie')) o.groupName = `${o.groupName} copie`.slice(0, 60);
      }
    this.normalizeGroups();
    // Les collages successifs se décalent en cascade.
    this.clipboard.set({ left: this.clipboard.left + 12, top: this.clipboard.top + 12 });
    this.canvas.setActiveObject(clone);
    this.canvas.requestRenderAll();
  }

  async duplicate() {
    const saved = this.clipboard;
    await this.copy();
    await this.paste();
    this.clipboard = saved;
  }

  arrange(action: 'front' | 'forward' | 'backward' | 'back') {
    const c = this.canvas;
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    // Préserve l'ordre relatif des objets d'une sélection multiple.
    const ordered = [...objs].sort((a, b) => c.getObjects().indexOf(a) - c.getObjects().indexOf(b));
    if (action === 'front') ordered.forEach((o) => c.bringObjectToFront(o));
    if (action === 'back') ordered.reverse().forEach((o) => c.sendObjectToBack(o));
    if (action === 'forward') ordered.reverse().forEach((o) => c.bringObjectForward(o));
    if (action === 'backward') ordered.forEach((o) => c.sendObjectBackwards(o));
    c.requestRenderAll();
    this.scheduleCommit(0);
  }

  /** Verrouille ou déverrouille les éléments (par défaut : la sélection, selon l'état du premier). */
  toggleLock(objs: FabricObject[] = this.canvas.getActiveObjects(), locked = !objs[0]?.locked) {
    if (!objs.length) return;
    for (const o of objs) applyLock(o, locked);
    this.syncSelectionLock();
    this.canvas.requestRenderAll();
    this.scheduleCommit(0);
    // Les panneaux se reconstruisent sur la sélection : on leur signale le changement d'état.
    this.canvas.fire('selection:updated', { selected: this.canvas.getActiveObjects(), deselected: [] });
  }

  // ---------------------------------------------------------------- Groupes

  /** Prochaine sélection : un élément précis, sans l'étendre à son groupe. */
  private direct = false;
  private expanding = false;

  groupMembers(id: string): FabricObject[] {
    return this.canvas.getObjects().filter((o) => o.groupId === id);
  }

  /** Identifiant du groupe si la sélection est exactement un groupe complet. */
  selectedGroup(): string | null {
    const objs = this.canvas.getActiveObjects();
    const id = objs[0]?.groupId;
    if (!id || objs.some((o) => o.groupId !== id)) return null;
    return this.groupMembers(id).length === objs.length ? id : null;
  }

  /** Sélectionne des éléments ; `direct` : sans étendre la sélection à leur groupe. */
  select(objs: FabricObject[], direct = false) {
    const c = this.canvas;
    const list = objs.filter((o) => o.visible);
    c.discardActiveObject();
    if (!list.length) return c.requestRenderAll();
    this.direct = direct;
    c.setActiveObject(list.length === 1 ? list[0] : new ActiveSelection(list, { canvas: c }));
    this.direct = false;
    c.requestRenderAll();
  }

  /** Regroupe la sélection (Ctrl+G). */
  group() {
    const objs = this.canvas.getActiveObjects();
    if (objs.length < 2) return;
    const used = new Set(this.canvas.getObjects().map((o) => o.groupName).filter(Boolean));
    let n = 1;
    while (used.has(`Groupe ${n}`)) n++;
    const id = newGroupId();
    for (const o of objs) o.set({ groupId: id, groupName: `Groupe ${n}` });
    this.normalizeGroups();
    this.select(objs);
    this.scheduleCommit(0);
  }

  /** Dissout les groupes de la sélection (Ctrl+Maj+G). */
  ungroup() {
    const objs = this.canvas.getActiveObjects();
    const ids = new Set(objs.map((o) => o.groupId).filter(Boolean));
    if (!ids.size) return;
    for (const o of this.canvas.getObjects()) if (o.groupId && ids.has(o.groupId)) o.set({ groupId: undefined, groupName: undefined });
    this.select(objs);
    this.scheduleCommit(0);
  }

  renameGroup(id: string, name: string) {
    const v = name.trim().slice(0, 60);
    if (!v) return;
    for (const o of this.groupMembers(id)) o.set({ groupName: v });
    this.scheduleCommit(0);
  }

  /** Change l'appartenance d'un élément (sans `id` : le retire de son groupe). */
  setGroup(o: FabricObject, id?: string) {
    const name = id ? this.groupMembers(id)[0]?.groupName : undefined;
    o.set({ groupId: id, groupName: name });
  }

  /**
   * Déplace un bloc d'éléments juste au-dessus (plus en avant) ou en dessous d'un élément de référence,
   * en gardant leur ordre relatif ; les groupes restent ensuite contigus.
   */
  moveBlock(block: FabricObject[], ref: FabricObject, where: 'above' | 'below') {
    if (block.includes(ref)) return;
    const order = this.canvas.getObjects();
    const moving = order.filter((o) => block.includes(o));
    const rest = order.filter((o) => !block.includes(o));
    const i = rest.indexOf(ref);
    if (i < 0) return;
    const at = where === 'above' ? i + 1 : i;
    this.applyOrder([...rest.slice(0, at), ...moving, ...rest.slice(at)]);
    this.normalizeGroups();
    this.canvas.requestRenderAll();
    this.scheduleCommit(0);
  }

  /** Applique un ordre de pile complet (index 0 = arrière-plan). */
  private applyOrder(order: FabricObject[]) {
    order.forEach((o, i) => {
      if (this.canvas.getObjects()[i] !== o) this.canvas.moveObjectTo(o, i);
    });
  }

  /**
   * Les membres d'un groupe restent contigus dans la pile (regroupés sous le plus en avant),
   * et un groupe réduit à un seul élément est dissous.
   */
  normalizeGroups() {
    const objs = this.canvas.getObjects();
    const count = new Map<string, number>();
    for (const o of objs) if (o.groupId) count.set(o.groupId, (count.get(o.groupId) ?? 0) + 1);
    for (const o of objs) if (o.groupId && (count.get(o.groupId) ?? 0) < 2) o.set({ groupId: undefined, groupName: undefined });
    const out: FabricObject[] = [];
    const done = new Set<string>();
    for (let i = objs.length - 1; i >= 0; i--) {
      const g = objs[i].groupId;
      if (!g) out.push(objs[i]);
      else if (!done.has(g)) {
        done.add(g);
        out.push(...objs.filter((o) => o.groupId === g).reverse());
      }
    }
    this.applyOrder(out.reverse());
  }

  /** Une sélection multiple contenant un élément verrouillé ne se déplace pas. */
  private syncSelectionLock() {
    const a = this.active();
    if (!(a instanceof ActiveSelection)) return;
    const locked = a.getObjects().some((o) => o.locked);
    a.set({
      locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
    } as Partial<FabricObject>);
  }

  /**
   * Comportement « à la Figma » : un clic sur un élément groupé sélectionne tout le groupe ;
   * double-clic (ou Ctrl/Cmd + clic) : sélectionne l'élément seul (un texte passe en édition).
   */
  private setupGroups() {
    const c = this.canvas;
    // Avant que Fabric ne prépare le déplacement : la cible devient le groupe entier,
    // ce qui permet de déplacer le groupe dès le premier glisser.
    c.on('mouse:down:before', ({ e }) => {
      const info = (c as unknown as { _targetInfo?: { target?: FabricObject } })._targetInfo;
      const t = info?.target;
      const pe = e as MouseEvent;
      if (!t?.groupId || pe.button !== 0 || pe.shiftKey) return;
      if (pe.ctrlKey || pe.metaKey) {
        this.direct = true;
        return;
      }
      if (t === this.active()) return; // élément déjà sélectionné seul (sélection directe)
      const members = this.groupMembers(t.groupId).filter((o) => o.visible);
      if (members.length > 1) info!.target = new ActiveSelection(members, { canvas: c });
    });
    const expand = () => {
      if (this.expanding) return;
      if (this.direct) {
        this.direct = false;
        return this.syncSelectionLock();
      }
      // Sélection au cadre, Maj + clic, liste des calques : on complète les groupes touchés.
      const objs = c.getActiveObjects();
      const ids = new Set(objs.map((o) => o.groupId).filter(Boolean));
      if (ids.size) {
        const all = c.getObjects().filter((o) => o.visible && (objs.includes(o) || (!!o.groupId && ids.has(o.groupId))));
        if (all.length > objs.length) {
          this.expanding = true;
          c.discardActiveObject();
          c.setActiveObject(new ActiveSelection(all, { canvas: c }));
          this.expanding = false;
        }
      }
      this.syncSelectionLock();
    };
    c.on('selection:created', expand);
    c.on('selection:updated', expand);
    c.on('mouse:dblclick', ({ e }) => {
      const a = this.active();
      if (!(a instanceof ActiveSelection) || !this.selectedGroup()) return;
      const p = c.getScenePoint(e);
      const members = a.getObjects();
      this.select([]);
      const hit = [...members].reverse().find((o) => o.visible && o.containsPoint(p));
      if (!hit) return;
      this.select([hit], true);
      if (isText(hit) && !hit.locked) {
        hit.enterEditing();
        hit.selectAll();
      }
    });
  }

  /** Masque ou affiche un élément (masqué : ni affiché, ni exporté, ni sélectionnable). */
  setVisible(o: FabricObject, visible: boolean) {
    if (!visible && this.canvas.getActiveObjects().includes(o)) this.canvas.discardActiveObject();
    o.set({ visible });
    this.canvas.requestRenderAll();
    this.scheduleCommit(0);
  }

  /** Place un élément à une position précise de la pile (0 = arrière-plan). */
  moveTo(o: FabricObject, index: number) {
    this.canvas.moveObjectTo(o, Math.max(0, Math.min(index, this.canvas.getObjects().length - 1)));
    this.canvas.requestRenderAll();
    this.scheduleCommit(0);
  }

  /** Zone de référence : les colonnes (et rangées) occupées si la grille est affichée, sinon la page. */
  referenceZone(o: FabricObject): Zone {
    const b = o.getBoundingRect();
    if (!this.showColumns) return { x0: 0, y0: 0, x1: PAGE.w, y1: PAGE.h };
    return zoneFor(this.columns, { x0: b.left, y0: b.top, x1: b.left + b.width, y1: b.top + b.height });
  }

  /** Aligne la sélection sur sa colonne (grille affichée) ou sur la page. */
  align(where: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const a = this.active();
    if (!a || a.locked) return;
    const b = a.getBoundingRect();
    const z = this.referenceZone(a);
    let dx = 0;
    let dy = 0;
    if (where === 'left') dx = z.x0 - b.left;
    if (where === 'hcenter') dx = (z.x0 + z.x1) / 2 - (b.left + b.width / 2);
    if (where === 'right') dx = z.x1 - (b.left + b.width);
    if (where === 'top') dy = z.y0 - b.top;
    if (where === 'vcenter') dy = (z.y0 + z.y1) / 2 - (b.top + b.height / 2);
    if (where === 'bottom') dy = z.y1 - (b.top + b.height);
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    this.canvas.requestRenderAll();
    this.canvas.fire('object:modified', { target: a });
  }

  /** Place la sélection dans les colonnes `from` à `to` : position et largeur exactes. */
  placeInColumns(from: number, to: number) {
    const a = this.active();
    const cols = columnRects(this.columns);
    if (!a || a.locked || !cols[from] || !cols[to]) return;
    const x0 = cols[Math.min(from, to)].x;
    const last = cols[Math.max(from, to)];
    const w = last.x + last.w - x0;
    // Textes : largeur du bloc ; images, icônes, cercles : mise à l'échelle proportionnelle ; formes : étirement.
    const proportional = a instanceof FabricImage || a instanceof Path || a instanceof Circle || a instanceof ActiveSelection;
    for (let pass = 0; pass < 2; pass++) {
      const bw = a.getBoundingRect().width;
      if (bw <= 0) break;
      const k = w / bw;
      if (isText(a)) (a as Textbox).set('width', a.width * k);
      else if (proportional) a.scale(a.scaleX * k);
      else a.set('scaleX', a.scaleX * k);
      a.setCoords();
    }
    const b = a.getBoundingRect();
    a.set({ left: a.left + x0 - b.left });
    a.setCoords();
    this.contain(a);
    this.canvas.requestRenderAll();
    this.canvas.fire('object:modified', { target: a });
  }

  /** Garde l'élément dans la zone de contenu (marges) quand la grille le demande. */
  contain(o: FabricObject) {
    if (!this.showColumns || !this.columns.contain) return;
    o.setCoords();
    const z = contentZone(this.columns);
    const b = o.getBoundingRect();
    let dx = 0;
    let dy = 0;
    if (b.width <= z.x1 - z.x0 + 0.5) dx = Math.max(z.x0 - b.left, Math.min(0, z.x1 - (b.left + b.width)));
    if (b.height <= z.y1 - z.y0 + 0.5) dy = Math.max(z.y0 - b.top, Math.min(0, z.y1 - (b.top + b.height)));
    if (!dx && !dy) return;
    o.set({ left: o.left + dx, top: o.top + dy });
    o.setCoords();
  }

  private saveValid(o: FabricObject) {
    this.lastValid.set(o, { left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY, width: o.width });
  }

  /** Redimensionnement : accroche des bords aux repères, puis respect des marges. */
  private onResize(o: FabricObject, transform: { corner: string; originX: unknown; originY: unknown }, shift: boolean) {
    const corner = transform.corner;
    o.setCoords(); // pendant une transformation, les coordonnées ne sont pas encore à jour
    if (this.snapEnabled && !o.angle && ['ml', 'mr', 'mt', 'mb'].includes(corner)) {
      const threshold = SNAP_PX / this.zoom;
      const { xs, ys } = this.snapTargets(o);
      const b = o.getBoundingRect();
      const near = (v: number, list: number[]) => list.reduce<number | null>((best, t) => (Math.abs(t - v) <= threshold && (best === null || Math.abs(t - v) < Math.abs(best - v)) ? t : best), null);
      const text = isText(o);
      const resize = (axis: 'x' | 'y', moving: 'start' | 'end', target: number) => {
        const start = axis === 'x' ? b.left : b.top;
        const size = axis === 'x' ? b.width : b.height;
        const newSize = moving === 'end' ? target - start : start + size - target;
        if (newSize < 4) return;
        if (axis === 'x' && text) o.set('width', o.width * (newSize / size));
        else if (axis === 'x') o.set('scaleX', o.scaleX * (newSize / size));
        else o.set('scaleY', o.scaleY * (newSize / size));
        if (moving === 'start') o.set(axis === 'x' ? 'left' : 'top', (axis === 'x' ? o.left : o.top) + target - start);
      };
      this.guides = { v: [], h: [] };
      if (corner === 'mr') { const t = near(b.left + b.width, xs); if (t !== null) { resize('x', 'end', t); this.guides.v = [t]; } }
      if (corner === 'ml') { const t = near(b.left, xs); if (t !== null) { resize('x', 'start', t); this.guides.v = [t]; } }
      if (corner === 'mb' && !text) { const t = near(b.top + b.height, ys); if (t !== null) { resize('y', 'end', t); this.guides.h = [t]; } }
      if (corner === 'mt' && !text) { const t = near(b.top, ys); if (t !== null) { resize('y', 'start', t); this.guides.h = [t]; } }
      o.setCoords();
    }
    // Poignée latérale + Maj (ou objet à proportions fixes) : l'autre dimension suit.
    const side = ['ml', 'mr', 'mt', 'mb'].includes(corner);
    if (side && !isText(o) && (shift || Editor.keepsProportions(o))) {
      const ox = transform.originX as 'left' | 'center' | 'right';
      const oy = transform.originY as 'top' | 'center' | 'bottom';
      const anchor = o.translateToOriginPoint(o.getCenterPoint(), ox, oy);
      if (corner === 'ml' || corner === 'mr') o.set('scaleY', o.scaleX * this.ratio);
      else o.set('scaleX', o.scaleY / this.ratio);
      o.setPositionByOrigin(anchor, ox, oy);
      o.setCoords();
    }
    if (this.showColumns && this.columns.contain && !this.clampToZone(o, transform, shift)) {
      const prev = this.lastValid.get(o);
      if (prev) {
        o.set(prev as Partial<FabricObject>);
        o.setCoords();
        return;
      }
    }
    this.saveValid(o);
  }

  /** Marges dépassées par l'élément (tolérance d'un demi-point). */
  private outOfZone(o: FabricObject) {
    o.setCoords();
    const z = contentZone(this.columns);
    const b = o.getBoundingRect();
    return {
      z,
      b,
      x: b.left < z.x0 - 0.5 || b.left + b.width > z.x1 + 0.5,
      y: b.top < z.y0 - 0.5 || b.top + b.height > z.y1 + 0.5,
    };
  }

  /**
   * Redimensionnement contenu dans les marges : le bord qui dépasse est ramené sur la marge,
   * sans bloquer l'autre direction (un coin tiré le long d'une marge agrandit toujours dans l'autre sens).
   * Renvoie `false` si l'élément ne peut pas être ramené (rotation, redimensionnement depuis le centre…).
   */
  private clampToZone(o: FabricObject, transform: { originX: unknown; originY: unknown }, shift: boolean): boolean {
    const { z, b, x, y } = this.outOfZone(o);
    if (!x && !y) return true;
    if (o.angle % 360) return false;
    const ox = transform.originX as 'left' | 'center' | 'right';
    const oy = transform.originY as 'top' | 'center' | 'bottom';
    // Facteur de réduction du bord mobile (le bord opposé, ancré, ne bouge pas).
    const factor = (out: boolean, origin: string, start: number, size: number, min: number, max: number, lo: string, hi: string) =>
      !out ? 1 : origin === lo ? (max - start) / size : origin === hi ? (start + size - min) / size : NaN;
    const kx = factor(x, ox, b.left, b.width, z.x0, z.x1, 'left', 'right');
    const ky = factor(y, oy, b.top, b.height, z.y0, z.y1, 'top', 'bottom');
    if (!(kx > 0 && ky > 0)) return false;
    const anchor = o.translateToOriginPoint(o.getCenterPoint(), ox, oy);
    if (isText(o)) {
      if (y) return false; // la hauteur d'un texte dépend de son contenu
      o.set('width', o.width * kx);
      o.initDimensions();
    } else if (shift || Editor.keepsProportions(o)) {
      const k = Math.min(kx, ky);
      o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
    } else {
      o.set({ scaleX: o.scaleX * kx, scaleY: o.scaleY * ky });
    }
    o.setPositionByOrigin(anchor, ox, oy);
    const after = this.outOfZone(o);
    return !after.x && !after.y;
  }

  nudge(dx: number, dy: number) {
    const a = this.active();
    if (!a || a.locked) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    this.contain(a);
    this.canvas.requestRenderAll();
    this.scheduleCommit(300);
    this.onNudge(a);
    this.onStateChange();
  }

  // ---------------------------------------------------------------- Magnétisme

  /** Met à jour les aides visuelles (grille, colonnes, magnétisme). */
  setAids(patch: Partial<Pick<Editor, 'snapEnabled' | 'showGrid' | 'gridSize' | 'showColumns' | 'columns'>>) {
    Object.assign(this, patch);
    this.canvas.requestRenderAll();
    this.onStateChange();
    this.onAidsChange();
  }

  /** Repères d'accroche : page, colonnes et rangées (si affichées), bords des autres éléments. */
  private snapTargets(target: FabricObject) {
    const excluded = new Set<FabricObject>(target instanceof ActiveSelection ? target.getObjects() : []);
    const xs = [0, PAGE.w / 2, PAGE.w];
    const ys = [0, PAGE.h / 2, PAGE.h];
    if (this.showColumns) {
      const t = layoutSnapTargets(this.columns);
      xs.push(...t.xs);
      ys.push(...t.ys);
    }
    for (const o of this.canvas.getObjects()) {
      if (o === target || excluded.has(o) || !o.visible) continue;
      const r = o.getBoundingRect();
      xs.push(r.left, r.left + r.width / 2, r.left + r.width);
      ys.push(r.top, r.top + r.height / 2, r.top + r.height);
    }
    // Grille « contenante » : les repères hors des marges sont ignorés, sinon l'aimant
    // et la contrainte se contredisent et l'élément vibre.
    if (this.showColumns && this.columns.contain) {
      const z = contentZone(this.columns);
      return { xs: xs.filter((x) => x >= z.x0 - 0.5 && x <= z.x1 + 0.5), ys: ys.filter((y) => y >= z.y0 - 0.5 && y <= z.y1 + 0.5) };
    }
    return { xs, ys };
  }

  private snap(target: FabricObject) {
    if (!this.snapEnabled) return;
    const threshold = SNAP_PX / this.zoom;
    const { xs, ys } = this.snapTargets(target);
    const b = target.getBoundingRect();
    const bestDelta = (edges: number[], targets: number[]) => {
      let best: { d: number; at: number } | null = null;
      for (const e of edges)
        for (const t of targets) {
          const d = t - e;
          if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
        }
      return best;
    };
    const sx = bestDelta([b.left, b.left + b.width / 2, b.left + b.width], xs);
    const sy = bestDelta([b.top, b.top + b.height / 2, b.top + b.height], ys);
    if (sx) target.left += sx.d;
    if (sy) target.top += sy.d;
    // Sans repère proche, on s'accroche à la grille.
    if (this.showGrid) {
      const g = this.gridSize;
      if (!sx) target.left += Math.round(b.left / g) * g - b.left;
      if (!sy) target.top += Math.round(b.top / g) * g - b.top;
    }
    this.guides = { v: sx ? [sx.at] : [], h: sy ? [sy.at] : [] };
    target.setCoords();
  }

  private clearGuides() {
    if (!this.guides.v.length && !this.guides.h.length) return;
    this.guides = { v: [], h: [] };
    this.canvas.requestRenderAll();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D) {
    const { v, h } = this.guides;
    if (!v.length && !h.length && !this.showGrid && !this.showColumns) return;
    const r = this.canvas.getRetinaScaling();
    const z = this.zoom;
    const W = PAGE.w * z;
    const H = PAGE.h * z;
    const px = (n: number) => Math.round(n * z) + 0.5;
    ctx.save();
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.lineWidth = 1;
    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(47,111,237,0.12)';
      ctx.beginPath();
      for (let x = this.gridSize; x < PAGE.w; x += this.gridSize) {
        ctx.moveTo(px(x), 0);
        ctx.lineTo(px(x), H);
      }
      for (let y = this.gridSize; y < PAGE.h; y += this.gridSize) {
        ctx.moveTo(0, px(y));
        ctx.lineTo(W, px(y));
      }
      ctx.stroke();
    }
    if (this.showColumns) {
      const m = this.columns.margin;
      ctx.fillStyle = 'rgba(232,49,138,0.06)';
      ctx.strokeStyle = 'rgba(232,49,138,0.55)';
      ctx.setLineDash([3, 3]);
      const rows = rowRects(this.columns);
      const bands = rows.length ? rows : [{ y: m, h: PAGE.h - 2 * m }];
      for (const c of columnRects(this.columns))
        for (const r of bands) {
          ctx.fillRect(c.x * z, r.y * z, c.w * z, r.h * z);
          ctx.strokeRect(px(c.x), px(r.y), Math.round(c.w * z), Math.round(r.h * z));
        }
    }
    if (v.length || h.length) {
      ctx.strokeStyle = '#e8318a';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (const x of v) {
        ctx.moveTo(px(x), 0);
        ctx.lineTo(px(x), H);
      }
      for (const y of h) {
        ctx.moveTo(0, px(y));
        ctx.lineTo(W, px(y));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- Historique

  /** Enregistre l'état courant dans l'historique (regroupe les modifications rapprochées). */
  scheduleCommit(delay = 250) {
    if (this.restoring) return;
    clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit(), delay);
  }

  private commit() {
    if (this.restoring) return;
    const snap = this.snapshot();
    if (snap === this.history[this.historyIndex]) return;
    this.history.splice(this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.historyIndex = this.history.length - 1;
    if (this.history.length > 1) this.dirty = true;
    this.pruneImages();
    this.onStateChange();
  }

  private snapshot(): string {
    const json = this.toJSON();
    for (const o of json.objects) {
      if (typeof o.src === 'string' && o.src.startsWith('data:')) o.src = this.imageKey(o.src);
    }
    // La fiche suit la page dans l'historique ; sa photo est stockée une seule fois (clé).
    const fill = this.fill ? structuredClone(this.fill) as { data?: { photo?: string } } : null;
    const photo = fill?.data?.photo;
    if (photo?.startsWith('data:')) fill!.data!.photo = this.imageKey(photo);
    return JSON.stringify({ ...json, fill });
  }

  private imageKey(src: string): string {
    let key = this.imageKeys.get(src);
    if (!key) {
      key = `img:${this.imageKeys.size}:${Date.now().toString(36)}`;
      this.imageKeys.set(src, key);
      this.imageData.set(key, src);
    }
    return key;
  }

  /** Libère les images qui ne sont plus référencées par aucun instantané. */
  private pruneImages() {
    if (this.imageData.size < 8) return;
    const all = this.history.join('');
    for (const [key, data] of this.imageData) {
      if (!all.includes(`"${key}"`)) {
        this.imageData.delete(key);
        this.imageKeys.delete(data);
      }
    }
  }

  canUndo() {
    return this.historyIndex > 0;
  }
  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }
  async undo() {
    if (!this.canUndo()) return;
    this.historyIndex--;
    await this.restore(this.history[this.historyIndex]);
  }
  async redo() {
    if (!this.canRedo()) return;
    this.historyIndex++;
    await this.restore(this.history[this.historyIndex]);
  }

  private async restore(snap: string) {
    const { fill, ...json } = JSON.parse(snap) as CanvasJSON & { fill?: { data?: { photo?: string } } | null };
    for (const o of json.objects) {
      if (typeof o.src === 'string' && o.src.startsWith('img:')) o.src = this.imageData.get(o.src) ?? '';
    }
    const photo = fill?.data?.photo;
    if (photo?.startsWith('img:')) fill!.data!.photo = this.imageData.get(photo);
    this.fill = fill ?? null;
    await this.load(json, false);
    this.dirty = true;
    this.onStateChange();
    this.onRestore();
  }

  // ---------------------------------------------------------------- Chargement / sérialisation

  toJSON(): CanvasJSON {
    return this.canvas.toObject() as CanvasJSON;
  }

  /** Remplace tout le contenu de la page. `resetHistory` démarre un nouvel historique. */
  async load(json: CanvasJSON, resetHistory = true) {
    this.restoring = true;
    clearTimeout(this.commitTimer);
    try {
      this.canvas.discardActiveObject();
      await this.canvas.loadFromJSON(json);
      for (const o of this.canvas.getObjects()) applyLock(o, !!o.locked);
      this.canvas.requestRenderAll();
    } finally {
      this.restoring = false;
    }
    if (resetHistory) {
      this.history = [];
      this.historyIndex = -1;
      this.imageKeys.clear();
      this.imageData.clear();
      this.commit();
      this.dirty = false;
    }
    this.onStateChange();
  }

  /** Quitte l'édition de texte et désélectionne (avant export ou sauvegarde). */
  settle() {
    const a = this.active() as (FabricObject & { isEditing?: boolean; exitEditing?: () => void }) | undefined;
    if (a?.isEditing) a.exitEditing?.();
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- Clavier

  handleKey(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
    const a = this.active() as (FabricObject & { isEditing?: boolean }) | undefined;
    if (a?.isEditing) return false;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const step = e.shiftKey ? 10 : 1;
    if (mod && k === 'z' && !e.shiftKey) void this.undo();
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) void this.redo();
    else if (mod && k === 'c') void this.copy();
    else if (mod && k === 'v') void this.paste();
    else if (mod && k === 'd') void this.duplicate();
    else if (mod && k === 'a') this.selectAll();
    else if (mod && e.shiftKey && k === 'l') this.toggleLock();
    else if (mod && k === 'g') e.shiftKey ? this.ungroup() : this.group();
    else if (k === 'delete' || k === 'backspace') this.removeSelection();
    else if (k === 'escape') this.settle();
    else if (k === 'g' && !mod) this.setAids({ showGrid: !this.showGrid });
    else if (k === 'm' && !mod) this.setAids({ snapEnabled: !this.snapEnabled });
    else if (e.key === '?') this.onHelp();
    else if (k === 'arrowleft') this.nudge(-step, 0);
    else if (k === 'arrowright') this.nudge(step, 0);
    else if (k === 'arrowup') this.nudge(0, -step);
    else if (k === 'arrowdown') this.nudge(0, step);
    else return false;
    return true;
  }

  selectAll() {
    const objs = this.canvas.getObjects().filter((o) => o.selectable && o.visible);
    if (!objs.length) return;
    this.canvas.discardActiveObject();
    this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
  }
}

