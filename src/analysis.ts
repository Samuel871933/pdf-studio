// Analyse « lecture par une IA » : 100 % locale, aucune donnée envoyée.
// Reproduit ce que voit un outil de tri automatique (texte extrait dans l'ordre du fichier)
// et signale ce qui lui échappe ou ce qu'il pourrait considérer comme suspect.
import { Circle, Color, FabricImage, Rect, type Canvas, type Textbox } from 'fabric';
import type { DocMeta } from './editor';
import { PAGE } from './editor';
import { collectItems, findLinks, readingOrder, toPlainText, type Item } from './reading';
import { isText } from './shapes';

export type Level = 'ok' | 'warn' | 'error' | 'info';

export type DocKind = 'cv' | 'letter';

export interface Check {
  level: Level;
  /** Lisibilité par une IA (commune) ou contenu propre au type de document. */
  scope: 'ai' | 'content';
  title: string;
  detail: string;
}

export interface Analysis {
  kind: DocKind;
  /** Type deviné d'après le texte (affiché si différent du type choisi). */
  guessed: DocKind;
  text: string;
  words: number;
  checks: Check[];
}

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ------------------------------------------------------------------ Contraste

function luminance(c: string): number | null {
  try {
    const [r, g, b, a] = new Color(c).getSource();
    if (a === 0) return null;
    const ch = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  } catch {
    return null;
  }
}

/** Contraste WCAG entre le texte et ce qui se trouve dessous (forme pleine ou fond de page). */
function contrastOf(it: Item, canvas: Canvas): number | null {
  const t = it.obj as Textbox;
  if (typeof t.fill !== 'string') return null;
  const fg = luminance(t.fill);
  if (fg === null) return 0;
  const cx = (it.x0 + it.x1) / 2;
  const cy = (it.y0 + it.y1) / 2;
  let bg = typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff';
  const objs = canvas.getObjects();
  for (let z = 0; z < it.z; z++) {
    const o = objs[z];
    if (!o.visible || isText(o) || typeof o.fill !== 'string' || o instanceof FabricImage) continue;
    const r = o.getBoundingRect();
    if (cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) bg = o.fill;
  }
  const b = luminance(bg) ?? 1;
  return (Math.max(fg, b) + 0.05) / (Math.min(fg, b) + 0.05);
}

// ------------------------------------------------------------------ Vérifications

const INJECTION = [
  /ignore[rz]?\s+(all\s+|toutes?\s+)?(the\s+|les\s+)?(previous|prior|above|pr[ée]c[ée]dentes?)\s+(instructions|consignes)/i,
  /\b(disregard|ignore)\b.{0,40}\b(instructions|prompt)\b/i,
  /\b(system prompt|prompt syst[eè]me)\b/i,
  /\b(you are|tu es|vous [eê]tes)\s+(an?\s+|une?\s+)?(ai|ia|llm|assistant|recruteur|recruiter)\b/i,
  /\b(rank|score|recommend|s[ée]lectionne[rz]?|retien[st]|classe[rz]?)\b.{0,30}\b(this|ce|cette)\s+(candidate|candidat|candidate?)/i,
  /\b(highly qualified|parfait candidat|meilleur candidat|best candidate)\b/i,
];

const SECTIONS: [string, RegExp][] = [
  ['Expérience', /\b(experience|parcours professionnel|emplois?|postes? occupes|stages?)\b/],
  ['Formation', /\b(formation|diplomes?|etudes|education|cursus)\b/],
  ['Compétences', /\b(competences|savoir-faire|skills|stack|outils)\b/],
];

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /(\+\d{1,3}[\s.]?)?\(?\d{1,4}\)?([\s.-]?\d{2,4}){3,5}/;

/** Devine le type de document d'après son texte. */
export function guessKind(flat: string): DocKind {
  const letter = [/\bmadame\b|\bmonsieur\b|\bbonjour\b/, /\bobjet\s*:/, /\b(salutations|cordialement|agreer|sentiments)\b/].filter((re) => re.test(flat)).length;
  return letter >= 2 ? 'letter' : 'cv';
}

