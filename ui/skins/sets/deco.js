// Набір «Ар-деко казино»: 1920-ті, чорний мармур, золоті лінії, віяла-сонця, ступінчасті рамки.
// Легендарна: золоті лінії світяться, і по них біжить світло; віяло дихає сяйвом.
import { registerSet, rng, uid, atLeast, f } from '../core.js';
import { svg, SPECIAL, suitGroup, particles, winBox } from './kit.js';

const SUIT_COLOR = { water: '#7fd1c1', fire: '#f2b84b', stone: '#e8e4da' };
const LINE = (rar, id) => ({ common: '#8f8a7e', rare: `url(#CH${id})`, epic: `url(#GO${id})`, legendary: `url(#GO${id})` }[rar]);

// ── масті: віяло хвиль, сонце-віяло, огранений діамант; кинджал, восьмикутне дзеркало, шеврони ──
export const SUITS = {
  water: '<path d="M2 20a10 10 0 0 1 20 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 20a3 3 0 0 1 6 0Z" fill="currentColor"/><path d="M12 4v4M7 6l1.5 3M17 6l-1.5 3" stroke="currentColor" stroke-width="1.4"/>',
  fire: '<path d="M12 21 3 9h18Z" fill="currentColor" opacity=".25"/><path d="M12 21 4 6M12 21l-3-17M12 21V3M12 21l3-17M12 21l8-15" stroke="currentColor" stroke-width="1.6"/><path d="M8 21a4 4 0 0 1 8 0Z" fill="currentColor"/>',
  stone: '<path d="M6 3h12l4 6-10 13L2 9Z" fill="currentColor"/><path d="M2 9h20M8 3l-2 6 6 13 6-13-2-6M12 3v6" stroke="#000" stroke-opacity=".35" stroke-width="1" fill="none"/>',
  knife: '<path d="M12 1.5 14.2 5v10h-4.4V5Z" fill="currentColor"/><path d="M6.5 15h11v1.8h-11Z" fill="currentColor"/><path d="M11 16.8h2V21h-2Z" fill="currentColor"/><path d="M10 21.2h4l-2 2Z" fill="currentColor"/><path d="M12 5v9" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>',
  mirror: '<path d="M8.5 2h7l5 5v7l-5 5h-7l-5-5V7Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9.6 5h4.8l3.6 3.6v4.8L14.4 17H9.6L6 13.4V8.6Z" fill="currentColor" opacity=".4"/><path d="M12 19v3.5M8.5 22.5h7" stroke="currentColor" stroke-width="2"/>',
  double: '<path d="M3 4l7 8-7 8M11 4l7 8-7 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="miter"/><path d="M19 8v8" stroke="currentColor" stroke-width="2"/>',
};
const suitG = suitGroup(SUITS);

const defs = (id) => `<defs>
<linearGradient id="GO${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c6"/><stop offset=".4" stop-color="#e5b04a"/><stop offset=".6" stop-color="#9e6c14"/><stop offset="1" stop-color="#ffe39a"/></linearGradient>
<linearGradient id="CH${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#b9c4cf"/><stop offset=".55" stop-color="#5f6b78"/><stop offset="1" stop-color="#eef3f8"/></linearGradient>
<radialGradient id="MB${id}" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#23242a"/><stop offset="1" stop-color="#08080a"/></radialGradient>
<filter id="GW${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="VB${id}"><feGaussianBlur stdDeviation=".35"/></filter></defs>`;

