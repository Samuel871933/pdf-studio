// Formulaire du remplissage rapide (onglet « Contenu ») : il édite la fiche, la page suit en direct.
// Les sections affichées par le modèle viennent en premier ; les autres restent remplissables
// (elles servent dès qu'on change de modèle).
import { sanitizeImage } from '../images';
import type { QuickFill } from '../quickfill';
import type { Section } from '../templates';
import type { Entry, Language, Persona, Skill } from '../templates/content';
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

export interface ContentForm {
  render(): void;
  /** Met à jour l'état (débordement, retouches) sans reconstruire les champs. */
  status(): void;
}

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
    el.addEventListener('input', () => set(path, el.value));
    return h('label', { class: 'field' }, h('span', {}, label, opts.hint && h('em', { class: 'cf-hint' }, ` ${opts.hint}`)), el);
  };

  const area = (label: string, path: string, opts: { rows?: number; placeholder?: string; lines?: boolean } = {}) => {
    const v = getPath(data(), path);
    const el = h('textarea', { rows: opts.rows ?? 3, placeholder: opts.placeholder ?? '', spellcheck: true });
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

  /** Fiche dépliable d'une expérience / formation. */
  function entryCard(path: string, i: number, n: number, e: Entry, kind: 'experience' | 'education') {
    const key = `${path}.${i}`;
    const summaryText = () => [e.title || (kind === 'experience' ? 'Nouveau poste' : 'Nouvelle formation'), e.dates].filter(Boolean).join(' · ');
    const summary = h('summary', {}, h('span', { class: 'cf-sum' }, summaryText()), itemTools(path, i, n));
    const card = h('details', { class: 'cf-card', open: open.has(key) },
      summary,
      input(kind === 'experience' ? 'Intitulé du poste' : 'Diplôme', `${key}.title`),
      input(kind === 'experience' ? 'Entreprise, ville' : 'Établissement', `${key}.org`),
      input('Dates', `${key}.dates`, { placeholder: kind === 'experience' ? 'Sept. 2021 – aujourd’hui' : '2016' }),
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

  function entries(kind: 'experience' | 'education') {
    const list = data()[kind];
    return h('div', { class: 'cf-list' },
      ...list.map((e, i) => entryCard(kind, i, list.length, e, kind)),
      addBtn(kind === 'experience' ? 'Ajouter une expérience' : 'Ajouter une formation', () => {
        // La plus récente en premier : la nouvelle entrée se place en tête, dépliée.
        open.add(`${kind}.0`);
        for (const k of [...open]) {
          const m = k.match(new RegExp(`^${kind}\\.(\\d+)$`));
          if (m) {
            open.delete(k);
            open.add(`${kind}.${Number(m[1]) + 1}`);
          }
        }
        open.add(`${kind}.0`);
        restructure((d) => d[kind].unshift({ title: '', org: '', dates: '', bullets: [] }));
        queueMicrotask(() => body.querySelector<HTMLInputElement>(`[data-section="${kind}"] .cf-card input`)?.focus());
      }),
    );
  }

  function skills() {
    const list = data().skills;
    const showLevel = used.has('levels');
    const rows = list.map((s: Skill, i) =>
      h('div', { class: 'cf-row' },
        (() => {
          const el = h('input', { type: 'text', value: s.name, placeholder: 'Compétence', spellcheck: true });
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
        return [entries(key)];
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

  function sectionBlock(key: Section, label: string, dim = false) {
    const sec = h('details', { class: `cf-sec${dim ? ' dim' : ''}`, open: open.has(`s:${key}`) || (key === 'identity' && !dim) },
      h('summary', {}, label),
      ...section(key),
    );
    sec.dataset.section = key;
    sec.addEventListener('toggle', () => (sec.open ? open.add(`s:${key}`) : open.delete(`s:${key}`)));
    return sec;
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
    const blocks: Node[] = usedOrder.map((o) => sectionBlock(o.key, o.label));
    if (others.length)
      blocks.push(h('details', { class: 'cf-others' },
        h('summary', {}, `Autres champs (${others.length})`),
        h('p', { class: 'hint' }, 'Non affichés par ce modèle, mais conservés : ils apparaissent si vous changez de modèle.'),
        ...others.map((o) => sectionBlock(o.key, o.label, true)),
      ));
    const fieldset = h('fieldset', { class: 'cf-fields', disabled }, ...blocks);
    body.replaceChildren(fieldset);
    status();
    root.scrollTop = scroll;
  }

  // Fiche modifiée depuis la page (ou annuler) : on reconstruit, sauf pendant une saisie dans le formulaire.
  qf.onExternalChange = () => {
    if (!root.contains(document.activeElement)) render();
  };
  qf.onStatus = status;
  return { render, status };
}
