import type { CanvasJSON } from '../editor';
import { DEVELOPER, GENERALIST, HOSPITALITY, LETTER_SAMPLE, STUDENT, type Persona } from './content';
import { PALETTES, type Overflow, type Palette } from './kit';
import { banner, classic, hybrid, junior, letter, letterClassic, organic, sidebar, tech, timeline } from './templates';

export { PALETTES, type Overflow, type Palette };

/** Parties de la fiche affichées par un modèle (le formulaire les présente en premier). */
export type Section =
  | 'photo' | 'identity' | 'github' | 'address' | 'profile' | 'experience' | 'education'
  | 'achievements' | 'skills' | 'levels' | 'tools' | 'languages' | 'interests' | 'letter';

export type Built = CanvasJSON & { overflow: Overflow[] };

export type TemplateKind = 'cv' | 'letter';

export const KINDS: [TemplateKind | 'all', string][] = [
  ['all', 'Tous'],
  ['cv', 'CV'],
  ['letter', 'Lettres de motivation'],
];

export interface TemplateDef {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string;
  /** Lisibilité par les logiciels de recrutement (ATS). */
  ats: 'Idéal ATS' | 'Compatible ATS' | 'Visuel';
  badges: string[];
  docTitle: string;
  /** Données d'exemple (fictives) affichées tant que la fiche n'a pas été remplie. */
  sample: Persona;
  sections: Section[];
  build(p: Palette, data: Persona, density?: number): Built | Promise<Built>;
}

const CV: Section[] = ['identity', 'profile', 'experience', 'education', 'skills', 'tools', 'languages', 'interests'];

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'classic', kind: 'cv', name: 'Classique', ats: 'Idéal ATS', badges: ['1 colonne', 'Sans photo'], docTitle: 'CV', sample: GENERALIST, sections: CV,
    build: classic,
    description: 'Le format le plus sûr pour les candidatures en ligne : une colonne, des titres standards, l’expérience la plus récente en premier.',
  },
  {
    id: 'hybrid', kind: 'cv', name: 'Hybride', ats: 'Idéal ATS', badges: ['1 colonne', 'Reconversion'], docTitle: 'CV', sample: GENERALIST, sections: ['identity', 'profile', 'skills', 'achievements', 'experience', 'education', 'languages', 'interests'],
    build: hybrid,
    description: 'Compétences clés et réalisations chiffrées avant le parcours. Idéal pour une reconversion ou un parcours varié.',
  },
  {
    id: 'timeline', kind: 'cv', name: 'Chronologique', ats: 'Idéal ATS', badges: ['Colonne de dates', 'Sobre'], docTitle: 'CV', sample: GENERALIST, sections: CV,
    build: timeline,
    description: 'Élégant et aéré : les dates dans une colonne étroite, le contenu à droite. Pour les profils expérimentés.',
  },
  {
    id: 'banner', kind: 'cv', name: 'Bandeau', ats: 'Compatible ATS', badges: ['2/3 – 1/3', 'Photo'], docTitle: 'CV', sample: GENERALIST, sections: ['photo', 'identity', 'github', 'profile', 'experience', 'education', 'skills', 'levels', 'languages', 'tools', 'interests'],
    build: banner,
    description: 'Parcours dans la colonne principale (lue en premier), atouts dans une colonne latérale : compétences, langues, outils.',
  },
  {
    id: 'tech', kind: 'cv', name: 'Tech', ats: 'Compatible ATS', badges: ['1/3 – 2/3', 'Développeur'], docTitle: 'CV', sample: DEVELOPER, sections: ['identity', 'github', 'profile', 'experience', 'achievements', 'education', 'tools', 'skills', 'languages', 'interests'],
    build: tech,
    description: 'Pour les métiers techniques : stack en étiquettes, projets mis en avant, liens LinkedIn et GitHub.',
  },
  {
    id: 'junior', kind: 'cv', name: 'Junior / Alternance', ats: 'Idéal ATS', badges: ['Formation d’abord', 'Photo'], docTitle: 'CV', sample: STUDENT, sections: ['photo', 'identity', 'profile', 'education', 'achievements', 'experience', 'tools', 'languages', 'interests'],
    build: junior,
    description: 'Formation et projets en premier, objectif clairement affiché : pour un stage, une alternance ou un premier emploi.',
  },
  {
    id: 'sidebar', kind: 'cv', name: 'Barre latérale', ats: 'Visuel', badges: ['Graphique', 'Photo'], docTitle: 'CV', sample: GENERALIST, sections: ['photo', 'identity', 'skills', 'tools', 'experience', 'education', 'languages', 'interests'],
    build: sidebar,
    description: 'Mise en page graphique en panneaux. Plutôt pour un envoi direct à un recruteur ou un réseau que pour un portail.',
  },
  {
    id: 'organic', kind: 'cv', name: 'Organique', ats: 'Visuel', badges: ['Formes douces', 'Photo'], docTitle: 'CV',
    sample: HOSPITALITY, sections: ['photo', 'identity', 'address', 'experience', 'education', 'skills', 'languages', 'interests'], build: organic,
    description: 'Formes arrondies et tons doux, photo mise en valeur, parcours centré. Pour une candidature directe dans l’accueil, le luxe ou les métiers créatifs.',
  },
  {
    id: 'letter', kind: 'letter', name: 'Lettre de motivation', ats: 'Idéal ATS', badges: ['Assortie aux CV'], docTitle: 'Lettre de motivation', sample: GENERALIST, sections: ['identity', 'letter'],
    build: letter,
    description: 'Même en-tête que les CV, structure « vous – moi – nous », une page.',
  },
  {
    id: 'letter-classic', kind: 'letter', name: 'Lettre classique', ats: 'Idéal ATS', badges: ['Format français', 'Sobre'], docTitle: 'Lettre de motivation', sample: LETTER_SAMPLE, sections: ['identity', 'address', 'letter'],
    build: letterClassic,
    description: 'Mise en page traditionnelle : coordonnées en haut à gauche, date à droite, formule d’appel centrée, texte justifié.',
  },
];

