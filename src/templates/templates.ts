import {
  mdiCamera,
  mdiCardsPlaying,
  mdiEmail,
  mdiGithub,
  mdiHandHeart,
  mdiImageFilterHdr,
  mdiEmailOutline,
  mdiLinkedin,
  mdiMapMarker,
  mdiMapMarkerOutline,
  mdiPhone,
  mdiPhoneOutline,
  mdiRun,
} from '@mdi/js';
import { cityName, filled, languagesText, type Persona } from './content';
import { Builder, H, mix, W, type Palette } from './kit';

/** Coordonnées avec icônes (les champs vides sont omis). */
const contacts = (p: Persona): [string, string, string][] => [
  [mdiPhone, p.phone, 'phone'],
  [mdiEmail, p.email, 'email'],
  [mdiMapMarker, p.city, 'city'],
  [mdiLinkedin, p.linkedin, 'linkedin'],
  [mdiGithub, p.github, 'github'],
];
const inlineContacts = (p: Persona) => [p.phone, p.email, p.city, p.linkedin].filter(Boolean).join('   ·   ');
/** Centres d'intérêt avec une icône par position (la série se répète au-delà). */
const interestIcons = (p: Persona, icons: string[]): [string, string, string][] => p.interests.map((t, i) => [icons[i % icons.length], t, `interests.${i}`]);
const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// ------------------------------------------------------------------ 1. Classique ATS

