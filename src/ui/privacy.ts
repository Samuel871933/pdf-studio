// Fenêtre « 100 % local » : ce qui reste sur l'appareil, et le brouillon automatique (activer, effacer).
import { clearDraft, draftEnabled, draftInfo, setDraftEnabled } from '../draft';
import { h, modal } from './dom';

const when = (t: number) =>
  new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`);

/** `full` : le dernier enregistrement a échoué faute de place (photos volumineuses). */
export function openPrivacy(opts: { full: boolean; onChange(): void }) {
  const m = modal('Vos données restent sur cet appareil');
  const status = h('p', { class: 'hint' });
  const toggle = h('input', { type: 'checkbox', checked: draftEnabled() });
  const clear = h('button', { type: 'button', class: 'danger' }, 'Effacer le brouillon');

  function render() {
    const info = draftInfo();
    clear.disabled = !info;
    status.textContent = !draftEnabled()
      ? 'Sauvegarde automatique désactivée : fermer la page efface le document (une alerte prévient s’il a été modifié).'
      : opts.full
        ? 'Document trop volumineux pour le brouillon automatique (photos ?) : pensez à l’enregistrer en .json.'
        : info
          ? `Brouillon enregistré le ${when(info.savedAt)} · ${size(info.bytes)}.`
          : 'Aucun brouillon pour l’instant : il sera créé à la prochaine modification.';
  }

  toggle.addEventListener('change', () => {
    setDraftEnabled(toggle.checked);
    opts.onChange();
    render();
  });
  clear.addEventListener('click', () => {
    clearDraft();
    render();
  });

  m.body.append(
    h('p', {}, 'Aucune donnée ne quitte votre navigateur : pas de serveur, pas de cookie, rien n’est envoyé. Le PDF et le projet .json sont créés sur votre appareil.'),
    h('h3', {}, 'Brouillon automatique'),
    h('p', {}, 'Le document en cours est enregistré dans ce navigateur pour que vous le retrouviez si vous fermez la page. Un seul document est conservé : en ouvrir ou en créer un autre le remplace.'),
    h('label', { class: 'check' }, toggle, 'Enregistrer automatiquement le document en cours'),
    status,
    h('div', { class: 'row' }, clear),
    h('p', { class: 'hint' }, 'Ordinateur partagé ? Désactivez la sauvegarde automatique ou effacez le brouillon avant de partir : il contient votre CV. Effacé, il est recréé à la modification suivante si la sauvegarde reste activée.'),
  );
  render();
}
