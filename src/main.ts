import './style.css';
import { FabricImage, Path, type FabricObject } from 'fabric';
import { Editor, PAGE, emptyMeta, type CanvasJSON } from './editor';
import { loadFonts } from './fonts';
import { sanitizeImage } from './images';
import { Panel } from './panel';
import { draftEnabled, readDraft, saveDraft, type DraftResult } from './draft';
import { openPrivacy } from './ui/privacy';
import { download, projectText, readProject, serializeProject, slug } from './project';
import * as S from './shapes';
import { ALL_TEMPLATES, BLANK_TEMPLATE, DEFAULT_TEMPLATE, PALETTES, type Palette } from './templates';
import { setupBottomBar, showShortcuts } from './ui/bottombar';
import { openGallery } from './ui/gallery';
import { openIconPicker, type IconPick } from './ui/icon-picker';
import { setupLayers } from './ui/layers';
import { setupContentForm, type FormTarget } from './ui/content-form';
import { setupSidePanel } from './ui/sidepanel';
import { setupPanelResize } from './ui/resize';
import { QuickFill, type FillState } from './quickfill';
import { setupAiChat } from './ui/ai-chat';
import { setupChatWidget } from './ui/chat-widget';
import { setupQuickBar } from './ui/quickbar';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ Notifications