/** Une colonne, sans photo ni tableau : le format le plus sûr pour les portails de recrutement. */
export function classic(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const M = 50;
  const w = W - 2 * M;
  let y = 46;
  b.group('En-tête');
  y = b.para(p.name.toUpperCase(), M, y, w, { fontWeight: 'bold', fontSize: 24, fill: P.primary, lineHeight: 1, field: 'name', codec: 'joined' }, 4);
  y = b.para(p.title, M, y, w, { fontSize: 13, fill: P.secondary, field: 'title' }, 6);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted, field: 'contacts', codec: 'contacts' }, 10);
  b.line(M, y, M + w, y, P.primary, 1.4);
  y += b.g(14);

  b.flow();
  b.group('Profil');
  y = b.heading('Profil', M, y, w);
  y = b.para(p.profile, M, y, w, { field: 'profile' }, 14);
  b.group('Expérience professionnelle');
  y = b.heading('Expérience professionnelle', M, y, w);
  p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
  y += b.g(5);
  b.group('Formation');
  y = b.heading('Formation', M, y, w);
  p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
  y += b.g(8);
  b.group('Compétences');
  y = b.heading('Compétences', M, y, w);
  const rows = [
    filled(p.skills.map((s) => s.name)).length && `Savoir-faire : ${filled(p.skills.map((s) => s.name)).join(', ')}`,
    filled(p.tools).length && `Outils : ${filled(p.tools).join(', ')}`,
    p.languages.some((l) => l.name.trim()) && `Langues : ${languagesText(p)}`,
  ].filter(Boolean);
  const skills = b.text(rows.join('\n'), M, y, w, { lineHeight: 1.5, field: 'skills', codec: 'skillsBlock' });
  b.boldPrefix(skills, ' :');
  y += skills.height + b.g(14);
  b.group('Centres d’intérêt');
  y = b.heading('Centres d’intérêt', M, y, w);
  y = b.para(filled(p.interests).join('  ·  '), M, y, w, { field: 'interests', codec: 'list' });
  b.spread(y, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 2. Hybride

/** Compétences et réalisations avant le parcours : idéal en reconversion ou parcours varié. */
export function hybrid(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const M = 48;
  const w = W - 2 * M;
  let y = 44;
  b.group('En-tête');
  y = b.para(p.name, M, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 25, fill: P.primary, textAlign: 'center', lineHeight: 1, field: 'name' }, 5);
  y = b.para(p.title.toUpperCase(), M, y, w, { fontFamily: 'Montserrat', fontSize: 11, fill: P.secondary, textAlign: 'center', field: 'title', codec: 'joined' }, 6);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted, textAlign: 'center', field: 'contacts', codec: 'contacts' }, 10);
  b.rect(W / 2 - 30, y, 60, 2.5, P.secondary);
  y += b.g(18);

  b.flow();
  b.group('Profil');
  y = b.heading('Profil', M, y, w, 'bar');
  y = b.para(p.profile, M, y, w, { field: 'profile' }, 14);

  // Compétences réparties sur trois colonnes (chaque compétence reste reliée à sa ligne de la fiche).
  if (filled(p.skills.map((s) => s.name)).length) {
    b.group('Compétences clés');
    y = b.heading('Compétences clés', M, y, w, 'bar');
    const colW = (w - 2 * 16) / 3;
    const per = Math.ceil(p.skills.length / 3);
    let maxY = y;
    for (let c = 0; c < 3; c++) {
      let yy = y;
      p.skills.slice(c * per, (c + 1) * per).forEach((s, k) => {
        if (!s.name.trim()) return;
        yy = b.para(`•  ${s.name}`, M + c * (colW + 16), yy, colW, { lineHeight: 1.4, field: `skills.${c * per + k}.name`, codec: 'bullet' });
      });
      maxY = Math.max(maxY, yy);
    }
    y = maxY + b.g(14);
  }

  b.group('Réalisations marquantes');
  y = b.heading('Réalisations marquantes', M, y, w, 'bar');
  y = b.bullets(p.achievements, M, y, w, { field: 'achievements' }, 14);
  b.group('Expérience professionnelle');
  y = b.heading('Expérience professionnelle', M, y, w, 'bar');
  p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
  y += b.g(5);
  b.group('Formation');
  y = b.heading('Formation', M, y, w, 'bar');
  p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
  y += b.g(8);
  b.group('Langues et intérêts');
  y = b.heading('Langues et intérêts', M, y, w, 'bar');
  y = b.para(`${languagesText(p)}\n${filled(p.interests).join('  ·  ')}`, M, y, w, { lineHeight: 1.5, field: 'languages', codec: 'langInterests' });
  b.spread(y, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 3. Chronologique (colonne de dates)

/** Sobre et élégant : les dates dans une colonne étroite, le contenu à droite. */
export function timeline(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const M = 50;
  const w = W - 2 * M;
  const dateW = 96;
  let y = 48;
  b.group('En-tête');
  const name = b.text(p.name, M, y, 300, { fontFamily: 'Arima', fontWeight: 'bold', fontSize: 30, fill: P.primary, lineHeight: 1, field: 'name' });
  b.para(p.title, M, y + name.height + 4, 300, { fontSize: 12, fill: P.secondary, field: 'title' });
  b.text([p.phone, p.email, p.city, p.linkedin].filter(Boolean).join('\n'), W - M - 190, y + 2, 190, { fontSize: 9, fill: P.muted, textAlign: 'right', lineHeight: 1.45, field: 'contacts', codec: 'contacts' });
  y = 128;
  b.line(M, y, M + w, y, P.secondary, 0.8);
  y += b.g(18);

  const cx = M + dateW;
  const cw = w - dateW;
  // Titre de section sur sa propre ligne, contenu décalé, dates dans la colonne de gauche.
  b.flow();
  const section = (title: string) => {
    b.group(title);
    b.mark();
    const t = b.text(title.toUpperCase(), M, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 9, fill: P.secondary });
    y += t.height + b.g(7);
  };
  section('Profil');
  y = b.para(p.profile, cx, y, cw, { field: 'profile' }, 16);
  section('Expérience professionnelle');
  p.experience.forEach((e, i) => (y = b.entryDated(e, M, y, dateW, w, 9, `experience.${i}`)));
  y += b.g(6);
  section('Formation');
  p.education.forEach((e, i) => (y = b.entryDated(e, M, y, dateW, w, 6, `education.${i}`)));
  y += b.g(10);
  section('Compétences');
  y = b.bullets(filled(p.skills.map((s) => s.name)), cx, y, cw, { field: 'skills', codec: 'skillNames' }, 16);
  const rows: [string, string, string, string][] = [
    ['Outils', filled(p.tools).join('  ·  '), 'tools', 'list'],
    ['Langues', languagesText(p), 'languages', 'languages'],
    ['Intérêts', filled(p.interests).join('  ·  '), 'interests', 'list'],
  ];
  for (const [label, value, field, codec] of rows) {
    if (!value) continue;
    b.text(label, M, y, dateW - 10, { fontSize: 9, fill: P.muted });
    y = b.para(value, cx, y, cw, { field, codec }, 7);
  }
  b.spread(y, H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 4. Bandeau 2/3 – 1/3

/** En-tête avec photo, parcours à gauche (lu en premier), atouts dans une colonne à droite. */
export async function banner(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const headH = 128;
  const sideX = W - 205;
  b.group('Arrière-plan', { locked: true });
  b.rect(0, 0, W, headH, P.primary);
  b.rect(sideX, headH, W - sideX, H - headH, P.panel);
  b.group('En-tête');
  await b.photo(40, 24, 80);
  const name = b.text(p.name.toUpperCase(), 142, 38, 300, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 24, fill: P.onPrimary, lineHeight: 1, field: 'name', codec: 'joined' });
  b.text(p.title, 142, 38 + name.height + 6, 300, { fontSize: 12.5, fill: P.onPrimarySoft, field: 'title' });

  // Colonne principale (2/3)
  const M = 40;
  const w = sideX - M - 26;
  let y = headH + 26;
  b.flow();
  b.group('Profil');
  y = b.heading('Profil', M, y, w);
  y = b.para(p.profile, M, y, w, { field: 'profile' }, 14);
  b.group('Expérience');
  y = b.heading('Expérience', M, y, w);
  p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { datesRight: false, path: `experience.${i}` })));
  y += b.g(4);
  b.group('Formation');
  y = b.heading('Formation', M, y, w);
  p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { datesRight: false, gap: 6, path: `education.${i}` })));
  b.spread(y, H - 40);

  // Colonne latérale (1/3)
  const sx = sideX + 22;
  const sw = W - sx - 24;
  y = headH + 26;
  b.flow();
  b.group('Contact');
  y = b.heading('Contact', sx, y, sw, 'caps');
  y = b.iconList(contacts(p), sx, y, sw, P.text, P.secondary, 8.5, 6) + b.g(10);
  if (filled(p.skills.map((s) => s.name)).length) {
    b.group('Compétences');
    y = b.heading('Compétences', sx, y, sw, 'caps');
    y = b.bars(p.skills, sx, y, sw, P.text, '#dfe3e8', P.secondary) + b.g(6);
  }
  if (p.languages.some((l) => l.name.trim())) {
    b.group('Langues');
    y = b.heading('Langues', sx, y, sw, 'caps');
    y = b.dots(p.languages, sx, y, sw, P.text, P.secondary, '#d5d9de') + b.g(8);
  }
  if (filled(p.tools).length) {
    b.group('Outils');
    y = b.heading('Outils', sx, y, sw, 'caps');
    y = b.tags(p.tools, sx, y, sw, '#ffffff', P.text, 8, 'tools') + b.g(6);
  }
  if (filled(p.interests).length) {
    b.group('Centres d’intérêt');
    y = b.heading('Centres d’intérêt', sx, y, sw, 'caps');
    y = b.iconList(interestIcons(p, [mdiRun, mdiCamera, mdiHandHeart]), sx, y, sw, P.text, P.secondary, 8.5, 6);
  }
  b.spread(y, H - 40);
  return b.json();
}

