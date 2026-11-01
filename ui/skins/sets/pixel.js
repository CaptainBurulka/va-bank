// Набір «Піксель»: 8-біт, обмежена палітра, цифри й масті — піксельні матриці (SVG, crispEdges).
// Легендарна: анімовані спрайти (монетка крутиться, зірки мерехтять), аркадні зорі летять крізь карту, цифра переливається.
import { registerSet, rng, uid, atLeast, f } from '../core.js';
import { svg, SPECIAL, pixText, pixMatrix, textCells, winBox } from './kit.js';

// 16-кольорова палітра в дусі фентезі-консолей
const P = { k: '#000000', n: '#1d2b53', p: '#7e2553', g: '#008751', b: '#ab5236', d: '#5f574f', l: '#c2c3c7', w: '#fff1e8', r: '#ff004d', o: '#ffa300', y: '#ffec27', G: '#00e436', B: '#29adff', v: '#83769c', P: '#ff77a8', s: '#ffccaa' };
const SUIT_COLOR = { water: P.B, fire: P.r, stone: P.l };

// ── масті й спецкарти: матриці 8×8 ('#' — колір масті, інші літери — палітра) ──
const M = {
  water: ['...#....', '...##...', '..####..', '.######.', '.#w####.', '.#w####.', '..####..', '........'],
  fire: ['...#....', '..##..#.', '..###.#.', '.#####..', '.##yy##.', '.#yyyy#.', '..#yy#..', '........'],
  stone: ['.######.', '#ww####d', '#w#####d', '########', '###d####', '#######d', '.dddddd.', '........'],
  knife: ['......ww', '.....ww.', '....ww..', '.y.ww...', '..yw....', '..oy....', '.o..y...', 'o.......'],
  mirror: ['..####..', '.#ww##d.', '.#w###d.', '.#####d.', '..####..', '...oo...', '..oooo..', '........'],
  double: ['#..#....', '.#..#...', '..#..#..', '...#..#.', '..#..#..', '.#..#...', '#..#....', '........'],
};
const palFor = (col) => ({ '#': col, w: P.w, d: P.d, y: P.y, o: P.o });
/** SVG 24×24 для решти гри. */
export const SUITS = Object.fromEntries(Object.entries(M).map(([k, rows]) => [k, pixMatrix(rows, 0, 0, 3, { ...palFor('currentColor') })]));
const suitP = (kind, x, y, s, col) => pixMatrix(M[kind], x, y, s / 8, palFor(col));

const SKY = { common: [P.n, P.n, P.v], rare: [P.k, P.n, P.v], epic: [P.k, P.n, P.p], legendary: [P.k, P.n, P.p] };

/** Небо смугами (як дизеринг), зорі-пікселі, хмарки. */
function sky(R, w, h, rar, cls = '') {
  const c = SKY[rar];
  let o = `<rect width="${w}" height="${h}" fill="${c[0]}"/>`;
  const band = h / 14;
  for (let i = 0; i < 6; i++) o += `<rect y="${f(h * .3 + i * band)}" width="${w}" height="${f(band)}" fill="${i < 3 ? c[1] : c[2]}" opacity="${f(.35 + i * .12)}"/>`;
  for (let i = 0; i < w * .4; i++) { const s = R() < .2 ? 2 : 1; o += `<rect class="${cls}" style="animation-delay:${f(R() * 3)}s" x="${Math.floor(R() * w / 2) * 2}" y="${Math.floor(R() * h * .45 / 2) * 2}" width="${s}" height="${s}" fill="${R() < .8 ? P.w : P.y}" shape-rendering="crispEdges"/>`; }
  return o;
}
/** Сходинкові гори і цегляна земля. */
function land(R, w, base, s, rar) {
  let o = '', x = 0, hgt = 10 * s;
  const cols = [];
  while (x < w) { hgt = Math.max(4 * s, Math.min(30 * s, hgt + (Math.floor(R() * 5) - 2) * 2 * s)); cols.push([x, hgt]); x += 4 * s; }
  o += cols.map(([cx, ch]) => `<rect x="${cx}" y="${f(base - ch)}" width="${4 * s}" height="${f(ch)}" fill="${rar === 'common' ? P.d : P.g}"/>`).join('');
  o += cols.map(([cx, ch]) => `<rect x="${cx}" y="${f(base - ch)}" width="${4 * s}" height="${2 * s}" fill="${rar === 'common' ? P.l : P.G}"/>`).join('');
  // цегла
  o += `<rect y="${base}" width="${w}" height="${40 * s}" fill="${P.b}"/>`;
  for (let ry = 0; ry < 5; ry++) for (let bx = (ry % 2) * 4 * s; bx < w; bx += 8 * s) o += `<rect x="${bx}" y="${base + ry * 4 * s}" width="${8 * s - s}" height="${4 * s - s}" fill="${P.s}" opacity=".35"/>`;
  return `<g shape-rendering="crispEdges">${o}</g>`;
}
/** Піксельна хмарка. */
const cloud = (x, y, s) => pixMatrix(['..###...', '.#####.#', '########', '.######.'], x, y, s, { '#': P.w }, 'opacity=".9"');

