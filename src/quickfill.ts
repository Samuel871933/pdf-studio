// Remplissage rapide : la page est générée à partir d'une fiche (Persona) éditée dans un formulaire.
// - chaque modification du formulaire régénère la page (les éléments ajoutés à la main sont conservés) ;
// - modifier un texte sur la page met la fiche à jour (le texte connaît son champ) ;
// - « Détacher » arrête le lien pour finir le design librement.
// L'état fait partie de l'historique (annuler / rétablir) et du projet enregistré.
import { FabricImage, type Canvas, type FabricObject, type Textbox } from 'fabric';
import { META_KEYS, type CanvasJSON, type DocMeta, type Editor, type MetaKey } from './editor';
import { capture, retouch, stamp, type Retouches } from './retouch';
import { isText } from './shapes';
import { clonePersona, CONTENT_KEYS, filled, visiblePersona, type ContentKey, type Persona } from './templates/content';
import { decodeField } from './templates/fields';
import { ALL_TEMPLATES, buildFit, PALETTES, type Built, type Overflow, type TemplateDef } from './templates';

export interface FillState {
  template: string;
  palette: string;
  data: Persona;
  /** Lié : le formulaire pilote la page. */
  linked: boolean;
  /** La fiche a été modifiée (sinon, changer de modèle reprend ses données d'exemple). */
  touched: boolean;
  /** Retouches des éléments du modèle, réappliquées à chaque régénération (même modèle). */
  retouches?: Retouches;
  /** Clés des éléments générés la dernière fois : un absent de la page a été supprimé. */
  keys?: string[];
}

/** Textes qui affichent plusieurs sections à la fois (leur codec relit chacune). */
const CODEC_KEYS: Record<string, ContentKey[]> = {
  skillsBlock: ['skills', 'tools', 'languages'],
  skillsTools: ['skills', 'tools'],
  langInterests: ['languages', 'interests'],
};

const isContentKey = (k: unknown): k is ContentKey => (CONTENT_KEYS as unknown[]).includes(k);

/** Section(s) de la fiche affichée(s) par une sélection de la page. */
export interface PageSection {
  name: string;
  /** Sections standards (une section regroupe parfois plusieurs parties : « Compétences » avec outils et langues). */
  keys: ContentKey[];
  /** Identifiant d'une section ajoutée. */
  custom?: string;
}

/**
 * Éléments ajoutés hors modèle, conservés quand la page se régénère : ceux placés sous tous les
 * éléments du modèle restent en arrière-plan (formes de fond), les autres au premier plan.
 */
export function compose(canvas: Canvas, built: CanvasJSON) {
  const objs = canvas.getObjects();
  const first = objs.findIndex((o) => o.tpl);
  const json = (o: FabricObject) => o.toObject() as Record<string, unknown>;
  const below = objs.filter((o, i) => !o.tpl && first >= 0 && i < first).map(json);
  const above = objs.filter((o, i) => !o.tpl && (first < 0 || i > first)).map(json);
  return { background: built.background, objects: [...below, ...built.objects, ...above] };
}

/**
 * Page régénérée : éléments du modèle marqués, retouches de la page affichée relevées puis
 * réappliquées (seulement si le modèle ne change pas), éléments ajoutés à leur plan.
 */
export function composePage(canvas: Canvas, built: CanvasJSON, state: FillState | null, template = state?.template, reset = false) {
  const objects = structuredClone(built.objects) as Record<string, unknown>[];
  const keys = stamp(objects);
  const kept = !!state && !reset && template === state.template;
  const retouches = kept ? capture(canvas.getObjects() as unknown as Record<string, unknown>[], state.retouches ?? {}, state.keys ?? []) : {};
  return { page: compose(canvas, { background: built.background, objects: retouch(objects, retouches) }), retouches, keys };
}