/** Чорний мармур із прожилками (білі/сірі; від епічної — золоті). */
function marble(R, w, h, rar, id, tint = '') {
  let o = `<rect width="${w}" height="${h}" fill="url(#MB${id})"/>${tint}`;
  // довгі плавні жили навскіс через усе полотно + тонкі відгалуження
  const n = Math.max(3, Math.round(w / 30));
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * h * 1.2 - h * .1 + R() * 20, y1 = y0 + h * (.25 + R() * .3);
    const d = `M-5 ${f(y0)} C${f(w * .3)} ${f(y0 + (R() - .3) * h * .3)} ${f(w * .6)} ${f(y1 - (R() - .5) * h * .3)} ${f(w + 5)} ${f(y1)}`;
    const gold = atLeast(rar, 'epic') && i % 2 === 0;
    o += `<path d="${d}" fill="none" stroke="${gold ? '#d9a441' : '#e6e3dc'}" stroke-width="${f((.3 + R() * .5) * w / 100)}" opacity="${f(gold ? .3 : .1 + R() * .1)}" filter="url(#VB${id})"/>`;
    const bx = w * (.2 + R() * .6), by = y0 + (y1 - y0) * (bx / w);
    o += `<path d="M${f(bx)} ${f(by)} q${f(w * .08)} ${f(h * .03)} ${f(w * .16)} ${f(h * (R() - .5) * .2)}" fill="none" stroke="#e6e3dc" stroke-width="${f(.25 * w / 100)}" opacity=".08" filter="url(#VB${id})"/>`;
  }
  return o;
}

/** Віяло-сонце з точки (cx, cy): промені й дуги. */
function fan(cx, cy, r, rays, stroke, sw, cls = '') {
  let o = `<g class="${cls}">`;
  for (let i = 0; i <= rays; i++) { const a = Math.PI + (i / rays) * Math.PI; o += `<path d="M${f(cx)} ${f(cy)}L${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}" stroke="${stroke}" stroke-width="${sw}"/>`; }
  for (const k of [.35, .62, 1]) o += `<path d="M${f(cx - r * k)} ${f(cy)}A${f(r * k)} ${f(r * k)} 0 0 1 ${f(cx + r * k)} ${f(cy)}" fill="none" stroke="${stroke}" stroke-width="${f(sw * 1.4)}"/>`;
  return `${o}</g>`;
}