/** Texte d'exemple laissé tel quel (modèles). */
const PLACEHOLDERS = /\b(prenom|nom de l.entreprise|societe exemple|entreprise demo|agence modele|magasin exemple|universite de ville|lycee de ville|ecole de commerce de ville|organisme de formation|iut de ville|rue de l.exemple|33000 ville|ville, le|email\.fr|lorem ipsum)\b|\[[^\]]{2,40}\]|\b0[67] (12 34 56 78|98 76 54 32|11 22 33 44)\b/;

export function analyze(canvas: Canvas, meta: DocMeta, forced?: DocKind): Analysis {
  const items = collectItems(canvas);
  const ordered = readingOrder(items);
  const text = toPlainText(ordered);
  const flat = normalize(text);
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  const guessed = guessKind(flat);
  const kind = forced ?? meta.kind ?? guessed;
  const checks: Check[] = [];
  const ai = (level: Level, title: string, detail: string) => checks.push({ level, scope: 'ai', title, detail });
  const content = (level: Level, title: string, detail: string) => checks.push({ level, scope: 'content', title, detail });
  const texts = items.filter((i) => i.kind === 'text');
  const finish = () => {
    const order: Record<Level, number> = { error: 0, warn: 1, ok: 2, info: 3 };
    checks.sort((a, b) => order[a.level] - order[b.level]);
    return { kind, guessed, text, words, checks };
  };

  if (!texts.length) {
    ai('error', 'Aucun texte lisible', 'Une IA ne peut rien lire : le contenu doit être écrit avec l’outil Texte, pas dans une image.');
    return finish();
  }

  // ---------------------------------------------------------------- Lisibilité par une IA (commun)
  const injected = texts.filter((i) => INJECTION.some((re) => re.test((i.obj as Textbox).text)));
  if (injected.length)
    ai('error', 'Consigne destinée à une IA détectée', 'Les outils de tri repèrent ces phrases et peuvent écarter la candidature. Supprimez-les : rien ne doit s’adresser à une IA.');

  const contrasts = texts.map((i) => ({ i, c: contrastOf(i, canvas) }));
  const invisible = contrasts.filter((x) => x.c !== null && x.c < 1.4);
  const low = contrasts.filter((x) => x.c !== null && x.c >= 1.4 && x.c < 3);
  const tiny = texts.filter((i) => (i.obj as Textbox).fontSize < 7 || i.obj.getScaledHeight() < 5);
  const outside = texts.filter((i) => i.x1 < 0 || i.y1 < 0 || i.x0 > PAGE.w || i.y0 > PAGE.h);
  const covered = texts.filter((i) => hiddenBelow(i, canvas)).length;
  if (invisible.length || outside.length)
    ai('error', `Texte invisible (${invisible.length + outside.length})`, 'Du texte de la couleur du fond ou hors de la page est lu par l’IA mais pas par l’humain : c’est assimilé à une tentative de manipulation. Rendez-le visible ou supprimez-le.');
  else if (!covered) ai('ok', 'Aucun texte caché', 'Tout le texte lu par une IA est aussi visible par le recruteur.');
  if (covered) ai('warn', `${covered} texte${covered > 1 ? 's' : ''} sous une forme`, 'Ces textes sont recouverts par un autre élément : invisibles pour le recruteur mais lus par l’IA.');
  if (low.length) ai('warn', `Contraste faible (${low.length} texte${low.length > 1 ? 's' : ''})`, 'Certains textes sont peu contrastés avec leur fond : difficiles à lire pour un humain et pour les IA qui analysent l’image de la page.');
  if (tiny.length) ai('warn', `Texte très petit (${tiny.length})`, 'En dessous de 7 pt, le texte est difficile à lire et peut être ignoré par les outils qui analysent l’image.');

  const hasMail = EMAIL.test(text);
  const hasPhone = PHONE.test(text.replace(EMAIL, ''));
  if (hasMail && hasPhone) ai('ok', 'Coordonnées lisibles', 'E-mail et téléphone sont du vrai texte, repérés automatiquement.');
  else ai('warn', 'Coordonnées incomplètes', `${hasMail ? '' : 'E-mail introuvable. '}${hasPhone ? '' : 'Téléphone introuvable. '}Écrivez-les en texte (pas dans une image ni seulement sous forme d’icône).`);
  const links = texts.reduce((n, i) => n + (i.obj as Textbox).text.split('\n').reduce((m, l) => m + findLinks(l).length, 0), 0);
  if (links) ai('info', `${links} lien${links > 1 ? 's' : ''} cliquable${links > 1 ? 's' : ''}`, 'E-mail, téléphone et adresses web deviennent des liens dans le PDF : les IA les extraient de façon fiable.');

  const leftovers = texts.filter((i) => PLACEHOLDERS.test(normalize((i.obj as Textbox).text))).length;
  if (leftovers) ai('warn', `Texte d’exemple restant (${leftovers} bloc${leftovers > 1 ? 's' : ''})`, 'Des éléments du modèle (« Prénom NOM », « Société Exemple », « Ville »…) semblent ne pas avoir été remplacés.');

  const bigImages = items.filter((i) => i.kind === 'image' && (i.x1 - i.x0) * (i.y1 - i.y0) > PAGE.w * PAGE.h * 0.15);
  if (bigImages.length) ai('info', 'Grande image', 'Si une image contient du texte, il est invisible pour la plupart des IA. Gardez le texte en texte.');
  ai('info', 'Ordre de lecture', 'Le texte du PDF est écrit colonne par colonne, de haut en bas. Vérifiez dans l’aperçu que l’ordre est logique.');
  if (!meta.keywords.trim())
    ai('info', 'Mots-clés du PDF vides', 'Renseignez le résumé et les mots-clés (panneau Document) : ils sont intégrés aux métadonnées du fichier.');

  // ---------------------------------------------------------------- Contenu
  if (kind === 'cv') cvChecks(content, canvas, text, flat, words);
  else letterChecks(content, ordered, text, flat, words);
  return finish();
}

