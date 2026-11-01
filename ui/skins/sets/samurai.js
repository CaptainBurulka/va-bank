// Набір «Самурай»: туш суммі-е на рисовому папері, червона печатка-ханко, сусальне золото.
// Легендарна: туш «тече» (мазки пензля промальовуються наново), падають пелюстки сакури, туман дрейфує.
import { registerSet, rng, uid, atLeast, f } from '../core.js';
import { svg, SPECIAL, suitGroup, particles, winBox } from './kit.js';

const PAPER = { common: '#e7e1d3', rare: '#efe6d0', epic: '#f1e6cc', legendary: '#f3e5c4' };
const INK = '#1c1915';
const VERMILION = '#c4352b';
const SUIT_COLOR = { water: '#26487a', fire: VERMILION, stone: '#3a362f' };

// ── масті: хвиля сейґайха, полум'я, камінь; катана, бронзове дзеркало, два мазки ──
export const SUITS = {
  water: '<path d="M2.5 19a9.5 9.5 0 0 1 19 0" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M6.6 19a5.4 5.4 0 0 1 10.8 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.2 19a1.8 1.8 0 0 1 3.6 0" fill="currentColor"/><path d="M1.5 20.5h21" stroke="currentColor" stroke-width="1.4"/>',
  fire: '<path d="M12.6 2c.6 4.2 6.2 6.4 6.2 12.2a6.8 6.8 0 0 1-13.6 0c0-3.1 1.9-5.2 3.3-6.4-.1 2.2.9 3.6 2.1 3.9-.4-4.2-.6-6.6 2-9.7Z" fill="currentColor"/><path d="M12 13.6c1.6 1.3 2.6 2.6 2.6 4.1a2.6 2.6 0 0 1-5.2 0c0-1.5.9-2.8 2.6-4.1Z" fill="#fff" fill-opacity=".38"/>',
  stone: '<path d="M2.5 19.5 6 10.5l4.5-4 5.2 1.4 3.5 4.6 2.3 7Z" fill="currentColor"/><path d="M10.5 6.5 9.4 12l3.6 2.4M15.7 7.9 14.4 12" stroke="#fff" stroke-opacity=".35" stroke-width="1" fill="none"/><path d="M1.5 20.5h21" stroke="currentColor" stroke-width="1.4"/>',
  knife: '<path d="M21.5 2.5C16 6.3 10.6 11 7.6 14.6l1.8 1.8C13 13.4 18 8.2 21.5 2.5Z" fill="currentColor"/><path d="M5.2 13.4l5.4 5.4" stroke="currentColor" stroke-width="2"/><path d="M7.4 16.6 2.6 21.4" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  mirror: '<circle cx="12" cy="10" r="7.6" fill="currentColor"/><circle cx="12" cy="10" r="5.4" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1"/><circle cx="12" cy="10" r="1.6" fill="#fff" fill-opacity=".5"/><path d="M12 17.6v4" stroke="currentColor" stroke-width="2.6"/>',
  double: '<path d="M6 4c3 4 3.4 10 1 16M14 4c3 4 3.4 10 1 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
};
const suitG = suitGroup(SUITS);

const defs = (id) => `<defs>
<filter id="BR${id}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="1.6"/></filter>
<filter id="MI${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
<linearGradient id="GD${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c0"/><stop offset=".45" stop-color="#e2ad3a"/><stop offset=".55" stop-color="#a8740f"/><stop offset="1" stop-color="#ffe7a0"/></linearGradient>
<linearGradient id="MT${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity=".85"/><stop offset=".55" stop-color="${INK}" stop-opacity=".25"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>`;

/** Волокна паперу і (від рідкісної) пластівці сусального золота. */
function paper(R, w, h, rar, id) {
  let o = `<rect width="${w}" height="${h}" fill="${PAPER[rar]}"/>`;
  for (let i = 0; i < w * .5; i++) { const x = R() * w, y = R() * h, a = R() * 6.28, l = 2 + R() * 6; o += `<path d="M${f(x)} ${f(y)}l${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}" stroke="#8a7550" stroke-width=".18" opacity="${f(.2 + R() * .3)}"/>`; }
  const flecks = { common: 0, rare: 10, epic: 18, legendary: 26 }[rar] * (w / 100);
  for (let i = 0; i < flecks; i++) {
    const x = R() * w, y = R() * h * .6, s = 1 + R() * 2.6;
    o += `<path d="M${f(x)} ${f(y)}l${f(s)} ${f(-s * .4)}l${f(s * .5)} ${f(s)}l${f(-s * 1.2)} ${f(s * .5)}Z" fill="url(#GD${id})" opacity="${f(.55 + R() * .4)}"/>`;
  }
  // епічна і вище — смуга золотих хмар (кумо) згори
  if (atLeast(rar, 'epic')) {
    for (let i = 0; i < (rar === 'legendary' ? 4 : 3); i++) {
      const bh = h * (.03 + R() * .02), bw = w * (.3 + R() * .35), bx = R() * w - bw * .3, by = h * (.04 + i * .14 + R() * .05);
      o += `<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="${f(bh / 2)}" fill="url(#GD${id})" opacity=".5"/><rect x="${f(bx + bw * .25)}" y="${f(by + bh * .9)}" width="${f(bw * .5)}" height="${f(bh * .8)}" rx="${f(bh * .4)}" fill="url(#GD${id})" opacity=".42"/>`;
    }
  }
  return o;
}

