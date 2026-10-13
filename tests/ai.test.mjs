import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

// Compile les modules purs dans un dossier temporaire, sans changer le build de l'app.
const temp = await mkdtemp(join(tmpdir(), 'pdf-studio-ai-'));
for (const name of ['ai/schema', 'ai/providers', 'ai/session', 'ai/storage', 'ai/agent', 'templates/content', 'retouch']) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const compiled = stripTypeScriptTypes(source)
    .replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.mjs$3');
  const target = join(temp, `${name}.mjs`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, compiled);
}
const load = (name) => import(pathToFileURL(join(temp, `${name}.mjs`)).href);
const { validate, proposalSchema } = await load('ai/schema');
const { complete } = await load('ai/providers');
const { AiSession } = await load('ai/session');
const { encryptKey, decryptKey, storeVault, readVault, forgetVault, readPreferences, savePreferences, forgetPreferences } = await load('ai/storage');
const { applyContentProposal, runAgent } = await load('ai/agent');
const { EMPTY, GENERALIST } = await load('templates/content');
const { stamp, capture, retouch, retouchOf, cleanRetouches } = await load('retouch');
globalThis.window = globalThis;
const realFetch = globalThis.fetch;
process.on('exit', () => { globalThis.fetch = realFetch; });
test.after(async () => { globalThis.fetch = realFetch; await rm(temp, { recursive: true, force: true }); });

const key = 'test-key-only-for-mocks';
const schema = proposalSchema(['classic', 'letter'], ['ocean', 'foret']);
const catalog = { templates: [{ id: 'classic', name: 'Classique', kind: 'cv', description: 'Sobre' }, { id: 'letter', name: 'Lettre', kind: 'letter', description: 'Lettre' }], palettes: [{ id: 'ocean', label: 'Océan' }, { id: 'foret', label: 'Forêt' }] };
const base = () => ({ data: structuredClone(GENERALIST), template: 'classic', palette: 'ocean' });
const tool = { name: 'propose_document', description: 'Aperçu', schema };
const reply = (args, text = 'Vérifiez l’aperçu.', name = tool.name) => new Response(JSON.stringify({ choices: [{ finish_reason: args ? 'tool_calls' : 'stop', message: { content: args ? null : text, ...(args ? { tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));

test('validation : propriétés interdites, mauvais types et limites sont rejetés', () => {
  for (const args of [
    { summary: 'x', content: { photo: 'https://example.com' } },
    { summary: 'x', content: { name: 'x'.repeat(201) } },
    { summary: 'x', content: { skills: [{ name: 'Code', level: 9 }] } },
    { summary: 'x', template: 'inconnu', content: {} },
    { summary: 'x', content: { experience: [{ title: 'T' }] } },
    JSON.parse('{"summary":"x","content":{"__proto__":{"polluted":true}}}'),
  ]) assert.throws(() => validate(schema, args), /invalide/);
  assert.equal({}.polluted, undefined);
});

test('fusion : seuls les champs visés changent, photo et lettre non visée préservées', () => {
  const original = base(); original.data.photo = 'data:image/png;base64,AAAA';
  const before = structuredClone(original);
  const next = applyContentProposal(original, { summary: 'Titre et objet', content: { title: 'Nouveau poste', letter: { subject: 'Candidature' } } }, schema);
  assert.equal(next.data.title, 'Nouveau poste');
  assert.equal(next.data.letter.subject, 'Candidature');
  assert.deepEqual(next.data.letter.paragraphs, original.data.letter.paragraphs);
  assert.deepEqual(next.data.experience, original.data.experience);
  assert.equal(next.data.photo, original.data.photo);
  assert.deepEqual(original, before);
  assert.deepEqual(applyContentProposal(original, { summary: 'Effacer', content: { experience: [] } }, schema).data.experience, []);
});

test('sections : identifiants dupliqués ou chemins arbitraires refusés', () => {
  const section = { id: 'projects', title: 'Projets', kind: 'text', after: 'education', entries: [], items: [], text: 'Projet réel' };
  assert.throws(() => applyContentProposal(base(), { summary: 'x', content: { custom: [section, section] } }, schema), /identifiants/);
  assert.throws(() => applyContentProposal(base(), { summary: 'x', content: { custom: [{ ...section, id: '../bad' }] } }, schema), /identifiants/);
});

test('OpenAI : authentification dans les en-têtes uniquement, appels et résultats d’outils', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.ok(!options.body.includes(key));
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.messages.at(-1).tool_call_id, 'call_1');
    assert.equal(body.messages[2].tool_calls[0].function.name, 'propose_document');
    return reply(null);
  };
  const result = await complete('openai', key, 'test-model', 'Règles', [{ role: 'user', text: 'Modifier' }, { role: 'assistant', text: '', calls: [{ id: 'call_1', name: tool.name, arguments: { summary: 'x', content: {} } }] }, { role: 'tool', id: 'call_1', text: '{"status":"preview_only"}' }], [tool], new AbortController().signal);
  assert.equal(result.inputTokens, 10);
});

test('Claude : blocs tool_use/tool_result et autorisation navigateur explicite', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'], key);
    assert.equal(options.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.ok(!options.body.includes(key));
    const body = JSON.parse(options.body);
    assert.equal(body.messages[1].content[0].type, 'tool_use');
    assert.equal(body.messages[2].content[0].type, 'tool_result');
    return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c2', name: tool.name, input: { summary: 'x', content: {} } }], usage: { input_tokens: 2, output_tokens: 3 } }));
  };
  const result = await complete('claude', key, 'test-model', 'Règles', [{ role: 'user', text: 'Modifier' }, { role: 'assistant', text: '', calls: [{ id: 'c1', name: tool.name, arguments: {} }] }, { role: 'tool', id: 'c1', text: '{}' }], [tool], new AbortController().signal);
  assert.equal(result.calls[0].id, 'c2');
});

test('erreur fournisseur : corps non affiché et aucune répétition automatique', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(key, { status: 401 }); };
  await assert.rejects(complete('openai', key, 'test', 'x', [], [tool], new AbortController().signal), (error) => error.message.includes('401') && !error.message.includes(key));
  assert.equal(calls, 1);
});