type Add = (level: Level, title: string, detail: string) => void;

function cvChecks(add: Add, canvas: Canvas, text: string, flat: string, words: number) {
  const missing = SECTIONS.filter(([, re]) => !re.test(flat)).map(([n]) => n);
  if (missing.length) add('warn', `Section${missing.length > 1 ? 's' : ''} non trouvée${missing.length > 1 ? 's' : ''} : ${missing.join(', ')}`, 'Utilisez des titres standards (« Expérience professionnelle », « Formation », « Compétences ») : les IA s’en servent pour découper le CV.');
  else add('ok', 'Sections standards', 'Expérience, formation et compétences sont identifiables.');
  if (!/\b(19|20)\d{2}\b/.test(text)) add('warn', 'Aucune date', 'Indiquez les périodes (mois et année) : les IA calculent l’expérience à partir des dates.');
  else add('ok', 'Dates présentes', 'Les périodes permettent de calculer l’expérience.');
  if (!/\d+\s?(%|k€|m€|€|ans|clients|projets|personnes|utilisateurs|sites|boutiques)/i.test(text))
    add('info', 'Peu de résultats chiffrés', 'Les résultats mesurables (%, €, volumes) sont mieux valorisés par les recruteurs comme par les IA.');
  else add('ok', 'Résultats chiffrés', 'Des chiffres concrets appuient les réalisations.');
  if (words < 180) add('warn', `CV court (${words} mots)`, 'Peu de contenu : une IA aura peu d’éléments pour évaluer le profil.');
  else if (words > 900) add('warn', `CV dense (${words} mots)`, 'Au-delà d’environ 900 mots sur une page, le CV devient difficile à lire.');
  else add('ok', `Longueur adaptée (${words} mots)`, 'Assez de contenu pour être évalué, sans surcharge.');

  const objs = canvas.getObjects();
  const dots = objs.filter((o) => o instanceof Circle && o.radius * o.scaleX <= 6).length;
  const bars = objs.filter((o) => o instanceof Rect && o.getScaledHeight() <= 6 && o.getScaledWidth() >= 20).length;
  // Niveaux également exprimés en texte (CECRL, adjectifs) : la jauge n'est alors qu'un complément.
  const levelWords = (flat.match(/\b([abc][12]|courant|natif|native|bilingue|notions|debutant|intermediaire|avance|confirme|expert)\b/g) ?? []).length;
  if ((dots >= 3 || bars >= 2) && levelWords < 2)
    add('warn', 'Jauges ou pastilles de niveau', 'Une IA ne voit pas un niveau dessiné. Écrivez-le aussi en texte (ex. « Anglais — C1 », « Excel : avancé »).');
  if (/\b(age|ne le|nee le|marie|mariee|celibataire|nationalite|enfants?)\b|\b\d{2} ans\b/.test(flat))
    add('info', 'Informations personnelles', 'Âge, situation familiale ou nationalité ne sont pas des critères d’embauche légaux en France : inutile de les indiquer.');
}

