// Bibliothèque d'icônes Material Design (Apache 2.0), chargée à la demande :
// la sélection classée à l'ouverture, la bibliothèque complète seulement si on cherche plus loin.
export interface CuratedLibrary {
  version: string;
  fullFile: string;
  categories: { id: string; label: string; icons: [name: string, keywords: string][] }[];
  paths: Record<string, string>;
}

export interface IconHit {
  name: string;
  path: string;
}

let curated: Promise<CuratedLibrary> | null = null;
let full: Promise<Record<string, string>> | null = null;

export function loadCurated(): Promise<CuratedLibrary> {
  return (curated ??= import('./curated.json').then((m) => m.default as unknown as CuratedLibrary));
}

export function loadFull(lib: CuratedLibrary): Promise<Record<string, string>> {
  return (full ??= fetch(`./icons/${lib.fullFile}`).then((r) => {
    if (!r.ok) throw new Error('Bibliothèque d’icônes indisponible.');
    return r.json() as Promise<Record<string, string>>;
  }).catch((e) => {
    full = null;
    throw e;
  }));
}

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Chaque terme doit correspondre au début d'un mot (« vélo » ne trouve pas « développeur »). */
const matches = (words: string[], terms: string[]) => terms.every((t) => words.some((w) => w.startsWith(t)));

/** Recherche dans la sélection (noms + mots-clés français + thème). */
export function searchCurated(lib: CuratedLibrary, query: string, category?: string): IconHit[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const hits: IconHit[] = [];
  for (const cat of lib.categories) {
    if (category && cat.id !== category) continue;
    for (const [name, kw] of cat.icons) {
      if (seen.has(name)) continue;
      const words = normalize(`${name} ${kw} ${cat.label}`).split(/[\s-]+/);
      if (matches(words, terms)) {
        seen.add(name);
        hits.push({ name, path: lib.paths[name] });
      }
    }
  }
  return hits;
}

/** Recherche dans la bibliothèque complète (noms anglais). */
export function searchFull(all: Record<string, string>, query: string, limit: number): { hits: IconHit[]; total: number } {
  const terms = normalize(query).split(/[\s-]+/).filter(Boolean);
  const hits: IconHit[] = [];
  let total = 0;
  for (const name in all) {
    if (matches(name.split('-'), terms)) {
      total++;
      if (hits.length < limit) hits.push({ name, path: all[name] });
    }
  }
  return { hits, total };
}
