import {
  mdiCamera,
  mdiCardsPlaying,
  mdiEmail,
  mdiGithub,
  mdiHandHeart,
  mdiImageFilterHdr,
  mdiLinkedin,
  mdiMapMarker,
  mdiPhone,
  mdiRun,
} from '@mdi/js';
import type { CanvasJSON } from '../editor';
import { DEVELOPER, GENERALIST, STUDENT, type Persona } from './content';
import { Builder, H, W, type Palette } from './kit';

const contacts = (p: Persona): [string, string][] => [
  [mdiPhone, p.phone],
  [mdiEmail, p.email],
  [mdiMapMarker, p.city],
  [mdiLinkedin, p.linkedin],
  ...(p.github ? ([[mdiGithub, p.github]] as [string, string][]) : []),
];
const inlineContacts = (p: Persona) => [p.phone, p.email, p.city, p.linkedin].join('   ·   ');

// ------------------------------------------------------------------ 1. Classique ATS

/** Une colonne, sans photo ni tableau : le format le plus sûr pour les portails de recrutement. */
export function classic(P: Palette): CanvasJSON {
  const b = new Builder(P);
  const p = GENERALIST;
  const M = 50;
  const w = W - 2 * M;
  let y = 46;
  b.group('En-tête');
  y = b.para(p.name.toUpperCase(), M, y, w, { fontWeight: 'bold', fontSize: 24, fill: P.primary, lineHeight: 1 }, 4);
  y = b.para(p.title, M, y, w, { fontSize: 13, fill: P.secondary }, 6);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted }, 10);
  b.line(M, y, M + w, y, P.primary, 1.4);
  y += 14;

  b.flow();
  b.group('Profil');
  y = b.heading('Profil', M, y, w);
  y = b.para(p.profile, M, y, w, {}, 14);
  b.group('Expérience professionnelle');
  y = b.heading('Expérience professionnelle', M, y, w);
  for (const e of p.experience) y = b.entry(e, M, y, w);
  y += 5;
  b.group('Formation');
  y = b.heading('Formation', M, y, w);
  for (const e of p.education) y = b.entry(e, M, y, w, { gap: 6 });
  y += 8;
  b.group('Compétences');
  y = b.heading('Compétences', M, y, w);
  const skills = b.text(`Savoir-faire : ${p.skills.join(', ')}\nOutils : ${p.tools.join(', ')}\nLangues : ${p.languagesText}`, M, y, w, { lineHeight: 1.5 });
  b.boldPrefix(skills, ' :');
  y += skills.height + 14;
  b.group('Centres d’intérêt');
  y = b.heading('Centres d’intérêt', M, y, w);
  y = b.para(p.interests.join('  ·  '), M, y, w);
  b.spread(y, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 2. Hybride

/** Compétences et réalisations avant le parcours : idéal en reconversion ou parcours varié. */
export function hybrid(P: Palette): CanvasJSON {
  const b = new Builder(P);
  const p = GENERALIST;
  const M = 48;
  const w = W - 2 * M;
  let y = 44;
  b.group('En-tête');
  y = b.para(p.name, M, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 25, fill: P.primary, textAlign: 'center', lineHeight: 1 }, 5);
  y = b.para(p.title.toUpperCase(), M, y, w, { fontFamily: 'Montserrat', fontSize: 11, fill: P.secondary, textAlign: 'center' }, 6);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted, textAlign: 'center' }, 10);
  b.rect(W / 2 - 30, y, 60, 2.5, P.secondary);
  y += 18;

  b.flow();
  b.group('Profil');
  y = b.heading('Profil', M, y, w, 'bar');
  y = b.para(p.profile, M, y, w, {}, 14);

  b.group('Compétences clés');
  y = b.heading('Compétences clés', M, y, w, 'bar');
  const colW = (w - 2 * 16) / 3;
  const groups: [string, string[]][] = [
    ['Pilotage', ['Gestion de projet agile', 'Budget et reporting', 'Gestion des risques']],
    ['Digital', ['UX et parcours client', 'SEO / SEA', 'Analyse d’audience']],
    ['Management', ['Équipes de 6 à 10 pers.', 'Animation d’ateliers', 'Formation interne']],
  ];
  let maxY = y;
  groups.forEach(([title, items], i) => {
    const x = M + i * (colW + 16);
    const yy = b.para(title, x, y, colW, { fontWeight: 'bold', fontSize: 10, fill: P.secondary }, 3);
    maxY = Math.max(maxY, b.bullets(items, x, yy, colW));
  });
  y = maxY + 14;

  b.group('Réalisations marquantes');
  y = b.heading('Réalisations marquantes', M, y, w, 'bar');
  y = b.bullets(p.achievements, M, y, w, {}, 14);
  b.group('Expérience professionnelle');
  y = b.heading('Expérience professionnelle', M, y, w, 'bar');
  for (const e of p.experience.slice(0, 2)) y = b.entry(e, M, y, w);
  y += 5;
  b.group('Formation');
  y = b.heading('Formation', M, y, w, 'bar');
  for (const e of p.education) y = b.entry(e, M, y, w, { gap: 6 });
  y += 8;
  b.group('Langues et intérêts');
  y = b.heading('Langues et intérêts', M, y, w, 'bar');
  y = b.para(`${p.languagesText}\n${p.interests.join('  ·  ')}`, M, y, w, { lineHeight: 1.5 });
  b.spread(y, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 3. Chronologique (colonne de dates)

/** Sobre et élégant : les dates dans une colonne étroite, le contenu à droite. */
export function timeline(P: Palette): CanvasJSON {
  const b = new Builder(P);
  const p = GENERALIST;
  const M = 50;
  const w = W - 2 * M;
  const dateW = 96;
  let y = 48;
  b.group('En-tête');
  const name = b.text(p.name, M, y, 300, { fontFamily: 'Arima', fontWeight: 'bold', fontSize: 30, fill: P.primary, lineHeight: 1 });
  b.para(p.title, M, y + name.height + 4, 300, { fontSize: 12, fill: P.secondary });
  b.text([p.phone, p.email, p.city, p.linkedin].join('\n'), W - M - 190, y + 2, 190, { fontSize: 9, fill: P.muted, textAlign: 'right', lineHeight: 1.45 });
  y = 128;
  b.line(M, y, M + w, y, P.secondary, 0.8);
  y += 18;

  const cx = M + dateW;
  const cw = w - dateW;
  // Titre de section sur sa propre ligne, contenu décalé, dates dans la colonne de gauche.
  b.flow();
  const section = (title: string) => {
    b.group(title);
    b.mark();
    const t = b.text(title.toUpperCase(), M, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 9, fill: P.secondary });
    y += t.height + 7;
  };
  section('Profil');
  y = b.para(p.profile, cx, y, cw, {}, 16);
  section('Expérience professionnelle');
  for (const e of p.experience) y = b.entryDated(e, M, y, dateW, w);
  y += 6;
  section('Formation');
  for (const e of p.education) y = b.entryDated(e, M, y, dateW, w, 6);
  y += 10;
  section('Compétences');
  y = b.bullets(p.skills, cx, y, cw, {}, 16);
  const rows: [string, string][] = [
    ['Outils', p.tools.join('  ·  ')],
    ['Langues', p.languagesText],
    ['Intérêts', p.interests.join('  ·  ')],
  ];
  for (const [label, value] of rows) {
    b.text(label, M, y, dateW - 10, { fontSize: 9, fill: P.muted });
    y = b.para(value, cx, y, cw, {}, 7);
  }
  b.spread(y, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 4. Bandeau 2/3 – 1/3

/** En-tête avec photo, parcours à gauche (lu en premier), atouts dans une colonne à droite. */
export async function banner(P: Palette): Promise<CanvasJSON> {
  const b = new Builder(P);
  const p = GENERALIST;
  const headH = 128;
  const sideX = W - 205;
  b.group('Arrière-plan', { locked: true });
  b.rect(0, 0, W, headH, P.primary);
  b.rect(sideX, headH, W - sideX, H - headH, P.panel);
  b.group('En-tête');
  await b.photo(40, 24, 80);
  const name = b.text(p.name.toUpperCase(), 142, 38, 300, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 24, fill: P.onPrimary, lineHeight: 1 });
  b.text(p.title, 142, 38 + name.height + 6, 300, { fontSize: 12.5, fill: P.onPrimarySoft });

  // Colonne principale (2/3)
  const M = 40;
  const w = sideX - M - 26;
  let y = headH + 26;
  b.flow();
  b.group('Profil');
  y = b.heading('Profil', M, y, w);
  y = b.para(p.profile, M, y, w, {}, 14);
  b.group('Expérience');
  y = b.heading('Expérience', M, y, w);
  for (const e of p.experience) y = b.entry(e, M, y, w, { datesRight: false });
  y += 4;
  b.group('Formation');
  y = b.heading('Formation', M, y, w);
  for (const e of p.education) y = b.entry(e, M, y, w, { datesRight: false, gap: 6 });
  b.spread(y, H - 40);

  // Colonne latérale (1/3)
  const sx = sideX + 22;
  const sw = W - sx - 24;
  y = headH + 26;
  b.flow();
  b.group('Contact');
  y = b.heading('Contact', sx, y, sw, 'caps');
  y = b.iconList(contacts(p), sx, y, sw, P.text, P.secondary, 8.5, 6) + 10;
  b.group('Compétences');
  y = b.heading('Compétences', sx, y, sw, 'caps');
  y = b.bars(p.skillLevels, sx, y, sw, P.text, '#dfe3e8', P.secondary) + 6;
  b.group('Langues');
  y = b.heading('Langues', sx, y, sw, 'caps');
  y = b.dots(p.languages, sx, y, sw, P.text, P.secondary, '#d5d9de') + 8;
  b.group('Outils');
  y = b.heading('Outils', sx, y, sw, 'caps');
  y = b.tags(p.tools, sx, y, sw, '#ffffff', P.text, 8) + 6;
  b.group('Centres d’intérêt');
  y = b.heading('Centres d’intérêt', sx, y, sw, 'caps');
  y = b.iconList([[mdiRun, p.interests[0]], [mdiCamera, p.interests[1]], [mdiHandHeart, p.interests[2]]], sx, y, sw, P.text, P.secondary, 8.5, 6);
  b.spread(y, H - 40);
  return b.json();
}

// ------------------------------------------------------------------ 5. Barre latérale (modèle d'origine)

/** Colonne sombre à gauche avec photo et coordonnées, panneaux clairs à droite. */
export async function sidebar(P: Palette): Promise<CanvasJSON> {
  const b = new Builder(P);
  const p = GENERALIST;
  const colX = 31;
  const colW = 219;
  // Fonds communs (verrouillés) ; chaque panneau clair suit sa section.
  b.group('Arrière-plan', { locked: true });
  b.rect(0, 51, W, 82, P.secondary);
  b.poly([{ x: 0, y: 0 }, { x: colW, y: 0 }, { x: colW, y: 405 }, { x: colW / 2, y: 450 }, { x: 0, y: 405 }].map((pt) => ({ x: pt.x + colX, y: pt.y })), P.primary);

  b.group('En-tête');
  b.text(p.name.toUpperCase().replace(' ', '\n'), colX, 60, colW, { fontFamily: 'Montserrat', fontSize: 25, lineHeight: 1.05, textAlign: 'center', fill: P.onPrimary });
  await b.photo(62.5, 135, 156);
  b.iconList(contacts(p).slice(0, 3), 66, 318, 170, P.onPrimary, P.onPrimary, 10, 13);
  b.text(p.title.toUpperCase().replace(' de ', ' DE\n'), 295, 67, 280, { fontFamily: 'Montserrat', fontSize: 21, lineHeight: 1.12, fill: P.onPrimary });

  b.group('Compétences');
  b.rect(279, 148, 285, 262, P.panel);
  let y = b.heading('Compétences', 298, 160, 250, 'big');
  const skills = b.text([...p.skills, `Outils : ${p.tools.slice(0, 4).join(', ')}`].map((i) => `•  ${i}`).join('\n'), 300, y + 2, 250, { lineHeight: 1.4 });
  b.boldPrefix(skills, ' :');
  b.group('Expérience');
  b.rect(279, 421, 285, 304, P.panel);
  y = b.heading('Expérience', 298, 432, 250, 'big');
  for (const e of p.experience.slice(0, 2)) y = b.entry({ ...e, bullets: e.bullets?.slice(0, 2) }, 300, y + 2, 250, { datesRight: false, gap: 6 });
  b.group('Formation');
  b.rect(colX, 464, colW, 261, P.panel);
  y = b.heading('Formation', 50, 478, 190, 'big');
  for (const e of p.education) y = b.entry(e, 52, y + 2, 186, { datesRight: false, gap: 6 });
  b.para(p.languagesText.replace('  ·  ', '\n'), 52, y + 4, 186, { fontSize: 9 });
  b.group('Loisirs');
  b.rect(0, 740, W, 47, P.secondary);
  b.text('LOISIRS', 50, 750, 130, { fontFamily: 'Montserrat', fontSize: 22, fill: P.onPrimary });
  b.text(p.interests.join('  ·  '), 192, 759, 380, { fontSize: 10, fill: P.onPrimary });
  return b.json();
}

// ------------------------------------------------------------------ 6. Tech

/** Pour les métiers techniques : stack en étiquettes, projets mis en avant, liens GitHub. */
export function tech(P: Palette): CanvasJSON {
  const b = new Builder(P);
  const p = DEVELOPER;
  const headH = 92;
  const sideW = 196;
  b.group('Arrière-plan', { locked: true });
  b.rect(0, 0, W, headH, P.primary);
  b.rect(0, headH, sideW, H - headH, P.panel);
  b.group('En-tête');
  const name = b.text(p.name, 32, 26, 400, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 24, fill: P.onPrimary, lineHeight: 1 });
  b.text(p.title, 32, 26 + name.height + 6, 420, { fontFamily: 'Montserrat', fontSize: 11.5, fill: P.onPrimarySoft });

  // Colonne principale (lue en premier)
  const mx = sideW + 26;
  const mw = W - mx - 32;
  let y = headH + 24;
  b.flow();
  b.group('Profil');
  y = b.heading('Profil', mx, y, mw, 'bar');
  y = b.para(p.profile, mx, y, mw, {}, 14);
  b.group('Expérience');
  y = b.heading('Expérience', mx, y, mw, 'bar');
  for (const e of p.experience) y = b.entry(e, mx, y, mw, { datesRight: false });
  y += 4;
  b.group('Projets');
  y = b.heading('Projets', mx, y, mw, 'bar');
  y = b.bullets(p.achievements, mx, y, mw, {}, 14);
  b.group('Formation');
  y = b.heading('Formation', mx, y, mw, 'bar');
  for (const e of p.education) y = b.entry(e, mx, y, mw, { datesRight: false, gap: 6 });
  b.spread(y, H - 40);

  // Colonne latérale
  const sx = 26;
  const sw = sideW - 2 * sx + 6;
  y = headH + 24;
  b.flow();
  b.group('Contact');
  y = b.heading('Contact', sx, y, sw, 'caps');
  y = b.iconList(contacts(p), sx, y, sw, P.text, P.secondary, 8.5, 6) + 10;
  b.group('Stack technique');
  y = b.heading('Stack technique', sx, y, sw, 'caps');
  y = b.tags(p.tools, sx, y, sw, P.secondary, '#ffffff', 8) + 6;
  b.group('Savoir-faire');
  y = b.heading('Savoir-faire', sx, y, sw, 'caps');
  y = b.bullets(p.skills, sx, y, sw, { fontSize: 8.8 }, 14);
  b.group('Langues');
  y = b.heading('Langues', sx, y, sw, 'caps');
  y = b.dots(p.languages, sx, y, sw, P.text, P.secondary, '#d5d9de') + 8;
  b.group('Intérêts');
  y = b.heading('Intérêts', sx, y, sw, 'caps');
  y = b.iconList([[mdiGithub, p.interests[0]], [mdiImageFilterHdr, p.interests[1]], [mdiCardsPlaying, p.interests[2]]], sx, y, sw, P.text, P.secondary, 8.5, 6);
  b.spread(y, H - 40);
  return b.json();
}

