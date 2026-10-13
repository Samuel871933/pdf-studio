// Formulaire du remplissage rapide (onglet « Contenu ») : il édite la fiche, la page suit en direct.
// Les sections affichées par le modèle viennent en premier ; les autres restent remplissables
// (elles servent dès qu'on change de modèle).
import { sanitizeImage } from '../images';
import { clearSection, type QuickFill } from '../quickfill';
import { anchorIn, hostsOf, type Section } from '../templates';
import { CONTENT_KEYS, KIND_OF, newCustomId, type ContentKey, type CustomKind, type CustomSection, type Entry, type Language, type Persona, type Skill } from '../templates/content';
import { getPath, setPath } from '../templates/fields';
import { h, type Child } from './dom';
import { uiIcon } from './icons';

const LEVELS = ['1 – notions', '2 – intermédiaire', '3 – confirmé', '4 – avancé', '5 – expert'];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Natif', 'Bilingue'];

/** Sections du formulaire, dans l'ordre par défaut. */
const ORDER: { key: Section; label: string }[] = [
  { key: 'identity', label: 'Identité et coordonnées' },
  { key: 'profile', label: 'Profil' },
  { key: 'experience', label: 'Expériences' },
  { key: 'education', label: 'Formations' },
  { key: 'achievements', label: 'Réalisations / projets' },
  { key: 'skills', label: 'Compétences' },
  { key: 'tools', label: 'Outils' },
  { key: 'languages', label: 'Langues' },
  { key: 'interests', label: 'Centres d’intérêt' },
  { key: 'letter', label: 'Lettre de motivation' },
];
const LABEL = Object.fromEntries(ORDER.map((o) => [o.key, o.label])) as Record<Section, string>;

/** Formes proposées à l'ajout d'une section. */
const KINDS: { kind: CustomKind; label: string; hint: string }[] = [
  { kind: 'entries', label: 'Entrées', hint: 'Intitulé, organisation, dates : bénévolat, missions, certifications datées…' },
  { kind: 'list', label: 'Liste à puces', hint: 'Une ligne par élément : qualités, publications, permis…' },
  { kind: 'text', label: 'Paragraphe', hint: 'Texte libre : disponibilité, mobilité, objectif…' },
];

const isContentKey = (k: Section): k is ContentKey => (CONTENT_KEYS as string[]).includes(k);

/** Section vide de la forme voulue (une ligne à remplir). */
const emptyCustom = (kind: CustomKind, after: ContentKey, title: string): CustomSection => ({
  id: newCustomId(), title, kind, after,
  entries: kind === 'entries' ? [{ title: '', org: '', dates: '', bullets: [] }] : [],
  items: kind === 'list' ? [''] : [],
  text: '',
});

/** Élément de la page à retrouver dans le formulaire : son champ (« experience.0.title ») ou sa section. */
export interface FormTarget {
  field?: string;
  /** Section standard (« experience ») ou section ajoutée (« c:<id> »). */
  section?: string;
}

export interface ContentForm {
  render(): void;
  /** Met à jour l'état (débordement, retouches) sans reconstruire les champs. */
  status(): void;
  /** Déplie, fait défiler et met en évidence le champ ou la section ; `focus` : place le curseur dans le champ. */
  reveal(target: FormTarget, focus?: boolean): boolean;
  /** Libellé du champ dans le formulaire (« Prénom et nom »), ou `null`. */
  labelFor(target: FormTarget): string | null;
}

/** Champs de la page qui regroupent plusieurs champs du formulaire : on va au premier. */
const FIELD_ALIAS: Record<string, string> = { contacts: 'phone', sender: 'name' };

