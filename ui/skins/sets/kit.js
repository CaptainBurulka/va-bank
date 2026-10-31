// Спільні інструменти наборів: SVG-обгортка, масті, частинки, контейнер перемоги, растровий шрифт 5×7
// (для «Пікселя» — квадратики, для «Козацького» — хрестики вишивки).
import { rng, f } from '../core.js';

export const svg = (vb, inner, ar = 'xMidYMid slice') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="${ar}">${inner}</svg>`;
export const SPECIAL = { knife: 'НІЖ', mirror: 'ДЗЕРКАЛО', double: 'ПОДВОЄННЯ' };
export const suitGroup = (SUITS) => (kind, x, y, s, color, extra = '') => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s / 24)})" style="color:${color}" ${extra}>${SUITS[kind]}</g>`;

/**
 * CSS-частинки для живого шару легендарної (кількість ≤ n). gen(R, i) → рядок style без left/top.
 * Анімацію задає клас набору; поза екраном CSS зупиняє її через .sk-paused.
 */
export function particles(cls, count, gen) {
  return (el, n) => {
    const R = rng(n * 13 + cls.length);
    let o = '';
    for (let i = 0; i < Math.min(n, count); i++) o += `<i class="${cls}" style="${gen(R, i)}"></i>`;
    el.innerHTML = o;
  };
}

/** Контейнер анімації перемоги (прибирається сам). */
export function winBox(layer, cls, rar, html, ms = 3400) {
  const box = document.createElement('div');
  box.className = `skwin ${cls} r-${rar}`;
  box.innerHTML = html;
  layer.append(box);
  setTimeout(() => box.remove(), ms);
  return box;
}

// ── растровий шрифт 5×7: цифри і літери, потрібні для назв карт ──
const G = {
  '0': '.###.#...##...##...##...##...#.###.',
  '1': '..#...##....#....#....#....#...###.',
  '2': '.###.#...#....#...#...#...#...#####',
  '3': '####.....#....#.###.....#....#####.',
  '4': '...#...##..#.#.#..#.#####...#....#.',
  '5': '######....####.....#....##...#.###.',
  '6': '..##..#...#....####.#...##...#.###.',
  '7': '#####....#...#...#...#....#....#...',
  '8': '.###.#...##...#.###.#...##...#.###.',
  '9': '.###.#...##...#.####....#...#..##..',
  'Н': '#...##...##...#######...##...##...#',
  'І': '.###...#....#....#....#....#...###.',
  'Ж': '#.#.##.#.#.###...#...###.#.#.##.#.#',
  'Д': '.###..#.#..#.#..#.#..#.#.######...#',
  'З': '.###.#...#....#..##.....##...#.###.',
  'Е': '######....#....####.#....#....#####',
  'Р': '####.#...##...#####.#....#....#....',
  'К': '#...##..#.#.#..##...#.#..#..#.#...#',
  'А': '.###.#...##...#######...##...##...#',
  'Л': '..###.#..#.#..#.#..#.#..#.#..##...#',
  'О': '.###.#...##...##...##...##...#.###.',
  'П': '######...##...##...##...##...##...#',
  'В': '####.#...##...#####.#...##...#####.',
  'Є': '.###.#...##....###..#....#...#.###.',
  'Я': '.#####...##...#.####..#.#.#..##...#',
  'Б': '######....#....####.#...##...#####.',
  '!': '..#....#....#....#....#.........#..',
  '-': '................###................',
  ' ': '...................................',
};
/** Клітинки гліфа: [[col,row]…]. */
export function glyphCells(ch) {
  const g = G[ch] || G[' '];
  const out = [];
  for (let i = 0; i < 35; i++) if (g[i] === '#') out.push([i % 5, Math.floor(i / 5)]);
  return out;
}
/** Ширина рядка у клітинках (крок 6, без хвостового проміжку). */
export const textCells = (str) => String(str).length * 6 - 1;

/** Піксельний текст: один path із квадратів (дешево для рендера). */
export function pixText(str, x, y, px, fill, attrs = '') {
  let d = '';
  [...String(str)].forEach((ch, k) => {
    for (const [c, r] of glyphCells(ch)) d += `M${f(x + (k * 6 + c) * px)} ${f(y + r * px)}h${f(px)}v${f(px)}h${f(-px)}z`;
  });
  return `<path d="${d}" fill="${fill}" shape-rendering="crispEdges" ${attrs}/>`;
}
/** Те саме, але хрестиками вишивки. */
export function stitchText(str, x, y, px, color, width = .38, attrs = '') {
  let d = '';
  const m = px * .12;
  [...String(str)].forEach((ch, k) => {
    for (const [c, r] of glyphCells(ch)) {
      const X = x + (k * 6 + c) * px, Y = y + r * px;
      d += `M${f(X + m)} ${f(Y + m)}L${f(X + px - m)} ${f(Y + px - m)}M${f(X + px - m)} ${f(Y + m)}L${f(X + m)} ${f(Y + px - m)}`;
    }
  });
  return `<path d="${d}" stroke="${color}" stroke-width="${f(px * width)}" stroke-linecap="round" fill="none" ${attrs}/>`;
}

/** Матриця рядків ('#', '.', або літера-колір) → path по кольорах. pal: { '#': '#fff', a: '#f00' } */
export function pixMatrix(rows, x, y, px, pal, attrs = '') {
  const by = {};
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (pal[ch]) by[ch] = (by[ch] || '') + `M${f(x + c * px)} ${f(y + r * px)}h${f(px)}v${f(px)}h${f(-px)}z`; }));
  return Object.entries(by).map(([ch, d]) => `<path d="${d}" fill="${pal[ch]}" shape-rendering="crispEdges" ${attrs}/>`).join('');
}

/**
 * Матриця хрестиками вишивки. pal: { b: '#000', r: '#c00' }. Якщо задано cls — стовпчики
 * групуються і отримують затримку анімації (орнамент «вишивається» ниткою зліва направо).
 */
export function stitchMatrix(rows, x, y, px, pal, { width = .36, cls = '', chunk = 4, period = 6 } = {}) {
  const m = px * .12;
  const cols = Math.max(...rows.map((r) => r.length));
  const groups = cls ? Math.ceil(cols / chunk) : 1;
  let out = '';
  for (let gI = 0; gI < groups; gI++) {
    const by = {};
    const c0 = cls ? gI * chunk : 0, c1 = cls ? Math.min(cols, c0 + chunk) : cols;
    rows.forEach((row, r) => {
      for (let c = c0; c < c1; c++) {
        const ch = row[c];
        if (!pal[ch]) continue;
        const X = x + c * px, Y = y + r * px;
        by[ch] = (by[ch] || '') + `M${f(X + m)} ${f(Y + m)}L${f(X + px - m)} ${f(Y + px - m)}M${f(X + px - m)} ${f(Y + m)}L${f(X + m)} ${f(Y + px - m)}`;
      }
    });
    const paths = Object.entries(by).map(([ch, d]) => `<path d="${d}" stroke="${pal[ch]}" stroke-width="${f(px * width)}" stroke-linecap="round" fill="none"/>`).join('');
    out += cls ? `<g class="${cls}" style="animation-delay:${f((gI / groups) * period)}s">${paths}</g>` : paths;
  }
  return out;
}