// ------------------------------------------------------------------ 5. Barre latérale (modèle d'origine)

/** Colonne sombre à gauche avec photo et coordonnées, panneaux clairs à droite. */
export async function sidebar(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const colX = 31;
  const colW = 219;
  // Fonds communs (verrouillés) ; chaque panneau clair suit sa section.
  b.group('Arrière-plan', { locked: true });
  b.rect(0, 51, W, 82, P.secondary);
  b.poly([{ x: 0, y: 0 }, { x: colW, y: 0 }, { x: colW, y: 405 }, { x: colW / 2, y: 450 }, { x: 0, y: 405 }].map((pt) => ({ x: pt.x + colX, y: pt.y })), P.primary);

  b.group('En-tête');
  b.text(p.name.toUpperCase().replace(' ', '\n'), colX, 60, colW, { fontFamily: 'Montserrat', fontSize: 25, lineHeight: 1.05, textAlign: 'center', fill: P.onPrimary, field: 'name', codec: 'joined' });
  await b.photo(62.5, 135, 156);
  const contactEnd = b.iconList(contacts(p).slice(0, 3), 66, 318, 170, P.onPrimary, P.onPrimary, 10, 13);
  b.check(contactEnd, 405, 'Coordonnées');
  b.text(p.title.toUpperCase().replace(' de ', ' DE\n'), 295, 67, 280, { fontFamily: 'Montserrat', fontSize: 21, lineHeight: 1.12, fill: P.onPrimary, field: 'title', codec: 'joined' });

  // Panneaux de taille fixe : chaque section est vérifiée par rapport au bas de son panneau.
  b.group('Compétences');
  b.rect(279, 148, 285, 262, P.panel);
  let y = b.heading('Compétences', 298, 160, 250, 'big');
  const items = [...filled(p.skills.map((s) => s.name)), ...(filled(p.tools).length ? [`Outils : ${filled(p.tools).slice(0, 4).join(', ')}`] : [])];
  const skills = b.text(items.map((i) => `•  ${i}`).join('\n'), 300, y + 2, 250, { lineHeight: 1.4, field: 'skills', codec: 'skillsTools' });
  b.boldPrefix(skills, ' :');
  b.check(y + 2 + skills.height, 400);
  b.group('Expérience');
  b.rect(279, 421, 285, 304, P.panel);
  y = b.heading('Expérience', 298, 432, 250, 'big');
  p.experience.forEach((e, i) => (y = b.entry(e, 300, y + 2, 250, { datesRight: false, gap: 6, path: `experience.${i}` })));
  b.check(y, 725);
  b.group('Formation');
  b.rect(colX, 464, colW, 261, P.panel);
  y = b.heading('Formation', 50, 478, 190, 'big');
  p.education.forEach((e, i) => (y = b.entry(e, 52, y + 2, 186, { datesRight: false, gap: 6, path: `education.${i}` })));
  if (p.languages.some((l) => l.name.trim())) y = b.para(languagesText(p).replace(/  ·  /g, '\n'), 52, y + 4, 186, { fontSize: 9, field: 'languages', codec: 'languages' });
  b.check(y, 725);
  b.group('Loisirs');
  b.rect(0, 740, W, 47, P.secondary);
  b.text('LOISIRS', 50, 750, 130, { fontFamily: 'Montserrat', fontSize: 22, fill: P.onPrimary });
  const fun = b.text(filled(p.interests).join('  ·  '), 192, 759, 380, { fontSize: 10, fill: P.onPrimary, field: 'interests', codec: 'list' });
  b.check(759 + fun.height, 787);
  return b.json();
}

