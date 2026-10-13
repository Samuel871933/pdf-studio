// Données des modèles : une fiche unique (Persona) que chaque modèle met en page.
// Le remplissage rapide édite cette fiche ; les exemples ci-dessous sont fictifs (aucune donnée réelle).
// Les puces suivent les bonnes pratiques : verbe d'action + résultat chiffré, expérience la plus récente en premier.

/** Poste ou diplôme. */
export interface Entry {
  title: string;
  org: string;
  dates: string;
  text?: string;
  bullets?: string[];
}

/** Compétence ; `level` de 1 à 5 (jauges des modèles graphiques). */
export interface Skill {
  name: string;
  level: number;
}

/** Langue : niveau court (« C1 », « Natif »), précision facultative, et note de 1 à 5 (points). */
export interface Language {
  name: string;
  level: string;
  detail?: string;
  score: number;
}

export interface LetterData {
  /** Bloc destinataire (une ligne par retour à la ligne). */
  recipient: string;
  /** Objet, sans le préfixe « Objet : ». */
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
}

/** Sections de la fiche qu'on peut renommer, dupliquer et après lesquelles placer une section ajoutée. */
export type ContentKey = 'profile' | 'experience' | 'education' | 'achievements' | 'skills' | 'tools' | 'languages' | 'interests';
export const CONTENT_KEYS: ContentKey[] = ['profile', 'experience', 'education', 'achievements', 'skills', 'tools', 'languages', 'interests'];

/** Forme d'une section ajoutée : postes / diplômes, liste à puces ou paragraphe. */
export type CustomKind = 'entries' | 'list' | 'text';

/** Section ajoutée par l'utilisateur (« Bénévolat », « Certifications »…), mise en page par le modèle. */
export interface CustomSection {
  /** Identifiant stable (ne change pas quand on réordonne). */
  id: string;
  title: string;
  kind: CustomKind;
  /** Section après laquelle elle s'affiche : elle en prend la colonne et le style. */
  after: ContentKey;
  entries: Entry[];
  items: string[];
  text: string;
}

/** Forme de section créée en dupliquant chaque section standard. */
export const KIND_OF: Record<ContentKey, CustomKind> = {
  profile: 'text', experience: 'entries', education: 'entries', achievements: 'list',
  skills: 'list', tools: 'list', languages: 'list', interests: 'list',
};

export const newCustomId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Une section ajoutée n'est affichée que si elle a du contenu. */
export const hasContent = (c: CustomSection) =>
  c.kind === 'text' ? !!c.text.trim() : c.kind === 'list' ? filled(c.items).length > 0 : c.entries.some((e) => e.title.trim() || e.org.trim());

export interface Persona {
  name: string;
  title: string;
  /** Photo (data URL assainie) ; absente : silhouette par défaut. */
  photo?: string;
  phone: string;
  email: string;
  city: string;
  /** Adresse postale (lettres), une ligne par retour à la ligne. */
  address: string;
  linkedin: string;
  github: string;
  profile: string;
  experience: Entry[];
  education: Entry[];
  achievements: string[];
  skills: Skill[];
  tools: string[];
  languages: Language[];
  interests: string[];
  letter: LetterData;
  /** Titres renommés des sections standards (sinon, le titre propre au modèle). */
  labels?: Partial<Record<ContentKey, string>>;
  /** Sections ajoutées, dans leur ordre d'affichage. */
  custom?: CustomSection[];
  /** Sections standards masquées : absentes de la page, leur contenu est conservé. */
  hidden?: ContentKey[];
}

/** La section n'a rien à afficher (un modèle n'affiche ni son titre ni son contenu). */
export function isEmptySection(p: Persona, key: ContentKey): boolean {
  switch (key) {
    case 'profile': return !p.profile.trim();
    case 'experience':
    case 'education': return !p[key].some((e) => e.title.trim() || e.org.trim());
    case 'skills': return !filled(p.skills.map((s) => s.name)).length;
    case 'languages': return !p.languages.some((l) => l.name.trim());
    default: return !filled(p[key]).length;
  }
}

/** Fiche telle que la page l'affiche : sections masquées vidées (copie ; la fiche garde leur contenu). */
export function visiblePersona(p: Persona): Persona {
  if (!p.hidden?.length) return p;
  const v: Persona = { ...p };
  for (const k of p.hidden) {
    if (k === 'profile') v.profile = '';
    else v[k] = [];
  }
  return v;
}

/** Éléments renseignés d'une liste (un élément tout juste ajouté, encore vide, n'est pas affiché). */
export const filled = (list: string[]) => list.filter((s) => s.trim());