test('réseau : une erreur fetch ne prétend pas que la clé ou le modèle est refusé', async () => {
  globalThis.fetch = async () => { throw new TypeError(key); };
  await assert.rejects(complete('claude', key, 'test', 'x', [], [tool], new AbortController().signal),
    (error) => error.message.includes('api.anthropic.com') && error.message.includes('n’ont pas pu être vérifiés') && !error.message.includes(key));
});

test('réseau : un blocage CSP confirmé est distingué d’une erreur CORS', async () => {
  const document = new EventTarget();
  globalThis.document = document;
  globalThis.fetch = async () => {
    queueMicrotask(() => document.dispatchEvent(Object.assign(new Event('securitypolicyviolation'), {
      effectiveDirective: 'connect-src', disposition: 'enforce', blockedURI: 'https://api.anthropic.com/v1/messages',
    })));
    throw new TypeError('Failed to fetch');
  };
  try {
    await assert.rejects(complete('claude', key, 'test', 'x', [], [tool], new AbortController().signal), /politique de sécurité.*bloque/);
  } finally { delete globalThis.document; }
});

test('session : refus d’une clé dans le contexte avant tout appel réseau', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  globalThis.fetch = async () => { assert.fail('La clé ne doit pas sortir dans le corps'); };
  await assert.rejects(session.run((send) => send('x', [{ role: 'user', text: key }], [tool])), /clé API/);
  session.disconnect(); assert.equal(session.connected, false);
});

