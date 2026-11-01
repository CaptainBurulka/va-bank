// Набір «Космос»: туманності, зорі, орбіти, планети з кільцями.
// Легендарна: туманність повільно рухається й переливається, планета йде орбітою, падають зорі.
import { registerSet, rng, uid, atLeast, f } from '../core.js';
import { svg, SPECIAL, suitGroup, particles, winBox } from './kit.js';

const NEB = { common: ['#3a3f6b', '#2c5566'], rare: ['#4d3fa0', '#1f7a8c'], epic: ['#7a2fb0', '#1aa3b8'], legendary: ['#b02f8f', '#2f6bd8'] };
const SUIT_COLOR = { water: '#6cc4ff', fire: '#ffcf5a', stone: '#d6cfc4' };

// ── масті: планета з кільцем, зоря, кратерний місяць; комета, супутникова антена, подвійна зоря ──
export const SUITS = {
  water: '<circle cx="12" cy="12" r="6.2" fill="currentColor"/><ellipse cx="12" cy="12.5" rx="11" ry="3.4" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-18 12 12)"/><path d="M8.2 9.6a4.6 4.6 0 0 1 4-2.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  fire: '<path d="M12 1.5 14 9.8 22.5 12 14 14.2 12 22.5 10 14.2 1.5 12 10 9.8Z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="#fff" fill-opacity=".85"/>',
  stone: '<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="8.5" cy="9" r="2.2" fill="#000" fill-opacity=".22"/><circle cx="15" cy="14.5" r="3" fill="#000" fill-opacity=".22"/><circle cx="14.5" cy="6.8" r="1.2" fill="#000" fill-opacity=".22"/><circle cx="7.6" cy="15.6" r="1.1" fill="#000" fill-opacity=".22"/>',
  knife: '<circle cx="17.5" cy="6.5" r="3.6" fill="currentColor"/><path d="M15 9 3 21M14.2 7.4 5 13.5M16.6 10 10.5 19.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>',
  mirror: '<path d="M4 6a11 11 0 0 0 14 14Z" fill="currentColor"/><path d="M11 13 18 6M18 6l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="19.8" cy="4.2" r="1.6" fill="currentColor"/><path d="M7 21h9" stroke="currentColor" stroke-width="2"/>',
  double: '<circle cx="8" cy="12" r="4.2" fill="currentColor"/><circle cx="17.5" cy="12" r="2.8" fill="currentColor" opacity=".8"/><ellipse cx="12" cy="12" rx="10.5" ry="4.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.6"/>',
};
const suitG = suitGroup(SUITS);

const defs = (id, rar) => `<defs>
<radialGradient id="N1${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${NEB[rar][0]}" stop-opacity=".9"/><stop offset="1" stop-color="${NEB[rar][0]}" stop-opacity="0"/></radialGradient>
<radialGradient id="N2${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${NEB[rar][1]}" stop-opacity=".8"/><stop offset="1" stop-color="${NEB[rar][1]}" stop-opacity="0"/></radialGradient>
<radialGradient id="PL${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe2b8"/><stop offset=".45" stop-color="#d9824a"/><stop offset="1" stop-color="#3a1a14"/></radialGradient>
<radialGradient id="PB${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d8f1ff"/><stop offset=".5" stop-color="#4a8fd8"/><stop offset="1" stop-color="#0c1a3a"/></radialGradient>
<linearGradient id="DG${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${rar === 'legendary' ? '#ffd56b' : rar === 'epic' ? '#d9b8ff' : '#c9d6ff'}"/></linearGradient>
<filter id="SG${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="NB${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${rar === 'common' ? 4 : 6}"/></filter></defs>`;