export const languagesText = (p: Persona) =>
  p.languages.filter((l) => l.name.trim()).map((l) => `${l.name} : ${l.level}${l.detail ? ` (${l.detail})` : ''}`).join('  ·  ');

/** Ville sans le département entre parenthèses (« Bordeaux (33) » → « Bordeaux »). */
export const cityName = (city: string) => city.replace(/\s*\(.*\)\s*$/, '');

export const GENERALIST: Persona = {
  name: 'Camille Martin',
  title: 'Responsable de projet digital',
  phone: '06 12 34 56 78',
  email: 'camille.martin@email.fr',
  city: 'Bordeaux (33)',
  address: '12 rue de l’Exemple\n33000 Bordeaux',
  linkedin: 'linkedin.com/in/camille-martin',
  github: '',
  profile:
    '8 ans d’expérience dans le pilotage de projets web et e-commerce, du cadrage à la mise en production. ' +
    'Coordination d’équipes pluridisciplinaires, suivi budgétaire et amélioration continue orientée résultats.',
  experience: [
    {
      title: 'Responsable de projet digital',
      org: 'Société Exemple — Bordeaux',
      dates: 'Sept. 2021 – aujourd’hui',
      bullets: [
        'Pilotage de 15 projets web par an (budget de 600 k€)',
        'Taux de conversion +32 % après refonte du parcours d’achat',
        'Management d’une équipe de 6 personnes',
      ],
    },
    {
      title: 'Chef de projet web',
      org: 'Agence Modèle — Nantes',
      dates: 'Mars 2018 – Août 2021',
      bullets: [
        'Portefeuille de 40 clients PME : cadrage, planning, recette',
        'Passage à Scrum : délais de livraison réduits de 20 %',
      ],
    },
    {
      title: 'Assistant chef de projet',
      org: 'Entreprise Démo — Paris',
      dates: 'Sept. 2016 – Févr. 2018',
      bullets: ['Rédaction de cahiers des charges et suivi de 12 prestataires'],
    },
  ],
  education: [
    { title: 'Master Management de projets numériques', org: 'Université de Ville', dates: '2016' },
    { title: 'Licence Information-Communication', org: 'Université de Ville', dates: '2014' },
  ],
  achievements: [
    'Boutique en ligne lancée en 4 mois : 1,2 M€ de CA la première année',
    'Réduction de 25 % des coûts de maintenance grâce à la mutualisation des outils',
    'Formation de 30 collaborateurs aux méthodes agiles',
  ],
  skills: [
    { name: 'Gestion de projet (Agile, Scrum, Kanban)', level: 5 },
    { name: 'Pilotage budgétaire et reporting', level: 4 },
    { name: 'UX et optimisation des parcours', level: 4 },
    { name: 'SEO, SEA et analyse d’audience', level: 3 },
    { name: 'Rédaction de cahiers des charges', level: 4 },
  ],
  tools: ['Jira', 'Notion', 'Figma', 'Google Analytics', 'Excel', 'WordPress', 'PrestaShop'],
  languages: [
    { name: 'Anglais', level: 'C1', detail: 'professionnel', score: 4 },
    { name: 'Espagnol', level: 'B1', score: 3 },
  ],
  interests: ['Course à pied (semi-marathon)', 'Photographie', 'Bénévolat associatif'],
  letter: {
    recipient: 'Société Exemple\nService Recrutement\n12 rue de l’Exemple\n33000 Bordeaux',
    subject: 'candidature au poste de Responsable de projet digital',
    greeting: 'Madame, Monsieur,',
    paragraphs: [
      'Votre entreprise accélère sa transformation numérique et recherche une personne capable de piloter des projets web à fort enjeu. Cette ambition rejoint pleinement mon parcours et mes motivations.',
      'Depuis huit ans, je conduis des projets digitaux de bout en bout. Chez Société Exemple, j’ai piloté quinze projets par an et augmenté de 32 % le taux de conversion de la boutique en ligne grâce à la refonte du parcours d’achat. J’ai également encadré une équipe de six personnes et introduit les méthodes agiles.',
      'Votre projet de refonte de la plateforme client m’intéresse tout particulièrement : il demande à la fois rigueur dans le pilotage, écoute des équipes métier et sens du résultat, trois qualités que je mets en œuvre au quotidien.',
      'Rejoindre vos équipes me permettrait de mettre cette expérience au service de vos projets, tout en relevant de nouveaux défis. Je serais ravi(e) de vous présenter plus en détail mes réalisations lors d’un entretien.',
    ],
    closing: 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
  },
};