test('session : configuration incomplète et clé du mauvais fournisseur sont signalées sans exposer la clé', () => {
  const session = new AiSession();
  assert.throws(() => session.connect('claude', '', 'test'), /Clé API.*vide/);
  assert.throws(() => session.connect('claude', key, ''), /Modèle.*vide/);
  const claudeKey = 'sk-ant-test-wrong-provider';
  assert.throws(() => session.connect('openai', claudeKey, 'test'), (error) => error.message.includes('Claude') && !error.message.includes(claudeKey));
  const openaiKey = 'sk-proj-test-wrong-provider';
  assert.throws(() => session.connect('claude', openaiKey, 'test'), (error) => error.message.includes('OpenAI') && !error.message.includes(openaiKey));
  assert.equal(session.connected, false);
});

test('session : déconnexion rejette une réponse tardive même si fetch ignore l’annulation', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  const pending = session.run((send) => send('x', [{ role: 'user', text: 'x' }], [tool]));
  session.disconnect(); release(reply(null));
  await assert.rejects(pending, /arrêtée/);
  assert.equal(session.connected, false);
});

test('session : une réponse qui reflète la clé n’entre ni dans le chat ni dans le document', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  globalThis.fetch = async () => reply(null, key);
  await assert.rejects(session.run((send) => send('Règles', [{ role: 'user', text: 'Bonjour' }], [tool])), /clé API/);
  session.disconnect();
});

test('agent : boucle de correction sur copie, contexte sans photo et coût cumulé', async () => {
  const original = base(); original.data.photo = 'data:image/png;base64,AAAA';
  const before = structuredClone(original);
  const session = new AiSession(); session.connect('openai', key, 'test');
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.ok(!options.body.includes('data:image'));
    assert.ok(!options.body.includes(key));
    calls++;
    if (calls === 1) return reply({ summary: 'Titre', content: { title: 'Chef de projet' } });
    assert.equal(body.messages.at(-1).role, 'tool');
    if (calls === 2) return reply({ summary: 'Profil plus court', content: { profile: 'Profil court fidèle.' } });
    return reply(null);
  };
  const previews = [];
  const result = await runAgent(session, original, catalog, [], 'Raccourcis mon profil', async (p) => { previews.push(p); return { overflow: previews.length === 1 ? [{ section: 'Profil' }] : [], issues: [] }; }, () => {});
  assert.equal(result.proposal.data.title, 'Chef de projet');
  assert.equal(result.proposal.data.profile, 'Profil court fidèle.');
  // Proposition corrigée sans débordement : pas d'appel supplémentaire pour la commenter.
  assert.equal(calls, 2); assert.equal(result.text, 'Profil plus court');
  assert.equal(result.inputTokens, 20); assert.equal(result.outputTokens, 40);
  assert.deepEqual(original, before); assert.equal(previews.length, 2);
  session.disconnect();
});

test('agent : commandes invalides renvoyées au modèle, aucune mutation', async () => {
  const original = base(); const before = structuredClone(original);
  const session = new AiSession(); session.connect('openai', key, 'test');
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    if (++calls === 1) return reply({ summary: 'x', content: { photo: 'https://bad.invalid' } });
    assert.match(JSON.parse(options.body).messages.at(-1).content, /invalide/);
    return reply(null, 'Cette action n’est pas disponible.');
  };
  const result = await runAgent(session, original, catalog, [], 'Modifie', async () => assert.fail('Aucun aperçu invalide'), () => {});
  assert.equal(result.proposal, null); assert.deepEqual(original, before);
  session.disconnect();
});

test('agent : nombre de tours borné même avec des propositions répétées', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  let calls = 0;
  globalThis.fetch = async () => { calls++; return reply({ summary: 'x', content: { name: 'Nom' } }); };
  await assert.rejects(runAgent(session, { data: structuredClone(EMPTY), template: 'classic', palette: 'ocean' }, catalog, [], 'Crée', async () => ({ overflow: [{ section: 'Profil' }], issues: [] }), () => {}), /Limite/);
  assert.equal(calls, 4); session.disconnect();
});