export function setupContentForm(root: HTMLElement, qf: QuickFill, actions: { chooseTemplate(): void }): ContentForm {
  const statusBox = h('div', { class: 'cf-status' });
  const body = h('div', { class: 'cf-body' });
  root.append(statusBox, body);
  /** Fiches dépliées (par adresse), pour les garder ouvertes d'un rendu à l'autre. */
  const open = new Set<string>(['identity']);
  let used = new Set<Section>();

  const data = () => qf.state!.data;
  const set = (path: string, value: unknown) => qf.update((d) => setPath(d, path, value));
  /** Modification de structure (ajout, suppression, déplacement) : régénération immédiate et nouveau rendu. */
  const restructure = (mutate: (d: Persona) => void) => {
    qf.update(mutate, 0);
    render();
  };

  // ---------------------------------------------------------------- Champs

  const input = (label: string, path: string, opts: { placeholder?: string; type?: string; hint?: string } = {}) => {
    const el = h('input', { type: opts.type ?? 'text', value: String(getPath(data(), path) ?? ''), placeholder: opts.placeholder ?? '', spellcheck: true });
    el.dataset.path = path;
    el.addEventListener('input', () => set(path, el.value));
    return h('label', { class: 'field' }, h('span', {}, label, opts.hint && h('em', { class: 'cf-hint' }, ` ${opts.hint}`)), el);
  };

  const area = (label: string, path: string, opts: { rows?: number; placeholder?: string; lines?: boolean } = {}) => {
    const v = getPath(data(), path);
    const el = h('textarea', { rows: opts.rows ?? 3, placeholder: opts.placeholder ?? '', spellcheck: true });
    el.dataset.path = path;
    el.value = opts.lines && Array.isArray(v) ? v.join('\n') : String(v ?? '');
    el.addEventListener('input', () =>
      set(path, opts.lines ? el.value.split('\n').map((l) => l.trim()).filter(Boolean) : el.value),
    );
    return h('label', { class: 'field' }, h('span', {}, label), el);
  };

  const iconBtn = (icon: Parameters<typeof uiIcon>[0], title: string, onClick: () => void, disabled = false) => {
    const b = h('button', { type: 'button', class: 'icon', title, ariaLabel: title, disabled }, uiIcon(icon, 15));
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  /** Boutons monter / descendre / supprimer d'un élément de liste. */
  function itemTools(path: string, i: number, n: number) {
    const move = (to: number) =>
      restructure((d) => {
        const list = getPath(d, path) as unknown[];
        const [x] = list.splice(i, 1);
        list.splice(to, 0, x);
      });
    return h('span', { class: 'cf-tools' },
      iconBtn('forward', 'Monter', () => move(i - 1), i === 0),
      iconBtn('backward', 'Descendre', () => move(i + 1), i === n - 1),
      iconBtn('trash', 'Supprimer', () => restructure((d) => (getPath(d, path) as unknown[]).splice(i, 1))),
    );
  }

  const addBtn = (label: string, onClick: () => void) => {
    const b = h('button', { type: 'button', class: 'cf-add' }, '+ ', label);
    b.addEventListener('click', onClick);
    return b;
  };

  /** Liste de textes courts (outils, centres d'intérêt, réalisations…). */
  function stringList(path: string, addLabel: string, placeholder: string, long = false) {
    const list = (getPath(data(), path) as string[]) ?? [];
    const rows = list.map((v, i) => {
      const el = long ? h('textarea', { rows: 2, placeholder, spellcheck: true }) : h('input', { type: 'text', placeholder, spellcheck: true });
      el.dataset.path = `${path}.${i}`;
      el.value = v;
      el.addEventListener('input', () => set(`${path}.${i}`, el.value));
      return h('div', { class: 'cf-row' }, el, itemTools(path, i, list.length));
    });
    const el = h('div', { class: 'cf-list' }, ...rows, addBtn(addLabel, () => restructure((d) => {
      const l = (getPath(d, path) as string[] | undefined) ?? [];
      l.push('');
      setPath(d, path, l);
      queueMicrotask(() => body.querySelector<HTMLElement>(`[data-list="${path}"] .cf-row:last-of-type :is(input, textarea)`)?.focus());
    })));
    el.dataset.list = path;
    return el;
  }

  type EntryKind = 'experience' | 'education' | 'custom';
  const ENTRY_TEXT: Record<EntryKind, { empty: string; title: string; org: string; dates: string; add: string }> = {
    experience: { empty: 'Nouveau poste', title: 'Intitulé du poste', org: 'Entreprise, ville', dates: 'Sept. 2021 – aujourd’hui', add: 'Ajouter une expérience' },
    education: { empty: 'Nouvelle formation', title: 'Diplôme', org: 'Établissement', dates: '2016', add: 'Ajouter une formation' },
    custom: { empty: 'Nouvelle entrée', title: 'Intitulé', org: 'Organisation, lieu', dates: '2020 – 2024', add: 'Ajouter une entrée' },
  };

  /** Fiche dépliable d'une expérience / formation / entrée d'une section ajoutée. */
  function entryCard(path: string, i: number, n: number, e: Entry, kind: EntryKind) {
    const key = `${path}.${i}`;
    const T = ENTRY_TEXT[kind];
    const summaryText = () => [e.title || T.empty, e.dates].filter(Boolean).join(' · ');
    const summary = h('summary', {}, h('span', { class: 'cf-sum' }, summaryText()), itemTools(path, i, n));
    const card = h('details', { class: 'cf-card', open: open.has(key) },
      summary,
      input(T.title, `${key}.title`),
      input(T.org, `${key}.org`),
      input('Dates', `${key}.dates`, { placeholder: T.dates }),
      area('Description (facultatif)', `${key}.text`, { rows: 2 }),
      area('Points clés (un par ligne)', `${key}.bullets`, { rows: 3, lines: true, placeholder: 'Verbe d’action + résultat chiffré' }),
    );
    card.addEventListener('toggle', () => (card.open ? open.add(key) : open.delete(key)));
    // Le résumé suit la saisie du titre et des dates.
    card.addEventListener('input', () => {
      const cur = getPath(data(), key) as Entry;
      Object.assign(e, cur);
      summary.querySelector('.cf-sum')!.textContent = summaryText();
    });
    return card;
  }

  function entries(path: string, kind: EntryKind) {
    const list = getPath(data(), path) as Entry[];
    const el = h('div', { class: 'cf-list' },
      ...list.map((e, i) => entryCard(path, i, list.length, e, kind)),
      addBtn(ENTRY_TEXT[kind].add, () => {
        // La plus récente en premier : la nouvelle entrée se place en tête, dépliée.
        for (const k of [...open]) {
          const m = k.startsWith(`${path}.`) && k.slice(path.length + 1).match(/^(\d+)$/);
          if (m) {
            open.delete(k);
            open.add(`${path}.${Number(m[1]) + 1}`);
          }
        }
        open.add(`${path}.0`);
        restructure((d) => (getPath(d, path) as Entry[]).unshift({ title: '', org: '', dates: '', bullets: [] }));
        queueMicrotask(() => body.querySelector<HTMLInputElement>(`[data-entries="${path}"] .cf-card input`)?.focus());
      }),
    );
    el.dataset.entries = path;
    return el;
  }

  function skills() {
    const list = data().skills;
    const showLevel = used.has('levels');
    const rows = list.map((s: Skill, i) =>
      h('div', { class: 'cf-row' },
        (() => {
          const el = h('input', { type: 'text', value: s.name, placeholder: 'Compétence', spellcheck: true });
          el.dataset.path = `skills.${i}.name`;
          el.addEventListener('input', () => set(`skills.${i}.name`, el.value));
          return el;
        })(),
        showLevel && (() => {
          const el = h('select', { title: 'Niveau (jauge)', ariaLabel: 'Niveau' }, ...LEVELS.map((t, k) => h('option', { value: String(k + 1) }, t)));
          el.value = String(s.level);
          el.addEventListener('change', () => set(`skills.${i}.level`, Number(el.value)));
          return el;
        })(),
        itemTools('skills', i, list.length),
      ),
    );
    return h('div', { class: 'cf-list' }, ...rows, addBtn('Ajouter une compétence', () => restructure((d) => d.skills.push({ name: '', level: 3 }))));
  }

  function languages() {
    const list = data().languages;
    const rows = list.map((l: Language, i) => {
      const key = `languages.${i}`;
      const level = h('input', { type: 'text', value: l.level, placeholder: 'C1', title: 'Niveau (CECRL ou « Natif »)' });
      level.setAttribute('list', 'cf-cefr');
      level.addEventListener('input', () => set(`${key}.level`, level.value));
      const score = h('select', { title: 'Points de niveau (sur 5)', ariaLabel: 'Points de niveau' }, ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${'●'.repeat(n)}${'○'.repeat(5 - n)}`)));
      score.value = String(l.score);
      score.addEventListener('change', () => set(`${key}.score`, Number(score.value)));
      const name = h('input', { type: 'text', value: l.name, placeholder: 'Langue' });
      name.dataset.path = `${key}.name`;
      name.addEventListener('input', () => set(`${key}.name`, name.value));
      const detail = h('input', { type: 'text', value: l.detail ?? '', placeholder: 'Précision : TOEIC 850…', title: 'Précision facultative (professionnel, TOEIC 850…)' });
      detail.addEventListener('input', () => set(`${key}.detail`, detail.value || undefined));
      return h('div', { class: 'cf-lang' },
        h('div', { class: 'cf-row' }, name, itemTools('languages', i, list.length)),
        h('div', { class: 'cf-row' }, level, score, detail),
      );
    });
    return h('div', { class: 'cf-list' },
      h('datalist', { id: 'cf-cefr' }, ...CEFR.map((v) => h('option', { value: v }))),
      ...rows,
      addBtn('Ajouter une langue', () => restructure((d) => d.languages.push({ name: '', level: '', score: 3 }))),
    );
  }

  function photo() {
    const d = data();
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      const clean = await sanitizeImage(f);
      restructure((x) => (x.photo = clean.url));
    });
    const preview = h('span', { class: 'cf-photo' });
    if (d.photo) preview.style.backgroundImage = `url("${d.photo}")`;
    const choose = h('button', { type: 'button' }, uiIcon('image', 15), d.photo ? 'Changer' : 'Choisir une photo…');
    choose.dataset.path = 'photo';
    choose.addEventListener('click', () => file.click());
    const remove = d.photo && h('button', { type: 'button', class: 'danger' }, 'Retirer');
    if (remove) remove.addEventListener('click', () => restructure((x) => (x.photo = undefined)));
    return h('div', { class: 'field' },
      h('span', {}, 'Photo', !used.has('photo') && h('em', { class: 'cf-hint' }, ' (non affichée par ce modèle)')),
      h('div', { class: 'cf-row' }, preview, choose, remove, file),
    );
  }

  function section(key: Section): Child[] {
    switch (key) {
      case 'identity':
        return [
          photo(),
          input('Prénom et nom', 'name'),
          input('Intitulé (poste visé)', 'title'),
          h('div', { class: 'grid2' }, input('Téléphone', 'phone', { type: 'tel' }), input('Ville', 'city')),
          input('E-mail', 'email', { type: 'email' }),
          input('LinkedIn', 'linkedin', { placeholder: 'linkedin.com/in/…' }),
          input('GitHub / site', 'github', { placeholder: 'github.com/…', hint: used.has('github') ? '' : '(facultatif)' }),
          area('Adresse postale', 'address', { rows: 2, placeholder: 'Utilisée par la lettre classique' }),
        ];
      case 'profile':
        return [area('Accroche (2 à 3 phrases)', 'profile', { rows: 4 })];
      case 'experience':
      case 'education':
        return [entries(key, key)];
      case 'achievements':
        return [stringList('achievements', 'Ajouter une réalisation', 'Résultat chiffré, projet marquant…', true)];
      case 'skills':
        return [skills()];
      case 'tools':
        return [stringList('tools', 'Ajouter un outil', 'Logiciel, langage, méthode…')];
      case 'languages':
        return [languages()];
      case 'interests':
        return [stringList('interests', 'Ajouter un centre d’intérêt', 'Sport, association, passion…')];
      case 'letter':
        return [
          area('Destinataire', 'letter.recipient', { rows: 4 }),
          input('Objet', 'letter.subject', { placeholder: 'Candidature au poste de…' }),
          input('Formule d’appel', 'letter.greeting', { placeholder: 'Madame, Monsieur,' }),
          stringList('letter.paragraphs', 'Ajouter un paragraphe', 'Paragraphe…', true),
          area('Formule de politesse', 'letter.closing', { rows: 2 }),
        ];
      default:
        return [];
    }
  }

  /** Titres en cours de modification (sections standards). */
  const renaming = new Set<ContentKey>();

  /** Nouvelle section de la forme voulue, placée après `after`, dépliée avec son titre sélectionné. */
  function addCustom(kind: CustomKind, after: ContentKey, title: string, at?: number) {
    const c = emptyCustom(kind, after, title);
    open.add(`s:${c.id}`);
    open.add(`custom.${at ?? data().custom?.length ?? 0}.entries.0`);
    restructure((d) => (d.custom ??= []).splice(at ?? d.custom.length, 0, c));
    queueMicrotask(() => {
      const t = body.querySelector<HTMLInputElement>(`[data-section="${c.id}"] input`);
      t?.focus();
      t?.select();
    });
  }

  const titleOf = (key: ContentKey) => data().labels?.[key]?.trim() || LABEL[key];

  const isHidden = (k: ContentKey) => !!data().hidden?.includes(k);

  /** Masque ou réaffiche une section standard : son contenu est conservé. */
  const toggleHidden = (k: ContentKey) =>
    restructure((d) => {
      const list = d.hidden ?? [];
      d.hidden = list.includes(k) ? list.filter((x) => x !== k) : [...list, k];
      if (!d.hidden.length) delete d.hidden;
    });

  function sectionBlock(key: Section, label: string, dim = false) {
    const k = isContentKey(key) ? key : null;
    const masked = !!k && !dim && isHidden(k);
    const summary = h('summary', {}, h('span', { class: 'cf-sum' }, k ? titleOf(k) : label), masked && h('span', { class: 'cf-badge' }, 'masquée'));
    if (k)
      summary.append(h('span', { class: 'cf-tools' },
        !dim && iconBtn(masked ? 'eye' : 'eyeOff', masked ? 'Réafficher la section sur la page' : 'Masquer la section : elle disparaît de la page, son contenu est conservé', () => toggleHidden(k)),
        !masked && iconBtn('edit', 'Renommer la section', () => {
          renaming.has(k) ? renaming.delete(k) : renaming.add(k);
          open.add(`s:${key}`);
          render();
          queueMicrotask(() => body.querySelector<HTMLInputElement>(`[data-section="${key}"] .cf-rename input`)?.focus());
        }),
        !masked && iconBtn('duplicate', 'Dupliquer : nouvelle section de la même forme, placée juste après', () => addCustom(KIND_OF[k], k, `${titleOf(k)} (2)`, firstCustomAfter(k))),
        !dim && iconBtn('trash', 'Supprimer la section : son contenu est effacé (Ctrl+Z pour annuler)', () => {
          if (!confirm(`Supprimer la section « ${titleOf(k)} » et tout son contenu ?\n(Pour la retirer de la page sans rien perdre, utilisez plutôt l’œil : Masquer.)`)) return;
          restructure((d) => clearSection(d, k));
        }),
      ));
    const rename = k && (renaming.has(k) || data().labels?.[k]) && (() => {
      const f = input('Titre affiché', `labels.${k}`, { placeholder: `Titre du modèle (${label})` });
      f.classList.add('cf-rename');
      f.querySelector('input')!.addEventListener('input', (e) => (summary.querySelector('.cf-sum')!.textContent = (e.target as HTMLInputElement).value.trim() || label));
      return [f, h('p', { class: 'cf-hint' }, 'Les IA de tri découpent le CV grâce aux titres : préférez un intitulé standard (« Expérience professionnelle », « Formation », « Compétences »…).')];
    })();
    const sec = h('details', { class: `cf-sec${dim ? ' dim' : ''}${masked ? ' masked' : ''}`, open: open.has(`s:${key}`) || (key === 'identity' && !dim) },
      summary,
      masked && h('p', { class: 'cf-hint' }, 'Section masquée : absente de la page et du PDF. Son contenu est conservé ; cliquez sur l’œil pour la réafficher.'),
      ...(rename || []),
      ...section(key),
    );
    sec.dataset.section = key;
    sec.addEventListener('toggle', () => (sec.open ? open.add(`s:${key}`) : open.delete(`s:${key}`)));
    return sec;
  }

  /** Section après laquelle le formulaire range une section ajoutée (celle choisie, si le modèle l'affiche). */
  const formAnchor = (c: CustomSection) => (used.has(c.after) ? c.after : anchorIn(qf.def!, c.after));

  /** Position d'insertion d'une section dupliquée depuis `key` : juste sous elle, avant les sections déjà placées là. */
  const firstCustomAfter = (key: ContentKey) => {
    const list = data().custom ?? [];
    const i = list.findIndex((c) => formAnchor(c) === key);
    return i < 0 ? list.length : i;
  };

  // ---------------------------------------------------------------- Glisser-déposer des sections ajoutées

  let fieldset: HTMLFieldSetElement | null = null;
  let dragged: HTMLElement | null = null;
  /**
   * Repère de dépôt. La section glissée ne bouge pas pendant le glisser : Firefox n'envoie plus « dragend »
   * à un élément déplacé dans la page, et l'ordre choisi serait perdu au rendu suivant.
   */
  const marker = h('div', { class: 'cf-drop', ariaHidden: 'true' });

  /** Blocs de section de la liste principale (hors « Autres champs »). */
  const mainBlocks = () => [...(fieldset?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('.cf-sec'));
  /** Une section ajoutée se place après une section de contenu : jamais au-dessus de la première. */
  const firstContent = (blocks: HTMLElement[]) => blocks.findIndex((el) => isContentKey(el.dataset.section as Section));

  /** Relit l'ordre affiché : chaque section ajoutée suit la section standard au-dessus d'elle. */
  function commitOrder() {
    let cur: ContentKey | null = null;
    const placed: { id: string; after: ContentKey }[] = [];
    for (const el of mainBlocks()) {
      const k = el.dataset.section as Section;
      if (isContentKey(k)) cur = k;
      else if (el.classList.contains('cf-custom') && cur) placed.push({ id: el.dataset.section!, after: cur });
    }
    const list = data().custom ?? [];
    const same = placed.every((p, n) => list[n]?.id === p.id && list[n].after === p.after);
    if (same) return render();
    // Les cartes dépliées sont repérées par position : on les replie plutôt que d'ouvrir la mauvaise.
    for (const k of [...open]) if (k.startsWith('custom.')) open.delete(k);
    restructure((d) => {
      const byId = new Map((d.custom ?? []).map((c) => [c.id, c]));
      const rest = (d.custom ?? []).filter((c) => !placed.some((p) => p.id === c.id));
      d.custom = [...placed.map((p) => ({ ...byId.get(p.id)!, after: p.after })), ...rest];
    });
  }

  /** Déplace la section d'un cran (clavier), sans passer au-dessus de la première section de contenu. */
  function step(sec: HTMLElement, dir: -1 | 1) {
    const blocks = mainBlocks();
    const i = blocks.indexOf(sec);
    const to = i + dir;
    if (to <= firstContent(blocks) || to >= blocks.length) return;
    fieldset!.insertBefore(sec, dir < 0 ? blocks[to] : blocks[to].nextSibling);
    commitOrder();
    queueMicrotask(() => body.querySelector<HTMLElement>(`[data-section="${sec.dataset.section}"] .cf-grip`)?.focus());
  }

  function onDragOver(e: DragEvent) {
    if (!dragged || !fieldset) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const blocks = mainBlocks().filter((el) => el !== dragged);
    let target = blocks.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const min = firstContent(blocks);
    if (target && blocks.indexOf(target) <= min) target = blocks[min + 1];
    const anchor = target ?? fieldset.querySelector(':scope > .cf-addsec, :scope > .cf-others');
    // Juste au-dessus ou au-dessous de la section glissée : elle ne bougerait pas, pas de repère.
    if (anchor === dragged || anchor === dragged.nextElementSibling || (anchor === marker.nextElementSibling && marker.isConnected)) {
      if (anchor === dragged || anchor === dragged.nextElementSibling) marker.remove();
      return;
    }
    fieldset.insertBefore(marker, anchor);
  }

  /** Lâcher hors de la liste : le repère disparaît, le dépôt est annulé. */
  function onDragLeave(e: DragEvent) {
    if (dragged && fieldset && !fieldset.contains(e.relatedTarget as Node | null)) marker.remove();
  }

  /** Fin du glisser (dépôt ou « dragend », selon le premier reçu) : la section prend la place du repère. */
  function finishDrag() {
    const sec = dragged;
    if (!sec) return;
    dragged = null;
    sec.draggable = false;
    sec.classList.remove('dragging');
    if (!marker.isConnected) return;
    fieldset!.insertBefore(sec, marker);
    marker.remove();
    commitOrder();
  }

  /** Poignée ⠿ : glisser pour déplacer, ou flèches haut / bas au clavier. */
  function grip(sec: HTMLElement) {
    const g = h('span', { class: 'cf-grip', role: 'button', tabIndex: 0, title: 'Glisser pour déplacer (ou flèches haut / bas)', ariaLabel: 'Déplacer la section' }, uiIcon('grip', 15));
    g.addEventListener('pointerdown', () => {
      if (!fieldset?.disabled) sec.draggable = true;
    });
    // Clic sans glisser : le bloc ne doit pas rester déplaçable (sinon on le traîne depuis ses champs).
    g.addEventListener('pointerup', () => (sec.draggable = false));
    g.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    g.addEventListener('keydown', (e) => {
      if (fieldset?.disabled || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      step(sec, e.key === 'ArrowUp' ? -1 : 1);
    });
    sec.addEventListener('dragstart', (e) => {
      dragged = sec;
      marker.remove();
      sec.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', sec.dataset.section!);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    sec.addEventListener('dragend', finishDrag);
    return g;
  }

  /** Bloc d'une section ajoutée : titre et contenu ; sa place se choisit en la glissant. */
  function customBlock(c: CustomSection, i: number, dim = false) {
    const path = `custom.${i}`;
    const sum = h('span', { class: 'cf-sum' }, c.title.trim() || 'Section sans titre');
    const summary = h('summary', {}, sum);
    const tools = h('span', { class: 'cf-tools' },
      iconBtn('duplicate', 'Dupliquer : nouvelle section de la même forme, placée juste après', () => addCustom(c.kind, c.after, `${c.title.trim() || 'Section'} (2)`, i + 1)),
      iconBtn('trash', 'Supprimer la section', () => {
        if (!confirm(`Supprimer la section « ${c.title.trim() || 'sans titre'} » et son contenu ?`)) return;
        restructure((d) => d.custom!.splice(i, 1));
      }),
    );
    const title = input('Titre de la section', `${path}.title`, { placeholder: 'Bénévolat, Certifications, Publications…' });
    title.querySelector('input')!.addEventListener('input', (e) => (sum.textContent = (e.target as HTMLInputElement).value.trim() || 'Section sans titre'));
    // Le modèle n'a pas de place après la section choisie (panneau fixe) : on dit où elle s'affiche.
    const at = anchorIn(qf.def!, c.after);
    const moved = !dim && at !== formAnchor(c)
      ? h('p', { class: 'cf-hint cf-where' }, `Ce modèle n’a pas de place après « ${titleOf(c.after)} » : la section s’affiche après « ${titleOf(at)} ». Elle reprendra sa place avec un autre modèle.`)
      : '';
    const content =
      c.kind === 'entries' ? entries(`${path}.entries`, 'custom')
      : c.kind === 'list' ? stringList(`${path}.items`, 'Ajouter une ligne', 'Élément…', true)
      : area('Texte', `${path}.text`, { rows: 4 });
    const sec = h('details', { class: `cf-sec cf-custom${dim ? ' dim' : ''}`, open: open.has(`s:${c.id}`) },
      summary,
      moved,
      title,
      content,
    );
    if (!dim) summary.prepend(grip(sec));
    summary.append(tools);
    sec.dataset.section = c.id;
    sec.addEventListener('toggle', () => (sec.open ? open.add(`s:${c.id}`) : open.delete(`s:${c.id}`)));
    return sec;
  }

  /** « Ajouter une section » : choix de la forme, la section arrive en bas de la liste. */
  function addRow(after: ContentKey | undefined) {
    if (!after || !hostsOf(qf.def!).length) return null;
    const choices = h('div', { class: 'cf-kinds', hidden: !open.has('add') },
      ...KINDS.map(({ kind, label, hint }) => {
        const b = h('button', { type: 'button', class: 'cf-kind' }, h('strong', {}, label), h('span', {}, hint));
        b.addEventListener('click', () => {
          open.delete('add');
          addCustom(kind, after, 'Nouvelle section');
        });
        return b;
      }),
    );
    const toggle = addBtn('Ajouter une section', () => {
      choices.hidden = !choices.hidden;
      choices.hidden ? open.delete('add') : open.add('add');
    });
    return h('div', { class: 'cf-addsec' }, toggle, choices,
      h('p', { class: 'cf-hint' }, 'Glissez une section ajoutée par sa poignée ⠿ pour la placer ailleurs : elle prend la colonne et le style de la section au-dessus d’elle.'),
    );
  }

  // ---------------------------------------------------------------- État

  function status() {
    const s = qf.state;
    const def = qf.def;
    if (!s || !def) return statusBox.replaceChildren();
    const nodes: Child[] = [];
    if (!s.linked) {
      const relink = h('button', { type: 'button' }, 'Relier au formulaire');
      relink.addEventListener('click', () => {
        if (confirm('La page sera régénérée depuis le formulaire : les retouches faites depuis le détachement seront remplacées. Continuer ?')) void qf.relink().then(render);
      });
      nodes.push(h('div', { class: 'cf-note' }, h('strong', {}, 'Page détachée. '), 'Le formulaire ne modifie plus la page : vous la retouchez librement.', h('div', { class: 'row' }, relink)));
    } else {
      const detach = h('button', { type: 'button', title: 'Arrêter le lien pour retoucher la page librement' }, 'Détacher');
      detach.addEventListener('click', () => {
        qf.detach();
        render();
      });
      const change = h('button', { type: 'button', title: 'Choisir un autre modèle : la fiche est conservée' }, 'Changer de modèle');
      change.addEventListener('click', actions.chooseTemplate);
      nodes.push(h('div', { class: 'cf-head' }, h('span', {}, 'Modèle : ', h('strong', {}, def.name)), h('span', { class: 'row' }, change, detach)));
      if (def.id === 'blank' && !s.touched)
        nodes.push(h('div', { class: 'cf-info' }, h('strong', {}, 'Page vierge. '),
          'Remplissez les champs ci-dessous : chaque section apparaît sur la page dès qu’elle a du contenu. Vous pourrez ensuite choisir un modèle sans rien ressaisir.'));
      if (qf.overflow.length) {
        const worst = [...qf.overflow].sort((a, b) => b.by - a.by)[0];
        nodes.push(h('div', { class: 'cf-alert' }, h('strong', {}, 'Ça ne tient pas sur la page. '),
          `« ${worst.section} » dépasse de ${worst.by} pt, même avec des espacements resserrés. Raccourcissez cette section ou retirez un élément.`));
      } else if (qf.density < 1) {
        nodes.push(h('div', { class: 'cf-info' }, 'Espacements resserrés pour que tout tienne sur la page.'));
      }
      if (qf.retouched) {
        nodes.push(h('div', { class: 'cf-note' }, 'Retouche manuelle : elle sera recalculée à la prochaine modification du formulaire. Pour la garder, détachez la page.'));
      }
    }
    statusBox.replaceChildren(...nodes.filter((n): n is Node | string => !!n));
  }

  function render() {
    const s = qf.state;
    const def = qf.def;
    if (!s || !def) {
      const choose = h('button', { type: 'button', class: 'primary' }, 'Choisir un modèle');
      choose.addEventListener('click', actions.chooseTemplate);
      statusBox.replaceChildren();
      body.replaceChildren(h('div', { class: 'cf-empty' },
        h('p', {}, 'Le remplissage rapide fonctionne avec les modèles : remplissez une fiche (coordonnées, expériences, formations…), la page se compose toute seule.'),
        choose,
      ));
      return;
    }
    const scroll = root.scrollTop;
    used = new Set(def.sections);
    const usedOrder = ORDER.filter((o) => used.has(o.key));
    const others = ORDER.filter((o) => !used.has(o.key));
    const disabled = !s.linked;
    // Sections ajoutées : chacune sous la section qu'elle suit (sans place pour elles : « Autres champs »).
    const customs = (data().custom ?? []).map((c, i) => ({ c, i }));
    const placeable = hostsOf(def).length > 0;
    const shown = new Set<number>();
    const blocks: Node[] = usedOrder.flatMap((o) => [
      sectionBlock(o.key, o.label),
      ...(placeable ? customs.filter((x) => formAnchor(x.c) === o.key) : []).map((x) => (shown.add(x.i), customBlock(x.c, x.i))),
    ]);
    const hidden = customs.filter((x) => !shown.has(x.i));
    const add = addRow(usedOrder.map((o) => o.key).filter(isContentKey).at(-1));
    if (add) blocks.push(add);
    if (others.length || hidden.length)
      blocks.push(h('details', { class: 'cf-others' },
        h('summary', {}, `Autres champs (${others.length + hidden.length})`),
        h('p', { class: 'hint' }, 'Non affichés par ce modèle, mais conservés : ils apparaissent si vous changez de modèle.'),
        ...others.map((o) => sectionBlock(o.key, o.label, true)),
        ...hidden.map((x) => customBlock(x.c, x.i, true)),
      ));
    fieldset = h('fieldset', { class: 'cf-fields', disabled }, ...blocks);
    fieldset.addEventListener('dragover', onDragOver);
    fieldset.addEventListener('dragleave', onDragLeave);
    fieldset.addEventListener('drop', (e) => {
      e.preventDefault();
      finishDrag();
    });
    body.replaceChildren(fieldset);
    status();
    root.scrollTop = scroll;
  }

  // Fiche modifiée depuis la page (ou annuler) : on reconstruit, sauf pendant une saisie dans le formulaire.
  qf.onExternalChange = () => {
    if (!root.contains(document.activeElement)) render();
  };
  qf.onStatus = status;

  // ---------------------------------------------------------------- Du texte de la page vers son champ

  /** Champ du formulaire : adresse exacte, sinon premier champ dessous (« experience.0 » → son intitulé), sinon le parent. */
  function find(t: FormTarget): HTMLElement | null {
    if (t.section) {
      const id = t.section.startsWith('c:') ? t.section.slice(2) : t.section;
      return body.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
    }
    if (!t.field) return null;
    let path = FIELD_ALIAS[t.field] ?? t.field;
    for (;;) {
      const sel = CSS.escape(path);
      const el = body.querySelector<HTMLElement>(`[data-path="${sel}"]`) ?? body.querySelector<HTMLElement>(`[data-path^="${sel}."]`);
      if (el) return el;
      const cut = path.lastIndexOf('.');
      if (cut < 0) return body.querySelector<HTMLElement>(`[data-section="${sel}"]`);
      path = path.slice(0, cut);
    }
  }

  function reveal(t: FormTarget, focus = false): boolean {
    const el = find(t);
    if (!el) return false;
    // Sections et fiches repliées : on les déplie (leur état est mémorisé par leur écouteur « toggle »).
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    const box = el.matches('details') ? (el.querySelector(':scope > summary') as HTMLElement) : (el.closest('.field, .cf-row') as HTMLElement | null) ?? el;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    for (const f of body.querySelectorAll('.cf-flash')) f.classList.remove('cf-flash');
    void box.offsetWidth; // relance l'animation
    box.classList.add('cf-flash');
    if (focus && el.matches('input, textarea, select, button')) {
      el.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
    }
    return true;
  }

  function labelFor(t: FormTarget): string | null {
    const el = find(t);
    if (!el) return null;
    if (el.matches('details')) return el.querySelector(':scope > summary .cf-sum')?.textContent ?? null;
    const own = el.closest('label.field, .field')?.querySelector(':scope > span')?.firstChild?.textContent?.trim();
    const sec = el.closest('details.cf-sec')?.querySelector(':scope > summary .cf-sum')?.textContent;
    return own && !el.closest('.cf-list .cf-row') ? own : sec ?? own ?? null;
  }

  return { render, status, reveal, labelFor };
}
