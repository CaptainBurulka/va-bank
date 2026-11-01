// Набір «Козацький»: вишивка хрестиком (геометрія ромбів), червоне й чорне на льоні, сталь шабель і шкіра.
// Легендарна: орнамент вишивається ниткою на очах (стовпчик за стовпчиком), з перехрестя шабель летять іскри.
import { registerSet, rng, uid, atLeast, f } from '../core.js';
import { svg, SPECIAL, stitchText, stitchMatrix, textCells, particles, winBox } from './kit.js';

// легендарна — чорна вишиванка: золото й червоне на чорному льоні
const LINEN = { common: '#e9dfcb', rare: '#efe4cd', epic: '#f1e5ca', legendary: '#1b1512' };
const TXT = (rar) => (rar === 'legendary' ? '#f3e2b0' : '#1d1714');
const RED = '#b3201c', BLACK = '#1d1714';
const SUIT_COLOR = { water: '#23467a', fire: RED, stone: BLACK };

// ── масті й спецкарти як схеми вишивки 7×7 ──
const M = {
  water: ['...#...', '..###..', '.#####.', '###.###', '##.####', '.#####.', '..###..'],
  fire: ['...#...', '..##...', '..###.#', '.#####.', '##.####', '#######', '.#####.'],
  stone: ['...#...', '..#.#..', '.#.#.#.', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  knife: ['......#', '.....#.', '....#..', '...#...', '#.#....', '.#.....', '#.#....'],
  mirror: ['#######', '#.....#', '#.#...#', '#..#..#', '#.....#', '#######', '..###..'],
  double: ['#..#..', '.#..#.', '..#..#', '.#..#.', '#..#..'],
};
/** Масть: SVG 24×24 для інших частин гри (колекція, огляд). */
export const SUITS = Object.fromEntries(Object.entries(M).map(([k, rows]) => [k, stitchMatrix(rows, 12 - rows[0].length * 1.65, 12 - rows.length * 1.65, 3.3, { '#': 'currentColor' }, { width: .42 })]));
const suitS = (kind, x, y, s, color) => { const rows = M[kind]; const px = s / 7; return stitchMatrix(rows, x + (7 - rows[0].length) * px / 2, y + (7 - rows.length) * px / 2, px, { '#': color }, { width: .44 }); };

// ── орнамент: ромби з серцевиною, період 8 ──
const MOTIF = ['...b....', '..b.b...', '.b.r.b..', 'b.rrr.br', '.b.r.b..', '..b.b...', '...b....'];
function band(len, rar) {
  const core = rar === 'legendary' ? 'g' : 'r';
  const rows = MOTIF.map((r) => r.replace(/r/g, core).repeat(Math.ceil(len / 8)).slice(0, len));
  const edge = Array.from({ length: len }, (_, i) => (i % 2 ? '.' : core)).join('');
  return [edge, '', ...rows, '', edge];
}

const defs = (id, rar) => `<defs>
<pattern id="LN${id}" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height="1.6" fill="${LINEN[rar]}"/><path d="M0 .4h1.6M.4 0v1.6" stroke="${rar === 'legendary' ? '#5a4632' : '#b8a682'}" stroke-width=".22" opacity=".55"/></pattern>
<linearGradient id="GT${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#d79b22"/><stop offset="1" stop-color="#ffe28a"/></linearGradient>
<linearGradient id="ST${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d6670"/><stop offset=".45" stop-color="#f2f6fa"/><stop offset=".55" stop-color="#9aa6b2"/><stop offset="1" stop-color="#e4eaf0"/></linearGradient>
<linearGradient id="LT${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4a26"/><stop offset="1" stop-color="#4a2a14"/></linearGradient></defs>`;
const pal = (id, rar) => ({ b: rar === 'legendary' ? '#d8352c' : BLACK, r: RED, g: `url(#GT${id})` });

/** Дві схрещені шаблі (сталь, шкіряні руків'я). */
function sabres(cx, cy, s, id) {
  const one = (flip) => `<g transform="translate(${f(cx)} ${f(cy)}) scale(${flip ? -s : s} ${s})"><path d="M-17 11 C-8 3 4 -6 17 -13 C8 -4 -2 4 -14 13Z" fill="url(#ST${id})" stroke="#3b4148" stroke-width=".3"/><path d="M-18.5 9.6l4 4.6" stroke="#c9a24a" stroke-width="1.4" stroke-linecap="round"/><path d="M-17.2 12.5l-3.6 3.2" stroke="url(#LT${id})" stroke-width="2.2" stroke-linecap="round"/></g>`;
  return one(false) + one(true);
}

function bigValue(v, rar, id) {
  const str = String(v);
  const px = str.length > 1 ? 4.4 : 5.4;
  const x = 50 - (textCells(str) * px) / 2, y = 58 - 3.5 * px;
  const col = { common: BLACK, rare: RED, epic: RED, legendary: `url(#GT${id})` }[rar];
  const shadow = atLeast(rar, 'epic') ? stitchText(str, x + px * .32, y + px * .32, px, rar === 'legendary' ? RED : BLACK, .4, 'opacity=".85"') : '';
  return shadow + stitchText(str, x, y, px, col, .42);
}

function face(card, rar, opts = {}) {
  const id = uid('ck');
  const R = rng(`cossack-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const P = pal(id, rar);
  const bg = svg('0 0 100 140', `${defs(id, rar)}<rect width="100" height="140" fill="url(#LN${id})"/>${atLeast(rar, 'epic') ? `<rect x="0" y="0" width="100" height="140" fill="none" stroke="${RED}" stroke-width="1" stroke-dasharray="1.2 1.2" opacity=".5" transform="translate(7 7) scale(.86 .9)"/>` : ''}`);
  const orn = svg('0 0 100 140', `${defs(id, rar)}${stitchMatrix(band(46, rar), 4, 92, 2, P, { cls: live ? 'kst' : '', chunk: 4, period: 5 })}`);
  const steel = atLeast(rar, 'rare') ? svg('0 0 100 140', `${defs(id, rar)}${sabres(50, 118, .95, id)}`) : '';
  let center;
  if (card.kind === 'num') {
    const col = rar === 'legendary' ? { water: '#6fa8ff', fire: '#ff5a48', stone: '#f3e2b0' }[card.suit] : SUIT_COLOR[card.suit];
    center = bigValue(card.value, rar, id)
      + suitS(card.suit, 83, 121, 11, col);
  } else {
    const col = { knife: rar === 'legendary' ? '#c9d2dc' : '#4b5560', mirror: rar === 'legendary' ? '#6fa8ff' : '#23467a', double: RED }[card.kind];
    center = suitS(card.kind, 33, 22, 34, col)
      + `<text x="50" y="74" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="9" letter-spacing="1.5" fill="${TXT(rar)}">${SPECIAL[card.kind]}</text>`;
  }
  const ink = svg('0 0 100 140', `${defs(id, rar)}${center}`, 'xMidYMid meet');
  const layers = [{ d: 0, svg: bg }, { d: 1, svg: orn }];
  if (steel) layers.push({ d: 3, svg: steel });
  return { layers, ink, live: live ? sparks : null, cls: 'ck' };
}

/** Легендарна: іскри з перехрестя шабель (CSS, кількість обмежена). */
const sparks = particles('ksp', 14, (R) => `left:50%;top:84%;--tx:${f((R() - .5) * 120)}px;--ty:${f(-30 - R() * 90)}px;--d:${f(1.4 + R() * 1.4)}s;--delay:-${f(R() * 3)}s`);

// ── сорочка: суцільне поле ромбів, медальйон зі схрещеними шаблями ──
function back(rar, opts = {}) {
  const id = uid('cb');
  const live = rar === 'legendary' && opts.live !== false;
  const P = pal(id, rar);
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push(...MOTIF.map((r) => (i % 2 ? r.slice(4) + r.slice(0, 4) : r).replace(/r/g, rar === 'legendary' ? 'g' : 'r').repeat(7)), '........'.repeat(7));
  const field = svg('0 0 100 140', `${defs(id, rar)}<rect width="100" height="140" fill="url(#LN${id})"/><g opacity="${rar === 'common' ? .55 : .8}">${stitchMatrix(rows, 0, 0, 1.8, P, { width: .4 })}</g>`);
  const med = svg('0 0 100 140', `${defs(id, rar)}<rect x="22" y="40" width="56" height="60" rx="3" fill="${LINEN[rar]}" stroke="${RED}" stroke-width="1"/><rect x="25" y="43" width="50" height="54" rx="2" fill="none" stroke="${TXT(rar)}" stroke-width=".5" stroke-dasharray="1 1"/>
${atLeast(rar, 'rare') ? sabres(50, 58, .75, id) : ''}${stitchText('ВБ', 50 - textCells('ВБ') * 1.6, 70, 3.2, rar === 'legendary' ? `url(#GT${id})` : RED, .44)}`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: med }], ink: '', live: live && atLeast(rar, 'rare') ? sparksBack : null, cls: 'ck' };
}
const sparksBack = particles('ksp', 10, (R) => `left:50%;top:46%;--tx:${f((R() - .5) * 110)}px;--ty:${f(-20 - R() * 70)}px;--d:${f(1.4 + R() * 1.4)}s;--delay:-${f(R() * 3)}s`);

// ── сукно: рушник — льон із широкими вишитими кінцями ──
function felt(rar, opts = {}) {
  const id = uid('cf');
  const live = rar === 'legendary' && opts.live !== false;
  const P = pal(id, rar);
  const b = band(160, rar);
  const base = svg('0 0 320 180', `${defs(id, rar)}<rect width="320" height="180" fill="url(#LN${id})"/>${stitchMatrix(b, 0, 8, 2, P, { cls: live ? 'kst' : '', chunk: 8, period: 6 })}${stitchMatrix(b, 0, 148, 2, P, { cls: live ? 'kst' : '', chunk: 8, period: 6 })}`);
  const mid = svg('0 0 320 180', `${defs(id, rar)}${atLeast(rar, 'rare') ? sabres(160, 72, 1.7, id) : ''}${stitchText('ВА-БАНК', 160 - textCells('ВА-БАНК') * 1.6, 106, 3.2, rar === 'legendary' ? `url(#GT${id})` : RED, .44)}`);
  return { layers: [{ d: 0, svg: base }, { d: 2, svg: mid }], ink: '', live: live ? sparksFelt : null, cls: 'ck' };
}
const sparksFelt = particles('ksp', 14, (R) => `left:50%;top:50%;--tx:${f((R() - .5) * 220)}px;--ty:${f(-30 - R() * 90)}px;--d:${f(1.4 + R() * 1.4)}s;--delay:-${f(R() * 3)}s`);

// ── фішка: шкіра зі сталевим обідком і вишитим ромбом ──
function chip(rar) {
  const id = uid('cc');
  const rim = { common: '#7d858e', rare: `url(#ST${id})`, epic: `url(#ST${id})`, legendary: `url(#GT${id})` }[rar];
  let rivets = '';
  for (let i = 0; i < 12; i++) rivets += `<circle cx="${f(50 + 42 * Math.cos(i * Math.PI / 6))}" cy="${f(50 + 42 * Math.sin(i * Math.PI / 6))}" r="1.8" fill="#dfe5ea" stroke="#4b5158" stroke-width=".5"/>`;
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `${defs(id, rar)}<circle cx="50" cy="50" r="49" fill="${rim}"/><circle cx="50" cy="50" r="45" fill="url(#LT${id})"/><circle cx="50" cy="50" r="38" fill="none" stroke="#e9dfcb" stroke-width=".8" stroke-dasharray="2 1.6"/>${rivets}`) },
      { d: 2, svg: svg('0 0 100 100', `${defs(id, rar)}<circle cx="50" cy="50" r="26" fill="url(#LN${id})"/>${stitchMatrix(MOTIF.map((r) => r.slice(0, 7)), 50 - 7 * 2.4, 50 - 7 * 2.4, 4.8, pal(id, rar), { width: .42 })}`) }],
    ink: '', live: null, cls: 'ck',
  };
}

/** Перемога: рушник розгортається через стіл, з-під шабель — сніп іскор. */
function win(layer, rar, limit) {
  const R = rng(Date.now() % 7901);
  const n = Math.min(limit, { common: 12, rare: 20, epic: 28, legendary: 40 }[rar]);
  let html = '<b class="krush"></b>';
  for (let i = 0; i < n; i++) html += `<i class="kspw" style="--tx:${f((R() - .5) * 360)}px;--ty:${f(-60 - R() * 220)}px;animation-delay:${f(.2 + R() * .5)}s"></i>`;
  winBox(layer, 'cossack', rar, html);
}

export default registerSet({
  id: 'cossack', name: 'Козацький', icon: '⚔️', accent: 'bandura', accentName: 'бандура',
  blurb: 'Вишивка хрестиком: ромби червоним і чорним на льоні, сталь шабель і шкіра.',
  legendaryNote: 'Орнамент вишивається ниткою на очах, з перехрестя шабель летять іскри.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