const toastEl = $('toast');
let toastTimer = 0;
function toast(msg: string, error = false) {
  toastEl.textContent = msg;
  toastEl.className = `show${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.className = ''), error ? 5000 : 2600);
}
const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Une erreur est survenue.', true);

// ------------------------------------------------------------------ Éditeur

const stage = $('stage');
const ed = new Editor($<HTMLCanvasElement>('page'), stage);
const panel = new Panel($('panel'), ed, {
  autoMeta: () => (qf.state?.linked ? qf.autoMeta() : null),
  addImage: () => pickImage(),
  replaceImage: (img) => pickImage(img),
  fillShape: (shape) => pickImage(shape),
  replaceIcon: (icon) => pickIcon(icon),
  linked: () => {
    const t = formTarget();
    const label = t && form.labelFor(t);
    if (!t || !label) return null;
    return {
      label,
      section: !!t.section,
      open: () => {
        side.show('content');
        form.reveal(t, true);
      },
    };
  },
});
const bottomBar = setupBottomBar(ed);
const qf = new QuickFill(ed);
// Panneau de gauche : Contenu (remplissage rapide) et Calques.
const side = setupSidePanel($('layers'), [
  { id: 'content', label: 'Contenu', icon: 'text', button: $<HTMLButtonElement>('btn-content'), onShow: () => form.render() },
  { id: 'layers', label: 'Calques', icon: 'layers', button: $<HTMLButtonElement>('btn-layers'), onShow: () => layers.refresh() },
], 'content');
const layers = setupLayers(ed, side.pane('layers'), side.badge('layers'), () => side.isShown('layers'));
const form = setupContentForm(side.pane('content'), qf, { chooseTemplate: () => chooseTemplate() });
const chat = setupChatWidget($<HTMLButtonElement>('btn-assistant'));
setupAiChat(chat.root, ed, qf, (id) => {
  palette = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  form.render();
  panel.render();
}, chat.close);
ed.onRestore = () => form.render();
side.start();
/** Section du modèle sélectionnée en entier sur la page (groupe), page liée au formulaire. */
const pageSection = () => qf.sectionOf(ed.canvas.getActiveObjects(), !!ed.selectedGroup());

/** Champ (texte seul) ou section (groupe entier) de la fiche affiché par la sélection. */
function formTarget(): FormTarget | null {
  if (!qf.state?.linked) return null;
  const objs = ed.canvas.getActiveObjects();
  if (objs.length === 1 && objs[0].tpl && objs[0].field) return { field: objs[0].field };
  const sec = pageSection();
  if (sec) return { section: sec.custom ? `c:${sec.custom}` : objs[0].sectionKey };
  // Groupe sans section de la fiche (en-tête : nom, intitulé, coordonnées) : son premier champ.
  const field = ed.selectedGroup() ? objs.find((o) => o.tpl && o.field)?.field : undefined;
  return field ? { field } : null;
}

// Sélection sur la page : l'onglet Contenu ouvert suit, sur le champ correspondant (sans prendre le focus).
for (const ev of ['selection:created', 'selection:updated'] as const)
  ed.canvas.on(ev, () => {
    const t = formTarget();
    if (t && side.isShown('content')) form.reveal(t);
  });
const quickBar = setupQuickBar(ed, stage, {
  section: pageSection,
  hideSection: (sec) => {
    qf.hideSections(sec);
    toast(`« ${sec.name} » masquée : son contenu est conservé (onglet Contenu, bouton œil).`);
  },
});
// Supprimer une section du modèle sur la page : elle est retirée de la fiche (sinon elle reviendrait au rendu suivant).
ed.onRemove = () => {
  const sec = pageSection();
  if (!sec) return false;
  ed.canvas.discardActiveObject();
  qf.removeSection(sec);
  toast(`« ${sec.name} » supprimée. Ctrl+Z pour annuler.`);
  return true;
};
ed.onHelp = showShortcuts;
ed.onAidsChange = () => panel.render();
let autoFit = true;
let palette: Palette = PALETTES[0];

/** Brouillon automatique : résultat du dernier enregistrement (`off` tant que rien n'est enregistré). */
let draft: DraftResult = 'off';
/** Pas d'enregistrement avant la fin du démarrage (sinon le modèle par défaut écraserait le brouillon). */
let draftReady = false;
let draftTimer = 0;

const undoBtn = $<HTMLButtonElement>('btn-undo');
const redoBtn = $<HTMLButtonElement>('btn-redo');
const zoomLabel = $('zoom-fit');
ed.onStateChange = () => {
  undoBtn.disabled = !ed.canUndo();
  redoBtn.disabled = !ed.canRedo();
  zoomLabel.textContent = `${Math.round(ed.zoom * 100)} %`;
  panel.refresh();
  bottomBar.update();
  layers.refresh();
  quickBar.update();
  scheduleDraft();
};

const c = ed.canvas;
for (const ev of ['selection:created', 'selection:updated', 'selection:cleared'] as const) c.on(ev, () => panel.render());
for (const ev of ['object:moving', 'object:scaling', 'object:rotating', 'object:resizing', 'object:modified', 'text:selection:changed', 'text:editing:exited'] as const)
  c.on(ev, () => panel.refresh());
// Après annuler/rétablir ou ouverture, l'objet sélectionné n'existe plus : on reconstruit le panneau.
let rerender = false;
c.on('object:removed', () => {
  if (rerender) return;
  rerender = true;
  queueMicrotask(() => {
    rerender = false;
    panel.render();
  });
});
c.on('mouse:dblclick', ({ target }) => {
  if (target instanceof FabricImage && !target.locked) pickImage(target);
  else if (target instanceof Path && !target.locked) pickIcon(target);
});

// ------------------------------------------------------------------ Images

const imageInput = $<HTMLInputElement>('file-image');
/** Image à remplacer, ou forme à remplir avec la nouvelle image. */
let replaceTarget: FabricObject | null = null;

function pickImage(target: FabricObject | null = null) {
  replaceTarget = target;
  imageInput.value = '';
  imageInput.click();
}

async function insertImage(file: File) {
  const clean = await sanitizeImage(file);
  const target = replaceTarget;
  replaceTarget = null;
  if (target && !(target instanceof FabricImage) && c.getObjects().includes(target)) {
    // Forme remplie : l'image prend sa place (position, rotation, plan) et est découpée à sa forme.
    const clip = S.shapeClip(target);
    if (!clip) return;
    const img = await FabricImage.fromURL(clean.url);
    img.clipPath = clip;
    S.fillFrame(img, clip.width * target.scaleX, clip.height * target.scaleY);
    img.set({ angle: target.angle, opacity: target.opacity });
    img.setPositionByOrigin(target.getCenterPoint(), 'center', 'center');
    const index = c.getObjects().indexOf(target);
    c.remove(target);
    c.insertAt(index, img);
    c.setActiveObject(img);
    c.requestRenderAll();
    return;
  }
  if (target instanceof FabricImage && c.getObjects().includes(target)) {
    // Remplacement : l'encart garde sa taille, la nouvelle image le remplit (recadrée au centre).
    const frameW = target.getScaledWidth();
    const frameH = target.getScaledHeight();
    target.set({ cropX: 0, cropY: 0 });
    await target.setSrc(clean.url);
    S.fillFrame(target, frameW, frameH);
    c.requestRenderAll();
    c.fire('object:modified', { target });
    panel.render();
    return;
  }
  const img = await FabricImage.fromURL(clean.url);
  const max = Math.min(PAGE.w * 0.5, clean.width);
  if (img.width > max) img.scaleToWidth(max);
  ed.add(img);
}

imageInput.addEventListener('change', () => {
  const f = imageInput.files?.[0];
  if (f) insertImage(f).catch(fail);
});

stage.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
stage.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files[0];
  if (!f) return;
  e.preventDefault();
  if (f.type.startsWith('image/')) insertImage(f).catch(fail);
  else if (f.name.endsWith('.json')) openProject(f).catch(fail);
});
window.addEventListener('paste', (e) => {
  const t = e.target as HTMLElement;
  if (/^(INPUT|TEXTAREA)$/.test(t.tagName) || dialogOpen()) return;
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f) {
    e.preventDefault();
    insertImage(f).catch(fail);
  }
});

// ------------------------------------------------------------------ Icônes

let iconColor = S.INK;

function iconObject(pick: IconPick): Path {
  const imp = pick.imported;
  const p = new Path(pick.d, {
    fill: imp ? (imp.fill === null ? null : pick.color) : pick.color,
    stroke: imp?.stroke ? pick.color : null,
    strokeWidth: imp?.strokeWidth ?? 0,
    strokeLineCap: imp?.lineCap ?? 'butt',
    strokeLineJoin: imp?.lineJoin ?? 'miter',
  });
  if (imp?.warnings.length) toast(imp.warnings.join(' '));
  return p;
}

/** Ouvre la bibliothèque : ajoute une icône, ou remplace `target` en gardant taille et position. */
function pickIcon(target: Path | null = null) {
  const color = target && typeof target.fill === 'string' ? target.fill : iconColor;
  void openIconPicker({
    color,
    title: target ? 'Changer d’icône' : 'Bibliothèque d’icônes',
    onError: fail,
    onPick(pick) {
      iconColor = pick.color;
      const icon = iconObject(pick);
      if (target && c.getObjects().includes(target)) {
        const size = Math.max(target.getScaledWidth(), target.getScaledHeight());
        icon.scale(size / Math.max(icon.width, icon.height));
        icon.set({ angle: target.angle, opacity: target.opacity });
        icon.setPositionByOrigin(target.getCenterPoint(), 'center', 'center');
        const index = c.getObjects().indexOf(target);
        c.remove(target);
        c.insertAt(index, icon);
        c.setActiveObject(icon);
        c.requestRenderAll();
        return;
      }
      icon.scale(36 / Math.max(icon.width, icon.height));
      ed.add(icon);
    },
  });
}

// ------------------------------------------------------------------ Outils

const factories: Record<string, () => FabricObject | void> = {
  heading: () => S.heading('TITRE'),
  text: () => S.text('Double-cliquez pour modifier ce texte.'),
  list: () => S.bullets(['Premier élément', 'Deuxième élément', 'Troisième élément']),
  image: () => pickImage(),
  rect: () => S.rect(),
  circle: () => S.circle(),
  triangle: () => S.triangle(),
  banner: () => S.banner(),
  star: () => S.star(),
  line: () => S.line(),
  icons: () => pickIcon(),
};
document.querySelector('.tools')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-add]');
  const obj = btn && factories[btn.dataset.add!]?.();
  if (obj) ed.add(obj);
});

// ------------------------------------------------------------------ Projet

const confirmDiscard = () =>
  !ed.dirty ||
  confirm(draft === 'saved'
    ? 'Le document en cours va être remplacé : le brouillon automatique ne garde que le dernier document. Pour le conserver, enregistrez-le d’abord (.json). Continuer ?'
    : 'Les modifications non enregistrées seront perdues. Continuer ?');

// ------------------------------------------------------------------ Brouillon automatique (un seul document)

function flushDraft() {
  clearTimeout(draftTimer);
  if (!draftReady) return;
  const prev = draft;
  draft = saveDraft(projectText(ed.toJSON(), ed.meta, ed.columns, qf.state));
  if (draft === 'full' && prev !== 'full') toast('Document trop volumineux pour le brouillon automatique (photos ?) : pensez à l’enregistrer.', true);
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  if (draftReady) draftTimer = window.setTimeout(flushDraft, 800);
}

/** Reprend le brouillon du navigateur (validé comme un fichier ouvert). */
async function restoreDraft(): Promise<boolean> {
  const d = readDraft();
  if (!d) return false;
  try {
    const { project } = await readProject(new File([d.project], 'brouillon.json', { type: 'application/json' }));
    await loadDoc(project.canvas, project.meta, project.fill ?? null);
    if (project.layout) ed.setAids({ columns: project.layout });
    // Jamais téléchargé : remplacer ce document demande confirmation.
    ed.dirty = true;
    draft = 'saved';
    return true;
  } catch {
    return false;
  }
}

/** Document libre (page vierge, projet sans fiche) : pas de remplissage rapide. */
async function loadDoc(json: CanvasJSON, meta = emptyMeta(), fill: FillState | null = null) {
  qf.clear();
  ed.fill = fill;
  ed.meta = meta;
  await ed.load(json);
  panel.render();
  form.render();
}

/** Modèle relié au formulaire : la fiche en cours est conservée si elle a été remplie. */
async function loadTemplate(id: string, p: Palette) {
  const def = ALL_TEMPLATES.find((t) => t.id === id) ?? ALL_TEMPLATES[0];
  palette = p;
  // Fiche déjà remplie : les propriétés modifiées à la main sont conservées, les autres suivent le contenu.
  ed.meta = qf.state?.touched ? { ...ed.meta, kind: def.kind } : emptyMeta(def.docTitle, def.kind);
  await qf.start(def, p.id);
  panel.render();
  form.render();
}

/** Nouveau document : fiche vide reliée au modèle « Vierge », la page se construit au fil du formulaire. */
async function newDocument() {
  qf.clear();
  await loadTemplate(BLANK_TEMPLATE.id, palette);
  side.show('content');
}

/** Empreinte courte d'un texte (clé de cache des miniatures). */
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function chooseTemplate() {
  const s = qf.state;
  openGallery({
    palette,
    data: s?.touched ? { persona: s.data, key: hash(JSON.stringify(s.data)) } : undefined,
    onChoose: (def, p) => {
      // Fiche remplie et reliée : elle est reprise par le nouveau modèle, rien n'est perdu.
      if ((qf.state?.linked && qf.state.touched) || confirmDiscard()) loadTemplate(def.id, p).catch(fail);
    },
    onBlank: () => {
      if (confirmDiscard()) newDocument().catch(fail);
    },
  });
}

async function openProject(file: File) {
  if (!confirmDiscard()) return;
  const { project, dropped } = await readProject(file);
  // Projet avec fiche : le remplissage rapide reprend là où il en était.
  await loadDoc(project.canvas, project.meta, project.fill ?? null);
  if (project.layout) ed.setAids({ columns: project.layout });
  toast(dropped ? `Projet ouvert (${dropped} élément(s) non pris en charge ignoré(s)).` : 'Projet ouvert.');
}

function saveProject() {
  const blob = serializeProject(ed.toJSON(), ed.meta, ed.columns, qf.state);
  download(blob, `${slug(ed.meta.title, 'projet')}.json`);
  ed.dirty = false;
  toast('Projet enregistré dans vos téléchargements.');
}

let exporting = false;
async function exportPdf() {
  if (exporting) return;
  exporting = true;
  const btn = $<HTMLButtonElement>('btn-export');
  btn.disabled = true;
  btn.textContent = 'Génération…';
  try {
    ed.settle();
    const t0 = performance.now();
    const { exportPdf: run } = await import('./export-pdf');
    const bytes = await run(c, PAGE, ed.meta);
    download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${slug(ed.meta.title, 'document')}.pdf`);
    toast(`PDF généré : ${Math.max(1, Math.round(bytes.length / 1024))} Ko en ${Math.round(performance.now() - t0)} ms.`);
  } catch (e) {
    console.error(e);
    fail(e);
  } finally {
    exporting = false;
    btn.disabled = false;
    btn.textContent = 'Exporter PDF';
  }
}

