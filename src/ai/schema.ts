// Schémas partagés par les fournisseurs et le validateur local. Aucun chemin libre.
export interface Schema {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: string[];
}
export const text = (maxLength = 500): Schema => ({ type: 'string', maxLength });
export const array = (items: Schema, maxItems = 40): Schema => ({ type: 'array', items, maxItems });
export const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const keys = ['profile', 'experience', 'education', 'achievements', 'skills', 'tools', 'languages', 'interests'];
const section: Schema = { type: 'string', enum: keys };
export const level: Schema = { type: 'integer', minimum: 1, maximum: 5 };
export const entry = object({ title: text(300), org: text(300), dates: text(120), text: text(2000), bullets: array(text(500), 30) }, ['title', 'org', 'dates']);
const letter = object({ recipient: text(1000), subject: text(), greeting: text(300), paragraphs: array(text(5000), 20), closing: text(1000) });
export const CONTENT_SCHEMA = object({
  name: text(200), title: text(300), phone: text(60), email: text(200), city: text(200), address: text(),
  linkedin: text(300), github: text(300), profile: text(3000),
  experience: array(entry, 30), education: array(entry, 30), achievements: array(text()),
  skills: array(object({ name: text(300), level }, ['name', 'level'])), tools: array(text(), 60),
  languages: array(object({ name: text(100), level: text(60), detail: text(200), score: level }, ['name', 'level', 'score']), 20),
  interests: array(text(), 30), letter, labels: object(Object.fromEntries(keys.map((k) => [k, text(80)]))),
  hidden: array(section, 8),
  custom: array(object({
    id: text(80), title: text(80), kind: { type: 'string', enum: ['entries', 'list', 'text'] }, after: section,
    entries: array(entry, 30), items: array(text()), text: text(3000),
  }, ['id', 'title', 'kind', 'after', 'entries', 'items', 'text']), 20),
});

/** Rejette les propriétés inconnues et les valeurs trop longues, sans les tronquer. */
export function validate(schema: Schema, value: unknown, path = 'commande'): void {
  const fail = () => { throw new Error(`Valeur invalide : ${path}.`); };
  if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > (schema.maxLength ?? 10000) || (schema.enum && !schema.enum.includes(value))) fail();
  } else if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))
      || value < (schema.minimum ?? 0) || value > (schema.maximum ?? 100)) fail();
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') fail();
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 100)) return fail();
    value.forEach((v, i) => validate(schema.items!, v, `${path}.${i}`));
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const v = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!Object.hasOwn(v, k)) fail();
    for (const k of Object.keys(v)) {
      if (!Object.hasOwn(schema.properties!, k)) return fail();
      validate(schema.properties![k], v[k], `${path}.${k}`);
    }
  }
}

/** Listes modifiables entrée par entrée, et la forme de leurs éléments. */
export const PATCH_LISTS = {
  experience: 'entry', education: 'entry', achievements: 'text', tools: 'text', interests: 'text', skills: 'skill', languages: 'language',
} as const;
// Modification ciblée d'une liste : évite de renvoyer la liste entière pour changer une seule entrée.
const PATCH = object({
  list: { type: 'string', enum: Object.keys(PATCH_LISTS) }, index: { type: 'integer', minimum: 0, maximum: 60 },
  action: { type: 'string', enum: ['replace', 'insert', 'remove'] },
  entry, text: text(), skill: CONTENT_SCHEMA.properties!.skills.items!, language: CONTENT_SCHEMA.properties!.languages.items!,
}, ['list', 'index', 'action']);

export function proposalSchema(templates: string[], palettes: string[]): Schema {
  return object({
    summary: text(1200), template: { type: 'string', enum: templates }, palette: { type: 'string', enum: palettes },
    content: CONTENT_SCHEMA, patch: array(PATCH, 40),
  }, ['summary', 'content']);
}
