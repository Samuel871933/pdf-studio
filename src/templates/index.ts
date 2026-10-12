import type { CanvasJSON } from '../editor';
import { PALETTES, type Palette } from './kit';
import { banner, classic, hybrid, junior, letter, letterClassic, sidebar, tech, timeline } from './templates';

export { PALETTES, type Palette };

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
  build(p: Palette): CanvasJSON | Promise<CanvasJSON>;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'classic', kind: 'cv', name: 'Classique', ats: 'Idéal ATS', badges: ['1 colonne', 'Sans photo'], docTitle: 'CV', build: classic,
    description: 'Le format le plus sûr pour les candidatures en ligne : une colonne, des titres standards, l’expérience la plus récente en premier.',
  },
  {
    id: 'hybrid', kind: 'cv', name: 'Hybride', ats: 'Idéal ATS', badges: ['1 colonne', 'Reconversion'], docTitle: 'CV', build: hybrid,
    description: 'Compétences clés et réalisations chiffrées avant le parcours. Idéal pour une reconversion ou un parcours varié.',
  },
  {
    id: 'timeline', kind: 'cv', name: 'Chronologique', ats: 'Idéal ATS', badges: ['Colonne de dates', 'Sobre'], docTitle: 'CV', build: timeline,
    description: 'Élégant et aéré : les dates dans une colonne étroite, le contenu à droite. Pour les profils expérimentés.',
  },
  {
    id: 'banner', kind: 'cv', name: 'Bandeau', ats: 'Compatible ATS', badges: ['2/3 – 1/3', 'Photo'], docTitle: 'CV', build: banner,
    description: 'Parcours dans la colonne principale (lue en premier), atouts dans une colonne latérale : compétences, langues, outils.',
  },
  {
    id: 'tech', kind: 'cv', name: 'Tech', ats: 'Compatible ATS', badges: ['1/3 – 2/3', 'Développeur'], docTitle: 'CV', build: tech,
    description: 'Pour les métiers techniques : stack en étiquettes, projets mis en avant, liens LinkedIn et GitHub.',
  },
  {
    id: 'junior', kind: 'cv', name: 'Junior / Alternance', ats: 'Idéal ATS', badges: ['Formation d’abord', 'Photo'], docTitle: 'CV', build: junior,
    description: 'Formation et projets en premier, objectif clairement affiché : pour un stage, une alternance ou un premier emploi.',
  },
  {
    id: 'sidebar', kind: 'cv', name: 'Barre latérale', ats: 'Visuel', badges: ['Graphique', 'Photo'], docTitle: 'CV', build: sidebar,
    description: 'Mise en page graphique en panneaux. Plutôt pour un envoi direct à un recruteur ou un réseau que pour un portail.',
  },
  {
    id: 'letter', kind: 'letter', name: 'Lettre de motivation', ats: 'Idéal ATS', badges: ['Assortie aux CV'], docTitle: 'Lettre de motivation', build: letter,
    description: 'Même en-tête que les CV, structure « vous – moi – nous », une page.',
  },
  {
    id: 'letter-classic', kind: 'letter', name: 'Lettre classique', ats: 'Idéal ATS', badges: ['Format français', 'Sobre'], docTitle: 'Lettre de motivation', build: letterClassic,
    description: 'Mise en page traditionnelle : coordonnées en haut à gauche, date à droite, formule d’appel centrée, texte justifié.',
  },
];

export const DEFAULT_TEMPLATE = 'sidebar';

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
