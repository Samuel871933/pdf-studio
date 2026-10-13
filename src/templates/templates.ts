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
import { cityName, filled, hasContent, languagesText, type ContentKey, type Entry, type Persona } from './content';
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
  const extra = { x: M, w, heading: (t: string, yy: number) => b.heading(t, M, yy, w), gap: 14 };
  if (b.has('profile')) {
    y = b.heading(b.section('profile', 'Profil'), M, y, w);
    y = b.para(p.profile, M, y, w, { field: 'profile' }, 14);
  }
  y = b.customs('profile', y, extra);
  if (b.has('experience')) {
    y = b.heading(b.section('experience', 'Expérience professionnelle'), M, y, w);
    p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
    y += b.g(5);
  }
  y = b.customs('experience', y, extra);
  y = b.customs('achievements', y, extra);
  if (b.has('education')) {
    y = b.heading(b.section('education', 'Formation'), M, y, w);
    p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
    y += b.g(8);
  }
  y = b.customs('education', y, extra);
  const rows = [
    filled(p.skills.map((s) => s.name)).length && `Savoir-faire : ${filled(p.skills.map((s) => s.name)).join(', ')}`,
    filled(p.tools).length && `Outils : ${filled(p.tools).join(', ')}`,
    p.languages.some((l) => l.name.trim()) && `Langues : ${languagesText(p)}`,
  ].filter(Boolean);
  // Une ligne par partie affichée : le codec ne relit que les lignes présentes (une section masquée reste intacte).
  if (rows.length) {
    y = b.heading(b.section('skills', 'Compétences'), M, y, w);
    const skills = b.text(rows.join('\n'), M, y, w, { lineHeight: 1.5, field: 'skills', codec: 'skillsBlock' });
    b.boldPrefix(skills, ' :');
    y += skills.height + b.g(14);
  }
  for (const k of ['skills', 'tools', 'languages'] as const) y = b.customs(k, y, extra);
  if (b.has('interests')) {
    y = b.heading(b.section('interests', 'Centres d’intérêt'), M, y, w);
    y = b.para(filled(p.interests).join('  ·  '), M, y, w, { field: 'interests', codec: 'list' });
  }
  y = b.customs('interests', y, { ...extra, lead: 14, gap: 0 });
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
  const extra = { x: M, w, heading: (t: string, yy: number) => b.heading(t, M, yy, w, 'bar'), gap: 14 };
  if (b.has('profile')) {
    y = b.heading(b.section('profile', 'Profil'), M, y, w, 'bar');
    y = b.para(p.profile, M, y, w, { field: 'profile' }, 14);
  }
  y = b.customs('profile', y, extra);

  // Compétences réparties sur trois colonnes (chaque compétence reste reliée à sa ligne de la fiche).
  if (filled(p.skills.map((s) => s.name)).length) {
    y = b.heading(b.section('skills', 'Compétences clés'), M, y, w, 'bar');
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
  y = b.customs('skills', y, extra);

  if (b.has('achievements')) {
    y = b.heading(b.section('achievements', 'Réalisations marquantes'), M, y, w, 'bar');
    y = b.bullets(p.achievements, M, y, w, { field: 'achievements' }, 14);
  }
  y = b.customs('achievements', y, extra);
  if (b.has('experience')) {
    y = b.heading(b.section('experience', 'Expérience professionnelle'), M, y, w, 'bar');
    p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
    y += b.g(5);
  }
  y = b.customs('experience', y, extra);
  if (b.has('education')) {
    y = b.heading(b.section('education', 'Formation'), M, y, w, 'bar');
    p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
    y += b.g(8);
  }
  y = b.customs('education', y, extra);
  // Langues et intérêts sur deux lignes d'un même texte ; une seule partie affichée : son propre champ
  // (sinon modifier la ligne effacerait la section masquée).
  const langs = b.has('languages');
  const fun = b.has('interests');
  if (langs || fun) {
    y = b.heading(langs ? b.section('languages', fun ? 'Langues et intérêts' : 'Langues') : b.section('interests', 'Centres d’intérêt'), M, y, w, 'bar');
    if (langs && fun) y = b.para(`${languagesText(p)}\n${filled(p.interests).join('  ·  ')}`, M, y, w, { lineHeight: 1.5, field: 'languages', codec: 'langInterests' });
    else if (langs) y = b.para(languagesText(p), M, y, w, { lineHeight: 1.5, field: 'languages', codec: 'languages' });
    else y = b.para(filled(p.interests).join('  ·  '), M, y, w, { lineHeight: 1.5, field: 'interests', codec: 'list' });
  }
  for (const k of ['languages', 'interests'] as const) y = b.customs(k, y, { ...extra, lead: 14, gap: 0 });
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
  const heading = (title: string) => {
    b.mark();
    const t = b.text(title.toUpperCase(), M, y, w, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 9, fill: P.secondary, heading: 2 });
    y += t.height + b.g(7);
  };
  const section = (key: ContentKey, fallback: string) => heading(b.section(key, fallback));
  const extra = {
    x: cx, w: cw, gap: 12,
    heading: (t: string, yy: number) => ((y = yy), heading(t), y),
    entry: (e: Entry, yy: number, path: string) => b.entryDated(e, M, yy, dateW, w, 9, path),
  };
  if (b.has('profile')) {
    section('profile', 'Profil');
    y = b.para(p.profile, cx, y, cw, { field: 'profile' }, 16);
  }
  y = b.customs('profile', y, extra);
  if (b.has('experience')) {
    section('experience', 'Expérience professionnelle');
    p.experience.forEach((e, i) => (y = b.entryDated(e, M, y, dateW, w, 9, `experience.${i}`)));
    y += b.g(6);
  }
  y = b.customs('experience', y, extra);
  y = b.customs('achievements', y, extra);
  if (b.has('education')) {
    section('education', 'Formation');
    p.education.forEach((e, i) => (y = b.entryDated(e, M, y, dateW, w, 6, `education.${i}`)));
    y += b.g(10);
  }
  y = b.customs('education', y, extra);
  // Les lignes Outils / Langues / Intérêts sont rangées sous « Compétences ».
  if (['skills', 'tools', 'languages', 'interests'].some((k) => b.has(k as ContentKey))) section('skills', 'Compétences');
  if (b.has('skills')) y = b.bullets(filled(p.skills.map((s) => s.name)), cx, y, cw, { field: 'skills', codec: 'skillNames' }, 16);
  const rows: [ContentKey, string, string, string][] = [
    ['tools', 'Outils', filled(p.tools).join('  ·  '), 'list'],
    ['languages', 'Langues', languagesText(p), 'languages'],
    ['interests', 'Intérêts', filled(p.interests).join('  ·  '), 'list'],
  ];
  for (const [field, label, value, codec] of rows) {
    if (!value) continue;
    b.text(b.label(field, label), M, y, dateW - 10, { fontSize: 9, fill: P.muted, heading: 3 });
    y = b.para(value, cx, y, cw, { field, codec }, 7);
  }
  for (const k of ['skills', 'tools', 'languages', 'interests'] as const) y = b.customs(k, y, { ...extra, lead: 9, gap: 0 });
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
  const main = { x: M, w, heading: (t: string, yy: number) => b.heading(t, M, yy, w), entryOpts: { datesRight: false }, gap: 12 };
  if (b.has('profile')) {
    y = b.heading(b.section('profile', 'Profil'), M, y, w);
    y = b.para(p.profile, M, y, w, { field: 'profile' }, 14);
  }
  y = b.customs('profile', y, main);
  if (b.has('experience')) {
    y = b.heading(b.section('experience', 'Expérience'), M, y, w);
    p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { datesRight: false, path: `experience.${i}` })));
    y += b.g(4);
  }
  y = b.customs('experience', y, main);
  y = b.customs('achievements', y, main);
  if (b.has('education')) {
    y = b.heading(b.section('education', 'Formation'), M, y, w);
    p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { datesRight: false, gap: 6, path: `education.${i}` })));
  }
  y = b.customs('education', y, { ...main, lead: 6, gap: 0 });
  b.spread(y, H - 40);

  // Colonne latérale (1/3)
  const sx = sideX + 22;
  const sw = W - sx - 24;
  const side = { x: sx, w: sw, heading: (t: string, yy: number) => b.heading(t, sx, yy, sw, 'caps'), body: { fontSize: 8.8 }, entryOpts: { datesRight: false, gap: 6 }, gap: 10 };
  y = headH + 26;
  b.flow();
  b.group('Contact');
  y = b.heading('Contact', sx, y, sw, 'caps');
  y = b.iconList(contacts(p), sx, y, sw, P.text, P.secondary, 8.5, 6) + b.g(10);
  if (filled(p.skills.map((s) => s.name)).length) {
    y = b.heading(b.section('skills', 'Compétences'), sx, y, sw, 'caps');
    y = b.bars(p.skills, sx, y, sw, P.text, '#dfe3e8', P.secondary) + b.g(6);
  }
  y = b.customs('skills', y, side);
  if (p.languages.some((l) => l.name.trim())) {
    y = b.heading(b.section('languages', 'Langues'), sx, y, sw, 'caps');
    y = b.dots(p.languages, sx, y, sw, P.text, P.secondary, '#d5d9de') + b.g(8);
  }
  y = b.customs('languages', y, side);
  if (filled(p.tools).length) {
    y = b.heading(b.section('tools', 'Outils'), sx, y, sw, 'caps');
    y = b.tags(p.tools, sx, y, sw, '#ffffff', P.text, 8, 'tools') + b.g(6);
  }
  y = b.customs('tools', y, side);
  if (filled(p.interests).length) {
    y = b.heading(b.section('interests', 'Centres d’intérêt'), sx, y, sw, 'caps');
    y = b.iconList(interestIcons(p, [mdiRun, mdiCamera, mdiHandHeart]), sx, y, sw, P.text, P.secondary, 8.5, 6);
  }
  y = b.customs('interests', y, { ...side, lead: 10, gap: 0 });
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
  // Les sections ajoutées se placent dans le panneau de leur section d'ancrage (voir `hosts`).
  const panel = (x: number, w: number) => ({
    x: x + 2, w: w - 2, lead: 8, gap: 0, entryOpts: { datesRight: false, gap: 6 },
    heading: (t: string, yy: number) => b.heading(t, x, yy, w, 'big') + 2,
  });
  // Chaque panneau appartient au groupe de sa section : on ouvre la section avant de le dessiner.
  // Un panneau sans contenu (sections vides ou masquées, aucune section ajoutée) n'est pas dessiné.
  const customIn = (...keys: ContentKey[]) => (p.custom ?? []).some((c) => keys.includes(c.after) && hasContent(c));
  let y = 0;
  if (b.has('skills') || b.has('tools') || customIn('skills', 'tools')) {
    const title = b.section(b.has('skills') ? 'skills' : 'tools', 'Compétences');
    b.rect(279, 148, 285, 262, P.panel);
    y = b.heading(title, 298, 160, 250, 'big');
    const items = [...filled(p.skills.map((s) => s.name)), ...(filled(p.tools).length ? [`Outils : ${filled(p.tools).slice(0, 4).join(', ')}`] : [])];
    if (items.length) {
      // Sans compétences (vides ou masquées), la ligne « Outils » a son propre codec : elle n'efface pas la liste masquée.
      const skills = b.text(items.map((i) => `•  ${i}`).join('\n'), 300, y + 2, 250, { lineHeight: 1.4, field: b.has('skills') ? 'skills' : 'tools', codec: b.has('skills') ? 'skillsTools' : 'toolsLine' });
      b.boldPrefix(skills, ' :');
      y += 2 + skills.height;
    }
    for (const k of ['skills', 'tools'] as const) y = b.customs(k, y, panel(298, 250));
    b.check(y, 400);
  }
  if (b.has('experience') || customIn('experience')) {
    const title = b.section('experience', 'Expérience');
    b.rect(279, 421, 285, 304, P.panel);
    y = b.heading(title, 298, 432, 250, 'big');
    p.experience.forEach((e, i) => (y = b.entry(e, 300, y + 2, 250, { datesRight: false, gap: 6, path: `experience.${i}` })));
    y = b.customs('experience', y, { ...panel(298, 250), lead: 2 });
    b.check(y, 725);
  }
  if (b.has('education') || b.has('languages') || customIn('education', 'languages')) {
    const title = b.section(b.has('education') ? 'education' : 'languages', b.has('education') ? 'Formation' : 'Langues');
    b.rect(colX, 464, colW, 261, P.panel);
    y = b.heading(title, 50, 478, 190, 'big');
    p.education.forEach((e, i) => (y = b.entry(e, 52, y + 2, 186, { datesRight: false, gap: 6, path: `education.${i}` })));
    if (b.has('languages')) y = b.para(languagesText(p).replace(/  ·  /g, '\n'), 52, y + 4, 186, { fontSize: 9, field: 'languages', codec: 'languages' });
    for (const k of ['education', 'languages'] as const) y = b.customs(k, y, panel(50, 190));
    b.check(y, 725);
  }
  if (b.has('interests')) {
    b.section('interests', 'Loisirs');
    b.rect(0, 740, W, 47, P.secondary);
    b.text(b.label('interests', 'Loisirs').toUpperCase(), 50, 750, 130, { fontFamily: 'Montserrat', fontSize: 22, fill: P.onPrimary, heading: 2 });
    const fun = b.text(filled(p.interests).join('  ·  '), 192, 759, 380, { fontSize: 10, fill: P.onPrimary, field: 'interests', codec: 'list' });
    b.check(759 + fun.height, 787);
  }
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
  const main = { x: mx, w: mw, heading: (t: string, yy: number) => b.heading(t, mx, yy, mw, 'bar'), entryOpts: { datesRight: false }, gap: 12 };
  if (b.has('profile')) {
    y = b.heading(b.section('profile', 'Profil'), mx, y, mw, 'bar');
    y = b.para(p.profile, mx, y, mw, { field: 'profile' }, 14);
  }
  y = b.customs('profile', y, main);
  if (b.has('experience')) {
    y = b.heading(b.section('experience', 'Expérience'), mx, y, mw, 'bar');
    p.experience.forEach((e, i) => (y = b.entry(e, mx, y, mw, { datesRight: false, path: `experience.${i}` })));
    y += b.g(4);
  }
  y = b.customs('experience', y, main);
  if (filled(p.achievements).length) {
    y = b.heading(b.section('achievements', 'Projets'), mx, y, mw, 'bar');
    y = b.bullets(p.achievements, mx, y, mw, { field: 'achievements' }, 14);
  }
  y = b.customs('achievements', y, main);
  if (b.has('education')) {
    y = b.heading(b.section('education', 'Formation'), mx, y, mw, 'bar');
    p.education.forEach((e, i) => (y = b.entry(e, mx, y, mw, { datesRight: false, gap: 6, path: `education.${i}` })));
  }
  y = b.customs('education', y, { ...main, lead: 6, gap: 0 });
  b.spread(y, H - 40);

  // Colonne latérale
  const sx = 26;
  const sw = sideW - 2 * sx + 6;
  const side = { x: sx, w: sw, heading: (t: string, yy: number) => b.heading(t, sx, yy, sw, 'caps'), body: { fontSize: 8.8 }, entryOpts: { datesRight: false, gap: 6 }, gap: 10 };
  y = headH + 24;
  b.flow();
  b.group('Contact');
  y = b.heading('Contact', sx, y, sw, 'caps');
  y = b.iconList(contacts(p), sx, y, sw, P.text, P.secondary, 8.5, 6) + b.g(10);
  if (filled(p.tools).length) {
    y = b.heading(b.section('tools', 'Stack technique'), sx, y, sw, 'caps');
    y = b.tags(p.tools, sx, y, sw, P.secondary, '#ffffff', 8, 'tools') + b.g(6);
  }
  y = b.customs('tools', y, side);
  if (filled(p.skills.map((s) => s.name)).length) {
    y = b.heading(b.section('skills', 'Savoir-faire'), sx, y, sw, 'caps');
    y = b.bullets(filled(p.skills.map((s) => s.name)), sx, y, sw, { fontSize: 8.8, field: 'skills', codec: 'skillNames' }, 14);
  }
  y = b.customs('skills', y, side);
  if (p.languages.some((l) => l.name.trim())) {
    y = b.heading(b.section('languages', 'Langues'), sx, y, sw, 'caps');
    y = b.dots(p.languages, sx, y, sw, P.text, P.secondary, '#d5d9de') + b.g(8);
  }
  y = b.customs('languages', y, side);
  if (filled(p.interests).length) {
    y = b.heading(b.section('interests', 'Intérêts'), sx, y, sw, 'caps');
    y = b.iconList(interestIcons(p, [mdiGithub, mdiImageFilterHdr, mdiCardsPlaying]), sx, y, sw, P.text, P.secondary, 8.5, 6);
  }
  y = b.customs('interests', y, { ...side, lead: 10, gap: 0 });
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
  if (b.has('profile')) y = b.para(p.profile, M, y, 330, { fontSize: 9.5, fontWeight: 'bold', fill: P.text, field: 'profile' }, 8);
  y = Math.max(y, 126);
  y = b.para(inlineContacts(p), M, y, w, { fontSize: 9, fill: P.muted, field: 'contacts', codec: 'contacts' }, 16);

  b.flow();
  const extra = { x: M, w, heading: (t: string, yy: number) => b.heading(t, M, yy, w), gap: 14 };
  y = b.customs('profile', y, extra);
  if (b.has('education')) {
    y = b.heading(b.section('education', 'Formation'), M, y, w);
    p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
    y += b.g(8);
  }
  y = b.customs('education', y, extra);
  if (filled(p.achievements).length) {
    y = b.heading(b.section('achievements', 'Projets'), M, y, w);
    y = b.bullets(p.achievements, M, y, w, { field: 'achievements' }, 14);
  }
  y = b.customs('achievements', y, extra);
  if (b.has('experience')) {
    y = b.heading(b.section('experience', 'Expériences'), M, y, w);
    p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
    y += b.g(4);
  }
  y = b.customs('experience', y, extra);
  if (filled(p.tools).length) {
    y = b.heading(b.section('tools', 'Compétences et outils'), M, y, w);
    y = b.tags(p.tools, M, y, w, P.panel, P.text, 8.5, 'tools') + b.g(8);
  }
  y = b.customs('tools', y, extra);
  y = b.customs('skills', y, extra);
  // Langues et centres d'intérêt côte à côte ; une seule des deux : elle prend la première demi-colonne.
  const half = (w - 24) / 2;
  let bottom = y;
  let x = M;
  if (b.has('languages')) {
    const y2 = b.heading(b.section('languages', 'Langues'), x, y, half);
    bottom = Math.max(bottom, b.para(languagesText(p).replace(/  ·  /g, '\n'), x, y2, half, { lineHeight: 1.5, field: 'languages', codec: 'languages' }));
    x += half + 24;
    if (b.has('interests')) b.sameRow();
  }
  if (b.has('interests')) {
    const y3 = b.heading(b.section('interests', 'Centres d’intérêt'), x, y, half);
    bottom = Math.max(bottom, b.para(filled(p.interests).join('\n'), x, y3, half, { lineHeight: 1.5, field: 'interests', codec: 'list' }));
  }
  y = bottom;
  for (const k of ['languages', 'interests'] as const) y = b.customs(k, y, { ...extra, lead: 14, gap: 0 });
  b.spread(y, H - 50);
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
    const t = b.text(str, centered ? cx - cw / 2 : u(55), y, cw, { fontFamily: 'DM Serif Display', fontSize: 12.5, fill: ink, textAlign: centered ? 'center' : 'left', heading: 2 });
    y += t.height + b.g(9);
  };
  const skills = filled(p.skills.map((s) => s.name));
  const langs = p.languages.filter((l) => l.name.trim());
  const list = { fontFamily: 'Poppins', fontSize: 10.3, lineHeight: 1.55, fill: P.text };
  const left = {
    x: u(55), w: 180, body: list, gap: 10,
    heading: (t: string, yy: number) => ((y = yy), dot(), leftHeading(t), y),
    entry: (e: Entry, yy: number, path: string) => {
      y = b.para(e.title, u(55), yy, 180, { ...list, fontFamily: 'DM Serif Display', lineHeight: 1.2, field: `${path}.title`, heading: 3 });
      const line = [e.org, e.dates].filter(Boolean).join(', ');
      if (line) y = b.para(line, u(55), y, 180, { ...list, fontSize: 9.2, lineHeight: 1.3, field: e.org && e.dates ? path : `${path}.${e.org ? 'org' : 'dates'}`, codec: e.org && e.dates ? 'orgDatesComma' : 'text' });
      return y + b.g(6);
    },
  };
  if (skills.length || langs.length) {
    dot();
    leftHeading(b.section('skills', 'Compétences & qualités'));
    if (skills.length) y = b.bullets(skills, u(55), y, 180, { ...list, field: 'skills', codec: 'skillNames' });
    // Les langues suivent les compétences avec le même interligne (deux textes, une seule liste à l'œil).
    if (skills.length && langs.length) y += list.fontSize * (list.lineHeight - 1.13);
    if (langs.length) y = b.bullets(langs.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)), u(55), y, 180, { ...list, field: 'languages', codec: 'languages' });
    y += b.g(10);
  }
  for (const k of ['skills', 'languages'] as const) y = b.customs(k, y, left);
  const fun = filled(p.interests);
  if (fun.length) {
    dot();
    leftHeading(b.section('interests', 'Loisirs'), true);
    y = b.para(fun.join(', '), cx - cw / 2, y, cw, { ...center, field: 'interests', codec: 'commaList' });
  }
  y = b.customs('interests', y, { ...left, lead: 10, gap: 0 });
  b.spread(y, H - 24, 18);

  // Colonne de droite : parcours centré
  const rx = u(400);
  const rw = W - rx - 16;
  const body = { fontFamily: 'Poppins', fontSize: 10, lineHeight: 1.3, fill: P.text, textAlign: 'center' as const };
  y = Math.max(u(398), title.top + title.height + 40);
  b.flow();
  const heading = (str: string) => {
    b.mark();
    const t = b.text(str, u(440), y, rw, { fontFamily: 'Poppins', fontSize: 17, fill: ink, heading: 2 });
    y += t.height + b.g(10);
  };
  const entryTitle = (str: string, field: string) => {
    const t = b.text(str, rx, y, rw, { fontFamily: 'DM Serif Display', fontSize: 10, lineHeight: 1.15, fill: P.text, textAlign: 'center', field, heading: 3 });
    y += t.height + 2;
  };
  const entry = (e: Entry, path: string) => {
    entryTitle(e.title, `${path}.title`);
    if (e.org) y = b.para(e.org, rx, y, rw, { ...body, field: `${path}.org` });
    if (e.dates) y = b.para(e.dates, rx, y, rw, { ...body, field: `${path}.dates` });
    if (e.text) y = b.para(e.text, rx, y + 2, rw, { ...body, fontSize: 9.2, fill: P.muted, field: `${path}.text` });
    if (e.bullets?.length) y = b.bullets(e.bullets, rx, y + 2, rw, { ...body, fontSize: 9.2, lineHeight: 1.35, fill: P.muted, field: `${path}.bullets` });
    y += b.g(15);
    return y;
  };
  const right = {
    x: rx, w: rw, body: { ...body, fontSize: 9.5, lineHeight: 1.35 }, gap: 15,
    heading: (t: string, yy: number) => ((y = yy), heading(t), y),
    entry: (e: Entry, yy: number, path: string) => ((y = yy), entry(e, path)),
  };
  if (p.experience.length) {
    heading(b.section('experience', 'Expériences'));
    p.experience.forEach((e, i) => entry(e, `experience.${i}`));
  }
  y = b.customs('experience', y, right);
  if (p.education.length) {
    y += b.g(4);
    heading(b.section('education', 'Formations'));
    p.education.forEach((e, i) => {
      const path = `education.${i}`;
      entryTitle(e.title, `${path}.title`);
      const line = [e.org, e.dates].filter(Boolean).join(', ');
      if (line) y = b.para(line, rx, y, rw, { ...body, field: e.org && e.dates ? path : `${path}.${e.org ? 'org' : 'dates'}`, codec: e.org && e.dates ? 'orgDatesComma' : 'text' });
      y += b.g(9);
    });
  }
  y = b.customs('education', y, { ...right, lead: 6, gap: 0 });
  b.spread(y, H - 20, 12);
  return b.json();
}

