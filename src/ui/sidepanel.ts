// Panneau de gauche à onglets (Contenu, Calques), repliable. Chaque onglet a aussi son bouton
// dans la barre d'outils : il ouvre le panneau sur cet onglet (un second clic le replie).
import { h } from './dom';
import { uiIcon, type UiIcon } from './icons';

export interface Tab {
  id: string;
  label: string;
  icon: UiIcon;
  /** Bouton de la barre d'outils. */
  button: HTMLButtonElement;
  onShow(): void;
}

export function setupSidePanel(root: HTMLElement, tabs: Tab[], initial: string) {
  const tabBar = h('div', { class: 'side-tabs', role: 'tablist' });
  const close = h('button', { type: 'button', class: 'icon side-close', title: 'Replier le panneau', ariaLabel: 'Replier le panneau' }, uiIcon('chevron', 16));
  const panes = new Map<string, HTMLElement>();
  const tabBtns = new Map<string, HTMLButtonElement>();
  const badges = new Map<string, HTMLElement>();
  let current = initial;

  for (const t of tabs) {
    const badge = h('span', { class: 'layer-count' });
    const b = h('button', { type: 'button', role: 'tab', class: 'side-tab', id: `tab-${t.id}` }, uiIcon(t.icon, 15), t.label, badge);
    const pane = h('div', { class: 'side-pane', role: 'tabpanel', id: `pane-${t.id}` });
    pane.setAttribute('aria-labelledby', b.id);
    b.setAttribute('aria-controls', pane.id);
    b.addEventListener('click', () => show(t.id));
    t.button.addEventListener('click', () => (!root.hidden && current === t.id ? setOpen(false) : show(t.id)));
    tabBar.append(b);
    panes.set(t.id, pane);
    tabBtns.set(t.id, b);
    badges.set(t.id, badge);
  }
  root.append(h('div', { class: 'side-head' }, tabBar, close), ...panes.values());
  close.addEventListener('click', () => setOpen(false));

  function sync() {
    for (const t of tabs) {
      const on = t.id === current;
      tabBtns.get(t.id)!.ariaSelected = String(on);
      panes.get(t.id)!.hidden = !on;
      t.button.ariaPressed = String(!root.hidden && on);
    }
  }
  function setOpen(open: boolean) {
    root.hidden = !open;
    sync();
    if (open) tabs.find((t) => t.id === current)?.onShow();
  }
  function show(id: string) {
    current = id;
    setOpen(true);
  }
  return {
    /** À appeler une fois le contenu des onglets prêt : ouvert par défaut, sauf sur petit écran. */
    start: () => setOpen(!matchMedia('(max-width: 860px)').matches),
    pane: (id: string) => panes.get(id)!,
    badge: (id: string) => badges.get(id)!,
    isShown: (id: string) => !root.hidden && current === id,
    show,
  };
}