// ------------------------------------------------------------------ 6. Tech

/** Pour les métiers techniques : stack en étiquettes, projets mis en avant, liens GitHub. */
export function tech(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const headH = 92;
  const sideW = 196;
  b.group('Arrière-plan', { locked: true });
  b.rect(0, 0, W, headH, P.primary);
  b.rect(0, headH, sideW, H - headH, P.panel);
  b.group('En-tête');
  const name = b.text(p.name, 32, 26, 400, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 24, fill: P.onPrimary, lineHeight: 1, field: 'name' });
  b.text(p.title, 32, 26 + name.height + 6, 420, { fontFamily: 'Montserrat', fontSize: 11.5, fill: P.onPrimarySoft, field: 'title' });

  // Colonne principale (lue en premier)
  const mx = sideW + 26;
  const mw = W - mx - 32;
  let y = headH + 24;
  b.flow();
  b.group('Profil');
  y = b.heading('Profil', mx, y, mw, 'bar');
  y = b.para(p.profile, mx, y, mw, { field: 'profile' }, 14);
  b.group('Expérience');
  y = b.heading('Expérience', mx, y, mw, 'bar');
  p.experience.forEach((e, i) => (y = b.entry(e, mx, y, mw, { datesRight: false, path: `experience.${i}` })));
  y += b.g(4);
  if (filled(p.achievements).length) {
    b.group('Projets');
    y = b.heading('Projets', mx, y, mw, 'bar');
    y = b.bullets(p.achievements, mx, y, mw, { field: 'achievements' }, 14);
  }
  b.group('Formation');
  y = b.heading('Formation', mx, y, mw, 'bar');
  p.education.forEach((e, i) => (y = b.entry(e, mx, y, mw, { datesRight: false, gap: 6, path: `education.${i}` })));
  b.spread(y, H - 40);

  // Colonne latérale
  const sx = 26;
  const sw = sideW - 2 * sx + 6;
  y = headH + 24;
  b.flow();
  b.group('Contact');
  y = b.heading('Contact', sx, y, sw, 'caps');
  y = b.iconList(contacts(p), sx, y, sw, P.text, P.secondary, 8.5, 6) + b.g(10);
  if (filled(p.tools).length) {
    b.group('Stack technique');
    y = b.heading('Stack technique', sx, y, sw, 'caps');
    y = b.tags(p.tools, sx, y, sw, P.secondary, '#ffffff', 8, 'tools') + b.g(6);
  }
  if (filled(p.skills.map((s) => s.name)).length) {
    b.group('Savoir-faire');
    y = b.heading('Savoir-faire', sx, y, sw, 'caps');
    y = b.bullets(filled(p.skills.map((s) => s.name)), sx, y, sw, { fontSize: 8.8, field: 'skills', codec: 'skillNames' }, 14);
  }
  if (p.languages.some((l) => l.name.trim())) {
    b.group('Langues');
    y = b.heading('Langues', sx, y, sw, 'caps');
    y = b.dots(p.languages, sx, y, sw, P.text, P.secondary, '#d5d9de') + b.g(8);
  }
  if (filled(p.interests).length) {
    b.group('Intérêts');
    y = b.heading('Intérêts', sx, y, sw, 'caps');
    y = b.iconList(interestIcons(p, [mdiGithub, mdiImageFilterHdr, mdiCardsPlaying]), sx, y, sw, P.text, P.secondary, 8.5, 6);
  }
  b.spread(y, H - 40);
  return b.json();
}

