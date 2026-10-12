// Petits utilitaires DOM (aucun innerHTML : tout le contenu est inséré en texte).
export type Child = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Icône SVG à partir d'un tracé (viewBox 24×24). */
export function svgPath(d: string, size = 24): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export interface Modal {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close(): void;
}

/** Fenêtre modale native (<dialog>) : Échap et clic à l'extérieur la ferment. */
export function modal(title: string, opts: { wide?: boolean; onClose?: () => void } = {}): Modal {
  const closeBtn = h('button', { type: 'button', class: 'icon', title: 'Fermer', ariaLabel: 'Fermer' }, '✕');
  const body = h('div', { class: 'modal-body' });
  const dialog = h(
    'dialog',
    { class: `modal${opts.wide ? ' wide' : ''}` },
    h('header', { class: 'modal-head' }, h('h2', {}, title), closeBtn),
    body,
  );
  const close = () => dialog.close();
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    opts.onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, close };
}
