// Brouillon automatique : le document en cours (un seul) est conservé dans le navigateur pour le
// retrouver après une fermeture de la page. Ouvrir ou créer un autre document le remplace.
// Il ne quitte jamais l'appareil ; l'utilisateur peut le désactiver ou l'effacer (fenêtre « 100 % local »).
// Relu au démarrage comme un fichier ouvert : même validation que les projets .json.

const KEY = 'pdf-studio.draft';
const AT = 'pdf-studio.draft.at';
const PREF = 'pdf-studio.autosave';

export type DraftResult = 'saved' | 'full' | 'off' | 'unavailable';

export function draftEnabled(): boolean {
  try {
    return localStorage.getItem(PREF) !== 'off';
  } catch {
    return false;
  }
}

/** Active ou désactive la sauvegarde automatique ; désactivée, le brouillon existant est effacé. */
export function setDraftEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(PREF);
    else {
      localStorage.setItem(PREF, 'off');
      clearDraft();
    }
  } catch {
    // Stockage indisponible : rien à retenir.
  }
}

/** Remplace le brouillon par ce document. */
export function saveDraft(project: string): DraftResult {
  if (!draftEnabled()) return 'off';
  try {
    localStorage.setItem(KEY, project);
    localStorage.setItem(AT, String(Date.now()));
    return 'saved';
  } catch (e) {
    // Quota dépassé (grandes photos) : l'ancien brouillon ne correspond plus au document, on le retire.
    clearDraft();
    return e instanceof DOMException && e.name === 'QuotaExceededError' ? 'full' : 'unavailable';
  }
}

export function readDraft(): { project: string; savedAt: number } | null {
  if (!draftEnabled()) return null;
  try {
    const project = localStorage.getItem(KEY);
    return project ? { project, savedAt: Number(localStorage.getItem(AT)) || 0 } : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(AT);
  } catch {
    // Stockage indisponible : il n'y a rien à effacer.
  }
}

/** Date et taille du brouillon (fenêtre d'information). */
export function draftInfo(): { savedAt: number; bytes: number } | null {
  const d = readDraft();
  return d && { savedAt: d.savedAt, bytes: d.project.length * 2 };
}