// ------------------------------------------------------------------ 7. Junior / étudiant

/** Formation et projets d'abord : pour un premier emploi, un stage ou une alternance. */
export async function junior(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  b.rect(0, 0, 12, H, P.primary);
  const M = 50;
  const w = W - M - 44;
  let y = 44;
  b.group('En-tête');
  await b.photo(W - 44 - 82, 34, 82);
  y = b.para(p.name, M, y, 330, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 25, fill: P.primary, lineHeight: 1, field: 'name' }, 5);
  y = b.para(p.title, M, y, 330, { fontSize: 13, fill: P.secondary, field: 'title' }, 4);
  y = b.para(p.profile, M, y, 330, { fontSize: 9.5, fontWeight: 'bold', fill: P.text, field: 'profile' }, 8);
  y = Math.max(y, 126);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted, field: 'contacts', codec: 'contacts' }, 16);

  b.flow();
  b.group('Formation');
  y = b.heading('Formation', M, y, w);
  p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
  y += b.g(8);
  if (filled(p.achievements).length) {
    b.group('Projets');
    y = b.heading('Projets', M, y, w);
    y = b.bullets(p.achievements, M, y, w, { field: 'achievements' }, 14);
  }
  b.group('Expériences');
  y = b.heading('Expériences', M, y, w);
  p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
  y += b.g(4);
  if (filled(p.tools).length) {
    b.group('Compétences et outils');
    y = b.heading('Compétences et outils', M, y, w);
    y = b.tags(p.tools, M, y, w, P.panel, P.text, 8.5, 'tools') + b.g(8);
  }
  const half = (w - 24) / 2;
  b.group('Langues');
  const y2 = b.heading('Langues', M, y, half);
  const langEnd = b.para(languagesText(p).replace(/  ·  /g, '\n'), M, y2, half, { lineHeight: 1.5, field: 'languages', codec: 'languages' });
  b.sameRow();
  b.group('Centres d’intérêt');
  const y3 = b.heading('Centres d’intérêt', M + half + 24, y, half);
  const end = b.para(filled(p.interests).join('\n'), M + half + 24, y3, half, { lineHeight: 1.5, field: 'interests', codec: 'list' });
  b.spread(Math.max(end, langEnd), H - 50);
  return b.json();
}

