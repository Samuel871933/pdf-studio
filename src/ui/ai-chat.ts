import { StaticCanvas, type Canvas } from 'fabric';
import { analyze, matchOffer, type Check } from '../analysis';
import { runAgent, type ConversationLine, type Proposal } from '../ai/agent';
import { AiSession, validateConnection } from '../ai/session';
import { readPreferences, savePreferences, forgetPreferences, readVault, storeVault, forgetVault, encryptKey, decryptKey, vaultAvailable } from '../ai/storage';
import { DEFAULT_MODELS, type Provider } from '../ai/providers';
import type { Editor } from '../editor';
import { composePage, QuickFill, type FillState } from '../quickfill';
import { createDraft, describePage, draftJSON, editDraft, PAGE_TOOLS, type PageDraft } from '../ai/page-tools';
import type { CanvasJSON } from '../editor';
import { ALL_TEMPLATES, PALETTES, buildFit, type Built } from '../templates';
import { clonePersona, EMPTY } from '../templates/content';
import { h, modal } from './dom';
import { uiIcon } from './icons';

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } }; resultIndex: number }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; abort(): void;
}

const LABELS: Record<string, string> = {
  name: 'Nom', title: 'Intitulé', phone: 'Téléphone', email: 'E-mail', city: 'Ville', address: 'Adresse',
  linkedin: 'LinkedIn', github: 'GitHub', profile: 'Profil', experience: 'Expériences', education: 'Formations',
  achievements: 'Réalisations', skills: 'Compétences', tools: 'Outils', languages: 'Langues', interests: 'Centres d’intérêt',
  letter: 'Lettre de motivation', labels: 'Titres de sections', custom: 'Sections personnalisées', hidden: 'Sections masquées',
  org: 'Organisation', dates: 'Dates', text: 'Texte', bullets: 'Points clés', level: 'Niveau', detail: 'Précision', score: 'Niveau visuel',
  recipient: 'Destinataire', subject: 'Objet', greeting: 'Formule d’appel', paragraphs: 'Paragraphes', closing: 'Formule de fin',
  after: 'Après la section', kind: 'Présentation', entries: 'Entrées', items: 'Liste',
};
function readable(value: unknown): string {
  if (value == null || value === '') return 'Vide';
  if (Array.isArray(value)) return value.length ? value.map(readable).join('\n\n') : 'Liste vide';
  if (typeof value === 'object') return Object.entries(value).filter(([k]) => k !== 'id')
    .map(([k, v]) => `${LABELS[k] ?? k} : ${readable(v)}`).join('\n') || 'Aucun';
  return String(value);
}
// Points de lecture que le contenu peut corriger (le contraste ou la taille dépendent du modèle visuel).
const actionable = (checks: Check[]) => checks.filter((c) => (c.level === 'error' || c.level === 'warn') && !/contraste|très petit|sous une forme/i.test(c.title));
// En mise en page libre, tout point de lecture compte, visuel compris.
const actionableLayout = (checks: Check[]) => checks.filter((c) => c.level === 'error' || c.level === 'warn');
/** Même point d'une version à l'autre, quels que soient les nombres entre parenthèses. */
const issueKey = (c: Check) => c.title.replace(/\s*\(.*?\)/g, '');
/** Offre d'emploi collée dans la demande : assez longue et avec le vocabulaire d'une annonce. */
const OFFER_MARKERS = /\b(missions?|profil recherché|vous serez|nous recherchons|poste|cdi|cdd|alternance|stage|rémunération|salaire|compétences requises|qualifications|responsabilités|rejoindre|candidat)\b/gi;
function looksLikeOffer(request: string) {
  if (request.length < 300) return false;
  return request.length >= 1500 || new Set(request.toLowerCase().match(OFFER_MARKERS) ?? []).size >= 3;
}
const comparable = (value: unknown) => value == null || (Array.isArray(value) && !value.length)
  || (typeof value === 'object' && !Object.keys(value).length) ? '' : JSON.stringify(value);

