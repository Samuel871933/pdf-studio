// Liaison texte ↔ fiche : chaque texte généré porte l'adresse de son champ (« experience.0.title »)
// et la façon dont il a été mis en forme (codec). Quand on modifie le texte sur la page,
// le codec relit la saisie pour mettre la fiche à jour.
import { cityName, type Language, type Persona } from './content';

type Obj = Record<string, unknown>;

export function getPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Obj)[k] : undefined), data);
}

export function setPath(data: unknown, path: string, value: unknown) {
  const keys = path.split('.');
  const last = keys.pop()!;
  let o = data as Obj;
  for (const k of keys) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = /^\d+$/.test(k) ? [] : {};
    o = o[k] as Obj;
  }
  o[last] = value;
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
/** Liste « a  ·  b  ·  c » ou une valeur par ligne. */
const items = (s: string) => s.split(/\n|\s+·\s+/).map((l) => l.trim()).filter(Boolean);
const unbullet = (s: string) => lines(s).map((l) => l.replace(/^[•\-–*]\s*/, '').trim()).filter(Boolean);
/** Comme `items`, puces éventuelles retirées. */
const unbulletItems = (s: string) => items(s).map((l) => l.replace(/^[•*]\s*/, '').trim()).filter(Boolean);

/** « Anglais : C1 (professionnel) » ou « Anglais — C1 ». */
function parseLanguage(s: string, prev?: Language): Language {
  // « Anglais (C1) »
  const p = s.match(/^([^:—–(]+?)\s*\(([^)]+)\)\s*$/);
  if (p) return { name: p[1].trim(), level: p[2].trim(), detail: p[2].trim() === prev?.level ? prev.detail : undefined, score: prev?.score ?? 3 };
  const m = s.match(/^(.+?)\s*(?::|—|–|-)\s*(.+)$/);
  if (!m) return { name: s.trim(), level: prev?.level ?? '', detail: prev?.detail, score: prev?.score ?? 3 };
  const d = m[2].match(/^(.*?)\s*\((.+)\)\s*$/);
  return { name: m[1].trim(), level: (d ? d[1] : m[2]).trim(), detail: d ? d[2].trim() : undefined, score: prev?.score ?? 3 };
}

const languages = (s: string, prev: Language[]) => unbulletItems(s).map((l, i) => parseLanguage(l, prev[i]));

/** Noms de compétences : on garde les niveaux déjà saisis (par position). */
const skillNames = (names: string[], p: Persona) => names.map((name, i) => ({ name, level: p.skills[i]?.level ?? 3 }));

/** Relit `text` et met la fiche à jour. */
type Decoder = (text: string, data: Persona, path: string) => void;