/** Ступінчаста рамка (зикурат у кутах). live — по ній біжить світло. */
function stepped(x, y, w, h, s, stroke, sw, live) {
  const d = `M${x + 3 * s} ${y}H${x + w - 3 * s}V${y + s}H${x + w - s}V${y + 3 * s}H${x + w}V${y + h - 3 * s}H${x + w - s}V${y + h - s}H${x + w - 3 * s}V${y + h}H${x + 3 * s}V${y + h - s}H${x + s}V${y + h - 3 * s}H${x}V${y + 3 * s}H${x + s}V${y + s}H${x + 3 * s}Z`;
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>${live ? `<path class="dkrun" pathLength="100" d="${d}" fill="none" stroke="#ffd66b" stroke-width="${f(sw * 4)}" stroke-linecap="round" opacity=".35"/><path class="dkrun" pathLength="100" d="${d}" fill="none" stroke="#fff6d6" stroke-width="${f(sw * 1.6)}" stroke-linecap="round"/>` : ''}`;
}

function bigValue(v, rar, id) {
  const fill = { common: '#e8e4da', rare: `url(#CH${id})`, epic: `url(#GO${id})`, legendary: `url(#GO${id})` }[rar];
  const outline = { common: '#6d685e', rare: '#c9d3dc', epic: '#e5b04a', legendary: '#ffe39a' }[rar];
  const t = (attrs) => `<text x="50" y="80" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="${String(v).length > 1 ? 42 : 50}" letter-spacing="1" ${attrs}>${v}</text>`;
  return t(`fill="none" stroke="${outline}" stroke-width="3.6" ${rar === 'legendary' ? `filter="url(#GW${id})" class="dkglow"` : ''}`) + t('fill="none" stroke="#0b0b0d" stroke-width="2"') + t(`fill="${fill}"`);
}

function face(card, rar, opts = {}) {
  const id = uid('dk');
  const R = rng(`deco-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const L = LINE(rar, id);
  const tint = rar === 'epic' ? `<rect width="100" height="140" fill="#0f3d31" opacity=".35"/>` : '';
  const bg = svg('0 0 100 140', `${defs(id)}${marble(R, 100, 140, rar, id, tint)}`);
  const sun = svg('0 0 100 140', `${defs(id)}<g opacity="${rar === 'common' ? .5 : .85}">${fan(50, 96, 44, rar === 'common' ? 12 : 18, L, .5, live ? 'dkfan' : '')}</g>`);
  const frame = svg('0 0 100 140', `${defs(id)}${stepped(8, 8, 84, 124, 3, L, .8, live)}${atLeast(rar, 'rare') ? stepped(11, 11, 78, 118, 2.4, L, .35, false) : ''}
<path d="M14 104H86M18 107H82" stroke="${L}" stroke-width=".5"/>${atLeast(rar, 'epic') ? `<path d="M50 112l4 4-4 4-4-4Z" fill="${rar === 'epic' ? '#1f8a6b' : `url(#GO${id})`}" stroke="${L}" stroke-width=".4"/>` : ''}`);
  let center;
  if (card.kind === 'num') {
    const col = SUIT_COLOR[card.suit];
    center = bigValue(card.value, rar, id)
      + suitG(card.suit, 83, 117, 12, col);
  } else {
    const col = { knife: '#e8e4da', mirror: '#7fd1c1', double: '#f2b84b' }[card.kind];
    center = suitG(card.kind, 32, 26, 36, col, rar === 'legendary' ? `filter="url(#GW${id})"` : '')
      + `<rect x="16" y="71" width="68" height="12" fill="#0b0b0d" stroke="${LINE(rar, id)}" stroke-width=".5"/><text x="50" y="80" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="9" letter-spacing="2.4" fill="#f3ead2">${SPECIAL[card.kind]}</text>`;
  }
  const ink = svg('0 0 100 140', `${defs(id)}${center}`, 'xMidYMid meet');
  return { layers: [{ d: 0, svg: bg }, { d: 1, svg: sun }, { d: 2, svg: frame }], ink, live: live ? glints : null, cls: 'dk' };
}

/** Легендарна: золоті іскорки-зірочки спалахують на лініях. */
const glints = particles('dkg', 10, (R) => `left:${f(8 + R() * 84)}%;top:${f(8 + R() * 84)}%;--d:${f(2.4 + R() * 2)}s;--delay:-${f(R() * 4)}s`);

// ── сорочка: симетричне віяло, вкладені арки, монограма у восьмикутнику ──
function back(rar, opts = {}) {
  const id = uid('db');
  const R = rng('deco-back');
  const live = rar === 'legendary' && opts.live !== false;
  const L = LINE(rar, id);
  let arches = '';
  for (let i = 0; i < 6; i++) arches += `<path d="M${18 + i * 4} 130V${78 - i * 0}A${32 - i * 4} ${32 - i * 4} 0 0 1 ${82 - i * 4} 78V130" fill="none" stroke="${L}" stroke-width="${i ? .4 : .8}"/>`;
  const field = svg('0 0 100 140', `${defs(id)}${marble(R, 100, 140, rar, id)}${fan(50, 140, 60, 24, L, .35, live ? 'dkfan' : '')}`);
  const mark = svg('0 0 100 140', `${defs(id)}${arches}${stepped(6, 6, 88, 128, 3, L, .8, live)}
<path d="M42 50h16l8 8v16l-8 8H42l-8-8V58Z" fill="#0b0b0d" stroke="${L}" stroke-width="1.2"/>
<text x="50" y="73" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="15" letter-spacing="1" fill="${rar === 'common' ? '#e8e4da' : `url(#GO${id})`}">ВБ</text>`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: mark }], ink: '', live: live ? glints : null, cls: 'dk' };
}

// ── сукно: темно-зелений мармур-оксамит із золотою деко-рамкою і віялами в кутах ──
function felt(rar, opts = {}) {
  const id = uid('df');
  const R = rng('deco-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const L = LINE(rar, id);
  const bg = svg('0 0 320 180', `${defs(id)}${marble(R, 320, 180, rar, id, '<rect width="320" height="180" fill="#0d3a2e" opacity=".55"/>')}`);
  const lines = svg('0 0 320 180', `${defs(id)}${stepped(10, 10, 300, 160, 6, L, 1.2, live)}${stepped(16, 16, 288, 148, 4, L, .5, false)}${fan(160, 170, 70, 22, L, .5, live ? 'dkfan' : '')}
${fan(16, 16, 30, 8, L, .5).replace('<g class="">', '<g transform="rotate(135 16 16)">')}${fan(304, 16, 30, 8, L, .5).replace('<g class="">', '<g transform="rotate(-135 304 16)">')}`);
  // напис — окремим шаром .felt-mark (у матчі ховається: під ним банк)
  const mark = svg('0 0 320 180', `${defs(id)}<text x="160" y="96" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="18" letter-spacing="8" fill="${rar === 'common' ? '#cfc9bb' : `url(#GO${id})`}" opacity=".85">ВА·БАНК</text>`);
  return { layers: [{ d: 0, svg: bg }, { d: 2, svg: lines }, { d: 2, svg: mark, cls: 'felt-mark' }], ink: '', live: live ? glints : null, cls: 'dk' };
}

// ── фішка: чорна емаль, золоті ступінчасті сегменти ──
function chip(rar) {
  const id = uid('dc');
  const L = LINE(rar, id);
  let seg = '';
  for (let i = 0; i < 8; i++) seg += `<path d="M46 3h8v5h3v5H43V8h3Z" fill="${rar === 'common' ? '#bdb7aa' : L}" transform="rotate(${i * 45} 50 50)"/>`;
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `${defs(id)}<circle cx="50" cy="50" r="49" fill="#0b0b0d"/><circle cx="50" cy="50" r="47" fill="none" stroke="${L}" stroke-width="1.6"/>${seg}<circle cx="50" cy="50" r="32" fill="none" stroke="${L}" stroke-width="1"/>`) },
      { d: 2, svg: svg('0 0 100 100', `${defs(id)}${fan(50, 62, 22, 10, L, .6)}<text x="50" y="74" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="10" letter-spacing="2" fill="${rar === 'common' ? '#e8e4da' : `url(#GO${id})`}">ВБ</text>`) }],
    ink: '', live: null, cls: 'dk',
  };
}

/** Перемога: прожектори розходяться віялом, падають золоті стрічки серпантину. */
function win(layer, rar, limit) {
  const R = rng(Date.now() % 7883);
  const n = Math.min(limit, { common: 14, rare: 22, epic: 30, legendary: 40 }[rar]);
  let html = `<i class="dkbeam" style="--r:-28deg"></i><i class="dkbeam" style="--r:28deg;animation-delay:.15s"></i>`;
  if (atLeast(rar, 'epic')) html += '<i class="dkbeam" style="--r:0deg;animation-delay:.3s"></i>';
  for (let i = 0; i < n; i++) html += `<i class="dkr" style="left:${f(R() * 100)}%;--c:${R() < .75 ? '#e5b04a' : '#f3ead2'};--rot:${f((R() - .5) * 80)}deg;animation-delay:${f(R() * 1)}s;animation-duration:${f(1.8 + R() * 1.4)}s"></i>`;
  winBox(layer, 'deco', rar, html);
}

export default registerSet({
  id: 'deco', name: 'Ар-деко казино', icon: '🎰', accent: 'jazz', accentName: 'джазове фортепіано',
  blurb: 'Двадцяті роки: чорний мармур, золоті лінії, віяла-сонця і ступінчасті рамки.',
  legendaryNote: 'Золоті лінії світяться, і по них біжить світло; віяло дихає сяйвом.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