export const DEFAULT_TEMPLATE = 'sidebar';

/** Densités essayées tour à tour quand le contenu déborde (espacements de plus en plus serrés). */
const DENSITIES = [1, 0.85, 0.7, 0.55];

/**
 * Met la fiche en page ; si le contenu déborde, les espacements se resserrent.
 * `overflow` reste rempli si même la densité la plus serrée ne suffit pas.
 */
export async function buildFit(def: TemplateDef, p: Palette, data: Persona): Promise<Built & { density: number }> {
  let last: Built | null = null;
  for (const d of DENSITIES) {
    last = await def.build(p, data, d);
    if (!last.overflow.length) return { ...last, density: d };
  }
  return { ...last!, density: DENSITIES.at(-1)! };
}

/** Synthèse des recherches sur ce qui fonctionne auprès des recruteurs. */
export const TIPS: string[] = [
  'Un premier tri dure quelques secondes : titres de section clairs, mise en page aérée et puces courtes captent mieux l’attention (étude oculométrique Ladders, 2018).',
  'Pour les candidatures via un portail (ATS), privilégiez une colonne. Les modèles à deux colonnes de PDF Studio écrivent le texte dans l’ordre de lecture, mais une colonne reste le choix le plus sûr.',
  'En France : une page (deux au-delà de 10 ans d’expérience), expérience la plus récente en premier, intitulé de poste visible en haut.',
  'Commencez vos puces par un verbe d’action et chiffrez vos résultats (%, €, volumes, délais).',
  'La photo est facultative. N’indiquez ni âge, ni situation familiale, ni nationalité : ce ne sont pas des critères d’embauche légaux.',
  'Utilisez des intitulés standards (« Expérience professionnelle », « Formation », « Compétences ») et reprenez les mots-clés de l’offre.',
  'Envoyez un PDF au texte sélectionnable (c’est le cas des exports PDF Studio), jamais une image ou un scan.',
];

export const SOURCES: [string, string][] = [
  ['Étude oculométrique Ladders (2018)', 'https://www.hrdive.com/news/eye-tracking-study-shows-recruiters-look-at-resumes-for-7-seconds/541582/'],
  ['Colonnes et ATS (Enhancv)', 'https://enhancv.com/blog/are-two-column-resumes-ats-friendly/'],
  ['Banc d’essai de parsing ATS 2026', 'https://atsverification.com/blog/ats-parsing-benchmark-2026/'],
  ['Format hybride (Jobscan)', 'https://www.jobscan.co/blog/hybrid-resumes-best-resume-format/'],
  ['Le CV en France (Novorésumé)', 'https://novoresume.com/career-blog/french-resume'],
];