const projectInput = $<HTMLInputElement>('file-project');
projectInput.addEventListener('change', () => {
  const f = projectInput.files?.[0];
  if (f) openProject(f).catch(fail);
});

$('btn-open').addEventListener('click', () => {
  projectInput.value = '';
  projectInput.click();
});
$('btn-save').addEventListener('click', saveProject);
$('btn-export').addEventListener('click', () => void exportPdf());
$('btn-new').addEventListener('click', () => {
  if (confirmDiscard()) newDocument().catch(fail);
});
$('btn-template').addEventListener('click', chooseTemplate);
$('btn-privacy').addEventListener('click', () =>
  openPrivacy({
    full: draft === 'full',
    // Réactivée : le document est enregistré tout de suite ; désactivée : le brouillon vient d'être effacé.
    onChange: () => (draftEnabled() ? flushDraft() : (draft = 'off')),
  }),
);
$('btn-ai').addEventListener('click', () => {
  import('./ui/ai-check').then((m) => m.openAiCheck(ed)).catch(fail);
});
undoBtn.addEventListener('click', () => void ed.undo());
redoBtn.addEventListener('click', () => void ed.redo());
$('zoom-in').addEventListener('click', () => {
  autoFit = false;
  ed.setZoom(ed.zoom * 1.2);
});
$('zoom-out').addEventListener('click', () => {
  autoFit = false;
  ed.setZoom(ed.zoom / 1.2);
});
zoomLabel.addEventListener('click', () => {
  autoFit = true;
  ed.zoomToFit();
});
stage.addEventListener('wheel', (e) => {
  if (Editor.isZoomWheel(e)) autoFit = false;
}, { passive: true });

let resizeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => autoFit && ed.zoomToFit());
}).observe(stage);

// Largeur des panneaux latéraux, retenue d'une visite à l'autre (préférence d'interface).
setupPanelResize([
  { el: $('layers'), prop: '--left-w', edge: 'right', min: 240, max: 560, def: 300, label: 'Contenu et calques' },
  { el: document.querySelector<HTMLElement>('.side')!, prop: '--right-w', edge: 'left', min: 240, max: 480, def: 288, label: 'Propriétés' },
]);

const dialogOpen = () => !!document.querySelector('dialog[open]');

window.addEventListener('keydown', (e) => {
  if (dialogOpen()) return; // les fenêtres gèrent leur propre clavier (Échap, saisie…)
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProject();
  } else if (mod && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    void exportPdf();
  } else if (ed.handleKey(e)) {
    e.preventDefault();
  }
});

// Fermeture : le brouillon est enregistré tout de suite ; sans brouillon, on prévient si le document a été modifié.
window.addEventListener('pagehide', flushDraft);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushDraft());
window.addEventListener('beforeunload', (e) => {
  flushDraft();
  if (ed.dirty && draft !== 'saved') e.preventDefault();
});

// ------------------------------------------------------------------ Démarrage

(async () => {
  await loadFonts();
  const restored = await restoreDraft();
  if (!restored) await loadTemplate(DEFAULT_TEMPLATE, palette);
  ed.zoomToFit();
  draftReady = true;
  if (restored) toast('Document en cours restauré depuis le brouillon de ce navigateur.');
})().catch(fail);
