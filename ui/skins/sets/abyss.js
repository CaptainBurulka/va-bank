// Набір «Безодня»: глибоке море, біолюмінесценція, медузи, бульбашки, промені світла згори.
// Легендарна: медузи пливуть і пульсують, світло створінь «дихає», піднімаються бульбашки.
import { registerSet, rng, uid, atLeast, f } from '../core.js';
import { svg, SPECIAL, suitGroup, particles, winBox } from './kit.js';

const GLOW = { common: '#7fb4c4', rare: '#7fe6ff', epic: '#3ff7ff', legendary: '#3ff7ff' };
const PINK = '#ff5fd2';
const SUIT_COLOR = { water: '#7fe6ff', fire: '#ffd25f', stone: '#ff9fc8' };

// ── масті: бульбашки, вогник вудильника, мушля; зуб акули, перлина, дві рибки ──
export const SUITS = {
  water: '<circle cx="9" cy="14" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="7" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="17.5" r="2.2" fill="currentColor"/><path d="M6.5 11.5a3 3 0 0 1 3-2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  fire: '<path d="M4 22C5 12 10 6 17 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".7"/><circle cx="18" cy="5.5" r="4.2" fill="currentColor"/><circle cx="18" cy="5.5" r="1.6" fill="#fff" fill-opacity=".85"/>',
  stone: '<path d="M12 3C6 3 2.5 8 2.5 13L12 21l9.5-8C21.5 8 18 3 12 3Z" fill="currentColor"/><path d="M12 21 7 4.6M12 21 12 3M12 21l5-16.4M12 21 3.4 9.6M12 21l8.6-11.4" stroke="#000" stroke-opacity=".3" stroke-width="1"/>',
  knife: '<path d="M4 21C6 12 11 5 20 2.5 18 10 13 17 4 21Z" fill="currentColor"/><path d="M8 17c2-4 5-8 9-11" stroke="#000" stroke-opacity=".3" stroke-width="1" fill="none"/>',
  mirror: '<circle cx="12" cy="11" r="8" fill="currentColor"/><circle cx="9" cy="8" r="2.6" fill="#fff" fill-opacity=".75"/><path d="M5 20.5c4 2 10 2 14 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  double: '<path d="M2 8c3-3.5 7-3.5 10 0-3 3.5-7 3.5-10 0Zm10 0 3-3v6Z" fill="currentColor"/><path d="M8 17c3-3.5 7-3.5 10 0-3 3.5-7 3.5-10 0Zm10 0 3-3v6Z" fill="currentColor"/>',
};
const suitG = suitGroup(SUITS);

const defs = (id, rar) => `<defs>
<linearGradient id="SEA${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rar === 'common' ? '#16384a' : '#064a66'}"/><stop offset=".45" stop-color="#03263c"/><stop offset="1" stop-color="#010812"/></linearGradient>
<linearGradient id="RAY${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bff3ff" stop-opacity=".35"/><stop offset="1" stop-color="#bff3ff" stop-opacity="0"/></linearGradient>
<radialGradient id="BELL${id}" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".4" stop-color="${GLOW[rar]}" stop-opacity=".7"/><stop offset="1" stop-color="${GLOW[rar]}" stop-opacity=".05"/></radialGradient>
<radialGradient id="BELP${id}" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".4" stop-color="${PINK}" stop-opacity=".7"/><stop offset="1" stop-color="${PINK}" stop-opacity=".05"/></radialGradient>
<linearGradient id="LUM${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ffff"/><stop offset=".5" stop-color="${GLOW[rar]}"/><stop offset="1" stop-color="${rar === 'legendary' ? PINK : '#2fa6c4'}"/></linearGradient>
<linearGradient id="PRL${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfe3ee"/><stop offset="1" stop-color="#f6e9ff"/></linearGradient>
<filter id="BL${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

/** Морський «сніг» і (від рідкісної) промені світла згори. */
function water(R, w, h, rar, id) {
  let o = `<rect width="${w}" height="${h}" fill="url(#SEA${id})"/>`;
  if (atLeast(rar, 'rare')) for (let i = 0; i < 4; i++) { const x = R() * w, sp = w * (.06 + R() * .08); o += `<path d="M${f(x)} 0h${f(sp)}L${f(x + sp * 3 - w * .1)} ${f(h * .7)}h${f(-sp * 3.2)}Z" fill="url(#RAY${id})" opacity="${f(.4 + R() * .4)}"/>`; }
  for (let i = 0; i < w * .5; i++) o += `<circle cx="${f(R() * w)}" cy="${f(R() * h)}" r="${f(.2 + R() * .4)}" fill="#cfefff" opacity="${f(.15 + R() * .35)}"/>`;
  return o;
}

/** Медуза: дзвін із сяйвом і хвилясті щупальця. */
function jelly(x, y, s, grad, id, cls = '', delay = 0) {
  let t = '';
  for (let k = -2; k <= 2; k++) t += `<path d="M${f(k * 2.2)} 0q${f(-2)} 6 0 12t0 12" stroke="${grad === 'p' ? PINK : '#9ff3ff'}" stroke-width=".5" fill="none" opacity=".7"/>`;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><g class="${cls}" style="animation-delay:${f(delay)}s">${t}<path d="M-7 0C-7 -9 7 -9 7 0Q5 1.4 3.5 0Q1.8 1.6 0 0Q-1.8 1.6 -3.5 0Q-5 1.4 -7 0Z" fill="url(#${grad === 'p' ? 'BELP' : 'BELL'}${id})" ${cls ? '' : `filter="url(#BL${id})"`}/>${cls ? `<ellipse cy="-3" rx="11" ry="9" fill="url(#${grad === 'p' ? 'BELP' : 'BELL'}${id})" opacity=".35"/>` : ''}</g></g>`;
}