test('agent : préfixe stable, document et diagnostic dans le dernier message, points de lecture signalés une seule fois', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return reply({ summary: `Version ${bodies.length}`, content: { title: 'Chef de projet' } });
  };
  const result = await runAgent(session, base(), catalog, [], 'Améliore mon CV', async () => ({ overflow: [], issues: ['Aucune date : indiquez les périodes'] }), () => {}, '- CV court (90 mots)');
  // Premier point signalé au modèle, puis la proposition suivante est montrée telle quelle.
  assert.equal(bodies.length, 2); assert.equal(result.text, 'Version 2');
  assert.match(bodies[1].messages.at(-1).content, /Aucune date/);
  const [first] = bodies;
  assert.ok(!first.messages[0].content.includes('<document>'), 'Le prompt système ne contient pas le document');
  assert.match(first.messages.at(-1).content, /<document>[\s\S]*<diagnostic>\n- CV court[\s\S]*<demande>\nAméliore mon CV/);
  session.disconnect();
});

test('Claude : points de cache, blocs de réflexion renvoyés tels quels et tokens en cache', async () => {
  const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.cache_control, { type: 'ephemeral' });
    assert.deepEqual(body.system, [{ type: 'text', text: 'Règles', cache_control: { type: 'ephemeral' } }]);
    assert.deepEqual(body.output_config, { effort: 'medium' });
    assert.deepEqual(body.messages[1].content[0], thinking);
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, cache_read_input_tokens: 900, cache_creation_input_tokens: 100, output_tokens: 3 } }));
  };
  const result = await complete('claude', key, 'claude-sonnet-5-5', 'Règles', [{ role: 'user', text: 'Modifier' },
    { role: 'assistant', text: '', calls: [{ id: 'c1', name: tool.name, arguments: {} }], raw: [thinking, { type: 'tool_use', id: 'c1', name: tool.name, input: {} }] },
    { role: 'tool', id: 'c1', text: '{}' }], [tool], new AbortController().signal);
  assert.equal(result.inputTokens, 1005); assert.equal(result.cachedTokens, 900);
});

test('patch : entrées ciblées remplacées, insérées ou retirées sans renvoyer la liste', () => {
  const original = base();
  const [first, second] = original.data.experience;
  const next = applyContentProposal(original, { summary: 'x', content: {}, patch: [
    { list: 'experience', index: 0, action: 'replace', entry: { ...first, title: 'Nouveau titre' } },
    { list: 'experience', index: 1, action: 'remove' },
    { list: 'tools', index: 0, action: 'insert', text: 'Figma' },
  ] }, schema);
  assert.equal(next.data.experience[0].title, 'Nouveau titre');
  assert.equal(next.data.experience.length, original.data.experience.length - 1);
  assert.notDeepEqual(next.data.experience[1], second);
  assert.equal(next.data.tools[0], 'Figma');
  assert.deepEqual(next.data.education, original.data.education);
  assert.throws(() => applyContentProposal(original, { summary: 'x', content: {}, patch: [{ list: 'experience', index: 40, action: 'remove' }] }, schema), /hors de la liste/);
  assert.throws(() => applyContentProposal(original, { summary: 'x', content: {}, patch: [{ list: 'skills', index: 0, action: 'replace' }] }, schema), /renseigne skill/);
});

const pageAccess = (edits) => ({
  tools: [{ name: 'read_page', description: 'Lire', schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }, { name: 'edit_page', description: 'Modifier', schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }],
  read: () => 'e1 rect x=0 y=0 w=200 h=842 fill=#d8cfc6 modèle',
  edit: async (args) => { edits.push(args); return { overflow: [], issues: [] }; },
});