// ------------------------------------------------------------------ 8. Lettre de motivation

/** Lettre assortie aux CV : en-tête identique, structure vous / moi / nous. */
export function letter(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const L = p.letter;
  const M = 62;
  const w = W - 2 * M;
  let y = 54;
  b.group('En-tête');
  const name = b.text(p.name, M, y, 260, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 20, fill: P.primary, lineHeight: 1, field: 'name' });
  b.text(p.title, M, y + name.height + 4, 260, { fontSize: 11, fill: P.secondary, field: 'title' });
  b.text([p.phone, p.email, p.city].filter(Boolean).join('\n'), W - M - 200, y, 200, { fontSize: 9, fill: P.muted, textAlign: 'right', lineHeight: 1.45, field: 'contacts', codec: 'contacts' });
  y = 112;
  b.line(M, y, M + w, y, P.secondary, 0.8);
  y += b.g(26);
  b.group('Destinataire et date');
  if (L.recipient) y = b.para(L.recipient, W - M - 200, y, 200, { lineHeight: 1.4, fontSize: 10, field: 'letter.recipient' }, 18);
  y = b.para(`${cityName(p.city)}, le ${today()}`, W - M - 200, y, 200, { fontSize: 10, field: 'city', codec: 'dateCity' }, 22);
  b.group(null);
  y = b.para(`Objet : ${L.subject}`, M, y, w, { fontWeight: 'bold', fontSize: 10.5, field: 'letter.subject', codec: 'subject' }, 18);
  b.group('Corps de la lettre');
  const body = { fontSize: 10.5, lineHeight: 1.45, textAlign: 'justify-left' as const };
  if (L.greeting) y = b.para(L.greeting, M, y, w, { ...body, field: 'letter.greeting' }, 12);
  L.paragraphs.forEach((t, i) => (y = b.para(t, M, y, w, { ...body, field: `letter.paragraphs.${i}` }, 12)));
  if (L.closing) y = b.para(L.closing, M, y, w, { ...body, field: 'letter.closing' }, 12);
  b.group(null);
  y = b.para(p.name, W - M - 200, y + b.g(18), 200, { fontSize: 10.5, fontWeight: 'bold', textAlign: 'right', field: 'name' });
  b.check(y, H - 40, 'Corps de la lettre');
  return b.json();
}

// ------------------------------------------------------------------ 9. Lettre classique