export const CODECS: Record<string, Decoder> = {
  text: (t, d, path) => setPath(d, path, t.trim()),
  /** Texte mis en capitales et/ou coupé sur plusieurs lignes : on garde la saisie, lignes réunies. */
  joined: (t, d, path) => setPath(d, path, t.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')),
  bullets: (t, d, path) => setPath(d, path, unbullet(t)),
  /** Une seule puce : le texte sans le « • ». */
  bullet: (t, d, path) => setPath(d, path, unbullet(t).join(' ')),
  list: (t, d, path) => setPath(d, path, items(t)),
  /** Liste séparée par des virgules (« Mode, Danse, Voyage »). */
  commaList: (t, d, path) => setPath(d, path, t.split(/,|\n/).map((x) => x.trim()).filter(Boolean)),
  /** « Organisation, dates » : les dates sont après la dernière virgule. */
  orgDatesComma: (t, d, path) => {
    const i = t.lastIndexOf(',');
    if (i < 0) return setPath(d, `${path}.org`, t.trim());
    setPath(d, `${path}.org`, t.slice(0, i).trim());
    setPath(d, `${path}.dates`, t.slice(i + 1).trim());
  },
  /** « Organisation  ·  dates » (entrée sans colonne de dates). */
  orgDates: (t, d, path) => {
    const [org, ...rest] = t.split(/\s+·\s+/);
    setPath(d, `${path}.org`, org.trim());
    if (rest.length) setPath(d, `${path}.dates`, rest.join(' · ').trim());
  },
  /** Coordonnées sur une ligne (« a · b · c ») ou une par ligne : téléphone, e-mail, ville, LinkedIn. */
  contacts: (t, d) => {
    const v = items(t);
    (['phone', 'email', 'city', 'linkedin'] as const).forEach((k, i) => {
      if (v[i] !== undefined) d[k] = cityName(v[i]) === cityName(d[k]) ? d[k] : v[i];
    });
  },
  /** Bloc expéditeur : nom, adresse, puis « téléphone – e-mail ». */
  sender: (t, d) => {
    const v = lines(t);
    if (!v.length) return;
    d.name = v[0];
    const last = v.length > 1 ? v[v.length - 1] : '';
    const contact = last.split(/\s+[–-]\s+/);
    if (contact.length === 2) {
      d.phone = contact[0].trim();
      d.email = contact[1].trim();
      d.address = v.slice(1, -1).join('\n');
    } else d.address = v.slice(1).join('\n');
  },
  /** « Ville, le 12 octobre 2026 » : seule la ville est une donnée. */
  dateCity: (t, d) => {
    const city = t.split(/,\s*le\s/i)[0].trim();
    if (city && city !== cityName(d.city)) d.city = city;
  },
  /** « Objet : … » */
  subject: (t, d) => {
    d.letter.subject = t.replace(/^\s*objet\s*:\s*/i, '').trim();
  },
  languages: (t, d) => {
    d.languages = languages(t, d.languages);
  },
  /** Jauge de langue : « Anglais — C1 ». */
  languageDots: (t, d, path) => {
    const i = Number(path.split('.')[1]);
    const prev = d.languages[i];
    const l = parseLanguage(t.trim(), prev);
    d.languages[i] = { ...l, detail: l.level === prev?.level ? prev.detail : l.detail };
  },
  skillNames: (t, d) => {
    d.skills = skillNames(unbullet(t), d);
  },
  /** Compétences en puces, avec une dernière puce « Outils : a, b, c ». */
  skillsTools: (t, d) => {
    const names: string[] = [];
    for (const l of unbullet(t)) {
      const m = l.match(/^outils\s*:\s*(.*)$/i);
      if (m) {
        // Le modèle n'affiche que les 4 premiers outils : on remplace ceux-là, la suite est gardée.
        d.tools = [...m[1].split(',').map((x) => x.trim()).filter(Boolean), ...d.tools.slice(4)];
      } else names.push(l);
    }
    d.skills = skillNames(names, d);
  },
  /** Ligne « • Outils : a, b, c » seule (compétences masquées) : seuls les outils affichés sont remplacés. */
  toolsLine: (t, d) => {
    const m = unbullet(t).join(' ').match(/^(?:outils\s*:\s*)?(.*)$/i)!;
    d.tools = [...m[1].split(',').map((x) => x.trim()).filter(Boolean), ...d.tools.slice(4)];
  },
  /** Bloc « Savoir-faire : … / Outils : … / Langues : … ». */
  skillsBlock: (t, d) => {
    for (const l of lines(t)) {
      const m = l.match(/^([^:]+?)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      if (key.startsWith('savoir')) d.skills = skillNames(m[2].split(',').map((x) => x.trim()).filter(Boolean), d);
      else if (key.startsWith('outil')) d.tools = m[2].split(',').map((x) => x.trim()).filter(Boolean);
      else if (key.startsWith('langue')) d.languages = languages(m[2], d.languages);
    }
  },
  /** Deux lignes : langues, puis centres d'intérêt. */
  langInterests: (t, d) => {
    const [l, i] = t.split('\n');
    if (l !== undefined) d.languages = languages(l, d.languages);
    if (i !== undefined) d.interests = items(i);
  },
};

export function decodeField(text: string, data: Persona, field: string, codec = 'text') {
  (CODECS[codec] ?? CODECS.text)(text, data, field);
}