/** Enregistre retouches et clés dans la fiche (sans entrée vide). */
function remember(s: FillState, { retouches, keys }: { retouches: Retouches; keys: string[] }) {
  if (Object.keys(retouches).length) s.retouches = retouches;
  else delete s.retouches;
  s.keys = keys;
}

export class QuickFill {
  overflow: Overflow[] = [];
  density = 1;
  /** Retouches de mise en page faites à la main depuis la dernière régénération. */
  retouched = false;
  /** Appelé quand la fiche change hors du formulaire (texte modifié sur la page, annuler…). */
  onExternalChange: () => void = () => {};
  /** Appelé après chaque régénération (débordement, retouches). */
  onStatus: () => void = () => {};

  private timer = 0;
  private regenerating = false;
  private running: Promise<void> | null = null;

  constructor(private ed: Editor) {
    const c = ed.canvas;
    // Texte modifié sur la page : la fiche suit, puis la page se recompose.
    c.on('text:editing:exited', ({ target }) => this.fromCanvas(target));
    c.on('object:modified', ({ target }) => {
      if (this.regenerating || !this.state?.linked || !target) return;
      if (target instanceof FabricImage && target.field === 'photo') {
        // Photo remplacée sur la page : elle devient celle de la fiche.
        const src = target.getSrc();
        if (src.startsWith('data:') && src !== this.state.data.photo) {
          this.state.data.photo = src;
          this.state.touched = true;
          this.onExternalChange();
        }
        return;
      }
      if (target.tpl || target.type === 'activeselection') {
        this.retouched = true;
        this.onStatus();
      }
    });
  }

  get state(): FillState | null {
    return (this.ed.fill as FillState | null) ?? null;
  }

  get def(): TemplateDef | undefined {
    return ALL_TEMPLATES.find((t) => t.id === this.state?.template);
  }

  /** Charge un modèle : avec la fiche en cours si elle a été remplie, sinon ses données d'exemple. */
  async start(def: TemplateDef, paletteId: string) {
    const prev = this.state;
    const data = prev?.touched ? prev.data : clonePersona(def.sample);
    this.ed.fill = { template: def.id, palette: paletteId, data, linked: true, touched: !!prev?.touched } satisfies FillState;
    await this.render(true);
  }

  /** Document sans modèle (page vierge, projet sans fiche). */
  clear() {
    clearTimeout(this.timer);
    this.timer = 0;
    this.ed.fill = null;
    this.overflow = [];
    this.retouched = false;
    this.onStatus();
  }

  /** Modification depuis le formulaire. */
  update(mutate: (d: Persona) => void, delay = 280) {
    const s = this.state;
    if (!s?.linked) return;
    mutate(s.data);
    s.touched = true;
    this.schedule(delay);
  }

