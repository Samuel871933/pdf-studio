// Icônes de l'interface (tracés au trait, viewBox 24×24).
const SVG_NS = 'http://www.w3.org/2000/svg';

export const UI_ICONS = {
  alignLeft: 'M4 3v18M8 7h11v4H8zM8 14h6v4H8z',
  alignHCenter: 'M12 3v18M5.5 7h13v4h-13zM8.5 14h7v4h-7z',
  alignRight: 'M20 3v18M5 7h11v4H5zM10 14h6v4h-6z',
  alignTop: 'M3 4h18M7 8h4v11H7zM14 8h4v6h-4z',
  alignVCenter: 'M3 12h18M7 5.5h4v13H7zM14 8.5h4v7h-4z',
  alignBottom: 'M3 20h18M7 5h4v11H7zM14 10h4v6h-4z',
  front: 'M5 4h14M12 20V8.5M7.5 13 12 8.5l4.5 4.5',
  forward: 'M12 19V6M7.5 10.5 12 6l4.5 4.5',
  backward: 'M12 5v13M7.5 13.5 12 18l4.5-4.5',
  back: 'M5 20h14M12 4v11.5M7.5 11l4.5 4.5 4.5-4.5',
  image: 'M3 4h18v16H3zM4 19l6-6 4 4 3-3 4 4M9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  chevron: 'm9 6 6 6-6 6',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.3M6.5 7.6A15.6 15.6 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 4.4-1.1M9.9 10a2.5 2.5 0 0 0 3.5 3.6',
  duplicate: 'M8 8h12v12H8zM16 8V4H4v12h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  text: 'M5 5h14M12 5v14M9 19h6',
  square: 'M4 5h16v14H4z',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  triangle: 'M12 4 21 20H3z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  line: 'M4 20 20 4',
  shape: 'M6 3h12v14l-6 4-6-4z',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  folder: 'M3 6h6l2 2h10v11H3z',
  group: 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M8 8h8v8H8z',
  ungroup: 'M4 4h9v9H4zM11 11h9v9h-9z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
} as const;
export type UiIcon = keyof typeof UI_ICONS;

export function uiIcon(name: UiIcon, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', UI_ICONS[name]);
  for (const [k, v] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']])
    path.setAttribute(k, v);
  svg.append(path);
  return svg;
}
