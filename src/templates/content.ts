// Contenu fictif des modèles (aucune donnée réelle). Les puces suivent les bonnes pratiques :
// verbe d'action + résultat chiffré, expérience la plus récente en premier.
import type { Entry } from './kit';

export interface Persona {
  name: string;
  title: string;
  phone: string;
  email: string;
  city: string;
  linkedin: string;
  github?: string;
  profile: string;
  experience: Entry[];
  education: Entry[];
  skills: string[];
  skillLevels: [string, number][];
  tools: string[];
  languages: [string, number][];
  languagesText: string;
  interests: string[];
  achievements: string[];
}

export const GENERALIST: Persona = {
  name: 'Camille Martin',
  title: 'Responsable de projet digital',
  phone: '06 12 34 56 78',
  email: 'camille.martin@email.fr',
  city: 'Bordeaux (33)',
  linkedin: 'linkedin.com/in/camille-martin',
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
  skills: [
    'Gestion de projet (Agile, Scrum, Kanban)',
    'Pilotage budgétaire et reporting',
    'UX et optimisation des parcours',
    'SEO, SEA et analyse d’audience',
    'Rédaction de cahiers des charges',
  ],
  skillLevels: [
    ['Gestion de projet — expert', 0.95],
    ['Pilotage budgétaire — avancé', 0.8],
    ['UX / parcours client — avancé', 0.75],
    ['SEO / Analytics — confirmé', 0.7],
  ],
  tools: ['Jira', 'Notion', 'Figma', 'Google Analytics', 'Excel', 'WordPress', 'PrestaShop'],
  languages: [
    ['Anglais — C1', 4],
    ['Espagnol — B1', 3],
  ],
  languagesText: 'Anglais : C1 (professionnel)  ·  Espagnol : B1',
  interests: ['Course à pied (semi-marathon)', 'Photographie', 'Bénévolat associatif'],
  achievements: [
    'Boutique en ligne lancée en 4 mois : 1,2 M€ de CA la première année',
    'Réduction de 25 % des coûts de maintenance grâce à la mutualisation des outils',
    'Formation de 30 collaborateurs aux méthodes agiles',
  ],
};

export const DEVELOPER: Persona = {
  name: 'Alex Durand',
  title: 'Développeur full-stack PHP / JavaScript',
  phone: '06 98 76 54 32',
  email: 'alex.durand@email.fr',
  city: 'Lyon (69)',
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
  skills: ['Architecture d’API REST', 'Tests automatisés', 'Performance et sécurité web', 'Revue de code et mentorat'],
  skillLevels: [],
  tools: ['PHP', 'Symfony', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'MySQL', 'PostgreSQL', 'Docker', 'Git', 'CI/CD'],
  languages: [
    ['Anglais — B2', 4],
    ['Allemand — A2', 2],
  ],
  languagesText: 'Anglais : B2 (documentation technique)  ·  Allemand : A2',
  interests: ['Projets open source', 'Escalade', 'Jeux de société'],
  achievements: [
    'Gestion de stock (React, Node.js) : 2 000 utilisateurs',
    'Module e-commerce open source (PHP) : 300 étoiles sur GitHub',
  ],
};

export const STUDENT: Persona = {
  name: 'Sacha Lefèvre',
  title: 'Étudiant en Master Marketing digital',
  phone: '07 11 22 33 44',
  email: 'sacha.lefevre@email.fr',
  city: 'Lille (59)',
  linkedin: 'linkedin.com/in/sacha-lefevre',
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
  skillLevels: [],
  tools: ['Canva', 'Meta Business', 'Google Analytics', 'WordPress', 'Excel', 'Notion', 'Mailchimp'],
  languages: [
    ['Anglais — B2', 4],
    ['Espagnol — B1', 3],
  ],
  languagesText: 'Anglais : B2 (TOEIC 850)  ·  Espagnol : B1',
  interests: ['Photographie', 'Handball en club', 'Voyages'],
};
