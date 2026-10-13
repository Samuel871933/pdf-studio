import type { Provider } from './providers';

const PREFS = 'pdf-studio.ai.preferences';
const VAULT = 'pdf-studio.ai.vault.';
const ITERATIONS = 600000;
export interface AiPreferences { provider: Provider; model: string }
export interface VaultRecord extends AiPreferences {
  version: 1; iterations: number; salt: string; iv: string; ciphertext: string;
}
const providerOk = (value: unknown): value is Provider => value === 'openai' || value === 'claude';
const modelOk = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(value) && !/^sk-/i.test(value);
const storageError = () => new Error('Le stockage local est indisponible ou plein. Rien n’a été mémorisé.');
const vaultKey = (provider: Provider) => {
  if (!providerOk(provider)) throw new Error('Fournisseur inconnu.');
  return `${VAULT}${provider}`;
};
export const vaultAvailable = () => !!globalThis.crypto?.subtle;

export function readPreferences(): AiPreferences | null {
  try {
    const raw = localStorage.getItem(PREFS);
    if (!raw || raw.length > 300) return null;
    const v = JSON.parse(raw);
    return v && providerOk(v.provider) && modelOk(v.model) ? { provider: v.provider, model: v.model } : null;
  } catch { return null; }
}
export function savePreferences(value: AiPreferences) {
  if (!providerOk(value.provider) || !modelOk(value.model)) throw new Error('Renseignez un identifiant de modèle valide pour mémoriser les réglages, sans clé API.');
  try { localStorage.setItem(PREFS, JSON.stringify({ provider: value.provider, model: value.model })); } catch { throw storageError(); }
}
export function forgetPreferences() {
  try { localStorage.removeItem(PREFS); } catch { throw new Error('Impossible d’effacer les réglages locaux.'); }
}
function validateRecord(value: unknown): VaultRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Coffre local non reconnu.');
  const v = value as Record<string, unknown>;
  const base64 = (s: unknown, bytes: number) => typeof s === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && atob(s).length === bytes;
  try {
    if (Object.keys(v).sort().join(',') !== 'ciphertext,iterations,iv,model,provider,salt,version'
      || v.version !== 1 || v.iterations !== ITERATIONS || !providerOk(v.provider) || !modelOk(v.model)
      || !base64(v.salt, 16) || !base64(v.iv, 12) || typeof v.ciphertext !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(v.ciphertext) || v.ciphertext.length > 2800
      || atob(v.ciphertext).length < 17) throw new Error();
  } catch { throw new Error('Coffre local invalide ou altéré. Vous pouvez l’effacer et enregistrer une nouvelle clé.'); }
  return v as unknown as VaultRecord;
}
export function readVault(provider: Provider): VaultRecord | null {
  let raw: string | null;
  try { raw = localStorage.getItem(vaultKey(provider)); } catch { throw new Error('Impossible de lire le coffre local.'); }
  if (!raw) return null;
  if (raw.length > 3500) throw new Error('Coffre local trop volumineux.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Coffre local illisible.'); }
  const record = validateRecord(parsed);
  if (record.provider !== provider) throw new Error('Ce coffre ne correspond pas au fournisseur choisi.');
  return record;
}
export function storeVault(record: VaultRecord) {
  const clean = validateRecord(record);
  try { localStorage.setItem(vaultKey(clean.provider), JSON.stringify(clean)); } catch { throw storageError(); }
}
export function forgetVault(provider: Provider) {
  try { localStorage.removeItem(vaultKey(provider)); } catch { throw new Error('Impossible d’effacer le coffre. Effacez les données du site dans votre navigateur.'); }
}
const encode = (value: Uint8Array) => btoa(Array.from(value, (b) => String.fromCharCode(b)).join(''));
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const aad = (value: AiPreferences) => new TextEncoder().encode(`pdf-studio.ai.vault.v1:${value.provider}:${value.model}`);
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (!vaultAvailable()) throw new Error('Le coffre chiffré nécessite HTTPS ou localhost et un navigateur compatible Web Crypto.');
  if (password.length < 12 || password.length > 1024) throw new Error('Choisissez un mot de passe de coffre de 12 à 1 024 caractères.');
  const bytes = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}
export async function encryptKey(value: AiPreferences, key: string, password: string): Promise<VaultRecord> {
  if (!providerOk(value.provider) || !modelOk(value.model) || !key.trim() || key.length > 500 || /\s/.test(key.trim())) throw new Error('Configuration de coffre invalide.');
  if ([key.trim(), value.model, value.provider].includes(password.trim())) throw new Error('Le mot de passe du coffre doit être différent de la clé API et des réglages mémorisés.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = await derive(password, salt);
  const bytes = new TextEncoder().encode(key.trim());
  try {
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(value) }, secret, bytes);
    return { version: 1, iterations: ITERATIONS, provider: value.provider, model: value.model,
      salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
  } finally { bytes.fill(0); }
}
export async function decryptKey(record: VaultRecord, password: string): Promise<string> {
  const clean = validateRecord(record);
  const secret = await derive(password, decode(clean.salt));
  let bytes: Uint8Array | undefined;
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(clean.iv), additionalData: aad(clean) }, secret, decode(clean.ciphertext)));
    const key = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!key || key.length > 500 || /\s/.test(key)) throw new Error();
    return key;
  } catch { throw new Error('Mot de passe incorrect ou coffre altéré.'); }
  finally { bytes?.fill(0); }
}