// ------------------------------------------------------------------ 7. Junior / étudiant

/** Formation et projets d'abord : pour un premier emploi, un stage ou une alternance. */
export async function junior(P: Palette): Promise<CanvasJSON> {
  const b = new Builder(P);
  const p = STUDENT;
  b.rect(0, 0, 12, H, P.primary);
  const M = 50;
  const w = W - M - 44;
  let y = 44;
  b.group('En-tête');
  await b.photo(W - 44 - 82, 34, 82);
  y = b.para(p.name, M, y, 330, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 25, fill: P.primary, lineHeight: 1 }, 5);
  y = b.para(p.title, M, y, 330, { fontSize: 13, fill: P.secondary }, 4);
  y = b.para(p.profile, M, y, 330, { fontSize: 9.5, fontWeight: 'bold', fill: P.text }, 8);
  y = Math.max(y, 126);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted }, 16);

  b.flow();
  b.group('Formation');
  y = b.heading('Formation', M, y, w);
  for (const e of p.education) y = b.entry(e, M, y, w, { gap: 6 });
  y += 8;
  b.group('Projets');
  y = b.heading('Projets', M, y, w);
  y = b.bullets(p.achievements, M, y, w, {}, 14);
  b.group('Expériences');
  y = b.heading('Expériences', M, y, w);
  for (const e of p.experience) y = b.entry(e, M, y, w);
  y += 4;
  b.group('Compétences et outils');
  y = b.heading('Compétences et outils', M, y, w);
  y = b.tags(p.tools, M, y, w, P.panel, P.text, 8.5) + 8;
  const half = (w - 24) / 2;
  b.group('Langues');
  const y2 = b.heading('Langues', M, y, half);
  b.para(p.languagesText.replace('  ·  ', '\n'), M, y2, half, { lineHeight: 1.5 });
  b.sameRow();
  b.group('Centres d’intérêt');
  const y3 = b.heading('Centres d’intérêt', M + half + 24, y, half);
  const end = b.para(p.interests.join('\n'), M + half + 24, y3, half, { lineHeight: 1.5 });
  b.spread(end, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 8. Lettre de motivation

/** Lettre assortie aux CV : en-tête identique, structure vous / moi / nous. */
export function letter(P: Palette): CanvasJSON {
  const b = new Builder(P);
  const p = GENERALIST;
  const M = 62;
  const w = W - 2 * M;
  let y = 54;
  b.group('En-tête');
  const name = b.text(p.name, M, y, 260, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 20, fill: P.primary, lineHeight: 1 });
  b.text(p.title, M, y + name.height + 4, 260, { fontSize: 11, fill: P.secondary });
  b.text([p.phone, p.email, p.city].join('\n'), W - M - 200, y, 200, { fontSize: 9, fill: P.muted, textAlign: 'right', lineHeight: 1.45 });
  y = 112;
  b.line(M, y, M + w, y, P.secondary, 0.8);
  y += 26;
  b.group('Destinataire et date');
  y = b.para('Société Exemple\nService Recrutement\n12 rue de l’Exemple\n33000 Bordeaux', W - M - 200, y, 200, { lineHeight: 1.4, fontSize: 10 }, 18);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  y = b.para(`Bordeaux, le ${date}`, W - M - 200, y, 200, { fontSize: 10 }, 22);
  b.group(null);
  y = b.para('Objet : candidature au poste de Responsable de projet digital', M, y, w, { fontWeight: 'bold', fontSize: 10.5 }, 18);
  const body = [
    'Madame, Monsieur,',
    'Votre entreprise accélère sa transformation numérique et recherche une personne capable de piloter des projets web à fort enjeu. Cette ambition rejoint pleinement mon parcours et mes motivations.',
    'Depuis huit ans, je conduis des projets digitaux de bout en bout. Chez Société Exemple, j’ai piloté quinze projets par an et augmenté de 32 % le taux de conversion de la boutique en ligne grâce à la refonte du parcours d’achat. J’ai également encadré une équipe de six personnes et introduit les méthodes agiles.',
    'Votre projet de refonte de la plateforme client m’intéresse tout particulièrement : il demande à la fois rigueur dans le pilotage, écoute des équipes métier et sens du résultat, trois qualités que je mets en œuvre au quotidien.',
    'Rejoindre vos équipes me permettrait de mettre cette expérience au service de vos projets, tout en relevant de nouveaux défis. Je serais ravi(e) de vous présenter plus en détail mes réalisations lors d’un entretien.',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
  ];
  b.group('Corps de la lettre');
  for (const para of body) y = b.para(para, M, y, w, { fontSize: 10.5, lineHeight: 1.45, textAlign: 'justify-left' }, 12);
  b.group(null);
  b.para(p.name, W - M - 200, y + 18, 200, { fontSize: 10.5, fontWeight: 'bold', textAlign: 'right' });
  return b.json();
}