test('agent : mise en page libre lue puis proposée, sans appel de résumé', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  const bodies = []; const edits = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return bodies.length === 1 ? reply({}, '', 'read_page') : reply({ summary: 'Vague beige ajoutée', operations: [{ action: 'add', shape: 'path', d: 'M0 0 C 50 80 150 80 200 0 Z' }] }, '', 'edit_page');
  };
  const result = await runAgent(session, null, catalog, [], 'Ajoute une vague', async () => assert.fail('Pas de contenu'), () => {}, '', pageAccess(edits));
  assert.equal(bodies.length, 2); assert.equal(result.edited, true); assert.equal(result.text, 'Vague beige ajoutée');
  assert.equal(edits.length, 1);
  // Page libre : seul l'outil de mise en page est proposé, et le résultat de lecture est transmis tel quel.
  assert.deepEqual(bodies[0].tools.map((t) => t.function.name), ['read_page', 'edit_page']);
  assert.match(bodies[1].messages.at(-1).content, /e1 rect/);
  session.disconnect();
});

test('agent : contenu et mise en page jamais mélangés dans une même demande', async () => {
  const session = new AiSession(); session.connect('openai', key, 'test');
  let calls = 0; const edits = [];
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 1) return reply({ summary: 'Titre', content: { title: 'Chef de projet' } });
    if (calls === 2) { assert.equal(JSON.parse(options.body).tools.length, 3); return reply({ summary: 'x', operations: [] }, '', 'edit_page'); }
    assert.match(JSON.parse(options.body).messages.at(-1).content, /soit le contenu, soit la mise en page/);
    return reply(null, 'Je propose d’abord le contenu.');
  };
  const result = await runAgent(session, base(), catalog, [], 'Change tout', async () => ({ overflow: [{ section: 'Profil' }], issues: [] }), () => {}, '', pageAccess(edits));
  assert.equal(edits.length, 0); assert.equal(result.edited, false); assert.equal(result.proposal.data.title, 'Chef de projet');
  session.disconnect();
});

test('retouches : relevées sur la page, réappliquées à une page régénérée dont la mise en page a bougé', () => {
  const generate = (shift) => [
    { type: 'Rect', tpl: true, sectionKey: 'experience', left: 0, top: 100 + shift, width: 10, height: 10, fill: '#111111' },
    { type: 'Textbox', tpl: true, field: 'name', left: 40, top: 40, width: 300, text: 'Julie', fill: '#212a39', fontFamily: 'Lato', fontSize: 24 },
    { type: 'Textbox', tpl: true, field: 'title', left: 40, top: 80, width: 300, text: 'Chargée', fill: '#212a39', fontFamily: 'Lato', fontSize: 12 },
    { type: 'Circle', tpl: false, left: 5, top: 5, width: 20, height: 20 },
  ];
  const page = generate(0);
  const keys = stamp(page);
  assert.deepEqual(keys, ['experience:rect', 'f:name', 'f:title']);
  // Retouches de l'utilisateur ou de l'assistant : nom en police d'affichage, puce décalée, intitulé supprimé.
  Object.assign(page[1], { fontFamily: 'DM Serif Display', fill: '#8a5a44', fontSize: 48, width: 360 });
  page[0].left = 12;
  const shown = [page[0], page[1], page[3]];
  const retouches = capture(shown, {}, keys);
  assert.deepEqual(retouches['f:name'], { dw: 60, set: { fill: '#8a5a44', fontFamily: 'DM Serif Display', fontSize: 48 } });
  assert.deepEqual(retouches['experience:rect'], { dx: 12 });
  assert.deepEqual(retouches['f:title'], { removed: true });
  assert.equal(retouchOf(page[3]), null, 'Un élément ajouté n’est pas une retouche');
  // Le contenu change : la section descend de 50 pt, la retouche suit en décalage.
  const next = generate(50);
  stamp(next);
  const out = retouch(next, retouches);
  assert.equal(out.length, 3);
  assert.equal(out[0].left, 12); assert.equal(out[0].top, 150);
  assert.equal(out[1].fontFamily, 'DM Serif Display'); assert.equal(out[1].width, 360);
  assert.ok(!out.some((o) => o.field === 'title'));
  // Une nouvelle relève sur cette page conserve les mêmes retouches.
  assert.deepEqual(capture(out, retouches, keys), retouches);
});

