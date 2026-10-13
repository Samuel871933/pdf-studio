// Assistant IA flottant : une bulle fixée en bas à droite qui déploie la fenêtre de discussion.
// Le bouton « Assistant IA » de la barre d'outils l'ouvre et la referme aussi.
import { h } from './dom';
import { uiIcon } from './icons';

export function setupChatWidget(toolbarButton: HTMLButtonElement) {
  const panel = h('section', { class: 'ai-dock', id: 'ai-dock', role: 'dialog', ariaLabel: 'Assistant IA', hidden: true });
  const launcher = h('button', { type: 'button', class: 'ai-launcher', title: 'Assistant IA' });
  launcher.setAttribute('aria-controls', panel.id);
  document.body.append(panel, launcher);

  function setOpen(open: boolean) {
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = !open;
    launcher.classList.toggle('open', open);
    launcher.replaceChildren(uiIcon(open ? 'close' : 'sparkle', 24));
    launcher.ariaLabel = open ? 'Réduire l’assistant IA' : 'Ouvrir l’assistant IA';
    launcher.ariaExpanded = String(open);
    toolbarButton.ariaPressed = String(open);
    if (open) panel.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)')?.focus({ preventScroll: true });
    else if (hadFocus) launcher.focus();
  }
  const toggle = () => setOpen(panel.hidden !== false);
  launcher.addEventListener('click', toggle);
  toolbarButton.addEventListener('click', toggle);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setOpen(false); }
  });
  setOpen(false);
  return { root: panel, open: () => setOpen(true), close: () => setOpen(false) };
}