  schedule(delay = 280) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.render(false), delay);
  }

  /** Termine les mises à jour en attente avant de capturer une révision pour l'IA. */
  async flush() {
    while (this.running) await this.running;
    if (this.timer) await this.render(false);
  }

  /** Applique un aperçu déjà composé, sans réinitialiser l'historique. */
  async applyProposal(next: FillState, built: Built & { density: number }) {
    const overflow = this.overflow;
    const density = this.density;
    const retouched = this.retouched;
    clearTimeout(this.timer);
    this.timer = 0;
    const composed = composePage(this.ed.canvas, built, this.state, next.template);
    const fill = structuredClone(next);
    remember(fill, composed);
    this.regenerating = true;
    try {
      await this.ed.transaction(async () => {
        this.ed.fill = fill;
        this.applyMeta();
        await this.ed.load(composed.page, false);
      });
      this.overflow = built.overflow;
      this.density = built.density;
      this.retouched = !!fill.retouches;
      this.onExternalChange();
    } catch (error) {
      this.overflow = overflow;
      this.density = density;
      this.retouched = retouched;
      throw error;
    } finally {
      this.regenerating = false;
      this.onStatus();
    }
  }

  /**
   * Section du modèle sélectionnée en entier sur la page (son groupe de calques), page liée au formulaire.
   * `null` pour un élément seul, un élément ajouté à la main ou une page détachée.
   */
  sectionOf(objs: FabricObject[], wholeGroup: boolean): PageSection | null {
    if (!this.state?.linked || !wholeGroup || !objs.length) return null;
    const key = objs[0].sectionKey;
    if (!key || objs.some((o) => !o.tpl || o.sectionKey !== key)) return null;
    const name = objs[0].groupName ?? 'Section';
    if (key.startsWith('c:')) return { name, keys: [], custom: key.slice(2) };
    if (!isContentKey(key)) return null;
    const keys = new Set<ContentKey>([key]);
    for (const o of objs) {
      const head = o.field?.split('.')[0];
      if (isContentKey(head)) keys.add(head);
      for (const k of CODEC_KEYS[o.codec ?? ''] ?? []) keys.add(k);
    }
    return { name, keys: [...keys] };
  }

  /** Masque des sections : absentes de la page, contenu conservé. */
  hideSections(sec: PageSection) {
    if (sec.custom) return;
    this.update((d) => (d.hidden = [...new Set([...(d.hidden ?? []), ...sec.keys])]), 0);
    this.onExternalChange();
  }

  /** Supprime une section : son contenu est vidé (section ajoutée : retirée de la fiche). */
  removeSection(sec: PageSection) {
    this.update((d) => {
      if (sec.custom) d.custom = d.custom?.filter((c) => c.id !== sec.custom);
      else for (const k of sec.keys) clearSection(d, k);
    }, 0);
    this.onExternalChange();
  }

  /** Arrête le lien : la page reste telle quelle et se modifie librement. */
  detach() {
    const s = this.state;
    if (!s) return;
    clearTimeout(this.timer);
    s.linked = false;
    this.ed.scheduleCommit(0);
    this.onStatus();
  }

  /** Relie de nouveau : la page est régénérée depuis la fiche (retouches remplacées). */
  async relink() {
    const s = this.state;
    if (!s) return;
    s.linked = true;
    await this.render(false);
  }

  /** Régénère la page depuis la fiche. `fresh` : nouveau document (nouvel historique). `reset` : retire les retouches. */
  async render(fresh: boolean, reset = false) {
    // Une seule régénération à la fois : la suivante repart de l'état le plus récent.
    while (this.running) await this.running;
    const s = this.state;
    const def = this.def;
    if (!s || !def || (!s.linked && !fresh)) return;
    clearTimeout(this.timer);
    this.timer = 0;
    this.running = (async () => {
      // Texte en cours d'édition : on le valide d'abord (la fiche le reprend).
      const a = this.ed.active() as (FabricObject & { isEditing?: boolean; exitEditing?: () => void }) | undefined;
      if (a?.isEditing) a.exitEditing?.();
      this.applyMeta();
      const palette = PALETTES.find((p) => p.id === s.palette) ?? PALETTES[0];
      const built = await buildFit(def, palette, s.data);
      this.overflow = built.overflow;
      this.density = built.density;
      // Les éléments ajoutés à la main (hors modèle) sont conservés, à leur plan ; les retouches du modèle aussi.
      const composed = composePage(this.ed.canvas, built, fresh ? null : s, s.template, reset);
      remember(s, composed);
      this.retouched = !!s.retouches;
      const json = fresh ? { background: built.background, objects: composed.page.objects.filter((o) => o.tpl) } : composed.page;
      this.regenerating = true;
      try {
        await this.ed.load(json, fresh);
      } finally {
        this.regenerating = false;
      }
      if (!fresh) this.ed.scheduleCommit(0);
      this.onStatus();
    })();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  /**
   * Propriétés du PDF déduites de la fiche (titre, auteur, résumé, mots-clés).
   * `null` hors remplissage rapide.
   */
  autoMeta(): Record<MetaKey, string> | null {
    const s = this.state;
    const def = this.def;
    if (!s || !def) return null;
    return autoMeta(visiblePersona(s.data), def.kind);
  }

  /** Remplit les propriétés que l'utilisateur n'a pas modifiées à la main. */
  private applyMeta() {
    const auto = this.autoMeta();
    if (!auto) return;
    const meta = this.ed.meta;
    meta.kind = this.def!.kind;
    for (const k of META_KEYS) if (!meta.manual?.[k]) meta[k] = auto[k];
  }

  /** Rend aux éléments du modèle leur aspect d'origine (les éléments ajoutés restent). */
  async resetRetouches() {
    if (this.state?.linked) await this.render(false, true);
  }

  /** Change de palette en gardant la fiche. */
  async setPalette(id: string) {
    const s = this.state;
    if (!s) return;
    s.palette = id;
    if (s.linked) await this.render(false);
  }

  private fromCanvas(target: FabricObject | undefined) {
    const s = this.state;
    if (!s?.linked || this.regenerating || !target || !isText(target) || !target.field) return;
    const before = JSON.stringify(s.data);
    decodeField((target as Textbox).text, s.data, target.field, target.codec);
    if (JSON.stringify(s.data) === before) return;
    s.touched = true;
    this.onExternalChange();
    // Après la sortie d'édition de Fabric : la page se recompose (textes plus longs, nouvelles lignes…).
    this.schedule(0);
  }
}