test('retouches : fichier ouvert validé, valeurs hors bornes et styles inconnus écartés', () => {
  const clean = cleanRetouches({ 'f:name': { dx: 5, sx: 1e9, set: { fill: '#8a5a44', fontFamily: 'Comic', onclick: 'x' } }, '../bad': { dx: 1 }, 'page:rect': { removed: true } },
    (k, v) => k !== 'fontFamily' || v === 'Lato');
  assert.deepEqual(clean, { 'f:name': { dx: 5, set: { fill: '#8a5a44' } }, 'page:rect': { removed: true } });
  assert.equal(cleanRetouches('x', () => true), undefined);
});

test('coffre : chiffrement aléatoire, déverrouillage et refus du mauvais mot de passe', async () => {
  const prefs = { provider: 'claude', model: 'claude-test' };
  const password = 'une phrase de passe privée';
  const a = await encryptKey(prefs, key, password);
  const b = await encryptKey(prefs, key, password);
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.iv, b.iv); assert.notEqual(a.ciphertext, b.ciphertext);
  assert.ok(!JSON.stringify(a).includes(key)); assert.ok(!JSON.stringify(a).includes(password));
  assert.equal(await decryptKey(a, password), key);
  await assert.rejects(decryptKey(a, 'mauvaise phrase de passe'), /incorrect/);
  await assert.rejects(encryptKey(prefs, key, 'court'), /12/);
  await assert.rejects(encryptKey({ provider: 'claude', model: 'claude-sonnet-5-5' }, key, 'claude-sonnet-5-5'), /différent/);
});

test('coffre : métadonnées authentifiées et paramètres non fiables bornés', async () => {
  const record = await encryptKey({ provider: 'openai', model: 'test' }, key, 'un mot de passe de test');
  await assert.rejects(decryptKey({ ...record, provider: 'claude' }, 'un mot de passe de test'), /altéré/);
  await assert.rejects(decryptKey({ ...record, model: 'other' }, 'un mot de passe de test'), /altéré/);
  await assert.rejects(decryptKey({ ...record, iterations: 10000000000 }, 'un mot de passe de test'), /invalide/);
  await assert.rejects(decryptKey({ ...record, iv: 'notbase64' }, 'un mot de passe de test'), /invalide/);
});

test('stockage : uniquement réglages autorisés et coffre chiffré, effacement ciblé', async () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  try {
    const prefs = { provider: 'claude', model: 'test' };
    savePreferences({ ...prefs, key });
    assert.deepEqual(readPreferences(), prefs);
    assert.throws(() => savePreferences({ ...prefs, model: 'sk-ant-accidental-key' }), /sans clé/);
    const record = await encryptKey(prefs, key, 'un mot de passe de test'); storeVault(record);
    assert.deepEqual(readVault('claude'), record);
    assert.equal(readVault('openai'), null);
    values.set('pdf-studio.draft', 'document');
    assert.ok(!JSON.stringify([...values]).includes(key));
    forgetVault('claude'); forgetPreferences();
    assert.equal(readVault('claude'), null); assert.equal(readPreferences(), null);
    assert.equal(values.get('pdf-studio.draft'), 'document');
  } finally { delete globalThis.localStorage; }
});

test('stockage : quota ou stockage bloqué signalé sans prétendre avoir enregistré', () => {
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
  try {
    assert.equal(readPreferences(), null);
    assert.throws(() => savePreferences({ provider: 'openai', model: 'test' }), /indisponible/);
    assert.throws(() => forgetVault('openai'), /Impossible/);
  } finally { delete globalThis.localStorage; }
});