/** Lettre au format français traditionnel : coordonnées à gauche, date à droite, texte justifié. */
export function letterClassic(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const L = p.letter;
  const M = 72;
  const w = W - 2 * M;
  const body = { fontSize: 10.5, lineHeight: 1.4 };
  let y = 76;
  const contact = [p.phone, p.email].filter(Boolean).join(' – ');
  const sender = b.text([p.name, p.address, contact].filter(Boolean).join('\n'), M, y, w, { ...body, field: 'sender', codec: 'sender' });
  sender.setSelectionStyles({ fontWeight: 'bold' }, 0, p.name.length);
  y += sender.height + b.g(30);
  y = b.para(`${cityName(p.city)}, le ${today()}`, M, y, w, { ...body, textAlign: 'right', field: 'city', codec: 'dateCity' }, 24);
  const subject = b.text(`Objet : ${L.subject}`, M, y, w, { ...body, field: 'letter.subject', codec: 'subject' });
  b.boldPrefix(subject, ' :');
  y += subject.height + b.g(18);
  b.group('Corps de la lettre');
  if (L.greeting) y = b.para(L.greeting, M, y, w, { ...body, textAlign: 'center', field: 'letter.greeting' }, 18);
  L.paragraphs.forEach((t, i) => (y = b.para(t, M, y, w, { ...body, textAlign: 'justify-left', field: `letter.paragraphs.${i}` }, 13)));
  if (L.closing) y = b.para(L.closing, M, y, w, { ...body, textAlign: 'justify-left', field: 'letter.closing' }, 13);
  b.group(null);
  y = b.para(p.name, M, y + b.g(26), w, { ...body, fontWeight: 'bold', textAlign: 'right', field: 'name' });
  b.check(y, H - 40, 'Corps de la lettre');
  return b.json();
}

// ------------------------------------------------------------------ 10. Organique

/** Repère du dessin d'origine (910 px de large) converti en points. */
const u = (v: number) => (v * W) / 910;

/**
 * Formes douces et tons sable : grand bandeau arrondi, photo ronde sur un disque blanc,
 * colonne de gauche ondulée (coordonnées, compétences, loisirs), parcours centré à droite.
 */