// ------------------------------------------------------------------ 11. Vierge

/**
 * Page qui se construit au fil du formulaire : une colonne sobre, chaque partie n'apparaît
 * qu'une fois remplie (rien d'affiché pour une fiche vide). Idéale pour les outils de tri.
 */
export async function blank(P: Palette, p: Persona, density = 1) {
  const b = new Builder(P, p, density);
  const M = 56;
  const w = W - 2 * M;
  const top = 56;
  let y = top;
  const photo = 84;
  const headW = p.photo ? w - photo - 20 : w;

  b.group('En-tête');
  if (p.photo) await b.photo(W - M - photo, top - 4, photo);
  if (p.name.trim()) y = b.para(p.name, M, y, headW, { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 24, fill: P.primary, lineHeight: 1.05, field: 'name' }, 6);
  if (p.title.trim()) y = b.para(p.title, M, y, headW, { fontSize: 12.5, fill: P.secondary, field: 'title' }, 8);
  // Une coordonnée par ligne (chacune reliée à son champ : un champ vide ne décale pas les autres).
  y = b.iconList(contacts(p), M, y, headW, P.muted, P.secondary, 9, 4);
  if (p.photo) y = Math.max(y, top + photo);
  if (y > top) {
    y += b.g(6);
    b.line(M, y, M + w, y, P.primary, 1.2);
    y += b.g(16);
  }

  b.flow();
  const extra = { x: M, w, heading: (t: string, yy: number) => b.heading(t, M, yy, w), gap: 14 };
  const block = (key: ContentKey, title: string, draw: () => void) => {
    if (b.has(key)) {
      y = b.heading(b.section(key, title), M, y, w);
      draw();
    }
    y = b.customs(key, y, extra);
  };
  block('profile', 'Profil', () => (y = b.para(p.profile, M, y, w, { field: 'profile' }, 14)));
  block('experience', 'Expérience professionnelle', () => {
    p.experience.forEach((e, i) => (y = b.entry(e, M, y, w, { path: `experience.${i}` })));
    y += b.g(5);
  });
  block('education', 'Formation', () => {
    p.education.forEach((e, i) => (y = b.entry(e, M, y, w, { gap: 6, path: `education.${i}` })));
    y += b.g(8);
  });
  block('achievements', 'Réalisations', () => (y = b.bullets(p.achievements, M, y, w, { field: 'achievements' }, 14)));
  block('skills', 'Compétences', () => (y = b.bullets(filled(p.skills.map((s) => s.name)), M, y, w, { field: 'skills', codec: 'skillNames' }, 14)));
  block('tools', 'Outils', () => (y = b.para(filled(p.tools).join('  ·  '), M, y, w, { field: 'tools', codec: 'list' }, 14)));
  block('languages', 'Langues', () => (y = b.para(languagesText(p), M, y, w, { field: 'languages', codec: 'languages' }, 14)));
  block('interests', 'Centres d’intérêt', () => (y = b.para(filled(p.interests).join('  ·  '), M, y, w, { field: 'interests', codec: 'list' }, 14)));
  b.check(y, H - 40);
  return b.json();
}
