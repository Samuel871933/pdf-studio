import { complete, type Message, type Provider, type Tool } from './providers';

export function validateConnection(provider: Provider, key: string, model: string) {
  if (!['openai', 'claude'].includes(provider)) throw new Error('Choisissez OpenAI ou Claude.');
  if (!key.trim()) throw new Error('Le champ « Clé API » est vide. Collez votre clé personnelle.');
  if (key.length > 500 || /\s/.test(key.trim())) throw new Error('La clé API doit être copiée sans espaces ni retours à la ligne à l’intérieur.');
  if (provider === 'openai' && key.trim().startsWith('sk-ant-')) throw new Error('Cette clé ressemble à une clé Claude. Choisissez « Claude / Anthropic » comme fournisseur.');
  if (provider === 'claude' && /^sk-(proj|svcacct)-/.test(key.trim())) throw new Error('Cette clé ressemble à une clé OpenAI. Choisissez « OpenAI » comme fournisseur.');
  if (!model.trim()) throw new Error('Le champ « Modèle » est vide. Renseignez son identifiant API.');
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(model.trim()) || /^sk-/i.test(model.trim())) throw new Error('Utilisez l’identifiant API du modèle, sans espaces ni clé API (par exemple celui prérempli).');
}

/** Cette instance ne fait jamais partie de l'état du document. */
export class AiSession {
  private key = '';
  private provider: Provider = 'openai';
  private model = '';
  private active: AbortController | null = null;
  private generation = 0;

  get connected() { return !!this.key; }
  connect(provider: Provider, key: string, model: string) {
    validateConnection(provider, key, model);
    this.disconnect();
    this.provider = provider;
    this.key = key.trim();
    this.model = model.trim();
  }
  disconnect() { this.stop(); this.key = ''; this.model = ''; this.generation++; }
  stop() { this.active?.abort(); }
  checkContent(value: unknown) {
    if (this.key && JSON.stringify(value).includes(this.key)) throw new Error('La clé API ne doit pas figurer dans la demande ou le document.');
  }
  async run<T>(work: (send: (system: string, messages: Message[], tools: Tool[]) => ReturnType<typeof complete>, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!this.connected) throw new Error('Connectez votre compte API avant d’envoyer une demande.');
    if (this.active) throw new Error('Une demande est déjà en cours.');
    const controller = new AbortController();
    const generation = this.generation;
    this.active = controller;
    const timer = window.setTimeout(() => controller.abort(), 120000);
    try {
      const value = await work(async (system, messages, tools) => {
        if (controller.signal.aborted || generation !== this.generation) throw new Error('Demande arrêtée.');
        this.checkContent({ system, messages, tools });
        if (system.length + JSON.stringify(messages).length > 200000) throw new Error('La conversation dépasse la limite de contexte. Réduisez la demande.');
        const reply = await complete(this.provider, this.key, this.model, system, messages, tools, controller.signal);
        if (controller.signal.aborted || generation !== this.generation) throw new Error('Demande arrêtée.');
        this.checkContent(reply);
        return reply;
      }, controller.signal);
      if (controller.signal.aborted || generation !== this.generation) throw new Error('Demande arrêtée.');
      return value;
    } finally {
      window.clearTimeout(timer);
      if (this.active === controller) this.active = null;
    }
  }
}