function letterChecks(add: Add, ordered: Item[], text: string, flat: string, words: number) {
  if (/\bobjet\s*:/.test(flat)) add('ok', 'Objet précisé', 'Le poste visé est identifiable immédiatement, y compris par une IA.');
  else add('warn', 'Objet non trouvé', 'Ajoutez « Objet : candidature au poste de … » : c’est l’information clé pour le recruteur et pour l’IA.');
  if (/\ble\s+\d{1,2}(er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(flat))
    add('ok', 'Lieu et date', 'La lettre est datée.');
  else add('warn', 'Date manquante', 'Ajoutez le lieu et la date (« Bordeaux, le 12 octobre 2026 »).');
  if (/\b(madame|monsieur|bonjour)\b/.test(flat)) add('ok', 'Formule d’appel', 'La lettre s’adresse clairement à son destinataire.');
  else add('warn', 'Formule d’appel absente', 'Commencez par « Madame, Monsieur, » ou par le nom du recruteur s’il est connu.');
  if (/\b(salutations|cordialement|agreer|sentiments|respectueuses)\b/.test(flat)) add('ok', 'Formule de politesse', 'La conclusion est présente.');
  else add('warn', 'Formule de politesse absente', 'Terminez par une formule de politesse (« Je vous prie d’agréer… »).');

  const last = ordered.filter((i) => i.kind === 'text').at(-1);
  const lastText = last ? (last.obj as Textbox).text.trim() : '';
  if (lastText && lastText.length <= 60 && !/[.!?]$/.test(lastText)) add('ok', 'Signature', 'La lettre se termine par vos prénom et nom.');
  else add('warn', 'Signature manquante', 'Terminez la lettre par vos prénom et nom.');

  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 25);
  const long = paragraphs.filter((p) => p.split(/\s+/).length > 110).length;
  if (paragraphs.length < 3) add('warn', 'Peu de paragraphes', 'Structurez la lettre en 3 à 5 paragraphes : vous (l’entreprise), moi (votre parcours), nous (la collaboration).');
  else if (long) add('warn', `Paragraphe${long > 1 ? 's' : ''} trop long${long > 1 ? 's' : ''} (${long})`, 'Au-delà d’environ 100 mots, un paragraphe se lit mal : découpez-le en idées distinctes.');
  else add('ok', `${paragraphs.length} paragraphes`, 'Structure aérée, facile à lire.');

  if (words < 180) add('warn', `Lettre courte (${words} mots)`, 'Développez votre motivation et un ou deux exemples concrets.');
  else if (words > 450) add('warn', `Lettre longue (${words} mots)`, 'Une lettre efficace tient sur une page, entre 250 et 400 mots environ.');
  else add('ok', `Longueur adaptée (${words} mots)`, 'La lettre reste concise.');

  const generic = (flat.match(/\bvotre (entreprise|societe|agence|structure)\b/g) ?? []).length;
  if (generic >= 2) add('info', 'Lettre peu personnalisée', 'Citez le nom de l’entreprise et un élément précis de l’offre ou de son activité : les recruteurs et les IA repèrent les lettres génériques.');
  if (!/\d/.test(text.replace(/\b0\d([\s.-]?\d{2}){4}\b|\b(19|20)\d{2}\b|\b\d{5}\b/g, '')))
    add('info', 'Aucun exemple chiffré', 'Un résultat concret (« plus de 40 boutiques », « +30 % de conversions ») rend la lettre plus convaincante.');
}

/** Texte recouvert par une forme opaque dessinée au-dessus. */
function hiddenBelow(it: Item, canvas: Canvas): boolean {
  const objs = canvas.getObjects();
  for (let z = it.z + 1; z < objs.length; z++) {
    const o = objs[z];
    if (!o.visible || isText(o) || o.opacity < 0.5) continue;
    if (!(o instanceof FabricImage) && (typeof o.fill !== 'string' || !o.fill || o.fill === 'transparent')) continue;
    const r = o.getBoundingRect();
    if (r.left <= it.x0 && r.top <= it.y0 && r.left + r.width >= it.x1 && r.top + r.height >= it.y1) return true;
  }
  return false;
}