/** Vide une section standard (et la réaffiche : vide, elle n'apparaît plus sur la page). */
export function clearSection(d: Persona, k: ContentKey) {
  if (k === 'profile') d.profile = '';
  else d[k] = [];
  d.hidden = d.hidden?.filter((x) => x !== k);
  if (!d.hidden?.length) delete d.hidden;
}

/** Texte raccourci au mot près (résumé, titre). */
const clip = (t: string, max: number) => {
  const v = t.replace(/\s+/g, ' ').trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.–-]+$/, '')}…`;
};

/**
 * Propriétés du PDF déduites de la fiche : lues par les logiciels de recrutement et les moteurs d'indexation.
 * Titre « CV – Nom – Poste », auteur = nom, résumé = profil (ou objet de la lettre), mots-clés = poste,
 * compétences, outils, langues et intitulés des postes occupés.
 */
export function autoMeta(p: Persona, kind: DocMeta['kind']): Record<MetaKey, string> {
  const name = p.name.trim();
  const job = p.title.trim();
  if (kind === 'letter') {
    const subject = p.letter.subject.trim();
    return {
      title: clip(['Lettre de motivation', name].filter(Boolean).join(' – '), 160),
      author: name,
      subject: clip(subject ? `Objet : ${subject.charAt(0).toUpperCase()}${subject.slice(1)}` : '', 300),
      keywords: clip(unique([job, subject.replace(/^candidature\s+(au|à|pour)\s+(un\s+|le\s+)?poste\s+(de\s+|d’|d')?/i, '')]).join(', '), 400),
    };
  }
  const summary = p.profile.trim() || [job, p.experience[0] && `${p.experience[0].title} (${p.experience[0].org})`].filter(Boolean).join(' — ');
  return {
    title: clip(['CV', name, job].filter(Boolean).join(' – '), 160),
    author: name,
    subject: clip(summary, 300),
    keywords: clip(unique([
      job,
      ...filled(p.skills.map((s) => s.name.replace(/\s*\(.*\)$/, ''))),
      ...filled(p.tools),
      ...p.languages.filter((l) => l.name.trim()).map((l) => l.name),
      ...filled(p.experience.map((e) => e.title.split(/\s+[—–-]\s+/)[0])),
    ]).slice(0, 25).join(', '), 400),
  };
}

/** Sans doublons (casse et accents ignorés), dans l'ordre d'apparition. */
function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.map((v) => v.trim()).filter((v) => {
    const k = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!v || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