function stars(R, w, h, n, rar, cls = '') {
  let o = '';
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = .2 + R() ** 3 * 1.1, c = R() < .15 ? '#ffd9a8' : R() < .3 ? '#b8d4ff' : '#ffffff';
    o += `<circle class="${r > .8 ? cls : ''}" style="animation-delay:${f(R() * 3)}s" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${f(.4 + R() * .6)}"/>`;
    if (r > .9 && atLeast(rar, 'rare')) o += `<path d="M${f(x - r * 4)} ${f(y)}H${f(x + r * 4)}M${f(x)} ${f(y - r * 4)}V${f(y + r * 4)}" stroke="${c}" stroke-width=".25" opacity=".7"/>`;
  }
  return o;
}
/** Туманність: кілька розмитих хмар двох кольорів. */
function nebula(R, w, h, id, cls = '') {
  let o = `<g class="${cls}" filter="url(#NB${id})">`;
  for (let i = 0; i < 5; i++) o += `<ellipse cx="${f(R() * w)}" cy="${f(h * (.2 + R() * .6))}" rx="${f(w * (.25 + R() * .3))}" ry="${f(h * (.1 + R() * .15))}" transform="rotate(${f(-30 + R() * 60)} ${f(w / 2)} ${f(h / 2)})" fill="url(#${i % 2 ? 'N2' : 'N1'}${id})"/>`;
  return `${o}</g>`;
}
/** Планета з кільцем на орбіті; live — обертання орбітою. */
function orbitPlanet(cx, cy, rx, ry, rar, id, live) {
  const ring = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#c9d6ff" stroke-width=".35" opacity=".45" stroke-dasharray="1.4 1.4"/>`;
  const body = `<circle r="4.2" fill="url(#PB${id})"/>${atLeast(rar, 'epic') ? '<ellipse rx="8" ry="2" fill="none" stroke="#e8d9b8" stroke-width=".8" opacity=".8" transform="rotate(-20)"/>' : ''}`;
  // планета йде саме еліпсом орбіти (SVG animateMotion — без JS, пауза разом зі сторінкою)
  const path = `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`;
  return ring + (live ? `<g>${body}<animateMotion dur="14s" repeatCount="indefinite" path="${path}"/></g>` : `<g transform="translate(${cx + rx} ${cy})">${body}</g>`);
}