/**
 * Гори тушшю: кілька планів, ближчі — темніші; гострі вершини, підніжжя тоне в тумані.
 * Повертає { body, ridge }: гребінь пензлем — окремим шаром (на легендарній він «промальовується» через transform).
 */
function mountains(R, w, base, s, rar, id) {
  let o = '';
  let line = '';
  for (let k = 0; k < 3; k++) {
    const y = base - (2 - k) * 9 * s, op = [.3, .5, .85][k];
    let ridge = `M-6 ${f(y)}`, x = -6;
    while (x < w + 6) {
      const pw = (16 + R() * 22) * s, ph = (10 + R() * 22) * s * (k === 0 ? 1.3 : 1), vy = y - R() * 4 * s;
      ridge += ` Q${f(x + pw * .32)} ${f(y - ph * .55)} ${f(x + pw * .5)} ${f(y - ph)} Q${f(x + pw * .62)} ${f(y - ph * .5)} ${f(x + pw)} ${f(vy)}`;
      x += pw;
    }
    const d = `${ridge} L${f(x)} ${f(y + 34 * s)} L-6 ${f(y + 34 * s)}Z`;
    o += `<path d="${d}" fill="url(#MT${id})" opacity="${op}" ${k < 2 ? `filter="url(#MI${id})"` : ''}/>`;
    if (k === 2) line = `<path d="${ridge}" fill="none" stroke="${INK}" stroke-width="${f(.8 * s)}" stroke-linecap="round" opacity=".8" filter="url(#BR${id})"/>`;
  }
  return { body: o, ridge: line };
}
/** Шар гребеня: статичний пензель; на живій легендарній — «промальовування» зліва направо. */
const ridgeLayer = (vb, id, m, d, live) => ({ d, svg: svg(vb, `${defs(id)}${m.ridge}`), wipe: live, cls: live ? 'smwipe' : '' });