// ------------------------------------------------------------------ Correspondance avec une offre

const stem = (w: string) => (w.length > 4 && /[sx]$/.test(w) && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);

const STOP = new Set(
  (
    'les des une un le la de du et en au aux pour par sur dans avec sans sous vers chez ou ne pas plus moins tres que qui quoi dont est sont ' +
    'etre avoir fait faire ce ces cet cette son sa ses leur leurs nos notre vos votre vous nous ils elles il elle on se si mais donc car ni ' +
    'tout tous toute toutes autre autres meme aussi ainsi comme entre afin lors deja bien bon bonne bons bonnes selon via etc mise place ' +
    'the and for with from that this these those your our you are will can have has not but all any per into out within ' +
    'poste postes profil profils mission missions entreprise societe candidat candidate candidature recrute recrutons recherchons rejoindre ' +
    'cdi cdd stage alternance salaire remuneration avantages teletravail contrat temps plein partiel lieu date debut ans annee annees mois ' +
    'experience experiences niveau minimum souhaite souhaitee souhaites requis requise idealement maitrise maitriser connaissance connaissances ' +
    'capacite capacites apprecie appreciee apprecies sensibilite gout envie esprit sens qualite qualites atout atouts plus serait ' +
    'job role team work position company looking years year strong good great nice offre offrons propose proposons sein equipe ' +
    'developpement developper participer participation assurer gerer realiser travailler accompagner contribuer'
  )
    .split(' ')
    .map((w) => stem(w)),
);

interface Token {
  key: string;
  shown: string;
  /** Nom propre ou terme technique (majuscule hors début de phrase, chiffres, +, #). */
  proper: boolean;
}

function tokens(s: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}+#.\-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]/gu;
  for (const m of s.matchAll(re)) {
    const word = m[0].replace(/[.\-]+$/, '');
    const before = s.slice(Math.max(0, (m.index ?? 0) - 3), m.index ?? 0);
    const sentenceStart = (m.index ?? 0) === 0 || /[.!?:\n]\s*$/.test(before);
    const proper = (/\p{Lu}/u.test(word) && !sentenceStart) || /[0-9+#]/.test(word) || /\p{Lu}.*\p{Lu}/u.test(word);
    out.push({ key: stem(normalize(word)), shown: word, proper });
  }
  return out;
}

const SHORT = ['ux', 'ui', 'ia', 'ai', 'bi', 'qa', 'go', 'js', 'ts', 'r', 'c', 'c#', 'c++'];
const keep = (t: Token) => !STOP.has(t.key) && !/^\d+$/.test(t.key) && (t.key.length >= 3 || /[0-9+#]/.test(t.key) || SHORT.includes(t.key));

export interface OfferMatch {
  coverage: number;
  matched: string[];
  missing: string[];
}

/** Mots-clés significatifs de l'offre (termes et expressions de deux mots), présents ou non dans le document. */
export function matchOffer(offer: string, docText: string): OfferMatch {
  const score = new Map<string, number>();
  const label = new Map<string, string>();
  const bump = (key: string, shown: string, w: number) => {
    score.set(key, (score.get(key) ?? 0) + w);
    if (!label.has(key)) label.set(key, shown);
  };
  let prev: Token | null = null;
  let gap = 0;
  for (const t of tokens(offer)) {
    if (!keep(t)) {
      if (++gap > 1) prev = null;
      continue;
    }
    bump(t.key, t.shown, t.proper ? 2 : 1);
    if (prev) bump(`${prev.key} ${t.key}`, `${prev.shown} ${t.shown}`, 0.75);
    prev = t;
    gap = 0;
  }
  // Une expression de deux mots n'est retenue que si elle revient.
  for (const [k, v] of score) if (k.includes(' ') && v < 1.5) score.delete(k);
  const top = [...score].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 25).map(([k]) => k);

  const doc = tokens(docText).filter(keep).map((t) => t.key);
  const docSet = new Set(doc);
  const docBigrams = new Set(doc.slice(1).map((t, i) => `${doc[i]} ${t}`));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of top) (k.includes(' ') ? docBigrams.has(k) : docSet.has(k)) ? matched.push(label.get(k)!) : missing.push(label.get(k)!);
  return { coverage: top.length ? matched.length / top.length : 0, matched, missing };
}