export const DEVELOPER: Persona = {
  name: 'Alex Durand',
  title: 'Développeur full-stack PHP / JavaScript',
  phone: '06 98 76 54 32',
  email: 'alex.durand@email.fr',
  city: 'Lyon (69)',
  address: '8 avenue de l’Exemple\n69000 Lyon',
  linkedin: 'linkedin.com/in/alex-durand',
  github: 'github.com/alex-durand',
  profile:
    'Développeur full-stack depuis 6 ans, spécialisé en PHP / Symfony et React. ' +
    'Conception d’applications métier, d’API et de sites e-commerce performants, avec un goût prononcé pour la qualité du code.',
  experience: [
    {
      title: 'Développeur full-stack',
      org: 'Société Exemple — Lyon',
      dates: '2021 – aujourd’hui',
      bullets: [
        'Plateforme B2B (Symfony, React) utilisée par 3 000 clients',
        'Temps de chargement divisé par 3 (cache, optimisation SQL)',
        'Intégration continue et tests automatisés (couverture 80 %)',
      ],
    },
    {
      title: 'Développeur web',
      org: 'Agence Modèle — Lyon',
      dates: '2019 – 2021',
      bullets: [
        'Création et maintenance de 25 sites e-commerce (PrestaShop, WordPress)',
        'Développement de modules sur mesure et de connecteurs ERP / CRM',
      ],
    },
  ],
  education: [
    { title: 'Licence pro Développement web', org: 'IUT de Ville', dates: '2019' },
    { title: 'Titre Concepteur développeur d’applications', org: 'Organisme de formation', dates: '2018' },
  ],
  achievements: [
    'Gestion de stock (React, Node.js) : 2 000 utilisateurs',
    'Module e-commerce open source (PHP) : 300 étoiles sur GitHub',
  ],
  skills: [
    { name: 'Architecture d’API REST', level: 5 },
    { name: 'Tests automatisés', level: 4 },
    { name: 'Performance et sécurité web', level: 4 },
    { name: 'Revue de code et mentorat', level: 3 },
  ],
  tools: ['PHP', 'Symfony', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'MySQL', 'PostgreSQL', 'Docker', 'Git', 'CI/CD'],
  languages: [
    { name: 'Anglais', level: 'B2', detail: 'documentation technique', score: 4 },
    { name: 'Allemand', level: 'A2', score: 2 },
  ],
  interests: ['Projets open source', 'Escalade', 'Jeux de société'],
  letter: {
    recipient: 'Société Exemple\nService Recrutement\n8 avenue de l’Exemple\n69000 Lyon',
    subject: 'Candidature au poste de Développeur web',
    greeting: 'Madame, Monsieur,',
    paragraphs: [
      'Actuellement développeur web au sein d’une agence depuis plusieurs années, je souhaite aujourd’hui m’ouvrir à de nouvelles opportunités professionnelles. C’est dans cette optique que je me permets de vous adresser ma candidature afin de mettre l’expérience acquise au service de votre entreprise.',
      'Titulaire d’un diplôme de concepteur développeur d’applications, j’ai poursuivi mon parcours par une licence professionnelle en alternance. Ces formations, associées à mon expérience en agence, m’ont permis d’acquérir de solides bases techniques et de travailler sur des projets variés.',
      'J’ai notamment conçu et réalisé des boutiques en ligne de bout en bout, avec ou sans intégrations tierces (ERP, solutions de paiement, transporteurs, places de marché), et développé de nombreux modules sur mesure, côté front-office comme back-office.',
      'En parallèle, j’ai assuré la maintenance évolutive et corrective de plusieurs dizaines de sites : montées de version, interventions en production, optimisation des performances et résolution d’incidents. Ces missions m’ont appris à communiquer avec les clients, à travailler en équipe et à maîtriser l’ensemble du cycle de vie d’un projet web.',
      'Motivé et désireux de poursuivre mon évolution au sein d’une structure dans laquelle je pourrai m’investir durablement, je suis convaincu que votre entreprise constituerait le cadre idéal pour mettre à profit mes compétences tout en continuant d’apprendre.',
      'Je reste à votre entière disposition pour tout renseignement complémentaire et serais heureux d’échanger avec vous lors d’un entretien.',
    ],
    closing: 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
  },
};