export async function organic(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  // Teintes claires dérivées de la palette : le texte foncé reste lisible avec toutes les palettes.
  const sand = mix(P.secondary, '#ffffff', 0.42);
  const greige = mix(mix(P.secondary, P.muted, 0.4), '#ffffff', 0.6);
  const ink = P.primary;
  const pts = (d: string) => d.replace(/-?\d+(\.\d+)?/g, (n) => String(Math.round(u(Number(n)) * 100) / 100));

  b.group('Arrière-plan', { locked: true });
  b.path(pts('M0 0 H910 V250 C780 300 600 345 420 335 C380 333 350 325 330 315 L300 100 C200 80 100 85 0 100 Z'), sand);
  b.path(pts('M0 222 C90 215 200 245 270 330 C335 410 360 540 368 690 C378 850 380 960 345 1060 C318 1140 290 1215 268 1287 L0 1287 Z'), greige);
  // Disque blanc derrière la photo : la photo y est centrée, avec une bordure blanche régulière.
  const disc = { x: u(205), y: u(205), r: u(180) };
  const photo = u(300);
  b.circle(disc.x, disc.y, disc.r, '#ffffff');

  // En-tête : photo, nom sur deux lignes, intitulé
  b.group('En-tête');
  await b.photo(disc.x - photo / 2, disc.y - photo / 2, photo);
  const [first, ...rest] = p.name.trim().split(/\s+/);
  const name = b.text([first, rest.join(' ')].filter(Boolean).join('\n'), u(410), u(58), 315, { fontFamily: 'DM Serif Display', fontSize: 56, lineHeight: 0.96, fill: ink, field: 'name', codec: 'joined' });
  const title = b.text(p.title, u(405), u(58) + name.height + 14, 300, { fontFamily: 'Poppins', fontSize: 13, lineHeight: 1.1, fill: ink, field: 'title' });

  // Colonne de gauche : contenu centré sur la bande ondulée
  const cx = u(160);
  const cw = 184;
  const center = { fontFamily: 'Poppins', fontSize: 10, lineHeight: 1.35, fill: P.text, textAlign: 'center' as const };
  let y = disc.y + disc.r + 10;
  b.flow();
  b.group('Coordonnées');
  const address = p.address.trim() || p.city;
  const contactItems: [string, string, string][] = [
    [mdiPhoneOutline, p.phone, 'phone'],
    [mdiEmailOutline, p.email, 'email'],
    [mdiMapMarkerOutline, address, p.address.trim() ? 'address' : 'city'],
  ];
  for (const [d, str, field] of contactItems) {
    if (!str) continue;
    b.icon(d, cx - 8, y, 16, ink);
    y += b.g(20);
    const t = b.text(str, cx - cw / 2, y, cw, { ...center, field });
    y += t.height + b.g(12);
  }
  const dot = () => {
    b.circle(cx, y + 5, 5, '#ffffff');
    y += b.g(22);
  };
  const leftHeading = (str: string, centered = false) => {
    b.mark();
    const t = b.text(str, centered ? cx - cw / 2 : u(55), y, cw, { fontFamily: 'DM Serif Display', fontSize: 12.5, fill: ink, textAlign: centered ? 'center' : 'left' });
    y += t.height + b.g(9);
  };
  const skills = filled(p.skills.map((s) => s.name));
  const langs = p.languages.filter((l) => l.name.trim());
  if (skills.length || langs.length) {
    dot();
    b.group('Compétences & qualités');
    leftHeading('Compétences & qualités');
    const list = { fontFamily: 'Poppins', fontSize: 10.3, lineHeight: 1.55, fill: P.text };
    if (skills.length) y = b.bullets(skills, u(55), y, 180, { ...list, field: 'skills', codec: 'skillNames' });
    // Les langues suivent les compétences avec le même interligne (deux textes, une seule liste à l'œil).
    if (skills.length && langs.length) y += list.fontSize * (list.lineHeight - 1.13);
    if (langs.length) y = b.bullets(langs.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)), u(55), y, 180, { ...list, field: 'languages', codec: 'languages' });
    y += b.g(10);
  }
  const fun = filled(p.interests);
  if (fun.length) {
    dot();
    b.group('Loisirs');
    leftHeading('Loisirs', true);
    y = b.para(fun.join(', '), cx - cw / 2, y, cw, { ...center, field: 'interests', codec: 'commaList' });
  }
  b.spread(y, H - 24, 18);

  // Colonne de droite : parcours centré
  const rx = u(400);
  const rw = W - rx - 16;
  const body = { fontFamily: 'Poppins', fontSize: 10, lineHeight: 1.3, fill: P.text, textAlign: 'center' as const };
  y = Math.max(u(398), title.top + title.height + 40);
  b.flow();
  const heading = (str: string) => {
    b.mark();
    const t = b.text(str, u(440), y, rw, { fontFamily: 'Poppins', fontSize: 17, fill: ink });
    y += t.height + b.g(10);
  };
  const entryTitle = (str: string, field: string) => {
    const t = b.text(str, rx, y, rw, { fontFamily: 'DM Serif Display', fontSize: 10, lineHeight: 1.15, fill: P.text, textAlign: 'center', field });
    y += t.height + 2;
  };
  if (p.experience.length) {
    b.group('Expériences');
    heading('Expériences');
    p.experience.forEach((e, i) => {
      const path = `experience.${i}`;
      entryTitle(e.title, `${path}.title`);
      if (e.org) y = b.para(e.org, rx, y, rw, { ...body, field: `${path}.org` });
      if (e.dates) y = b.para(e.dates, rx, y, rw, { ...body, field: `${path}.dates` });
      if (e.text) y = b.para(e.text, rx, y + 2, rw, { ...body, fontSize: 9.2, fill: P.muted, field: `${path}.text` });
      if (e.bullets?.length) y = b.bullets(e.bullets, rx, y + 2, rw, { ...body, fontSize: 9.2, lineHeight: 1.35, fill: P.muted, field: `${path}.bullets` });
      y += b.g(15);
    });
  }
  if (p.education.length) {
    y += b.g(4);
    b.group('Formations');
    heading('Formations');
    p.education.forEach((e, i) => {
      const path = `education.${i}`;
      entryTitle(e.title, `${path}.title`);
      const line = [e.org, e.dates].filter(Boolean).join(', ');
      if (line) y = b.para(line, rx, y, rw, { ...body, field: e.org && e.dates ? path : `${path}.${e.org ? 'org' : 'dates'}`, codec: e.org && e.dates ? 'orgDatesComma' : 'text' });
      y += b.g(9);
    });
  }
  b.spread(y, H - 20, 12);
  return b.json();
}