// ------------------------------------------------------------------ 9. Lettre classique

/** Lettre au format français traditionnel : coordonnées à gauche, date à droite, texte justifié. */
export function letterClassic(P: Palette): CanvasJSON {
  const b = new Builder(P);
  const M = 72;
  const w = W - 2 * M;
  const body = { fontSize: 10.5, lineHeight: 1.4 };
  let y = 76;
  const sender = b.text('Prénom NOM\n12 rue de l’Exemple\n33000 Ville\n06 12 34 56 78 – prenom.nom@email.fr', M, y, w, body);
  sender.setSelectionStyles({ fontWeight: 'bold' }, 0, 'Prénom NOM'.length);
  y += sender.height + 30;
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  y = b.para(`Ville, le ${date}`, M, y, w, { ...body, textAlign: 'right' }, 24);
  const subject = b.text('Objet : Candidature au poste de Développeur web', M, y, w, body);
  b.boldPrefix(subject, ' :');
  y += subject.height + 18;
  b.group('Corps de la lettre');
  y = b.para('Madame, Monsieur,', M, y, w, { ...body, textAlign: 'center' }, 18);
  const paragraphs = [
    'Actuellement développeur web au sein d’une agence depuis plusieurs années, je souhaite aujourd’hui m’ouvrir à de nouvelles opportunités professionnelles. C’est dans cette optique que je me permets de vous adresser ma candidature afin de mettre l’expérience acquise au service de votre entreprise.',
    'Titulaire d’un diplôme de concepteur développeur d’applications, j’ai poursuivi mon parcours par une licence professionnelle en alternance. Ces formations, associées à mon expérience en agence, m’ont permis d’acquérir de solides bases techniques et de travailler sur des projets variés.',
    'J’ai notamment conçu et réalisé des boutiques en ligne de bout en bout, avec ou sans intégrations tierces (ERP, solutions de paiement, transporteurs, places de marché), et développé de nombreux modules sur mesure, côté front-office comme back-office.',
    'En parallèle, j’ai assuré la maintenance évolutive et corrective de plusieurs dizaines de sites : montées de version, interventions en production, optimisation des performances et résolution d’incidents. Ces missions m’ont appris à communiquer avec les clients, à travailler en équipe et à maîtriser l’ensemble du cycle de vie d’un projet web.',
    'Motivé et désireux de poursuivre mon évolution au sein d’une structure dans laquelle je pourrai m’investir durablement, je suis convaincu que votre entreprise constituerait le cadre idéal pour mettre à profit mes compétences tout en continuant d’apprendre.',
    'Je reste à votre entière disposition pour tout renseignement complémentaire et serais heureux d’échanger avec vous lors d’un entretien.',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
  ];
  for (const para of paragraphs) y = b.para(para, M, y, w, { ...body, textAlign: 'justify-left' }, 13);
  b.group(null);
  b.para('Prénom NOM', M, y + 26, w, { ...body, fontWeight: 'bold', textAlign: 'right' });
  return b.json();
}