export const STUDENT: Persona = {
  name: 'Sacha Lefèvre',
  title: 'Étudiant en Master Marketing digital',
  phone: '07 11 22 33 44',
  email: 'sacha.lefevre@email.fr',
  city: 'Lille (59)',
  address: '3 place de l’Exemple\n59000 Lille',
  linkedin: 'linkedin.com/in/sacha-lefevre',
  github: '',
  profile: 'Recherche une alternance de 12 mois en marketing digital à partir de septembre 2026 (rythme 3 semaines / 1 semaine).',
  education: [
    {
      title: 'Master 1 Marketing digital',
      org: 'École de commerce de Ville',
      dates: '2025 – 2026',
      bullets: ['Cours : stratégie de marque, acquisition, data marketing, e-commerce'],
    },
    { title: 'Licence Économie-Gestion — mention Bien', org: 'Université de Ville', dates: '2022 – 2025' },
    { title: 'Baccalauréat général', org: 'Lycée de Ville', dates: '2022' },
  ],
  achievements: [
    'Campagne réseaux sociaux pour une association : +1 200 abonnés en 3 mois',
    'Étude de marché en équipe de 4 pour une PME locale (projet tutoré, note 17/20)',
    'Création d’un site vitrine WordPress pour un commerce de quartier',
  ],
  experience: [
    {
      title: 'Stage assistant marketing',
      org: 'Entreprise Démo — Lille',
      dates: 'Avr. – Juin 2025',
      bullets: ['Gestion du calendrier éditorial et rédaction de 20 articles de blog', 'Suivi des campagnes e-mailing : taux d’ouverture +15 %'],
    },
    {
      title: 'Vendeur (job étudiant)',
      org: 'Magasin Exemple — Lille',
      dates: 'Étés 2023 et 2024',
      bullets: ['Conseil client, encaissement et mise en rayon'],
    },
  ],
  skills: [],
  tools: ['Canva', 'Meta Business', 'Google Analytics', 'WordPress', 'Excel', 'Notion', 'Mailchimp'],
  languages: [
    { name: 'Anglais', level: 'B2', detail: 'TOEIC 850', score: 4 },
    { name: 'Espagnol', level: 'B1', score: 3 },
  ],
  interests: ['Photographie', 'Handball en club', 'Voyages'],
  letter: { ...GENERALIST.letter },
};

/** Modèle « Organique » : profil fictif (métiers de l'accueil et du vin). */
export const HOSPITALITY: Persona = {
  name: 'Léa Moreau',
  title: 'Chargée de marketing & communication, créatrice de contenus en alternance',
  phone: '06 45 67 89 10',
  email: 'lea.moreau@email.fr',
  city: 'Bordeaux (33)',
  address: '10 rue de l’Exemple\n33000 Bordeaux',
  linkedin: 'linkedin.com/in/lea-moreau',
  github: '',
  profile: 'Passionnée par l’univers du vin et du luxe, je conjugue accueil, conseil et communication digitale pour faire vivre l’expérience client.',
  experience: [
    { title: 'Assistante communication digitale — Mission ponctuelle', org: 'Maison Exemple, Bordeaux', dates: 'Depuis mars 2026' },
    { title: 'Guide œnotourisme — Contrat d’alternance', org: 'Château Exemple, Sauternes', dates: 'Oct. 2025 – sept. 2026' },
    { title: 'Chargée d’œnotourisme (CDI)', org: 'Domaine Modèle, Pessac', dates: 'Janv. 2023 – oct. 2024' },
    { title: 'Sommelière (CDI)', org: 'Restaurant Démo, Bordeaux', dates: 'Janv. 2022 – déc. 2022' },
    { title: 'Sommelière caviste — Contrat d’alternance', org: 'Cave Exemple, Bordeaux', dates: 'Juil. 2020 – sept. 2021' },
  ],
  education: [
    { title: 'Mastère Marketing & management du luxe', org: 'École de Ville, Bordeaux', dates: '2025 – 2027' },
    { title: 'Formation de conseiller en sommellerie', org: 'Organisme de formation, Bordeaux', dates: '2020 – 2021' },
    { title: 'Licence professionnelle Œnotourisme', org: 'Université de Ville', dates: '2019 – 2020' },
    { title: 'BTS Tourisme', org: 'Lycée de Ville', dates: '2015 – 2017' },
  ],
  achievements: [],
  skills: [
    { name: 'Informatique (Canva, Pack Office, CapCut)', level: 4 },
    { name: 'Autonome et rigoureuse', level: 4 },
    { name: 'Proactive et entreprenante', level: 4 },
    { name: 'Capacité d’adaptation', level: 4 },
    { name: 'Maîtrise de la relation client', level: 5 },
    { name: 'Esprit d’équipe', level: 4 },
  ],
  tools: ['Canva', 'Pack Office', 'CapCut'],
  languages: [
    { name: 'Anglais', level: 'C1', score: 4 },
    { name: 'Espagnol', level: 'B2', score: 3 },
  ],
  interests: ['Mode', 'Danse', 'Théâtre', 'Voyage'],
  letter: { ...GENERALIST.letter },
};