/** Монетка-спрайт (8 кадрів обертання — CSS steps по scaleX). */
const COIN = ['..####..', '.#yyyy#.', '#yywwyy#', '#yywyyy#', '#yywyyy#', '#yyyyyy#', '.#yyyy#.', '..####..'];
const coin = (x, y, s, cls = '') => `<g transform="translate(${f(x)} ${f(y)})"><g class="${cls}">${pixMatrix(COIN, -4 * s, -4 * s, s, { '#': P.o, y: P.y, w: P.w })}</g></g>`;
const STAR = ['...#...', '...#...', '.#####.', '#######', '.#####.', '.##.##.', '##...##'];

function bigValue(v, rar, cls) {
  const str = String(v);
  const px = str.length > 1 ? 3.4 : 4.4;
  const x = 50 - (textCells(str) * px) / 2, y = 60 - 3.5 * px;
  const main = { common: P.l, rare: P.w, epic: P.y, legendary: P.y }[rar];
  const shade = { common: P.d, rare: P.B, epic: P.o, legendary: P.r }[rar];
  let o = pixText(str, x + px, y + px, px, shade);
  if (atLeast(rar, 'epic')) o = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => pixText(str, x + dx * px * .5, y + dy * px * .5, px, P.k)).join('') + o;
  return o + pixText(str, x, y, px, main, cls ? `class="${cls}"` : '');
}