function bigValue(v, rar, id) {
  return `<text x="50" y="72" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="600" font-size="${String(v).length > 1 ? 36 : 44}" fill="${rar === 'common' ? '#dfe4f2' : `url(#DG${id})`}" ${atLeast(rar, 'epic') ? `filter="url(#SG${id})"` : ''}>${v}</text>`
    + (atLeast(rar, 'epic') ? `<path class="${rar === 'legendary' ? 'cstw' : ''}" d="M70 38l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#fff"/>` : '');
}

function face(card, rar, opts = {}) {
  const id = uid('cs');
  const R = rng(`space-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 100 140', `${defs(id, rar)}<rect width="100" height="140" fill="#05030f"/>${nebula(R, 100, 140, id, live ? 'csneb' : '')}`);
  const st = svg('0 0 100 140', `${defs(id, rar)}${stars(R, 100, 140, { common: 40, rare: 55, epic: 70, legendary: 85 }[rar], rar, live ? 'cstw' : '')}`);
  const near = svg('0 0 100 140', `${defs(id, rar)}${atLeast(rar, 'rare') ? orbitPlanet(50, 104, 34, 9, rar, id, live) : ''}<circle cx="${atLeast(rar, 'rare') ? 18 : 80}" cy="${atLeast(rar, 'rare') ? 120 : 112}" r="${rar === 'common' ? 9 : 12}" fill="url(#PL${id})"/>`);
  let center;
  if (card.kind === 'num') {
    const col = SUIT_COLOR[card.suit];
    center = bigValue(card.value, rar, id)
      + `<text x="10" y="17" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="600" font-size="9.5" fill="#eef1ff">${card.value}</text>`
      + suitG(card.suit, 4, 20, 12, col) + suitG(card.suit, 84, 122, 12, col);
  } else {
    const col = { knife: '#bfe6ff', mirror: '#d6cfc4', double: '#ffcf5a' }[card.kind];
    center = suitG(card.kind, 32, 22, 36, col, atLeast(rar, 'epic') ? `filter="url(#SG${id})"` : '')
      + `<text x="50" y="76" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="600" font-size="7" letter-spacing="1" fill="#eef1ff">${SPECIAL[card.kind]}</text>`;
  }
  const ink = svg('0 0 100 140', `${defs(id, rar)}${center}`, 'xMidYMid meet');
  return { layers: [{ d: 0, svg: bg }, { d: 1, svg: st }, { d: 2, svg: near }], ink, live: live ? falling : null, cls: 'cs' };
}

/** Легендарна: падають зорі — світлі штрихи навскіс (CSS, кількість обмежена). */
const falling = particles('csf', 6, (R) => `left:${f(20 + R() * 90)}%;top:${f(-10 + R() * 40)}%;--d:${f(3 + R() * 4)}s;--delay:-${f(R() * 7)}s`);

// ── сорочка: спіральна галактика, «ВБ» у центрі ──
function back(rar, opts = {}) {
  const id = uid('cB');
  const R = rng('space-back');
  const live = rar === 'legendary' && opts.live !== false;
  let arms = '';
  for (let a = 0; a < 2; a++) for (let i = 0; i < 70; i++) {
    const t = i / 70, ang = a * Math.PI + t * Math.PI * 2.6, r = 4 + t * 40;
    arms += `<circle cx="${f(50 + Math.cos(ang) * r + (R() - .5) * 5)}" cy="${f(70 + Math.sin(ang) * r * .7 + (R() - .5) * 4)}" r="${f(.3 + R() * .8 * (1 - t))}" fill="${R() < .3 ? NEB[rar][0] : '#e8ecff'}" opacity="${f(.4 + R() * .6)}"/>`;
  }
  const field = svg('0 0 100 140', `${defs(id, rar)}<rect width="100" height="140" fill="#05030f"/>${nebula(R, 100, 140, id)}${stars(R, 100, 140, 50, rar)}`);
  const gal = svg('0 0 100 140', `${defs(id, rar)}<g class="${live ? 'csgal' : ''}" style="transform-origin:50px 70px">${arms}</g><circle cx="50" cy="70" r="9" fill="#05030f" opacity=".6"/>
<text x="50" y="75" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="13" fill="url(#DG${id})" filter="url(#SG${id})">ВБ</text>`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: gal }], ink: '', live: live ? falling : null, cls: 'cs' };
}

function felt(rar, opts = {}) {
  const id = uid('cF');
  const R = rng('space-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 320 180', `${defs(id, rar)}<rect width="320" height="180" fill="#05030f"/>${nebula(R, 320, 180, id, live ? 'csneb' : '')}${stars(R, 320, 180, 140, rar, live ? 'cstw' : '')}`);
  const pl = svg('0 0 320 180', `${defs(id, rar)}<circle cx="300" cy="230" r="110" fill="url(#PB${id})"/><circle cx="300" cy="230" r="110" fill="none" stroke="#9fd2ff" stroke-width="2" opacity=".5"/>${atLeast(rar, 'rare') ? orbitPlanet(110, 70, 60, 16, rar, id, live) : ''}${atLeast(rar, 'epic') ? '<circle cx="40" cy="150" r="10" fill="#d6cfc4"/><circle cx="37" cy="147" r="2.4" fill="#000" opacity=".2"/>' : ''}`);
  return { layers: [{ d: 0, svg: bg }, { d: 2, svg: pl }], ink: '', live: live ? falling : null, cls: 'cs' };
}

// ── фішка: планета з кільцем ──
function chip(rar) {
  const id = uid('cC');
  const rim = { common: '#5b6488', rare: '#6cc4ff', epic: '#b97cff', legendary: '#ffd56b' }[rar];
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `${defs(id, rar)}<circle cx="50" cy="50" r="49" fill="#0a0820"/><circle cx="50" cy="50" r="45" fill="none" stroke="${rim}" stroke-width="5" stroke-dasharray="10 6"/>${stars(rng('csc'), 100, 100, 26, rar)}`) },
      { d: 2, svg: svg('0 0 100 100', `${defs(id, rar)}<circle cx="50" cy="50" r="18" fill="url(#PL${id})"/><ellipse cx="50" cy="52" rx="32" ry="8" fill="none" stroke="${rim}" stroke-width="2.4" transform="rotate(-16 50 50)"/><text x="50" y="56" text-anchor="middle" font-family="Unbounded, 'Arial Black', sans-serif" font-weight="800" font-size="12" fill="#fff">ВБ</text>`) }],
    ink: '', live: null, cls: 'cs',
  };
}

/** Перемога: стрибок у гіперпростір — зорі розтягуються в промені від центру, далі зорепад. */
function win(layer, rar, limit) {
  const R = rng(Date.now() % 7867);
  const n = Math.min(limit, { common: 16, rare: 24, epic: 32, legendary: 40 }[rar]);
  let html = '';
  for (let i = 0; i < n; i++) html += `<i class="cswarp" style="--a:${f(R() * 360)}deg;--c:${R() < .7 ? '#fff' : '#9fd2ff'};animation-delay:${f(R() * .5)}s"></i>`;
  if (atLeast(rar, 'epic')) for (let i = 0; i < 6; i++) html += `<i class="csfw" style="left:${f(20 + R() * 80)}%;top:${f(R() * 30)}%;animation-delay:${f(.6 + R() * 1.2)}s"></i>`;
  winBox(layer, 'space', rar, html);
}

export default registerSet({
  id: 'space', name: 'Космос', icon: '🪐', accent: 'cosmos', accentName: 'космічний пед',
  blurb: 'Туманності, зорі з променями, орбіти і планети з кільцями.',
  legendaryNote: 'Туманність рухається й переливається, планета йде орбітою, падають зорі.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