/** Гілка сосни/сакури тушшю з переднього плану. */
function branch(R, x, y, s, rar, live) {
  let o = `<path class="${live ? 'smflow' : ''}" pathLength="100" d="M${f(x)} ${f(y)} q${f(14 * s)} ${f(-4 * s)} ${f(26 * s)} ${f(-14 * s)} t${f(22 * s)} ${f(-6 * s)}" stroke="${INK}" stroke-width="${f(1.8 * s)}" fill="none" stroke-linecap="round"/>`;
  o += `<path d="M${f(x + 16 * s)} ${f(y - 6 * s)} q${f(4 * s)} ${f(-8 * s)} ${f(12 * s)} ${f(-10 * s)}" stroke="${INK}" stroke-width="${f(1 * s)}" fill="none" stroke-linecap="round"/>`;
  if (atLeast(rar, 'rare')) {
    const pink = rar === 'legendary' ? '#f7b6c8' : '#f2c4cf';
    for (let i = 0; i < { rare: 4, epic: 7, legendary: 10 }[rar]; i++) {
      const px = x + (8 + R() * 40) * s, py = y - (4 + R() * 18) * s, r = (1.4 + R() * 1.2) * s;
      o += `<g transform="translate(${f(px)} ${f(py)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="${f(r * .55)}" ry="${f(r)}" transform="rotate(${a}) translate(0 ${f(-r * .8)})" fill="${pink}"/>`).join('')}<circle r="${f(r * .35)}" fill="${VERMILION}"/></g>`;
    }
  }
  return o;
}

/** Печатка-ханко: червоний квадрат з білим написом. */
const hanko = (x, y, s, txt = 'ВБ', rot = -4) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})"><rect x="${f(-6 * s)}" y="${f(-6 * s)}" width="${f(12 * s)}" height="${f(12 * s)}" rx="${f(1.2 * s)}" fill="${VERMILION}" opacity=".92"/><rect x="${f(-4.8 * s)}" y="${f(-4.8 * s)}" width="${f(9.6 * s)}" height="${f(9.6 * s)}" fill="none" stroke="#f6e7d2" stroke-width="${f(.5 * s)}"/><text y="${f(2.6 * s)}" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" font-weight="900" font-size="${f(7 * s)}" fill="#f6e7d2">${txt}</text></g>`;

function bigValue(v, rar, id) {
  const fill = { common: '#3a352d', rare: INK, epic: INK, legendary: `url(#GD${id})` }[rar];
  const stroke = rar === 'legendary' ? `stroke="${INK}" stroke-width="1.1" paint-order="stroke"` : rar === 'epic' ? `stroke="url(#GD${id})" stroke-width=".7" paint-order="stroke"` : '';
  return `<text class="${rar === 'legendary' ? 'smbig' : ''}" x="50" y="70" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" font-style="italic" font-weight="900" font-size="50" fill="${fill}" ${stroke} filter="url(#BR${id})">${v}</text>`;
}

function face(card, rar, opts = {}) {
  const id = uid('sm');
  const R = rng(`samurai-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const sunR = { common: 10, rare: 11, epic: 12, legendary: 13 }[rar];
  const bg = svg('0 0 100 140', `${defs(id)}${paper(R, 100, 140, rar, id)}<circle cx="70" cy="44" r="${sunR}" fill="${rar === 'legendary' ? `url(#GD${id})` : VERMILION}" opacity="${rar === 'common' ? .55 : .9}"/>`);
  const m = mountains(R, 100, 112, 1, rar, id);
  const hills = svg('0 0 100 140', `${defs(id)}${m.body}`);
  const mist = svg('0 0 100 140', `${defs(id)}<g filter="url(#MI${id})"><ellipse cx="26" cy="104" rx="44" ry="6" fill="${PAPER[rar]}" opacity=".85"/><ellipse cx="84" cy="114" rx="38" ry="5" fill="${PAPER[rar]}" opacity=".75"/><rect x="-5" y="122" width="110" height="20" fill="${PAPER[rar]}" opacity=".6"/></g>`);
  const front = svg('0 0 100 140', `${branch(R, -4, 132, 1, rar, live)}${atLeast(rar, 'rare') ? hanko(86, 104, .9) : ''}`);
  let center;
  if (card.kind === 'num') {
    const col = SUIT_COLOR[card.suit];
    center = bigValue(card.value, rar, id)
      + suitG(card.suit, 85, 124, 12, col);
  } else {
    const col = { knife: INK, mirror: '#8a5a1c', double: VERMILION }[card.kind];
    center = suitG(card.kind, 30, 16, 40, col, `filter="url(#BR${id})"`)
      + `<text x="50" y="72" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" font-weight="900" font-size="9.5" letter-spacing="1" fill="${INK}">${SPECIAL[card.kind]}</text>`;
  }
  const ink = svg('0 0 100 140', `${defs(id)}${center}`, 'xMidYMid meet');
  return { layers: [{ d: 0, svg: bg }, { d: 1, svg: hills }, ridgeLayer('0 0 100 140', id, m, 1, live), { d: 2, svg: mist, cls: live ? 'smmist' : '' }, { d: 3, svg: front }], ink, live: live ? petals : null, cls: 'sm' };
}

/** Легендарна: пелюстки сакури летять навскіс (CSS, кількість обмежена). */
const petals = particles('sp', 16, (R) => `left:${f(R() * 110 - 10)}%;top:-6%;--d:${f(6 + R() * 5)}s;--delay:-${f(R() * 10)}s;--dx:${f(30 + R() * 60)}px;--s:${f(.7 + R() * .6)}`);

// ── сорочка: сейґайха індиґо, коло енсо пензлем, печатка ──
function back(rar, opts = {}) {
  const id = uid('sb');
  const live = rar === 'legendary' && opts.live !== false;
  let waves = '';
  for (let y = 0; y < 150; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < 110; x += 12) waves += `<g transform="translate(${x} ${y})"><path d="M-6 0a6 6 0 0 1 12 0" fill="${PAPER[rar]}" stroke="#26487a" stroke-width=".5"/><path d="M-4 0a4 4 0 0 1 8 0M-2 0a2 2 0 0 1 4 0" fill="none" stroke="#26487a" stroke-width=".4"/></g>`;
  const field = svg('0 0 100 140', `${defs(id)}<rect width="100" height="140" fill="${PAPER[rar]}"/><g opacity="${rar === 'common' ? .45 : .7}">${waves}</g>`);
  const disc = svg('0 0 100 140', `<circle cx="50" cy="68" r="30" fill="${PAPER[rar]}"/>`);
  const enso = svg('0 0 100 140', `${defs(id)}<path d="M70 52 A24 24 0 1 0 74 74" fill="none" stroke="${rar === 'legendary' ? `url(#GD${id})` : INK}" stroke-width="5" stroke-linecap="round" filter="url(#BR${id})"/>`);
  const mark = svg('0 0 100 140', `${hanko(50, 70, 1.4, 'ВБ', 0)}<rect x="22" y="110" width="56" height="11" rx="5.5" fill="${PAPER[rar]}"/><text x="50" y="118" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" font-weight="900" font-size="7" letter-spacing="3" fill="${INK}">ВА·БАНК</text>`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: disc }, { d: 2, svg: enso, wipe: live, cls: live ? 'smwipe' : '' }, { d: 2, svg: mark }], ink: '', live: live ? petals : null, cls: 'sm' };
}

function felt(rar, opts = {}) {
  const id = uid('sf');
  const R = rng('samurai-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 320 180', `${defs(id)}${paper(R, 320, 180, rar, id)}<circle cx="236" cy="62" r="26" fill="${rar === 'legendary' ? `url(#GD${id})` : VERMILION}" opacity=".85"/>`);
  const m = mountains(R, 320, 150, 2, rar, id);
  const hills = svg('0 0 320 180', `${defs(id)}${m.body}`);
  const front = svg('0 0 320 180', `${branch(R, -6, 186, 2.2, rar, live)}${atLeast(rar, 'rare') ? hanko(296, 160, 1.4) : ''}`);
  return { layers: [{ d: 0, svg: bg }, { d: 2, svg: hills }, ridgeLayer('0 0 320 180', id, m, 2, live), { d: 2, svg: front }], ink: '', live: live ? petals : null, cls: 'sm' };
}

// ── фішка: чорний лак, червоний кант, герб-мон із квіткою сакури ──
function chip(rar) {
  const id = uid('sc');
  const rim = { common: '#8a2a22', rare: VERMILION, epic: '#d9483c', legendary: `url(#GD${id})` }[rar];
  const petal = (a) => `<path d="M0 -5C4 -9 5 -15 2.4 -19L0 -17 -2.4 -19C-5 -15 -4 -9 0 -5Z" transform="rotate(${a})" fill="${rar === 'legendary' ? `url(#GD${id})` : '#f2e6d0'}"/>`;
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `${defs(id)}<circle cx="50" cy="50" r="49" fill="#15110e"/><circle cx="50" cy="50" r="45" fill="none" stroke="${rim}" stroke-width="6"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="47.5" y="2.5" width="5" height="8" fill="#f2e6d0" transform="rotate(${a} 50 50)"/>`).join('')}<circle cx="50" cy="50" r="33" fill="none" stroke="#f2e6d0" stroke-width=".6" opacity=".5"/>`) },
      { d: 2, svg: svg('0 0 100 100', `${defs(id)}<g transform="translate(50 50)">${[0, 72, 144, 216, 288].map(petal).join('')}<circle r="4" fill="${VERMILION}"/></g>`) }],
    ink: '', live: null, cls: 'sm',
  };
}

/** Перемога: буря пелюсток і печатка «ВА-БАНК», що падає на стіл. */
function win(layer, rar, limit) {
  const R = rng(Date.now() % 7907);
  const n = Math.min(limit, { common: 14, rare: 22, epic: 30, legendary: 40 }[rar]);
  let html = '';
  for (let i = 0; i < n; i++) html += `<i class="smp" style="left:${f(R() * 100)}%;--dx:${f(80 + R() * 160)}px;--s:${f(.6 + R() * .9)};animation-delay:${f(R() * 1.2)}s;animation-duration:${f(2 + R() * 1.4)}s"></i>`;
  if (atLeast(rar, 'rare')) html += `<b class="smstamp">ВА-БАНК</b>`;
  if (atLeast(rar, 'epic')) html += '<i class="smsplash"></i>';
  winBox(layer, 'samurai', rar, html);
}

export default registerSet({
  id: 'samurai', name: 'Самурай', icon: '🗡️', accent: 'koto', accentName: 'кото',
  blurb: 'Туш суммі-е на рисовому папері, червона печатка-ханко, сусальне золото.',
  legendaryNote: 'Туш тече мазками пензля, падають пелюстки сакури, туман дрейфує.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