function face(card, rar, opts = {}) {
  const id = uid('px');
  const R = rng(`pixel-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 100 140', `<g shape-rendering="crispEdges">${sky(R, 100, 140, rar, live ? 'pxtw' : '')}</g>${cloud(8 + R() * 20, 30 + R() * 8, 2)}${atLeast(rar, 'rare') ? cloud(60 + R() * 20, 18 + R() * 6, 1.5) : ''}`);
  const ground = svg('0 0 100 140', land(R, 100, 118, 1, rar));
  const sprites = atLeast(rar, 'epic') ? svg('0 0 100 140', `${coin(82, 98, 1.6, live ? 'pxspin' : '')}${rar === 'legendary' ? pixMatrix(STAR, 82, 50, 1.6, { '#': P.y }, live ? 'class="pxstar"' : '') : ''}`) : '';
  let center;
  if (card.kind === 'num') {
    center = bigValue(card.value, rar, live ? 'pxrain' : '')
      + suitP(card.suit, 84, 123, 11, SUIT_COLOR[card.suit]);
  } else {
    const label = SPECIAL[card.kind];
    const lpx = label.length > 6 ? 1.3 : 1.8;
    center = suitP(card.kind, 32, 22, 36, { knife: P.l, mirror: P.B, double: P.P }[card.kind])
      + `<rect x="${f(50 - textCells(label) * lpx / 2 - 2)}" y="68" width="${f(textCells(label) * lpx + 4)}" height="${f(7 * lpx + 4)}" fill="${P.k}" opacity=".7"/>`
      + pixText(label, 50 - (textCells(label) * lpx) / 2, 70, lpx, P.w);
  }
  const ink = svg('0 0 100 140', center, 'xMidYMid meet');
  const layers = [{ d: 0, svg: bg }, { d: 2, svg: ground }];
  if (sprites) layers.push({ d: 3, svg: sprites });
  return { layers, ink, live: live ? arcade : null, cls: 'pxs' };
}

/** Легендарна: аркадні зорі летять згори вниз пікселями (CSS steps, кількість обмежена). */
function arcade(el, n) {
  const R = rng(n * 5 + 1);
  let o = '';
  for (let i = 0; i < Math.min(n, 18); i++) o += `<i class="pxf" style="left:${f(R() * 100)}%;--d:${f(1.6 + R() * 2.4)}s;--delay:-${f(R() * 4)}s;--c:${[P.w, P.y, P.B, P.P][i % 4]}"></i>`;
  el.innerHTML = o;
}

// ── сорочка: шахова клітинка, рамка, «ВБ» великими пікселями ──
function back(rar, opts = {}) {
  const live = rar === 'legendary' && opts.live !== false;
  const a = { common: P.n, rare: P.n, epic: P.p, legendary: P.p }[rar], b = { common: P.d, rare: P.B, epic: P.v, legendary: P.r }[rar];
  let chk = '';
  for (let y = 0; y < 140; y += 6) for (let x = (y / 6) % 2 ? 6 : 0; x < 100; x += 12) chk += `M${x} ${y}h6v6h-6z`;
  const field = svg('0 0 100 140', `<rect width="100" height="140" fill="${a}"/><path d="${chk}" fill="${b}" opacity=".45" shape-rendering="crispEdges"/>`);
  const mark = svg('0 0 100 140', `<g shape-rendering="crispEdges"><rect x="18" y="44" width="64" height="52" fill="${P.k}"/><rect x="20" y="46" width="60" height="48" fill="none" stroke="${P.w}" stroke-width="2"/></g>
${pixText('ВБ', 50 - textCells('ВБ') * 2.6, 52, 5.2, P.y)}${pixText('ВА-БАНК', 50 - textCells('ВА-БАНК') * 1.1, 104, 2.2, P.w, live ? 'class="pxblink"' : '')}${atLeast(rar, 'epic') ? coin(50, 26, 2, live ? 'pxspin' : '') : ''}`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: mark }], ink: '', live: live ? arcade : null, cls: 'pxs' };
}

function felt(rar, opts = {}) {
  const R = rng('pixel-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 320 180', `<g shape-rendering="crispEdges">${sky(R, 320, 180, rar, live ? 'pxtw' : '')}</g>${cloud(30, 40, 4)}${cloud(200, 24, 3)}${atLeast(rar, 'rare') ? cloud(250, 70, 2.5) : ''}`);
  const ground = svg('0 0 320 180', `${land(R, 320, 150, 2, rar)}${atLeast(rar, 'epic') ? coin(120, 110, 3, live ? 'pxspin' : '') + coin(150, 100, 3, live ? 'pxspin' : '') + coin(180, 110, 3, live ? 'pxspin' : '') : ''}`);
  return { layers: [{ d: 0, svg: bg }, { d: 2, svg: ground }], ink: '', live: live ? arcade : null, cls: 'pxs' };
}

// ── фішка: піксельна монета ──
function chip(rar) {
  const rim = { common: P.d, rare: P.B, epic: P.v, legendary: P.o }[rar];
  const rows = [];
  const N = 20;
  for (let r = 0; r < N; r++) { let row = ''; for (let c = 0; c < N; c++) { const d = Math.hypot(c - N / 2 + .5, r - N / 2 + .5); row += d < N / 2 - 2.6 ? (d < 5.5 ? 'k' : 'n') : d < N / 2 - .4 ? ((Math.atan2(r - N / 2, c - N / 2) * 8 / Math.PI + 16) % 2 < 1 ? 'w' : 'r') : '.'; } rows.push(row); }
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', pixMatrix(rows, 0, 0, 5, { k: P.k, n: P.n, w: P.w, r: rim })) },
      { d: 2, svg: svg('0 0 100 100', pixText('ВБ', 50 - textCells('ВБ') * 1.4, 40, 2.8, rar === 'legendary' ? P.y : P.w)) }],
    ink: '', live: null, cls: 'pxs',
  };
}

/** Перемога: піксельний напис «ПЕРЕМОГА!», вибух квадратних зірочок. */
function win(layer, rar, limit) {
  const R = rng(Date.now() % 7873);
  const n = Math.min(limit, { common: 14, rare: 22, epic: 30, legendary: 40 }[rar]);
  let html = `<div class="pxwin">${svg(`0 0 ${textCells('ПЕРЕМОГА!') * 4 + 8} 36`, `${pixText('ПЕРЕМОГА!', 6, 6, 4, P.k)}${pixText('ПЕРЕМОГА!', 4, 4, 4, rar === 'legendary' ? P.y : P.w)}`, 'xMidYMid meet')}</div>`;
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, d = 50 + R() * 140; html += `<i class="px" style="--tx:${f(Math.cos(a) * d)}px;--ty:${f(Math.sin(a) * d)}px;--c:${[P.y, P.r, P.B, P.G, P.P][i % 5]};animation-delay:${f(R() * .3)}s"></i>`; }
  winBox(layer, 'pixel', rar, html);
}

export default registerSet({
  id: 'pixel', name: 'Піксель', icon: '👾', accent: 'chip', accentName: '8-біт',
  blurb: '8-біт: обмежена палітра, піксельні цифри й масті, цегла, хмарки й монетки.',
  legendaryNote: 'Монетки крутяться, зорі мерехтять, аркадні зорі летять крізь карту.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
