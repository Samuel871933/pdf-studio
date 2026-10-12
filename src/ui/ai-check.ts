import { analyze, matchOffer, type Analysis, type Check, type DocKind, type Level } from '../analysis';
import type { Editor } from '../editor';
import { h, modal } from './dom';

const ICON: Record<Level, string> = { ok: '✓', warn: '!', error: '✕', info: 'i' };
const KIND_LABEL: Record<DocKind, string> = { cv: 'CV', letter: 'Lettre de motivation' };

const checkList = (checks: Check[]) =>
  h('ul', { class: 'checks' }, ...checks.map((c) =>
    h('li', { class: c.level }, h('span', { class: 'mark', ariaHidden: 'true' }, ICON[c.level]), h('div', {}, h('strong', {}, c.title), h('p', {}, c.detail))),
  ));

/** Fenêtre « Analyse IA » : ce que lit un outil de tri, points à corriger, comparaison avec une offre. */
export function openAiCheck(ed: Editor) {
  ed.settle();
  const m = modal('Analyse IA — lecture automatique du document', { wide: true });
  let a: Analysis = analyze(ed.canvas, ed.meta);

  // Type de document : fixé par le modèle, modifiable ici (et mémorisé dans le projet).
  const kindBtns = (['cv', 'letter'] as DocKind[]).map((k) => {
    const b = h('button', { type: 'button', role: 'radio' }, KIND_LABEL[k]);
    b.addEventListener('click', () => {
      ed.meta.kind = k;
      ed.dirty = true;
      a = analyze(ed.canvas, ed.meta, k);
      render();
    });
    return [k, b] as const;
  });
  const kindHint = h('span', { class: 'hint' });
  const score = h('p', { class: 'ai-score' });
  const aiChecks = h('div', {});
  const contentTitle = h('h3', {});
  const contentChecks = h('div', {});

  // Comparaison avec une offre d'emploi (analyse locale des mots-clés).
  const offer = h('textarea', { rows: 6, placeholder: 'Collez ici le texte de l’offre d’emploi…', maxLength: 30000 });
  const result = h('div', { class: 'offer-result' });
  const run = h('button', { type: 'button', class: 'primary' }, 'Comparer');
  const compare = () => {
    if (offer.value.trim().length < 40) {
      result.replaceChildren(h('p', { class: 'hint' }, 'Collez une offre un peu plus longue.'));
      return;
    }
    const r = matchOffer(offer.value, a.text);
    const pct = Math.round(r.coverage * 100);
    const bar = h('div', { class: 'meter' }, h('span', {}));
    (bar.firstChild as HTMLElement).style.width = `${pct}%`;
    result.replaceChildren(
      h('p', {}, h('strong', {}, `${pct} %`), ` des mots-clés principaux de l’offre se retrouvent dans votre ${a.kind === 'cv' ? 'CV' : 'lettre'}.`),
      bar,
      r.missing.length ? h('p', { class: 'hint' }, 'Absents — à ajouter s’ils correspondent réellement à votre parcours :') : '',
      h('div', { class: 'kw' }, ...r.missing.map((k) => h('span', { class: 'missing' }, k))),
      r.matched.length ? h('p', { class: 'hint' }, 'Présents :') : '',
      h('div', { class: 'kw' }, ...r.matched.map((k) => h('span', { class: 'found' }, k))),
    );
  };
  run.addEventListener('click', compare);

  const pre = h('pre', { class: 'ai-text', tabIndex: 0 });
  const copy = h('button', { type: 'button' }, 'Copier le texte');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(a.text);
      copy.textContent = 'Copié ✓';
    } catch {
      copy.textContent = 'Copie impossible';
    }
  });

  function render() {
    for (const [k, b] of kindBtns) b.ariaChecked = String(k === a.kind);
    kindHint.textContent = a.guessed !== a.kind ? `Le texte ressemble plutôt à : ${KIND_LABEL[a.guessed]}.` : '';
    const problems = a.checks.filter((c) => c.level === 'error' || c.level === 'warn').length;
    const passed = a.checks.filter((c) => c.level === 'ok').length;
    score.replaceChildren(
      h('strong', {}, problems ? `${problems} point${problems > 1 ? 's' : ''} à corriger` : 'Prêt pour les outils de tri'),
      ` · ${passed} vérification${passed > 1 ? 's' : ''} réussie${passed > 1 ? 's' : ''}`,
    );
    aiChecks.replaceChildren(checkList(a.checks.filter((c) => c.scope === 'ai')));
    contentTitle.textContent = a.kind === 'cv' ? 'Contenu du CV' : 'Contenu de la lettre';
    contentChecks.replaceChildren(checkList(a.checks.filter((c) => c.scope === 'content')));
    pre.textContent = a.text;
    if (result.childElementCount) compare();
  }

  m.body.append(
    h('div', { class: 'row kind-row' }, h('span', { class: 'hint' }, 'Type de document :'), h('div', { class: 'chips', role: 'radiogroup' }, ...kindBtns.map(([, b]) => b)), kindHint),
    h('div', { class: 'ai-grid' },
      h('section', {},
        score,
        h('h3', {}, 'Lisibilité par une IA'),
        aiChecks,
        contentTitle,
        contentChecks,
        h('h3', {}, 'Comparer avec une offre d’emploi'),
        offer,
        h('div', { class: 'row' }, run, h('span', { class: 'hint' }, 'Analyse locale : l’offre n’est envoyée nulle part.')),
        result,
      ),
      h('section', {},
        h('div', { class: 'row between' }, h('h3', {}, 'Texte lu par une IA'), copy),
        h('p', { class: 'hint' }, 'Texte extrait du PDF exporté, dans l’ordre du fichier. Titres (#), sections (##) et puces (-) reflètent la structure balisée du PDF.'),
        pre,
      ),
    ),
  );
  render();
}
