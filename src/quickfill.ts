// Remplissage rapide : la page est générée à partir d'une fiche (Persona) éditée dans un formulaire.
// - chaque modification du formulaire régénère la page (les éléments ajoutés à la main sont conservés) ;
// - modifier un texte sur la page met la fiche à jour (le texte connaît son champ) ;
// - « Détacher » arrête le lien pour finir le design librement.
// L'état fait partie de l'historique (annuler / rétablir) et du projet enregistré.
import { FabricImage, type FabricObject, type Textbox } from 'fabric';
import { META_KEYS, type DocMeta, type Editor, type MetaKey } from './editor';
import { isText } from './shapes';
import { clonePersona, filled, type Persona } from './templates/content';
import { decodeField } from './templates/fields';
import { buildFit, PALETTES, TEMPLATES, type Overflow, type TemplateDef } from './templates';

export interface FillState {
  template: string;
  palette: string;
  data: Persona;
  /** Lié : le formulaire pilote la page. */
  linked: boolean;
  /** La fiche a été modifiée (sinon, changer de modèle reprend ses données d'exemple). */
  touched: boolean;
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
    return TEMPLATES.find((t) => t.id === this.state?.template);
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

  /** Régénère la page depuis la fiche. `fresh` : nouveau document (nouvel historique). */
  async render(fresh: boolean) {
    // Une seule régénération à la fois : la suivante repart de l'état le plus récent.
    while (this.running) await this.running;
    const s = this.state;
    const def = this.def;
    if (!s || !def || (!s.linked && !fresh)) return;
    clearTimeout(this.timer);
    this.running = (async () => {
      // Texte en cours d'édition : on le valide d'abord (la fiche le reprend).
      const a = this.ed.active() as (FabricObject & { isEditing?: boolean; exitEditing?: () => void }) | undefined;
      if (a?.isEditing) a.exitEditing?.();
      this.applyMeta();
      const palette = PALETTES.find((p) => p.id === s.palette) ?? PALETTES[0];
      const built = await buildFit(def, palette, s.data);
      this.overflow = built.overflow;
      this.density = built.density;
      this.retouched = false;
      // Les éléments ajoutés à la main (hors modèle) sont conservés, au premier plan.
      const extras = fresh ? [] : this.ed.canvas.getObjects().filter((o) => !o.tpl).map((o) => o.toObject() as Record<string, unknown>);
      const json = { background: built.background, objects: [...built.objects, ...extras] };
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
    return autoMeta(s.data, def.kind);
  }

  /** Remplit les propriétés que l'utilisateur n'a pas modifiées à la main. */
  private applyMeta() {
    const auto = this.autoMeta();
    if (!auto) return;
    const meta = this.ed.meta;
    meta.kind = this.def!.kind;
    for (const k of META_KEYS) if (!meta.manual?.[k]) meta[k] = auto[k];
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
