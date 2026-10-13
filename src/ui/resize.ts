// Largeur des panneaux latéraux réglable : poignée sur le bord (glisser, flèches, double-clic = défaut).
// Les largeurs sont des préférences d'interface, retenues dans le navigateur (jamais le document).
import { h } from './dom';

const KEY = 'pdf-studio.panels';

interface Side {
  /** Panneau redimensionné (la poignée est placée sur son bord intérieur). */
  el: HTMLElement;
  /** Variable CSS de sa largeur. */
  prop: string;
  /** Bord où se trouve la poignée : la largeur augmente en tirant vers l'extérieur de la page. */
  edge: 'right' | 'left';
  min: number;
  max: number;
  def: number;
  label: string;
}

/** Espace minimal laissé à la page entre les panneaux. */
const STAGE_MIN = 320;

function load(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function save(widths: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {
    // Stockage indisponible (navigation privée, stockage bloqué) : la largeur vaut pour cette session.
  }
}

export function setupPanelResize(sides: Side[]) {
  const root = document.documentElement;
  const widths = load();
  const current = (s: Side) => widths[s.prop] ?? s.def;

  /** Largeur bornée : limites du panneau, et la page garde toujours un minimum de place. */
  const clamp = (s: Side, w: number) => {
    const others = sides.filter((o) => o !== s && !o.el.hidden).reduce((n, o) => n + current(o), 0);
    const room = window.innerWidth - others - 76 - STAGE_MIN;
    return Math.round(Math.max(s.min, Math.min(s.max, room, w)));
  };

  const apply = (s: Side, w: number, persist = true) => {
    const v = clamp(s, w);
    if (v === s.def) delete widths[s.prop];
    else widths[s.prop] = v;
    root.style.setProperty(s.prop, `${v}px`);
    handles.get(s)!.ariaValueNow = String(v);
    if (persist) save(widths);
  };

  const handles = new Map<Side, HTMLElement>();
  for (const s of sides) {
    const handle = h('div', {
      class: `resize-handle ${s.edge}`, role: 'separator', tabIndex: 0, ariaLabel: `Largeur du panneau ${s.label}`,
      title: 'Glisser pour redimensionner · double-clic : largeur par défaut',
    });
    handle.setAttribute('aria-orientation', 'vertical');
    handle.ariaValueMin = String(s.min);
    handle.ariaValueMax = String(s.max);
    handles.set(s, handle);
    s.el.append(handle);
    const dir = s.edge === 'right' ? 1 : -1;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = current(s);
      document.body.classList.add('resizing');
      const move = (m: PointerEvent) => apply(s, w0 + (m.clientX - x0) * dir, false);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        document.body.classList.remove('resizing');
        save(widths);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
      handle.addEventListener('pointercancel', up, { once: true });
    });
    handle.addEventListener('dblclick', () => apply(s, s.def));
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 48 : 16;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation(); // pas de déplacement de l'élément sélectionné
        apply(s, current(s) + (e.key === 'ArrowRight' ? step : -step) * dir);
      } else if (e.key === 'Home' || e.key === 'Enter') {
        e.preventDefault();
        apply(s, s.def);
      }
    });
    apply(s, current(s), false);
  }

  // Fenêtre réduite : les panneaux se resserrent pour laisser la page visible (sans oublier la préférence).
  window.addEventListener('resize', () => {
    for (const s of sides) root.style.setProperty(s.prop, `${clamp(s, current(s))}px`);
  });
}