/** Assistant entièrement navigateur. Ni la session ni la conversation ne sont sérialisées. */
export function setupAiChat(root: HTMLElement, ed: Editor, qf: QuickFill, onApplied: (palette: string) => void, close: () => void) {
  const session = new AiSession();
  const provider = { value: 'openai' as Provider, disabled: false };
  const providerSwitcher = h('div', { class: 'ai-provider-switcher', role: 'radiogroup', ariaLabel: 'Fournisseur IA' });
  const providerButtons = (['openai', 'claude'] as const).map((name) => {
    const button = h('button', { type: 'button', class: `ai-provider-option ${name}`, role: 'radio' },
      h('img', { src: `${import.meta.env.BASE_URL}branding/${name}.svg`, alt: '', class: 'ai-provider-logo' }),
      h('span', {}, name === 'openai' ? 'OpenAI' : 'Claude'));
    button.dataset.provider = name;
    button.addEventListener('click', () => { if (!provider.disabled && provider.value !== name) changeProvider(name); });
    providerSwitcher.append(button);
    return button;
  });
  providerSwitcher.addEventListener('keydown', (event) => {
    if (provider.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : provider.value === 'openai' ? 1 : 0;
    providerButtons[next].click(); providerButtons[next].focus();
  });
  const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: false, maxLength: 500, ariaLabel: 'Clé API personnelle', placeholder: 'Votre clé API personnelle' });
  key.name = 'pdf-studio-ephemeral-key';
  const model = h('input', { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: 120, ariaLabel: 'Identifiant du modèle', placeholder: 'Identifiant du modèle de votre compte API', value: DEFAULT_MODELS.openai });
  const savedPreferences = readPreferences();
  if (savedPreferences) {
    provider.value = savedPreferences.provider; model.value = savedPreferences.model;
    // Ancienne option « réglages seuls » : préremplir cette ouverture, puis retirer
    // sa persistance pour que la nouvelle option corresponde à une connexion complète.
    try { if (!readVault(savedPreferences.provider)) forgetPreferences(); } catch { /* Les données restent effaçables manuellement. */ }
  }
  else for (const name of ['openai', 'claude'] as const) {
    try { const stored = readVault(name); if (stored) { provider.value = name; model.value = stored.model; break; } } catch { /* Un coffre illisible reste effaçable. */ }
  }
  const rememberKey = h('input', { type: 'checkbox', id: 'ai-remember-connection' });
  const password = h('input', { type: 'password', id: 'ai-vault-password', autocomplete: 'off', maxLength: 1024, ariaLabel: 'Mot de passe du coffre', placeholder: '12 caractères minimum' });
  const confirmation = h('input', { type: 'password', id: 'ai-vault-confirmation', autocomplete: 'off', maxLength: 1024, ariaLabel: 'Confirmer le mot de passe du coffre' });
  const passwordLabel = h('label', {}, 'Mot de passe du coffre', password);
  const confirmationLabel = h('label', {}, 'Confirmer le mot de passe', confirmation);
  const vaultStatus = h('p', { class: 'hint', role: 'status' });
  const unlock = h('button', { type: 'button' }, 'Déverrouiller');
  const forget = h('button', { type: 'button', class: 'danger' }, 'Oublier ma clé');
  const vaultActions = h('div', { class: 'ai-actions' }, unlock, forget);
  const connect = h('button', { type: 'button' }, 'Connecter');
  const disconnect = h('button', { type: 'button', disabled: true }, 'Déconnecter');
  const state = h('p', { class: 'ai-chat-state', role: 'status', id: 'ai-session-status' }, 'Connectez votre compte IA pour commencer.');
  key.setAttribute('aria-describedby', state.id);
  model.setAttribute('aria-describedby', state.id);
  const usage = h('p', { class: 'hint ai-chat-usage' });
  const log = h('div', { class: 'ai-chat-log', role: 'log', ariaLabel: 'Conversation avec l’assistant', ariaLive: 'polite' });
  const previewBox = h('section', { class: 'ai-proposal', hidden: true, ariaLabel: 'Proposition de modification' });
  const prompt = h('textarea', { rows: 2, maxLength: 12000, ariaLabel: 'Votre demande à l’assistant', placeholder: 'Écrivez votre demande…' });
  const send = h('button', { type: 'submit', class: 'primary', disabled: true }, uiIcon('send'), 'Envoyer');
  const stop = h('button', { type: 'button', disabled: true }, 'Stop');
  const clear = h('button', { type: 'button', class: 'icon', title: 'Effacer la conversation', ariaLabel: 'Effacer la conversation' }, uiIcon('trash'));
  const minimize = h('button', { type: 'button', class: 'icon', title: 'Réduire (Échap)', ariaLabel: 'Réduire l’assistant' }, uiIcon('close'));
  minimize.addEventListener('click', close);
  const voice = h('button', { type: 'button', title: 'Dicter une demande', ariaLabel: 'Dicter une demande' }, uiIcon('microphone'), 'Dicter');
  const settingsToggle = h('button', { type: 'button', class: 'ai-chat-settings-toggle', title: 'Configurer le fournisseur, le modèle et la clé API', ariaLabel: 'Paramètres de connexion IA' }, uiIcon('settings'), 'Paramètres');
  const badge = h('span', { class: 'ai-chat-badge' }, 'À connecter');
  // Réglages en surimpression sur la discussion ; imposés tant qu'aucune session n'est ouverte.
  const settings = h('details', { class: 'ai-chat-connection', id: 'ai-connection-settings' }, h('summary', {}, uiIcon('chevron', 14), 'Retour à la discussion'));
  settingsToggle.setAttribute('aria-controls', settings.id);
  const suggestions = h('div', { class: 'ai-chat-suggestions' });
  for (const [label, request] of [
    ['Créer mon CV', 'Aide-moi à créer un CV. Pose-moi les questions nécessaires sur mon parcours.'],
    ['Améliorer mon CV', 'Améliore le contenu de mon CV en conservant uniquement les faits de mon parcours.'],
    ['Rédiger une lettre', 'Aide-moi à rédiger une lettre de motivation à partir de mon parcours. Demande-moi le poste et les informations manquantes.'],
  ]) {
    const example = h('button', { type: 'button' }, label, uiIcon('chevron', 14));
    example.addEventListener('click', () => { prompt.value = request; resizePrompt(); sync(); prompt.focus(); });
    suggestions.append(example);
  }
  const welcome = h('section', { class: 'ai-chat-empty' }, h('div', { class: 'ai-chat-welcome-icon' }, uiIcon('sparkle', 26)),
    h('h3', {}, 'Qu’est-ce qu’on crée ?'), h('p', {}, 'Un CV qui vous ressemble, une lettre ou quelques retouches. Décrivez votre idée, puis ajustons-la ensemble.'), suggestions);
  const typing = h('div', { class: 'ai-chat-typing', hidden: true }, h('span', { ariaHidden: 'true' }, '•••'), 'L’assistant réfléchit…');
  const thread = h('div', { class: 'ai-chat-thread' }, welcome, log, previewBox, typing);
  const form = h('form', { class: 'ai-chat-compose' }, h('div', { class: 'ai-chat-input-box' }, prompt,
    h('div', { class: 'ai-chat-input-actions' }, h('div', { class: 'ai-actions' }, voice, stop), send)),
    h('p', { class: 'ai-chat-keyboard' }, 'Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne'), usage);
  let busy = false;
  let credentialBusy = false;
  let hasVault = false;
  let applying = false;
  let history: ConversationLine[] = [];
  let pending: { proposal: Proposal; built: Built & { density: number }; revision: string } | null = null;
  let pendingPage: { draft: PageDraft; revision: string } | null = null;
  let canvas: StaticCanvas | null = null;
  let recognition: Recognition | null = null;
  let previewGeneration = 0;
  let workGeneration = 0;

  const errorText = (e: unknown) => e instanceof Error ? e.message : 'La demande n’a pas abouti.';
  const kindOf = (template: string) => ALL_TEMPLATES.find((t) => t.id === template)?.kind === 'letter' ? 'letter' as const : 'cv' as const;
  /** Analyse locale d'une page composée hors écran, avec les éléments ajoutés à la main. */
  async function inspect(page: CanvasJSON, kind: 'cv' | 'letter') {
    const scratch = new StaticCanvas(undefined, { width: 595.28, height: 841.89, enableRetinaScaling: false, renderOnAddRemove: false });
    try {
      await scratch.loadFromJSON(page);
      return analyze(scratch as unknown as Canvas, { ...ed.meta, kind });
    } finally { void scratch.dispose(); }
  }
  const pageKind = () => qf.state ? kindOf(qf.state.template) : ed.meta.kind ?? 'cv';
  /** Fige les surfaces de l'éditeur pendant une application ; renvoie la fonction qui les libère. */
  function freeze() {
    const surfaces = [...document.querySelectorAll<HTMLElement>('.layout, .topbar, .bottombar')];
    const inert = surfaces.map((s) => s.inert);
    surfaces.forEach((s) => { s.inert = true; });
    return () => surfaces.forEach((s, i) => { s.inert = inert[i]; });
  }
  /** Aperçu chargé : points d'attention et bouton d'agrandissement. */
  function decorate(localCanvas: StaticCanvas, points: Check[]) {
    const box = previewBox.querySelector('.ai-preview')!;
    if (points.length) box.before(h('details', { class: 'ai-proposal-points' },
      h('summary', {}, `Points d’attention (${points.length})`), h('ul', {}, ...points.map((c) => h('li', {}, h('strong', {}, c.title), ' — ', c.detail)))));
    const enlarge = h('button', { type: 'button', class: 'ai-preview-enlarge' }, 'Agrandir l’aperçu');
    enlarge.addEventListener('click', () => {
      const view = modal('Aperçu de la proposition', { wide: true });
      view.body.append(h('img', { class: 'ai-preview-large', alt: 'Document proposé par l’assistant', src: localCanvas.toDataURL({ format: 'png', multiplier: 1 }) }));
    });
    box.after(enlarge);
  }
  const revision = () => JSON.stringify({ canvas: ed.toJSON(), fill: ed.fill, meta: ed.meta, columns: ed.columns, retouched: qf.retouched });
  function scrollToLatest() { thread.scrollTop = thread.scrollHeight; }
  function resizePrompt() {
    prompt.style.height = 'auto';
    prompt.style.height = `${Math.min(140, prompt.scrollHeight || 56)}px`;
  }
  function line(role: 'user' | 'assistant', text: string) {
    if (role === 'user') welcome.hidden = true;
    log.append(h('div', { class: `ai-message ${role}` }, h('strong', { class: 'ai-message-author' }, role === 'user' ? 'Vous' : 'Assistant'), h('p', {}, text)));
    while (log.children.length > 30) log.firstElementChild?.remove();
    scrollToLatest();
  }
  function clearPreview() {
    previewGeneration++;
    pending = null;
    pendingPage = null;
    if (canvas) { void canvas.dispose(); canvas = null; }
    previewBox.replaceChildren();
    previewBox.hidden = true;
  }
  function refreshVault(updateConsent = false) {
    try {
      hasVault = !!readVault(provider.value as Provider);
      vaultStatus.textContent = hasVault ? 'Clé chiffrée enregistrée sur cet appareil. Déconnecter la verrouille ; Oublier ma clé l’efface.' : 'Aucune clé enregistrée pour ce fournisseur.';
    } catch (e) { hasVault = true; vaultStatus.textContent = errorText(e); }
    if (!vaultAvailable()) vaultStatus.textContent = 'Coffre indisponible : utilisez HTTPS ou localhost avec un navigateur compatible.';
    vaultActions.hidden = !hasVault;
    if (updateConsent) rememberKey.checked = hasVault;
  }
  function sync() {
    send.disabled = !session.connected || busy || credentialBusy || applying || !prompt.value.trim();
    connect.disabled = session.connected || busy || credentialBusy || applying;
    connect.textContent = session.connected ? 'Session prête' : 'Connecter';
    disconnect.disabled = !session.connected || applying || credentialBusy;
    provider.disabled = model.disabled = key.disabled = session.connected || busy || credentialBusy || applying;
    providerButtons.forEach((button) => {
      button.disabled = provider.disabled;
      const selected = button.dataset.provider === provider.value;
      button.setAttribute('aria-checked', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    rememberKey.disabled = busy || credentialBusy || applying || session.connected;
    rememberKey.disabled ||= !vaultAvailable();
    password.disabled = confirmation.disabled = busy || credentialBusy || applying || session.connected;
    passwordLabel.hidden = !rememberKey.checked && !hasVault;
    confirmationLabel.hidden = !rememberKey.checked || (hasVault && !key.value.trim());
    unlock.disabled = !hasVault || !vaultAvailable() || busy || credentialBusy || applying || session.connected;
    forget.disabled = busy || credentialBusy || applying;
    stop.disabled = !busy && !recognition;
    stop.hidden = !busy && !recognition;
    clear.disabled = busy || credentialBusy || applying;
    voice.disabled = busy || credentialBusy || applying || !RecognitionClass;
    prompt.disabled = busy || credentialBusy || applying;
    badge.textContent = session.connected ? (busy ? 'En cours…' : provider.value === 'claude' ? 'Claude' : 'OpenAI') : 'À connecter';
    badge.classList.toggle('connected', session.connected);
    badge.title = session.connected ? model.value : 'Clé API personnelle requise';
    typing.hidden = !busy;
    if (!session.connected && !settings.open) settings.open = true;
    settings.classList.toggle('locked', !session.connected);
    thread.inert = form.inert = settings.open;
    settingsToggle.hidden = !session.connected;
    settingsToggle.disabled = applying;
    settingsToggle.setAttribute('aria-expanded', String(settings.open));
    settingsToggle.classList.toggle('active', settings.open);
    usage.hidden = !usage.textContent;
    root.setAttribute('aria-busy', String(busy || credentialBusy || applying));
  }
  function reset() {
    workGeneration++;
    session.disconnect();
    recognition?.abort();
    recognition = null;
    voice.textContent = 'Dicter';
    key.value = '';
    password.value = confirmation.value = '';
    rememberKey.checked = false;
    const prefs = readPreferences();
    model.value = prefs?.provider === provider.value ? prefs.model : DEFAULT_MODELS[provider.value as Provider];
    prompt.value = '';
    history = [];
    log.replaceChildren();
    welcome.hidden = false;
    clearPreview();
    usage.textContent = '';
    state.textContent = 'Déconnecté. La clé et la conversation ont été retirées de la session.';
    state.classList.remove('error');
    settings.open = true;
    resizePrompt();
    refreshVault(true);
    sync();
  }
  function connected() {
    key.value = password.value = confirmation.value = '';
    rememberKey.checked = false;
    state.classList.remove('error');
    key.removeAttribute('aria-invalid'); model.removeAttribute('aria-invalid');
    state.textContent = 'Session prête. La première demande vérifiera l’accès au modèle et sera facturée par votre fournisseur.';
    settings.open = false;
    refreshVault(true);
    line('assistant', 'Je suis prêt à vous aider. Décrivez votre parcours ou dites-moi ce que vous souhaitez modifier.');
    prompt.focus();
  }
  function persistSettings() {
    if (rememberKey.checked && hasVault) savePreferences({ provider: provider.value as Provider, model: model.value.trim() });
  }
  connect.addEventListener('click', async () => {
    if (credentialBusy || busy || applying || session.connected) return;
    const generation = ++workGeneration;
    try {
      validateConnection(provider.value as Provider, key.value, model.value);
      if (rememberKey.checked) {
        if (password.value !== confirmation.value) throw new Error('Les mots de passe du coffre ne correspondent pas.');
        credentialBusy = true;
        state.textContent = 'Chiffrement de la clé sur cet appareil…';
        sync();
        const encrypted = await encryptKey({ provider: provider.value as Provider, model: model.value.trim() }, key.value, password.value);
        if (generation !== workGeneration) return;
        storeVault(encrypted);
      }
      session.connect(provider.value as Provider, key.value, model.value);
      connected();
      try { persistSettings(); } catch (e) { state.textContent = `Session prête. ${errorText(e)}`; }
    } catch (e) {
      if (generation !== workGeneration) return;
      state.textContent = errorText(e);
      state.classList.add('error');
      settings.open = true;
      const field = /mot.*passe/i.test(errorText(e)) ? password : /identifiant|Modèle/i.test(errorText(e)) ? model : key;
      field.setAttribute('aria-invalid', 'true');
      state.scrollIntoView({ block: 'nearest' });
      field.focus({ preventScroll: true });
    } finally { credentialBusy = false; password.value = confirmation.value = ''; refreshVault(); sync(); if (session.connected && generation === workGeneration) prompt.focus(); }
  });
  unlock.addEventListener('click', async () => {
    if (credentialBusy || busy || applying || session.connected) return;
    const generation = ++workGeneration;
    credentialBusy = true;
    state.classList.remove('error');
    state.textContent = 'Déverrouillage du coffre…';
    sync();
    try {
      const encrypted = readVault(provider.value as Provider);
      if (!encrypted) throw new Error('Aucune clé enregistrée pour ce fournisseur.');
      const secret = await decryptKey(encrypted, password.value);
      if (generation !== workGeneration) return;
      session.connect(provider.value as Provider, secret, model.value);
      connected();
      try { persistSettings(); } catch (e) { state.textContent = `Session prête. ${errorText(e)}`; }
    } catch (e) {
      if (generation !== workGeneration) return;
      state.textContent = errorText(e); state.classList.add('error');
      password.focus();
    } finally { credentialBusy = false; password.value = confirmation.value = ''; sync(); if (session.connected && generation === workGeneration) prompt.focus(); }
  });
  function forgetConnection() {
    forgetVault(provider.value);
    if (readPreferences()?.provider === provider.value) forgetPreferences();
  }
  forget.addEventListener('click', () => {
    try { forgetConnection(); reset(); state.textContent = 'Connexion enregistrée effacée et session déconnectée.'; }
    catch (e) { state.textContent = errorText(e); state.classList.add('error'); }
  });
  rememberKey.addEventListener('change', () => {
    password.value = confirmation.value = '';
    if (!rememberKey.checked && hasVault) {
      try { forgetConnection(); refreshVault(true); state.textContent = 'Connexion enregistrée effacée. Vous pouvez utiliser une clé pour cette ouverture uniquement.'; }
      catch (e) { refreshVault(true); state.textContent = errorText(e); state.classList.add('error'); }
    }
    sync();
  });
  function changeProvider(next: Provider) {
    provider.value = next;
    model.value = DEFAULT_MODELS[next];
    key.value = password.value = confirmation.value = '';
    rememberKey.checked = false;
    key.removeAttribute('aria-invalid'); model.removeAttribute('aria-invalid');
    state.classList.remove('error');
    const stored = (() => { try { return readVault(next); } catch { return null; } })();
    const prefs = readPreferences();
    if (stored) model.value = prefs?.provider === next ? prefs.model : stored.model;
    state.textContent = 'Modèle prérempli. Collez la clé API du fournisseur choisi ou déverrouillez sa connexion enregistrée.';
    refreshVault(true);
    sync();
  }
  for (const field of [key, model]) field.addEventListener('input', () => { field.removeAttribute('aria-invalid'); sync(); });
  settings.addEventListener('toggle', () => { sync(); if (!settings.open && !prompt.disabled) prompt.focus({ preventScroll: true }); });
  settingsToggle.addEventListener('click', () => { settings.open = !settings.open; if (settings.open && !session.connected) key.focus(); });
  disconnect.addEventListener('click', reset);
  clear.addEventListener('click', () => { history = []; log.replaceChildren(); welcome.hidden = false; clearPreview(); usage.textContent = ''; sync(); });
  stop.addEventListener('click', () => { workGeneration++; session.stop(); recognition?.abort(); clearPreview(); state.textContent = 'Arrêt demandé. Les appels déjà traités peuvent rester facturés.'; });
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', (e) => { if (e.persisted) reset(); });

  async function showProposal(proposal: Proposal, built: Built & { density: number }, stamp: string, base: FillState) {
    clearPreview();
    const generation = previewGeneration;
    const apply = h('button', { type: 'button', class: 'primary' }, 'Appliquer');
    const dismiss = h('button', { type: 'button' }, 'Rejeter');
    const notice = h('p', { class: 'hint', role: 'status' });
    const changes = Object.keys(proposal.data).filter((k) => comparable(proposal.data[k as keyof typeof proposal.data]) !== comparable(base.data[k as keyof typeof base.data]));
    const warning = built.overflow.length ? `Débordement : ${built.overflow.map((o) => o.section).join(', ')}. Corrigez le contenu avant application.` : 'Le contenu tient dans le modèle.';
    const previewElement = h('canvas', { ariaLabel: 'Aperçu du document proposé' });
    previewBox.append(h('h3', {}, 'Proposition'), h('p', {}, proposal.summary),
      h('p', { class: 'hint' }, `Modèle : ${ALL_TEMPLATES.find((t) => t.id === proposal.template)!.name} · Palette : ${PALETTES.find((p) => p.id === proposal.palette)!.label}`),
      h('p', { class: 'hint' }, `Champs modifiés : ${changes.map((k) => LABELS[k] ?? k).join(', ') || 'aucun'}.`), h('p', { class: 'hint' }, warning),
      h('div', { class: 'ai-preview' }, previewElement));
    if (qf.state?.retouches && proposal.template !== qf.state.template)
      previewBox.append(h('p', { class: 'hint' }, 'Changer de modèle retire les retouches des éléments du modèle actuel. Les éléments ajoutés sont conservés.'));
    const details = h('details', {}, h('summary', {}, 'Voir les changements de contenu'));
    for (const field of changes) details.append(h('h4', {}, LABELS[field] ?? field),
      h('strong', {}, 'Avant'), h('pre', {}, readable(base.data[field as keyof typeof base.data])),
      h('strong', {}, 'Proposition'), h('pre', {}, readable(proposal.data[field as keyof typeof proposal.data])));
    previewBox.append(details, notice, h('div', { class: 'ai-actions' }, apply, dismiss));
    previewBox.hidden = false;
    apply.disabled = !!built.overflow.length;
    const localCanvas = new StaticCanvas(previewElement, { width: 595.28, height: 841.89, enableRetinaScaling: false });
    canvas = localCanvas;
    try {
      await localCanvas.loadFromJSON(composePage(ed.canvas, built, qf.state, proposal.template).page);
      if (generation !== previewGeneration) return;
      localCanvas.renderAll();
      pending = { proposal, built, revision: stamp };
      decorate(localCanvas, actionable(analyze(localCanvas as unknown as Canvas, { ...ed.meta, kind: kindOf(proposal.template) }).checks));
      scrollToLatest();
    } catch {
      if (generation !== previewGeneration) return;
      clearPreview();
      throw new Error('Impossible de composer l’aperçu. Le document est inchangé.');
    }
    dismiss.addEventListener('click', () => {
      clearPreview();
      line('assistant', 'Proposition rejetée. Le document est inchangé.');
      history.push({ role: 'assistant', text: 'L’utilisateur a rejeté la dernière proposition.' });
    });
    apply.addEventListener('click', async () => {
      const next = pending;
      if (!next || applying || busy) return;
      applying = true;
      apply.disabled = dismiss.disabled = true;
      sync();
      const release = freeze();
      try {
        ed.settle();
        await qf.flush();
        if (revision() !== next.revision) throw new Error('Le document a changé depuis la demande. Envoyez une nouvelle demande pour repartir de sa version actuelle.');
        await qf.applyProposal({ template: next.proposal.template, palette: next.proposal.palette, data: next.proposal.data, linked: true, touched: true }, next.built);
        onApplied(next.proposal.palette);
        clearPreview();
        line('assistant', 'Modifications appliquées. Vous pouvez les annuler avec Annuler ou Ctrl+Z.');
        history.push({ role: 'assistant', text: 'L’utilisateur a appliqué la dernière proposition.' });
      } catch (e) { notice.textContent = errorText(e); }
      finally {
        release();
        applying = false;
        apply.disabled = !!built.overflow.length;
        dismiss.disabled = false;
        sync();
      }
    });
  }

  async function showPage(draft: PageDraft, summary: string, stamp: string) {
    clearPreview();
    const generation = previewGeneration;
    const apply = h('button', { type: 'button', class: 'primary' }, 'Appliquer');
    const dismiss = h('button', { type: 'button' }, 'Rejeter');
    const notice = h('p', { class: 'hint', role: 'status' });
    const previewElement = h('canvas', { ariaLabel: 'Aperçu de la mise en page proposée' });
    previewBox.append(h('h3', {}, 'Mise en page proposée'), h('p', {}, summary),
      h('p', { class: 'hint' }, qf.state?.linked
        ? 'Retouches et éléments ajoutés sont conservés quand le contenu change ; Réinitialiser (onglet Contenu) rend au modèle son aspect d’origine.'
        : 'Page libre : chaque élément reste tel que vous l’appliquez.'),
      h('div', { class: 'ai-preview' }, previewElement), notice, h('div', { class: 'ai-actions' }, apply, dismiss));
    previewBox.hidden = false;
    const localCanvas = new StaticCanvas(previewElement, { width: 595.28, height: 841.89, enableRetinaScaling: false });
    canvas = localCanvas;
    try {
      await localCanvas.loadFromJSON(draftJSON(draft));
      if (generation !== previewGeneration) return;
      localCanvas.renderAll();
      pendingPage = { draft, revision: stamp };
      decorate(localCanvas, actionableLayout(analyze(localCanvas as unknown as Canvas, { ...ed.meta, kind: pageKind() }).checks));
      scrollToLatest();
    } catch {
      if (generation !== previewGeneration) return;
      clearPreview();
      throw new Error('Impossible de composer l’aperçu. Le document est inchangé.');
    }
    dismiss.addEventListener('click', () => {
      clearPreview();
      line('assistant', 'Mise en page rejetée. Le document est inchangé.');
      history.push({ role: 'assistant', text: 'L’utilisateur a rejeté la dernière mise en page.' });
    });
    apply.addEventListener('click', async () => {
      const next = pendingPage;
      if (!next || applying || busy) return;
      applying = true;
      apply.disabled = dismiss.disabled = true;
      sync();
      const release = freeze();
      try {
        ed.settle();
        await qf.flush();
        if (revision() !== next.revision) throw new Error('Le document a changé depuis la demande. Envoyez une nouvelle demande pour repartir de sa version actuelle.');
        await ed.transaction(() => ed.load(draftJSON(next.draft), false));
        if (next.draft.retouched) { qf.retouched = true; qf.onStatus(); }
        clearPreview();
        line('assistant', 'Mise en page appliquée. Vous pouvez l’annuler avec Annuler ou Ctrl+Z.');
        history.push({ role: 'assistant', text: 'L’utilisateur a appliqué la dernière mise en page.' });
      } catch (e) { notice.textContent = errorText(e); }
      finally { release(); applying = false; apply.disabled = dismiss.disabled = false; sync(); }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || credentialBusy || applying || !session.connected || !prompt.value.trim()) return;
    recognition?.abort();
    const request = prompt.value.trim();
    const generation = ++workGeneration;
    const previousProposal = pending;
    busy = true;
    state.classList.remove('error');
    clearPreview();
    sync();
    scrollToLatest();
    try {
      ed.settle();
      await qf.flush();
      // Page détachée ou vierge : l'assistant ne travaille que la mise en page.
      const linked = !!qf.state?.linked;
      const base = linked ? structuredClone(qf.state!) : null;
      // Les exemples fictifs de la galerie ne deviennent jamais des faits utilisateur.
      if (base && !base.touched) base.data = clonePersona(EMPTY);
      const stamp = revision();
      session.checkContent({ request, data: base?.data });
      if (generation !== workGeneration) return;
      line('user', request);
      // Une proposition peut être retravaillée avant application, sur la même révision.
      const source = base && previousProposal?.revision === stamp ? previousProposal.proposal : base;
      // Diagnostic local transmis d'emblée : les points déjà connus ne relancent pas l'assistant ensuite.
      const page = analyze(ed.canvas, { ...ed.meta, kind: pageKind() });
      const current = !base || base.touched ? page : null;
      const known = new Set(actionable(current?.checks ?? []).map(issueKey));
      const knownLayout = new Set(actionableLayout(page.checks).map(issueKey));
      // Brouillon de mise en page : copie de la page, sans les images (jamais envoyées).
      const draft = createDraft(ed.toJSON());
      const diagnostic = [
        ...actionable(current?.checks ?? []).map((c) => `- ${c.title}`),
        // Une longue demande contient probablement une offre : mots-clés de l'offre absents du document.
        ...(looksLikeOffer(request) ? (() => {
          const missing = matchOffer(request, current?.text ?? '').missing.slice(0, 12);
          return missing.length ? [`- Mots-clés de l’offre absents du document : ${missing.join(', ')}`] : [];
        })() : []),
      ].join('\n');
      const result = await runAgent(session, source, {
        templates: ALL_TEMPLATES.map(({ id, name, kind, ats, description }) => ({ id, name, kind, ats, description })),
        palettes: PALETTES.map(({ id, label }) => ({ id, label })),
      }, history, request, async (proposal) => {
        const built = await buildFit(ALL_TEMPLATES.find((t) => t.id === proposal.template)!, PALETTES.find((p) => p.id === proposal.palette)!, proposal.data);
        const issues = actionable((await inspect(composePage(ed.canvas, built, qf.state, proposal.template).page, kindOf(proposal.template))).checks).filter((c) => !known.has(issueKey(c))).map((c) => `${c.title} : ${c.detail}`);
        return { status: 'preview_only', overflow: built.overflow, density: built.density, issues };
      }, (text) => { if (generation === workGeneration) state.textContent = text; }, diagnostic, {
        tools: PAGE_TOOLS,
        read: () => describePage(draft),
        edit: async (args) => {
          const report = editDraft(draft, args, linked);
          const issues = actionableLayout((await inspect(draftJSON(draft), pageKind())).checks).filter((c) => !knownLayout.has(issueKey(c))).map((c) => `${c.title} : ${c.detail}`);
          return { status: 'preview_only', overflow: [], issues, report };
        },
      });
      if (!session.connected || generation !== workGeneration) return;
      if (revision() !== stamp) throw new Error('Le document a changé pendant la demande. La proposition n’a pas été appliquée ; envoyez une nouvelle demande.');
      line('assistant', result.text);
      if (result.edited) await showPage(draft, result.text, stamp);
      if (result.proposal && base) {
        const built = await buildFit(ALL_TEMPLATES.find((t) => t.id === result.proposal!.template)!, PALETTES.find((p) => p.id === result.proposal!.palette)!, result.proposal.data);
        if (!session.connected || generation !== workGeneration) return;
        await showProposal(result.proposal, built, stamp, base);
      }
      if (!session.connected || generation !== workGeneration) return;
      history.push({ role: 'user', text: request }, { role: 'assistant', text: result.text });
      history = history.slice(-8);
      prompt.value = '';
      resizePrompt();
      usage.textContent = `Cette demande : ${result.inputTokens} tokens en entrée${result.cachedTokens ? ` (dont ${result.cachedTokens} lus en cache, à tarif réduit)` : ''} · ${result.outputTokens} en sortie. Facturation par votre fournisseur.`;
      state.textContent = result.proposal || result.edited ? 'Proposition prête. Vérifiez l’aperçu avant de l’appliquer.' : 'Réponse reçue. Le document est inchangé.';
    } catch (e) {
      if (session.connected && generation === workGeneration) {
        state.textContent = errorText(e);
        state.classList.add('error');
        state.scrollIntoView({ block: 'nearest' });
      }
    }
    finally { busy = false; sync(); }
  });
  prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault(); form.requestSubmit();
    }
  });
  prompt.addEventListener('input', () => { resizePrompt(); sync(); });

  const browser = window as typeof window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const RecognitionClass = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  voice.addEventListener('click', () => {
    if (!RecognitionClass || busy || applying) return;
    if (recognition) { recognition.abort(); return; }
    const rec = new RecognitionClass();
    recognition = rec;
    rec.lang = 'fr-FR'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (event) => {
      if (recognition !== rec) return;
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal)
        prompt.value = `${prompt.value}${prompt.value ? ' ' : ''}${event.results[i][0].transcript}`.slice(0, 12000);
      resizePrompt(); sync();
    };
    rec.onerror = () => { if (recognition === rec) state.textContent = 'Dictée indisponible ou accès au micro refusé. Vous pouvez saisir votre demande.'; };
    rec.onend = () => { if (recognition === rec) recognition = null; voice.textContent = 'Dicter'; sync(); };
    try { rec.start(); voice.textContent = 'Arrêter la dictée'; state.textContent = 'Dictée en cours. Relisez le texte avant de l’envoyer.'; }
    catch { recognition = null; state.textContent = 'Impossible de démarrer la dictée dans ce navigateur.'; }
    sync();
  });

  const privacy = h('details', { class: 'ai-chat-info' }, h('summary', {}, 'Données, facturation et dictée'),
    h('p', {}, 'Vos demandes, le contenu utile et les derniers échanges sont envoyés au fournisseur choisi. La photo reste locale. Les appels utilisent votre compte API ; les abonnements aux interfaces de chat ne les financent pas automatiquement.'),
    h('p', {}, 'Connexion mémorisable localement avec clé chiffrée. Le mot de passe n’est jamais enregistré. Le chiffrement protège le coffre verrouillé ; il ne protège pas d’un script malveillant pendant l’utilisation. La conversation reste uniquement en mémoire.'),
    h('p', {}, RecognitionClass ? 'La dictée utilise le service du navigateur, qui peut transmettre votre voix à un service distant. Relisez le texte avant de l’envoyer.' : 'Dictée indisponible dans ce navigateur. Utilisez le clavier ou la dictée de votre appareil.'));
  settings.append(h('div', { class: 'ai-chat-settings' },
    h('div', { class: 'ai-provider-field' }, h('span', {}, 'Fournisseur'), providerSwitcher), h('label', {}, 'Modèle', model), h('label', {}, 'Clé API', key),
    h('label', { class: 'check' }, rememberKey, 'Mémoriser cette connexion sur cet appareil'),
    h('p', { class: 'hint' }, 'Fournisseur, modèle et clé chiffrée, protégés par votre mot de passe. Après réouverture, déverrouillez la connexion. Enregistrer une nouvelle clé remplace l’ancienne.'),
    passwordLabel, confirmationLabel, vaultStatus, vaultActions,
    h('p', { class: 'hint' }, 'Sans coffre, clé uniquement en mémoire. Vos demandes sont transmises au fournisseur et facturées sur votre compte API.'),
    h('div', { class: 'ai-actions' }, connect, disconnect), privacy));
  voice.title = RecognitionClass ? 'Dicter : le navigateur peut transmettre votre voix à son service distant' : 'Dictée indisponible dans ce navigateur';
  root.append(h('header', { class: 'ai-chat-header' }, h('div', { class: 'ai-chat-heading' }, uiIcon('sparkle'), h('div', {}, h('h3', {}, 'Votre assistant'), badge)), h('div', { class: 'ai-actions' }, settingsToggle, clear, minimize)),
    h('div', { class: 'ai-chat-body' }, thread, form, settings), state);
  refreshVault(true);
  if (hasVault) state.textContent = 'Clé enregistrée trouvée. Saisissez votre mot de passe pour déverrouiller votre coffre.';
  sync();
}