/** Lettre classique : coordonnées génériques à remplacer. */
export const LETTER_SAMPLE: Persona = {
  ...DEVELOPER,
  name: 'Prénom NOM',
  phone: '06 12 34 56 78',
  email: 'prenom.nom@email.fr',
  city: 'Ville',
  address: '12 rue de l’Exemple\n33000 Ville',
};

/** Fiche vide (modèle « Vierge » : la page se construit au fil de la saisie). */
export const EMPTY: Persona = {
  name: '', title: '', phone: '', email: '', city: '', address: '', linkedin: '', github: '', profile: '',
  experience: [], education: [], achievements: [], skills: [], tools: [], languages: [], interests: [],
  letter: { recipient: '', subject: '', greeting: '', paragraphs: [], closing: '' },
};

export const clonePersona = (p: Persona): Persona => structuredClone(p);

// ------------------------------------------------------------------ Validation (projets ouverts)

const IMAGE_SRC = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const list = <T>(v: unknown, max: number, f: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : [];
const level = (v: unknown, d = 3) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : d;
};

function entry(v: unknown): Entry | null {
  if (!isObj(v)) return null;
  const e: Entry = { title: str(v.title, 300), org: str(v.org, 300), dates: str(v.dates, 120) };
  if (v.text) e.text = str(v.text);
  const bullets = list(v.bullets, 30, (b) => (typeof b === 'string' ? b.slice(0, 500) : null));
  if (bullets.length) e.bullets = bullets;
  return e;
}

const KINDS: CustomKind[] = ['entries', 'list', 'text'];

function custom(v: unknown): CustomSection | null {
  if (!isObj(v) || !KINDS.includes(v.kind as CustomKind)) return null;
  return {
    id: typeof v.id === 'string' && /^[a-z0-9]{1,24}$/i.test(v.id) ? v.id : newCustomId(),
    title: str(v.title, 80),
    kind: v.kind as CustomKind,
    after: CONTENT_KEYS.includes(v.after as ContentKey) ? (v.after as ContentKey) : 'education',
    entries: list(v.entries, 30, entry),
    items: list(v.items, 40, (x) => (typeof x === 'string' ? x.slice(0, 500) : null)),
    text: str(v.text, 3000),
  };
}

/** Fiche issue d'un fichier ouvert : seuls les champs attendus, en texte, de taille bornée. */
export function sanitizePersona(v: unknown): Persona | null {
  if (!isObj(v)) return null;
  const text = (x: unknown) => (typeof x === 'string' ? x.slice(0, 500) : null);
  const letter = isObj(v.letter) ? v.letter : {};
  return {
    name: str(v.name, 200),
    title: str(v.title, 300),
    photo: typeof v.photo === 'string' && IMAGE_SRC.test(v.photo) ? v.photo : undefined,
    phone: str(v.phone, 60),
    email: str(v.email, 200),
    city: str(v.city, 200),
    address: str(v.address, 500),
    linkedin: str(v.linkedin, 300),
    github: str(v.github, 300),
    profile: str(v.profile, 3000),
    experience: list(v.experience, 30, entry),
    education: list(v.education, 30, entry),
    achievements: list(v.achievements, 40, text),
    skills: list(v.skills, 40, (s) => (isObj(s) ? { name: str(s.name, 300), level: level(s.level) } : null)),
    tools: list(v.tools, 60, text),
    languages: list(v.languages, 20, (l) =>
      isObj(l) ? { name: str(l.name, 100), level: str(l.level, 60), detail: str(l.detail, 200) || undefined, score: level(l.score) } : null,
    ),
    interests: list(v.interests, 30, text),
    labels: isObj(v.labels)
      ? Object.fromEntries(CONTENT_KEYS.filter((k) => typeof (v.labels as Obj)[k] === 'string' && str((v.labels as Obj)[k], 80).trim()).map((k) => [k, str((v.labels as Obj)[k], 80)]))
      : undefined,
    custom: list(v.custom, 20, custom),
    hidden: Array.isArray(v.hidden) ? CONTENT_KEYS.filter((k) => (v.hidden as unknown[]).includes(k)) : undefined,
    letter: {
      recipient: str(letter.recipient, 1000),
      subject: str(letter.subject, 500),
      greeting: str(letter.greeting, 300),
      paragraphs: list(letter.paragraphs, 20, (x) => (typeof x === 'string' ? x.slice(0, 5000) : null)),
      closing: str(letter.closing, 1000),
    },
  };
}
