import type { Schema } from './schema';

export type Provider = 'openai' | 'claude';
export const DEFAULT_MODELS: Record<Provider, string> = { openai: 'gpt-4.1-mini', claude: 'claude-sonnet-5-5' };
export interface Tool { name: string; description: string; schema: Schema }
export interface Call { id: string; name: string; arguments: unknown }
export type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; calls: Call[]; raw?: unknown[] }
  | { role: 'tool'; id: string; text: string };
/** inputTokens inclut les tokens lus depuis le cache (cachedTokens), facturés à prix réduit. */
export interface Reply { text: string; calls: Call[]; inputTokens: number; cachedTokens: number; outputTokens: number; raw?: unknown[] }

const URLS = { openai: 'https://api.openai.com/v1/chat/completions', claude: 'https://api.anthropic.com/v1/messages' } as const;

function headers(provider: Provider, key: string): Record<string, string> {
  return provider === 'openai'
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
    : { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
}

// Les erreurs distantes peuvent contenir des secrets : ne jamais afficher leur corps.
async function request(provider: Provider, key: string, body: unknown, signal: AbortSignal): Promise<Record<string, any>> {
  let response: Response;
  let blockedByPolicy = false;
  const onViolation = (event: SecurityPolicyViolationEvent) => {
    if (event.effectiveDirective === 'connect-src' && event.disposition === 'enforce'
      && event.blockedURI.startsWith(new URL(URLS[provider]).origin)) blockedByPolicy = true;
  };
  if (typeof document !== 'undefined') document.addEventListener('securitypolicyviolation', onViolation);
  try {
    response = await fetch(URLS[provider], {
      method: 'POST', headers: headers(provider, key), body: JSON.stringify(body), signal,
      credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    });
  } catch {
    if (signal.aborted) throw new Error('Demande arrêtée ou délai dépassé.');
    // Les notifications CSP peuvent arriver après le rejet de fetch.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (blockedByPolicy) throw new Error('La politique de sécurité du site bloque l’API. Rechargez la dernière version ; en local, reconstruisez le site avec npm run build. Le domaine API doit être autorisé dans connect-src.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Le navigateur est hors connexion. Rétablissez le réseau puis renvoyez votre demande.');
    throw new Error(`Le navigateur n’a pas pu joindre ${new URL(URLS[provider]).hostname}. Consultez F12 → Console pour distinguer un refus CORS, une extension qui bloque la requête ou une erreur réseau. La clé et le modèle n’ont pas pu être vérifiés.`);
  } finally {
    if (typeof document !== 'undefined') document.removeEventListener('securitypolicyviolation', onViolation);
  }
  if (!response.ok) {
    const detail = response.status === 401 ? 'Clé refusée.' : response.status === 429 ? 'Quota ou limite de débit atteint.' : response.status === 400 ? 'Vérifiez le modèle et sa compatibilité avec les outils.' : 'Demande refusée par le fournisseur.';
    throw new Error(`${detail} (HTTP ${response.status})`);
  }
  const raw = await response.text();
  if (raw.length > 600000) throw new Error('Réponse du fournisseur trop volumineuse.');
  try { return JSON.parse(raw); } catch { throw new Error('Réponse du fournisseur illisible.'); }
}

export async function complete(provider: Provider, key: string, model: string, system: string, messages: Message[], tools: Tool[], signal: AbortSignal): Promise<Reply> {
  let reply: Reply;
  if (provider === 'openai') {
    const wire = messages.map((m) => m.role === 'tool' ? { role: 'tool', tool_call_id: m.id, content: m.text }
      : m.role === 'user' ? { role: 'user', content: m.text }
        : { role: 'assistant', content: m.text || null, ...(m.calls.length ? { tool_calls: m.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } : {}) });
    const result = await request(provider, key, { model, store: false, max_completion_tokens: 6000, messages: [{ role: 'system', content: system }, ...wire],
      tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema, strict: false } })), parallel_tool_calls: false }, signal);
    const choice = result.choices?.[0];
    if (!choice?.message || !['stop', 'tool_calls'].includes(choice.finish_reason)) throw new Error('Réponse incomplète ou refusée. Réduisez la demande.');
    const m = choice.message;
    reply = { text: m.content ?? '', calls: (m.tool_calls ?? []).map((c: any) => {
      let args: unknown;
      try { args = JSON.parse(c.function?.arguments); } catch { throw new Error('Arguments d’outil illisibles.'); }
      return { id: c.id, name: c.function?.name, arguments: args };
    }), inputTokens: result.usage?.prompt_tokens ?? 0, cachedTokens: result.usage?.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: result.usage?.completion_tokens ?? 0 };
  } else {
    const wire: { role: string; content: unknown[] }[] = [];
    for (const m of messages) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = m.role === 'tool' ? [{ type: 'tool_result', tool_use_id: m.id, content: m.text }]
        : m.role === 'user' ? [{ type: 'text', text: m.text }]
          // Contenu d'origine renvoyé tel quel : les blocs de réflexion doivent accompagner leurs appels d'outil.
          : m.raw ?? [...(m.text ? [{ type: 'text', text: m.text }] : []), ...m.calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments }))];
      if (wire.at(-1)?.role === role) wire.at(-1)!.content.push(...content);
      else wire.push({ role, content });
    }
    // Cache : outils + consignes fixes (point explicite), puis la conversation en cours (point automatique).
    // Les modèles Claude 5 réfléchissent par défaut : un effort moyen limite les tokens de réflexion facturés.
    const result = await request(provider, key, { model, max_tokens: 16000, cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: wire,
      ...(/^claude-(opus|sonnet|haiku|fable)-5/.test(model) ? { output_config: { effort: 'medium' } } : {}),
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
      tool_choice: { type: 'auto', disable_parallel_tool_use: true } }, signal);
    if (!Array.isArray(result.content) || !['end_turn', 'tool_use'].includes(result.stop_reason)) throw new Error('Réponse incomplète ou refusée. Réduisez la demande.');
    reply = { text: result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n'),
      calls: result.content.filter((c: any) => c.type === 'tool_use').map((c: any) => ({ id: c.id, name: c.name, arguments: c.input })),
      inputTokens: (result.usage?.input_tokens ?? 0) + (result.usage?.cache_read_input_tokens ?? 0) + (result.usage?.cache_creation_input_tokens ?? 0),
      cachedTokens: result.usage?.cache_read_input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0,
      raw: result.content.filter((c: any) => ['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(c?.type)) };
  }
  if (typeof reply.text !== 'string' || reply.text.length > 30000 || reply.calls.length > 4
    || reply.calls.some((c) => typeof c.id !== 'string' || typeof c.name !== 'string')) throw new Error('Réponse du fournisseur invalide.');
  return reply;
}