/** Корали й водорості по дну. */
function seabed(R, w, base, s) {
  let o = `<path d="M0 ${base} Q${w * .25} ${base - 4 * s} ${w * .5} ${base - 1 * s} T${w} ${base - 3 * s}V${base + 40}H0Z" fill="#020a12"/>`;
  for (let i = 0; i < w / (9 * s); i++) {
    const x = R() * w, hgt = (8 + R() * 22) * s;
    if (R() < .5) o += `<path d="M${f(x)} ${f(base)}q${f(-3 * s)} ${f(-hgt / 2)} 0 ${f(-hgt)}" stroke="#04202c" stroke-width="${f(1.4 * s)}" fill="none" stroke-linecap="round"/>`;
    else o += `<path d="M${f(x)} ${f(base)}v${f(-hgt * .6)}m0 ${f(hgt * .25)}l${f(-4 * s)} ${f(-hgt * .3)}m${f(4 * s)} ${f(hgt * .15)}l${f(4 * s)} ${f(-hgt * .35)}" stroke="#05222e" stroke-width="${f(1.6 * s)}" fill="none" stroke-linecap="round"/>`;
  }
  return o;
}

/** Цятки біолюмінесценції по дну й на коралах. */
function plankton(R, w, y0, y1, n, rar, cls = '') {
  let o = '';
  for (let i = 0; i < n; i++) o += `<circle class="${cls}" style="animation-delay:${f(R() * 4)}s" cx="${f(R() * w)}" cy="${f(y0 + R() * (y1 - y0))}" r="${f(.35 + R() * .5)}" fill="${R() < .7 ? GLOW[rar] : PINK}" opacity="${f(.5 + R() * .5)}"/>`;
  return o;
}

function bigValue(v, rar, id) {
  const fill = { common: '#a9cfda', rare: `url(#PRL${id})`, epic: `url(#LUM${id})`, legendary: `url(#LUM${id})` }[rar];
  return `<text class="${rar === 'legendary' ? 'abglow' : ''}" x="${String(v).length > 1 ? 58 : 50}" y="70" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="${String(v).length > 1 ? 29 : 42}" fill="${fill}" ${atLeast(rar, 'epic') ? `filter="url(#BL${id})"` : ''}>${v}</text>`;
}

