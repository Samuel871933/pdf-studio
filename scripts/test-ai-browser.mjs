// Parcours navigateur avec API interceptées : aucune clé réelle, aucun appel facturé.
// Utilise le build de production et sa CSP. Nécessite Chromium et Node >= 22.13.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'pdf-studio-chromium-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(dist, `.${new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname}`);
    if (!path.startsWith(dist)) { response.writeHead(403).end(); return; }
    const suffix = path.slice(path.lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': mime[suffix] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME_BIN ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chromium n’a pas démarré : ${stderr.slice(-1000)}`)), 20000);
    chrome.stderr.on('data', (data) => {
      stderr += data.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    chrome.on('error', reject);
    chrome.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chromium a quitté (${code}) : ${stderr.slice(-1000)}`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let counter = 0;
  const calls = new Map();
  const events = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const pending = calls.get(message.id);
      if (pending) { calls.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
    } else for (const handler of events.get(message.method) ?? []) handler(message.params);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { calls.delete(id); reject(new Error(`Délai CDP : ${method}`)); }, 15000);
    calls.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  const wait = async (expression) => {
    const start = Date.now();
    while (Date.now() - start < 12000) { if (await evaluate(expression)) return; await new Promise((r) => setTimeout(r, 50)); }
    throw new Error(`Attente : ${expression}\n${await evaluate('document.body.innerText.slice(-2500)')}`);
  };
  const click = async (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = async (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const button = async (text) => evaluate(`Array.from(document.querySelectorAll('#ai-dock button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`);
  const secret = 'mock-key-never-persisted';
  let fixture = { summary: 'Création de votre CV', template: 'classic', palette: 'foret', content: { name: 'Alex Test', title: 'Développeur', profile: 'Création de logiciels et travail en équipe.' } };
  let toolName = 'propose_document';
  let delay = false;
  let errorStatus = 0;
  let providerCalls = 0;
  const requests = [];
  const errors = [];
  const downloads = [];
  events.set('Browser.downloadWillBegin', [(event) => downloads.push({ ...event, complete: false })]);
  events.set('Browser.downloadProgress', [(event) => { if (event.state === 'completed') { const d = downloads.find((d) => d.guid === event.guid); if (d) d.complete = true; } }]);
  events.set('Runtime.exceptionThrown', [(event) => errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text)]);
  events.set('Fetch.requestPaused', [async ({ requestId, request }) => {
    try {
      const cors = [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access' }, { name: 'Access-Control-Allow-Methods', value: 'POST,OPTIONS' }];
      if (request.method === 'OPTIONS') { await command('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: cors }); return; }
      providerCalls++;
      const body = JSON.parse(request.postData);
      assert.ok(!request.postData.includes(secret));
      assert.ok(!request.postData.includes('data:image'));
      requests.push(body);
      if (delay) await new Promise((r) => setTimeout(r, 400));
      const claude = request.url.includes('anthropic');
      const final = claude ? body.messages.at(-1).content.some((c) => c.type === 'tool_result') : body.messages.at(-1).role === 'tool';
      const payload = claude
        ? { stop_reason: final ? 'end_turn' : 'tool_use', content: final ? [{ type: 'text', text: 'Votre proposition est prête.' }] : [{ type: 'tool_use', id: 'call_test', name: toolName, input: fixture }], usage: { input_tokens: 10, output_tokens: 20 } }
        : { choices: [{ finish_reason: final ? 'stop' : 'tool_calls', message: final ? { content: 'Votre proposition est prête.' } : { content: null, tool_calls: [{ id: 'call_test', type: 'function', function: { name: toolName, arguments: JSON.stringify(fixture) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 20 } };
      await command('Fetch.fulfillRequest', { requestId, responseCode: errorStatus || 200, responseHeaders: cors, body: Buffer.from(errorStatus ? secret : JSON.stringify(payload)).toString('base64') });
    } catch (error) {
      // Après Stop/rechargement, Chromium peut supprimer une interception retardée.
      if (error.message !== 'Invalid InterceptionId.') errors.push(error.message);
    }
  }]);
  await command('Runtime.enable'); await command('Page.enable');
  await mkdir(join(profile, 'downloads'));
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(profile, 'downloads'), eventsEnabled: true });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Fetch.enable', { patterns: [{ urlPattern: 'https://api.openai.com/*' }, { urlPattern: 'https://api.anthropic.com/*' }] });
  await command('Page.navigate', { url: origin });
  await wait("document.querySelector('#page') && document.querySelector('#ai-dock form') && document.fonts.status === 'loaded'");
  await new Promise((r) => setTimeout(r, 250));
  await click('#btn-assistant');
  // Sans session, la connexion recouvre la discussion, rendue inerte.
  assert.equal(await evaluate("document.querySelector('.ai-chat-connection').open"), true);
  assert.equal(await evaluate("document.querySelector('.ai-chat-thread').inert && document.querySelector('.ai-chat-compose').inert"), true);
  assert.equal(await evaluate("document.querySelectorAll('.ai-chat-settings input[type=checkbox]').length"), 1);
  await wait("Array.from(document.querySelectorAll('.ai-provider-logo')).every(img=>img.complete && img.naturalWidth>0)");
  await evaluate("document.querySelector('.ai-provider-option[data-provider=openai]').focus()");
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  assert.equal(await evaluate("document.querySelector('.ai-provider-option[aria-checked=true]').dataset.provider"), 'claude');
  await click('.ai-provider-option[data-provider=openai]');
  await new Promise((r) => setTimeout(r, 300));
  const connectionScreenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/pdf-studio-ai-connection.png', Buffer.from(connectionScreenshot.data, 'base64'));
  assert.equal(await evaluate("document.querySelector('.ai-chat-connection').open"), true);
  assert.equal(await evaluate("document.querySelector('#ai-dock input[type=text]').value"), 'gpt-4.1-mini');
  await button('Connecter');
  assert.ok(await evaluate("document.querySelector('#ai-session-status').textContent.includes('Clé API')"));
  assert.equal(await evaluate("document.activeElement === document.querySelector('#ai-dock input[type=password]')"), true);
  await fill('#ai-dock input[type=password]', 'sk-ant-test-wrong-provider');
  await button('Connecter');
  assert.ok(await evaluate("document.querySelector('#ai-session-status').textContent.includes('Claude')"));
  assert.equal(providerCalls, 0, 'Une clé du mauvais fournisseur ne doit pas partir en requête');
  await fill('#ai-dock input[type=password]', secret);
  await fill('#ai-dock input[type=text]', '');
  await button('Connecter');
  assert.ok(await evaluate("document.querySelector('#ai-session-status').textContent.includes('Modèle')"));
  assert.equal(await evaluate("document.activeElement === document.querySelector('#ai-dock input[type=text]')"), true);
  await fill('#ai-dock input[type=text]', 'test-model');
  await button('Connecter');
  assert.equal(await evaluate("document.querySelector('#ai-dock input[type=password]').value"), '');
  assert.equal(providerCalls, 0, 'La connexion ne doit pas générer de requête');
  assert.ok(await evaluate("Array.from(document.querySelectorAll('#ai-dock button')).some(b=>b.textContent==='Session prête' && b.disabled)"));
  assert.equal(await evaluate("document.querySelector('.ai-chat-connection').open"), false);
  assert.equal(await evaluate("document.querySelector('.ai-chat-thread').inert"), false);
  await button('Créer mon CV');
  assert.ok(await evaluate("document.querySelector('#ai-dock textarea').value.includes('créer un CV')"));
  assert.equal(providerCalls, 0, 'Une suggestion prépare le texte sans appel automatique');
  console.log('✓ Modèle prérempli, erreurs de saisie visibles et état de connexion explicite');
  const ask = async (text) => { await fill('#ai-dock textarea', text); await evaluate("document.querySelector('#ai-dock form').requestSubmit()"); await wait("document.querySelector('#ai-dock').getAttribute('aria-busy') === 'false'"); };
  await ask('Crée mon CV avec mon parcours réel');
  await wait("!document.querySelector('.ai-proposal').hidden");
  const composerBottom = await evaluate("document.querySelector('.ai-chat-compose').getBoundingClientRect().bottom");
  await evaluate("document.querySelector('.ai-chat-thread').scrollTop=0");
  assert.equal(await evaluate("document.querySelector('.ai-chat-compose').getBoundingClientRect().bottom"), composerBottom, 'La saisie doit rester ancrée pendant le défilement');
  await button('Agrandir l’aperçu');
  await wait("document.querySelector('dialog[open] .ai-preview-large')?.complete");
  await click('dialog[open] .modal-head button');
  await wait("!document.querySelector('dialog[open]')");
  await evaluate("document.querySelector('.ai-proposal').scrollIntoView({block:'start'})");
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/pdf-studio-ai-preview.png', Buffer.from(screenshot.data, 'base64'));
  assert.ok(!JSON.stringify(requests[0]).includes('Camille Martin'), 'Les données fictives ne sont pas des faits');
  assert.equal(await evaluate("document.querySelector('#pane-content').innerText.includes('Alex Test')"), false, 'L’aperçu ne modifie pas le document');
  // Retravailler l’aperçu conserve la proposition précédente sans toucher le document réel.
  fixture = { summary: 'Profil plus précis', content: { profile: 'Développement de logiciels en équipe.' } };
  const sent = requests.length;
  await ask('Précise encore le profil de cette proposition');
  assert.ok(requests[sent].messages.at(-1).content.includes('Alex Test'), 'La demande repart de la proposition précédente');
  await button('Appliquer');
  await wait("Array.from(document.querySelectorAll('#pane-content input')).some(e=>e.value==='Alex Test')");
  assert.ok(await evaluate("document.querySelector('#ai-dock').innerText.includes('Modifications appliquées')"));
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#panel input')).some(e=>e.value==='Alex Test')"), true, 'Les métadonnées suivent le contenu');
  await click('#btn-undo');
  await wait("!Array.from(document.querySelectorAll('#pane-content input')).some(e=>e.value==='Alex Test')");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#panel input')).some(e=>e.value==='Camille Martin')"), true, 'Annuler restaure aussi les métadonnées');
  await click('#btn-redo');
  await wait("Array.from(document.querySelectorAll('#pane-content input')).some(e=>e.value==='Alex Test')");
  console.log('✓ Création, aperçu, application, Annuler/Rétablir (CSP de production)');

  await click('#btn-save');
  const downloadDeadline = Date.now() + 5000;
  while (!downloads.some((d) => d.complete) && Date.now() < downloadDeadline) await new Promise((r) => setTimeout(r, 50));
  const projectDownload = downloads.find((d) => d.complete);
  assert.ok(projectDownload, 'Le projet doit être exportable');
  const serialized = await readFile(join(profile, 'downloads', projectDownload.suggestedFilename), 'utf8');
  const project = JSON.parse(serialized);
  assert.equal(project.fill.data.name, 'Alex Test');
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes('Crée mon CV avec mon parcours réel'));
  assert.ok(!Object.hasOwn(project, 'conversation'));
  console.log('✓ Export du projet sans clé ni conversation');

  // Mise en page libre : forme organique ajoutée en arrière-plan, aperçu puis application.
  const savedPage = async () => {
    const known = downloads.length;
    await click('#btn-save');
    const deadline = Date.now() + 5000;
    while (!(downloads.length > known && downloads.at(-1).complete) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.ok(downloads.at(-1).complete, 'Projet enregistré');
    saved = JSON.parse(await readFile(join(profile, 'downloads', downloads.at(-1).suggestedFilename), 'utf8'));
    return saved.canvas.objects;
  };
  let saved;
  const before = await savedPage();
  toolName = 'edit_page';
  fixture = { summary: 'Vague beige ajoutée derrière le contenu.', operations: [
    { action: 'add', shape: 'path', d: 'M0 0 H595 V180 C 420 260 180 120 0 220 Z', x: 0, y: 0, w: 595, h: 230, fill: '#d8cfc6' },
    { action: 'back', ids: ['n1'] },
  ] };
  await ask('Ajoute une grande vague beige en haut de la page, derrière le texte');
  await wait("document.querySelector('.ai-proposal h3')?.textContent === 'Mise en page proposée'");
  assert.equal((await savedPage()).length, before.length, 'L’aperçu ne modifie pas la page');
  await evaluate("document.querySelector('.ai-proposal').scrollIntoView({block:'start'})");
  await writeFile('/tmp/pdf-studio-ai-layout.png', Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await button('Appliquer');
  await wait("document.querySelector('#ai-dock').innerText.includes('Mise en page appliquée')");
  let objects = await savedPage();
  assert.equal(objects.length, before.length + 1);
  assert.equal(objects[0].type, 'Path', 'La forme ajoutée est en arrière-plan');
  assert.equal(objects[0].fill, '#d8cfc6');
  // Retouche d'un élément du modèle : le nom passe en police d'affichage et change de couleur.
  const nameId = `e${objects.findIndex((o) => o.field === 'name') + 1}`;
  toolName = 'edit_page';
  fixture = { summary: 'Nom en DM Serif Display brun.', operations: [{ action: 'update', ids: [nameId], fontFamily: 'DM Serif Display', fill: '#8a5a44', fontSize: 34 }] };
  await ask('Mets mon nom en DM Serif Display brun, plus grand');
  await wait("document.querySelector('.ai-proposal h3')?.textContent === 'Mise en page proposée'");
  await button('Appliquer');
  await wait("document.querySelector('#ai-dock').innerText.split('Mise en page appliquée').length > 2");
  // Une modification de contenu ultérieure conserve la forme, toujours au fond.
  toolName = 'propose_document';
  fixture = { summary: 'Titre ajusté', content: { title: 'Développeur confirmé' } };
  await ask('Mets Développeur confirmé comme titre');
  await wait("!document.querySelector('.ai-proposal').hidden");
  await button('Appliquer');
  await wait("document.querySelector('#ai-dock').innerText.includes('Modifications appliquées')");
  objects = await savedPage();
  assert.equal(objects[0].type, 'Path', 'La régénération garde la forme de fond à sa place');
  const name = objects.find((o) => o.field === 'name');
  assert.deepEqual([name.fontFamily, name.fill, name.fontSize], ['DM Serif Display', '#8a5a44', 34], 'La retouche du modèle survit au changement de contenu');
  assert.equal(objects.find((o) => o.field === 'title').text, 'Développeur confirmé');
  assert.equal(saved.fill.retouches['f:name'].set.fontFamily, 'DM Serif Display', 'La retouche est enregistrée dans le projet');
  await click('#btn-undo'); await click('#btn-undo'); await click('#btn-undo');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await savedPage()).length, before.length, 'Annuler retire la forme');
  console.log('✓ Mise en page libre : forme organique, retouche du modèle durable, plan conservé et annulation');

  fixture = { summary: 'Profil modifié', content: { profile: 'Un profil amélioré fidèle au parcours.' } };
  await ask('Améliore mon profil');
  await click('#btn-content');
  const nameSelector = await evaluate("(()=>{const e=Array.from(document.querySelectorAll('#pane-content input')).find(e=>e.value==='Alex Test'); e.id='test-name-input'; return '#test-name-input';})()");
  await fill(nameSelector, 'Alex Modifié');
  await new Promise((r) => setTimeout(r, 500));
  await click('#btn-assistant'); await button('Appliquer');
  await wait("document.querySelector('.ai-proposal').innerText.includes('Le document a changé')");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#pane-content input')).some(e=>e.value==='Alex Modifié')"), true);
  await button('Rejeter');
  console.log('✓ Proposition obsolète refusée après une retouche utilisateur');

  fixture = { summary: 'Un parcours très long', content: { experience: Array.from({ length: 20 }, (_, i) => ({ title: `Poste ${i + 1}`, org: 'Organisation', dates: '2020–2021', text: 'Une description longue du parcours professionnel. '.repeat(35) })) } };
  await ask('Prépare ce parcours long');
  await wait("!document.querySelector('.ai-proposal').hidden");
  assert.ok(await evaluate("document.querySelector('.ai-proposal').innerText.includes('Débordement')"));
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.ai-proposal button')).find(b=>b.textContent==='Appliquer').disabled"), true);
  await button('Rejeter');
  console.log('✓ Débordement détecté et application bloquée');

  // Erreur HTTP : pas de copie du corps distant dans l’interface.
  errorStatus = 401;
  const beforeError = providerCalls;
  await ask('Demande refusée');
  assert.equal(providerCalls, beforeError + 1);
  assert.ok(!(await evaluate('document.body.innerText')).includes(secret));
  errorStatus = 0;
  console.log('✓ Erreurs sans secret et sans répétition automatique');

  // Annulation pendant la réponse : aucun aperçu tardif.
  delay = true;
  await fill('#ai-dock textarea', 'Une demande à arrêter');
  await evaluate("document.querySelector('#ai-dock form').requestSubmit()");
  await wait("document.querySelector('#ai-dock').getAttribute('aria-busy') === 'true'");
  await button('Stop');
  await wait("document.querySelector('#ai-dock').getAttribute('aria-busy') === 'false'");
  assert.equal(await evaluate("document.querySelector('.ai-proposal').hidden"), true);
  delay = false;
  await button('Déconnecter');
  assert.equal(await evaluate("document.querySelector('.ai-chat-log').children.length"), 0);
  assert.ok(!(await evaluate('JSON.stringify(localStorage)')).includes(secret));
  console.log('✓ Stop, déconnexion et absence de clé dans le stockage');

  await click('.ai-provider-option[data-provider=claude]');
  assert.equal(await evaluate("document.querySelector('#ai-dock input[type=text]').value"), 'claude-sonnet-5-5');
  await fill('#ai-dock input[type=password]', secret);
  await fill('#ai-dock input[type=text]', 'test-claude');
  await button('Connecter');
  fixture = { summary: 'Lettre de motivation', template: 'letter', content: { letter: { subject: 'Candidature développeur', paragraphs: ['Je souhaite mettre mon expérience au service de votre équipe.'] } } };
  await ask('Crée une lettre avec mon parcours');
  await wait("!document.querySelector('.ai-proposal').hidden");
  await button('Appliquer');
  await wait("document.querySelector('.ai-proposal').hidden");
  await evaluate('window.__testBeforeReload = true');
  await command('Page.reload');
  await wait("!window.__testBeforeReload && document.querySelector('#ai-dock form') && document.querySelector('#ai-dock input[type=password]').value === ''");
  assert.equal(await evaluate("document.querySelector('#ai-dock button[type=submit]').disabled"), true);
  assert.ok(!(await evaluate('JSON.stringify(localStorage)')).includes(secret));
  assert.deepEqual(errors, []);
  console.log('✓ Claude, lettre de motivation et session déconnectée après rechargement');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('#btn-assistant');
  await wait("document.querySelector('#ai-dock').getBoundingClientRect().height > 300");
  const mobileBounds = await evaluate("(()=>{const pane=document.querySelector('#ai-dock').getBoundingClientRect(), form=document.querySelector('.ai-chat-compose').getBoundingClientRect(), input=document.querySelector('#ai-dock textarea').getBoundingClientRect(); return {paneBottom:pane.bottom,formBottom:form.bottom,inputTop:input.top,inputBottom:input.bottom,paneTop:pane.top};})()");
  assert.ok(mobileBounds.formBottom <= mobileBounds.paneBottom + 1);
  assert.ok(mobileBounds.inputTop >= mobileBounds.paneTop && mobileBounds.inputBottom <= 844);
  assert.ok(await evaluate("document.querySelector('.ai-chat-empty').offsetWidth <= document.querySelector('.ai-chat-thread').clientWidth"));
  const mobileScreenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/pdf-studio-ai-mobile.png', Buffer.from(mobileScreenshot.data, 'base64'));
  console.log('✓ Chat sur petit écran, suggestions et saisie toujours accessible');

  // Enregistrement volontaire : coffre chiffré et réglages, sans requête générative.
  await click('.ai-provider-option[data-provider=claude]');
  await fill('#ai-dock input[type=text]', 'test-claude');
  await fill('#ai-dock input[type=password]', secret);
  await click('#ai-remember-connection');
  const vaultPassword = 'phrase de passe de test privée';
  await fill('#ai-vault-password', vaultPassword);
  await fill('#ai-vault-confirmation', vaultPassword);
  const beforeVault = providerCalls;
  await button('Connecter');
  await wait("document.querySelector('#ai-dock').getAttribute('aria-busy') === 'false' && document.querySelector('#ai-session-status').textContent.includes('Session prête')");
  const storedVault = await evaluate("localStorage.getItem('pdf-studio.ai.vault.claude')");
  assert.ok(JSON.parse(storedVault).ciphertext);
  assert.ok(!(await evaluate('JSON.stringify(localStorage)')).includes(secret));
  assert.ok(!(await evaluate('JSON.stringify(localStorage)')).includes(vaultPassword));
  assert.equal(providerCalls, beforeVault);
  await evaluate('window.__testBeforeReload = true');
  await command('Page.reload');
  await wait("!window.__testBeforeReload && document.querySelector('#ai-vault-password')");
  assert.equal(await evaluate("document.querySelector('.ai-provider-option[aria-checked=true]').dataset.provider"), 'claude');
  assert.equal(await evaluate("document.querySelector('#ai-dock input[type=text]').value"), 'test-claude');
  assert.equal(await evaluate("document.querySelector('#ai-dock input[type=password]').value"), '');
  assert.equal(await evaluate("document.querySelector('#ai-vault-password').value"), '');
  assert.equal(await evaluate("document.querySelector('#ai-dock button[type=submit]').disabled"), true);
  await click('#btn-assistant');
  await fill('#ai-vault-password', 'une mauvaise phrase de passe');
  await button('Déverrouiller');
  await wait("document.querySelector('#ai-dock').getAttribute('aria-busy') === 'false'");
  assert.ok(await evaluate("document.querySelector('#ai-session-status').textContent.includes('incorrect')"));
  assert.equal(await evaluate("document.querySelector('#ai-vault-password').value"), '');
  await fill('#ai-vault-password', vaultPassword);
  await button('Déverrouiller');
  await wait("document.querySelector('#ai-dock').getAttribute('aria-busy') === 'false' && document.querySelector('#ai-session-status').textContent.includes('Session prête')");
  assert.equal(await evaluate("document.querySelector('#ai-dock input[type=password]').value"), '');
  assert.equal(providerCalls, beforeVault);
  await button('Oublier ma clé');
  assert.equal(await evaluate("localStorage.getItem('pdf-studio.ai.vault.claude')"), null);
  assert.equal(await evaluate("document.querySelector('#ai-dock button[type=submit]').disabled"), true);
  assert.equal(await evaluate("localStorage.getItem('pdf-studio.ai.preferences')"), null);
  assert.equal(providerCalls, beforeVault);
  assert.deepEqual(errors, []);
  console.log('✓ Coffre facultatif, rechargement verrouillé, mauvais mot de passe, déverrouillage et effacement sans appel IA');
} finally {
  socket?.close(); chrome.kill('SIGTERM'); server.close(); server.closeAllConnections();
  await new Promise((r) => setTimeout(r, 150));
  await rm(profile, { recursive: true, force: true });
}