function face(card, rar, opts = {}) {
  const id = uid('ab');
  const R = rng(`abyss-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 100 140', `${defs(id, rar)}${water(R, 100, 140, rar, id)}`);
  const far = svg('0 0 100 140', `${defs(id, rar)}<g opacity=".35">${jelly(20, 30, .7, 'c', id)}${jelly(82, 62, .55, 'p', id)}</g>${seabed(R, 100, 126, 1)}`);
  const n = { common: 1, rare: 2, epic: 2, legendary: 3 }[rar];
  let jl = '';
  const spots = [[82, 24, 1, 'c'], [16, 88, .9, 'p'], [84, 98, .75, 'c']];
  for (let i = 0; i < n; i++) { const [x, y, s, g] = spots[i]; jl += jelly(x + (R() - .5) * 8, y + (R() - .5) * 10, s, rar === 'common' ? 'c' : g, id, live ? 'abj' : '', i * 1.3); }
  const near = svg('0 0 100 140', `${defs(id, rar)}${jl}${plankton(R, 100, 112, 134, { common: 6, rare: 12, epic: 18, legendary: 26 }[rar], rar, live ? 'abpl' : '')}`);
  let center;
  if (card.kind === 'num') {
    const col = rar === 'common' ? '#a9cfda' : SUIT_COLOR[card.suit];
    center = bigValue(card.value, rar, id)
      + suitG(card.suit, 84, 122, 12, col);
  } else {
    const col = { knife: '#d7f4ff', mirror: '#f6ecff', double: '#7fe6ff' }[card.kind];
    center = suitG(card.kind, 32, 22, 36, col, atLeast(rar, 'epic') ? `filter="url(#BL${id})"` : '')
      + `<text x="50" y="76" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="7" letter-spacing=".6" fill="#e6fbff">${SPECIAL[card.kind]}</text>`;
  }
  const ink = svg('0 0 100 140', `${defs(id, rar)}${center}`, 'xMidYMid meet');
  return { layers: [{ d: 0, svg: bg }, { d: 1, svg: far }, { d: 2, svg: near }], ink, live: live ? bubbles : null, cls: 'ab' };
}

/** Легендарна: бульбашки піднімаються, похитуючись (CSS, кількість обмежена). */
const bubbles = particles('abb', 16, (R) => `left:${f(5 + R() * 90)}%;top:100%;--d:${f(5 + R() * 5)}s;--delay:-${f(R() * 10)}s;--s:${f(.5 + R() * 1)}`);

// ── сорочка: кола сонара, велика медуза в центрі ──
function back(rar, opts = {}) {
  const id = uid('aB');
  const R = rng('abyss-back');
  const live = rar === 'legendary' && opts.live !== false;
  let rings = '';
  for (let i = 1; i <= 6; i++) rings += `<circle cx="50" cy="66" r="${i * 9}" fill="none" stroke="${GLOW[rar]}" stroke-width="${f(.6 - i * .06)}" opacity="${f(.5 - i * .06)}"/>`;
  const field = svg('0 0 100 140', `${defs(id, rar)}${water(R, 100, 140, rar, id)}${rings}${live ? `<circle class="abping" cx="50" cy="66" r="10" fill="none" stroke="${GLOW[rar]}" stroke-width=".8"/>` : ''}`);
  const mark = svg('0 0 100 140', `${defs(id, rar)}${jelly(50, 46, 2.2, rar === 'legendary' ? 'p' : 'c', id, live ? 'abj' : '')}<text x="50" y="124" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="9" letter-spacing="2" fill="#e6fbff" ${atLeast(rar, 'epic') ? `filter="url(#BL${id})"` : ''}>ВА·БАНК</text>`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: mark }], ink: '', live: live ? bubbles : null, cls: 'ab' };
}

function felt(rar, opts = {}) {
  const id = uid('aF');
  const R = rng('abyss-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 320 180', `${defs(id, rar)}${water(R, 320, 180, rar, id)}<g opacity=".35">${jelly(60, 50, 1.4, 'c', id)}${jelly(250, 70, 1.1, 'p', id)}</g>`);
  const near = svg('0 0 320 180', `${defs(id, rar)}${seabed(R, 320, 160, 1.8)}${plankton(R, 320, 140, 178, { common: 14, rare: 26, epic: 40, legendary: 56 }[rar], rar, live ? 'abpl' : '')}${atLeast(rar, 'rare') ? jelly(270, 40, 1.8, 'c', id, live ? 'abj' : '') : ''}${atLeast(rar, 'epic') ? jelly(40, 110, 1.4, 'p', id, live ? 'abj' : '', 1.4) : ''}`);
  return { layers: [{ d: 0, svg: bg }, { d: 2, svg: near }], ink: '', live: live ? bubbles : null, cls: 'ab' };
}

// ── фішка: перламутр, бірюзовий кант ──
function chip(rar) {
  const id = uid('aC');
  const rim = { common: '#4f8396', rare: '#7fe6ff', epic: '#3ff7ff', legendary: '#ffd56b' }[rar];
  let marks = '';
  for (let i = 0; i < 8; i++) marks += `<circle cx="50" cy="7" r="3.4" fill="#e9fbff" opacity=".85" transform="rotate(${i * 45} 50 50)"/>`;
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `${defs(id, rar)}<circle cx="50" cy="50" r="49" fill="#03263c"/><circle cx="50" cy="50" r="45" fill="none" stroke="${rim}" stroke-width="5"/>${marks}<circle cx="50" cy="50" r="30" fill="url(#PRL${id})"/>`) },
      { d: 2, svg: svg('0 0 100 100', `${defs(id, rar)}<circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width=".6" opacity=".7"/><ellipse cx="42" cy="40" rx="8" ry="5" fill="#fff" opacity=".6" transform="rotate(-30 42 40)"/><text x="50" y="58" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="15" fill="#2b5e74">ВБ</text>`) }],
    ink: '', live: null, cls: 'ab',
  };
}

/** Перемога: хвилі світла розходяться, знизу здіймається стовп бульбашок. */
function win(layer, rar, limit) {
  const R = rng(Date.now() % 7877);
  const n = Math.min(limit, { common: 14, rare: 22, epic: 30, legendary: 40 }[rar]);
  let html = '';
  for (let i = 0; i < { common: 1, rare: 2, epic: 3, legendary: 4 }[rar]; i++) html += `<i class="abring" style="animation-delay:${f(i * .35)}s"></i>`;
  for (let i = 0; i < n; i++) html += `<i class="abw" style="left:${f(30 + R() * 40)}%;--dx:${f((R() - .5) * 140)}px;--s:${f(.5 + R() * 1.2)};animation-delay:${f(R() * .9)}s;animation-duration:${f(1.6 + R() * 1.2)}s"></i>`;
  winBox(layer, 'abyss', rar, html);
}

export default registerSet({
  id: 'abyss', name: 'Безодня', icon: '🪼', accent: 'sonar', accentName: 'сонар',
  blurb: 'Глибоке море: біолюмінесценція, медузи, бульбашки і промені світла згори.',
  legendaryNote: 'Медузи пливуть і пульсують, світло створінь дихає, піднімаються бульбашки.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
