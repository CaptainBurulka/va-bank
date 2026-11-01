// Набір «Кіберпанк»: глітч, сканлайни, хроматична аберація, кислотні кольори.
// Легендарна: карта «збоїть» і перебудовується, цифровий дощ (Canvas 2D, обмежена кількість струменів).
import { registerSet, rng, uid, atLeast, f } from '../core.js';

const svg = (vb, inner, ar = 'xMidYMid slice') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="${ar}">${inner}</svg>`;
const NEON = { cyan: '#00f0ff', pink: '#ff2bd6', acid: '#c6ff00', yellow: '#ffe600', white: '#effcff' };
const SUIT_COLOR = { water: NEON.cyan, fire: NEON.pink, stone: NEON.acid };

// ── масті: неонова крапля, блискавка, мікросхема ──
export const SUITS = {
  water: '<path d="M12 2.5 6 12v4.5L9.5 21h5l3.5-4.5V12Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 13.5h7M13.5 16h7" stroke="currentColor" stroke-width="1.6" opacity=".7"/><path d="M10 17h4" stroke="currentColor" stroke-width="2"/>',
  fire: '<path d="M14 2 5 13.5h6L9.5 22 19 9.8h-6.2Z" fill="currentColor"/><path d="M3 18h4M17 5h4" stroke="currentColor" stroke-width="1.5" opacity=".6"/>',
  stone: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/><rect x="9.2" y="9.2" width="5.6" height="5.6" fill="#000" fill-opacity=".45"/><path d="M9 2.5v3M12 2.5v3M15 2.5v3M9 18.5v3M12 18.5v3M15 18.5v3M2.5 9h3M2.5 12h3M2.5 15h3M18.5 9h3M18.5 12h3M18.5 15h3" stroke="currentColor" stroke-width="1.6"/>',
  knife: '<path d="M20.5 2.5c-4.5 1.2-9.3 5.4-12.2 9.6l3.6 3.6c4.2-2.9 8.2-7.6 8.6-13.2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.4 15.1 3 19.5 4.5 21l4.4-4.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/>',
  mirror: '<path d="M6 3h12v14H6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 6l6 6M9 10l3 3" stroke="currentColor" stroke-width="1.4" opacity=".7"/><path d="M12 17v4M8 21h8" stroke="currentColor" stroke-width="2"/>',
  double: '<path d="M4 5h4l5 7-5 7H4l5-7ZM11 5h4l5 7-5 7h-4l5-7Z" fill="currentColor"/>',
};
const suitG = (kind, x, y, s, color, glow) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s / 24)})" style="color:${color}" ${glow ? `filter="url(#${glow})"` : ''}>${SUITS[kind]}</g>`;

// ── семисегментні цифри (процедурний SVG) ──
const SEG_ON = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function hseg(cx, cy, len, t) { const a = len / 2, b = t / 2; return `${f(cx - a)},${f(cy)} ${f(cx - a + b)},${f(cy - b)} ${f(cx + a - b)},${f(cy - b)} ${f(cx + a)},${f(cy)} ${f(cx + a - b)},${f(cy + b)} ${f(cx - a + b)},${f(cy + b)}`; }
function vseg(cx, cy, len, t) { const a = len / 2, b = t / 2; return `${f(cx)},${f(cy - a)} ${f(cx + b)},${f(cy - a + b)} ${f(cx + b)},${f(cy + a - b)} ${f(cx)},${f(cy + a)} ${f(cx - b)},${f(cy + a - b)} ${f(cx - b)},${f(cy - a + b)}`; }
/** Одна цифра 7-сег. ghost — непідсвічені сегменти ледь видно (як на РК-екрані). */
function digit7(d, x, y, w, h, t, fill, ghost) {
  const g = t * .35, on = SEG_ON[d];
  const segs = {
    a: hseg(x + w / 2, y, w - g * 2, t), g: hseg(x + w / 2, y + h / 2, w - g * 2, t), d: hseg(x + w / 2, y + h, w - g * 2, t),
    f: vseg(x, y + h / 4, h / 2 - g * 2, t), b: vseg(x + w, y + h / 4, h / 2 - g * 2, t), e: vseg(x, y + h * 3 / 4, h / 2 - g * 2, t), c: vseg(x + w, y + h * 3 / 4, h / 2 - g * 2, t),
  };
  let o = '';
  for (const [k, pts] of Object.entries(segs)) {
    if (on.includes(k)) o += `<polygon points="${pts}" fill="${fill}"/>`;
    else if (ghost) o += `<polygon points="${pts}" fill="${fill}" opacity="${ghost}"/>`;
  }
  return o;
}
/** Число 7-сег (1–2 цифри) з курсивом і, від рідкісної, хроматичною аберацією. */
function number7(n, cx, cy, h, rar, id, cls = '') {
  const ds = String(n).split('').map(Number);
  const w = h * .5, t = h * .13, gap = h * .2;
  const total = ds.length * w + (ds.length - 1) * gap;
  const draw = (fill, ghost) => ds.map((d, i) => digit7(d, cx - total / 2 + i * (w + gap), cy - h / 2, w, h, t, fill, ghost)).join('');
  const skew = `transform="skewX(-9) translate(${f(cy * .158)} 0)"`;
  if (rar === 'common') return `<g ${skew}>${draw('#d9f6ff', .07)}</g>`;
  const ab = { rare: .9, epic: 1.4, legendary: 1.8 }[rar];
  const main = rar === 'legendary' ? `url(#CG${id})` : NEON.white;
  return `<g class="${cls}" ${skew}><g style="mix-blend-mode:screen" transform="translate(${-ab} 0)">${draw(NEON.pink)}</g><g style="mix-blend-mode:screen" transform="translate(${ab} 0)">${draw(NEON.cyan)}</g><g ${atLeast(rar, 'epic') ? `filter="url(#GL${id})"` : ''}>${draw(main, rar === 'rare' ? .06 : 0)}</g></g>`;
}

// ── сцена: темрява з неоновими заграваннями, силует мегаполіса, перспективна сітка, HUD ──
function backdrop(R, rar, id, w = 100, h = 140) {
  const sat = rar === 'common' ? .55 : 1;
  return `<defs><radialGradient id="P${id}" cx=".15" cy=".2" r=".7"><stop offset="0" stop-color="${NEON.pink}" stop-opacity="${.35 * sat}"/><stop offset="1" stop-color="${NEON.pink}" stop-opacity="0"/></radialGradient>
<radialGradient id="C${id}" cx=".9" cy=".75" r=".7"><stop offset="0" stop-color="${NEON.cyan}" stop-opacity="${.3 * sat}"/><stop offset="1" stop-color="${NEON.cyan}" stop-opacity="0"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="#07070f"/><rect width="${w}" height="${h}" fill="url(#P${id})"/><rect width="${w}" height="${h}" fill="url(#C${id})"/>`;
}
function skyline(R, w, base, s, rar) {
  let o = '', x = -2;
  const edge = rar === 'common' ? '#2a4a57' : NEON.cyan;
  while (x < w) {
    const bw = (4 + R() * 8) * s, bh = (10 + R() * 34) * s;
    o += `<rect x="${f(x)}" y="${f(base - bh)}" width="${f(bw)}" height="${f(bh)}" fill="#0b0c1a"/><path d="M${f(x)} ${f(base - bh)}h${f(bw)}" stroke="${edge}" stroke-width="${f(.35 * s)}" opacity=".7"/>`;
    // вертикальні неонові смуги на хмарочосах
    if (R() < .35) o += `<rect x="${f(x + bw * .4)}" y="${f(base - bh + 2 * s)}" width="${f(.6 * s)}" height="${f(bh * .5)}" fill="${R() < .5 ? NEON.pink : NEON.cyan}" opacity="${rar === 'common' ? .3 : .8}"/>`;
    if (R() < .25) o += `<path d="M${f(x + bw / 2)} ${f(base - bh)}v${f(-5 * s)}" stroke="#0b0c1a" stroke-width="${f(.6 * s)}"/><circle cx="${f(x + bw / 2)}" cy="${f(base - bh - 5 * s)}" r="${f(.6 * s)}" fill="#ff3b3b"/>`;
    x += bw + R() * 1.2 * s;
  }
  return o;
}
function grid(w, h, horizon, rar, cls = '') {
  const col = rar === 'common' ? '#6a2a5e' : NEON.pink;
  let o = `<g class="${cls}" opacity="${rar === 'common' ? .55 : .85}">`;
  for (let k = 1; k <= 9; k++) { const y = horizon + (k * k) * (h - horizon) / 81; o += `<path d="M0 ${f(y)}H${w}" stroke="${col}" stroke-width="${f(.25 + k * .05)}"/>`; }
  for (let i = -8; i <= 8; i++) o += `<path d="M${f(w / 2)} ${f(horizon)}L${f(w / 2 + i * w * .16)} ${h}" stroke="${col}" stroke-width=".3"/>`;
  return `${o}</g><rect x="0" y="${f(horizon - .6)}" width="${w}" height="1.2" fill="${NEON.cyan}" opacity="${rar === 'common' ? .35 : .9}"/>`;
}
function hud(R, rar, w = 100, h = 140) {
  const c = rar === 'common' ? '#3f6b78' : NEON.cyan;
  let o = '';
  // кутові дужки
  for (const [x, y, sx, sy] of [[5, 5, 1, 1], [w - 5, 5, -1, 1], [5, h - 5, 1, -1], [w - 5, h - 5, -1, -1]]) o += `<path d="M${x} ${y + sy * 7}V${y}H${x + sx * 7}" stroke="${c}" stroke-width=".7" fill="none"/>`;
  // штрихкод на лівому краї
  let bx = 0;
  for (let y = 40; y < 96; y += 1.6) { if (R() < .55) o += `<rect x="3.2" y="${f(y)}" width="${f(1.2 + R() * 2.2)}" height="1" fill="${c}" opacity=".55"/>`; bx++; }
  // службові рядки
  const hex = () => Math.floor(R() * 65535).toString(16).toUpperCase().padStart(4, '0');
  o += `<text x="${w - 6}" y="12" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="3.1" fill="${c}" opacity=".85">0x${hex()} // VB.NET</text>`;
  o += `<text x="${w - 6}" y="16" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="2.6" fill="${NEON.pink}" opacity=".7">SYS:${hex()}</text>`;
  // глітч-блоки
  const n = { common: 2, rare: 4, epic: 6, legendary: 8 }[rar];
  for (let i = 0; i < n; i++) o += `<rect x="${f(R() * w)}" y="${f(20 + R() * 90)}" width="${f(4 + R() * 16)}" height="${f(.6 + R() * 1.6)}" fill="${[NEON.cyan, NEON.pink, NEON.acid][i % 3]}" opacity="${f(.25 + R() * .4)}"/>`;
  // попереджувальні смуги (рідкісна і вище)
  if (atLeast(rar, 'rare')) {
    o += `<clipPath id="WS${rar}"><rect x="${w - 30}" y="${h - 13}" width="18" height="4"/></clipPath><g clip-path="url(#WS${rar})"><rect x="${w - 30}" y="${h - 13}" width="18" height="4" fill="${NEON.yellow}"/>`;
    for (let i = 0; i < 8; i++) o += `<path d="M${w - 31 + i * 3} ${h - 9}l3 -4" stroke="#000" stroke-width="1.2"/>`;
    o += '</g>';
  }
  return o;
}
const glowDefs = (id) => `<defs><filter id="GL${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="CG${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c4"/><stop offset=".5" stop-color="#ffe600"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>`;

const SPECIAL = { knife: 'KNIFE', mirror: 'MIRROR', double: 'DOUBLE' };
const SPECIAL_UA = { knife: 'НІЖ', mirror: 'ДЗЕРКАЛО', double: 'ПОДВОЄННЯ' };

function face(card, rar, opts = {}) {
  const id = uid('cy');
  const R = rng(`cyber-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const bg = svg('0 0 100 140', backdrop(R, rar, id));
  const city = svg('0 0 100 140', skyline(R, 100, 96, 1, rar));
  const floor = svg('0 0 100 140', grid(100, 140, 96, rar, live ? 'cygrid' : ''));
  const ui = svg('0 0 100 140', hud(R, rar));
  let center;
  if (card.kind === 'num') {
    const col = SUIT_COLOR[card.suit];
    const glow = atLeast(rar, 'epic') ? `GL${id}` : '';
    center = number7(card.value, 50, 60, 40, rar, id, live ? 'cyglitch' : '')
      + suitG(card.suit, 82, 112, 13, col, glow);
  } else {
    const col = { knife: NEON.white, mirror: NEON.cyan, double: NEON.yellow }[card.kind];
    center = suitG(card.kind, 32, 22, 36, col, atLeast(rar, 'epic') ? `GL${id}` : '')
      + `<text x="50" y="74" text-anchor="middle" font-family="Unbounded, Arial Black, sans-serif" font-weight="800" font-size="7.2" letter-spacing=".5" fill="${col}">${SPECIAL_UA[card.kind]}</text>`
      + `<text x="50" y="80" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="3" fill="${NEON.pink}" opacity=".8">// ${SPECIAL[card.kind]}.EXE</text>`;
  }
  const ink = svg('0 0 100 140', `${glowDefs(id)}${center}`, 'xMidYMid meet');
  return { layers: [{ d: 0, svg: bg }, { d: 1, svg: city }, { d: 2, svg: floor }, { d: 3, svg: ui }], ink, live: live ? liveRain : null, cls: 'cy' };
}

/**
 * Легендарна: цифровий дощ (Canvas 2D). Струменів не більше n; цикл зупиняється, коли предмет
 * поза екраном або вимкнено рух (див. render.js → IntersectionObserver).
 */
function liveRain(el, n) {
  const c = document.createElement('canvas');
  c.className = 'cyrain';
  el.append(c);
  const ctx = c.getContext('2d');
  const cols = Math.max(6, Math.min(n, 18));
  let drops = [], raf = 0, last = 0, W = 0, H = 0;
  const chars = '01ABCDEF<>/\\#$%ВБ';
  const R = rng(91);
  const size = () => {
    const r = el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = c.width = Math.max(1, Math.round(r.width * dpr)); H = c.height = Math.max(1, Math.round(r.height * dpr));
    drops = Array.from({ length: cols }, (_, i) => ({ x: ((i + .5) / cols) * W, y: R() * H, v: (.6 + R() * 1.2) * (H / 140), t: 0 }));
  };
  const frame = (ts) => {
    raf = requestAnimationFrame(frame);
    if (el.closest('.sk-paused') || !el.closest('.sk-full, .skwin')) return; // дощ лише в активного / в огляді
    if (ts - last < 50) return; // ~20 к/с досить для «дощу» і береже батарею
    last = ts;
    if (!W) size();
    ctx.fillStyle = 'rgba(4,4,12,.22)';
    ctx.fillRect(0, 0, W, H);
    const fs = Math.max(8, H / 26);
    ctx.font = `${fs}px ui-monospace, Menlo, monospace`;
    for (const d of drops) {
      ctx.fillStyle = R() < .1 ? '#effcff' : R() < .5 ? '#00f0ff' : '#c6ff00';
      ctx.fillText(chars[Math.floor(R() * chars.length)], d.x - fs / 3, d.y);
      d.y += d.v * fs * .6;
      if (d.y > H + fs) { d.y = -fs * (1 + R() * 6); d.v = (.6 + R() * 1.2) * (H / 140); }
    }
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// ── сорочка: друкована плата, глітч-логотип ВБ з RGB-розшаруванням ──
function circuit(R, w, h, col, n) {
  let o = '';
  for (let i = 0; i < n; i++) {
    let x = Math.round(R() * w / 4) * 4, y = Math.round(R() * h / 4) * 4;
    let d = `M${x} ${y}`;
    for (let k = 0; k < 4; k++) {
      if (R() < .5) x += (R() < .5 ? -1 : 1) * 4 * (1 + Math.floor(R() * 4)); else y += (R() < .5 ? -1 : 1) * 4 * (1 + Math.floor(R() * 4));
      d += ` L${x} ${y}`;
    }
    o += `<path d="${d}" stroke="${col}" stroke-width=".5" fill="none" opacity=".45"/><circle cx="${x}" cy="${y}" r="1" fill="none" stroke="${col}" stroke-width=".5" opacity=".7"/>`;
  }
  return o;
}
function back(rar, opts = {}) {
  const id = uid('cb');
  const R = rng('cyber-back');
  const field = svg('0 0 100 140', `${backdrop(R, rar, id)}${circuit(R, 100, 140, rar === 'common' ? '#2d6b78' : NEON.cyan, 26)}`);
  const ab = rar === 'common' ? 0 : { rare: 1, epic: 1.6, legendary: 2.2 }[rar];
  const logo = (fill, dx) => `<text x="${50 + dx}" y="80" text-anchor="middle" font-family="Unbounded, Arial Black, sans-serif" font-weight="800" font-size="30" fill="${fill}" ${dx ? 'style="mix-blend-mode:screen"' : ''}>ВБ</text>`;
  const mark = svg('0 0 100 140', `${glowDefs(id)}${hud(R, rar)}<rect x="22" y="48" width="56" height="44" fill="#07070f" stroke="${rar === 'common' ? '#2d6b78' : NEON.pink}" stroke-width=".8"/>
<g class="${rar === 'legendary' && opts.live !== false ? 'cyglitch' : ''}">${ab ? logo(NEON.pink, -ab) + logo(NEON.cyan, ab) : ''}${logo(rar === 'legendary' ? `url(#CG${id})` : NEON.white, 0)}</g>
<text x="50" y="100" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="3.6" letter-spacing="1" fill="${NEON.cyan}">VA-BANK // NET</text>`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: mark }], ink: '', live: rar === 'legendary' && opts.live !== false ? liveRain : null, cls: 'cy' };
}

// ── сукно: нічний мегаполіс, неонова сітка до горизонту ──
function felt(rar, opts = {}) {
  const id = uid('cf');
  const R = rng('cyber-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const sky = svg('0 0 320 180', `${backdrop(R, rar, id, 320, 180)}${skyline(R, 320, 92, 1.6, rar)}`);
  const floor = svg('0 0 320 180', grid(320, 180, 92, rar, live ? 'cygrid' : ''));
  return { layers: [{ d: 0, svg: sky }, { d: 2, svg: floor }], ink: '', live: live ? liveRain : null, cls: 'cy' };
}

// ── фішка: шестикутник з неоновим кантом і платою ──
function chip(rar) {
  const id = uid('cc');
  const R = rng('cyber-chip');
  const edge = { common: '#2d6b78', rare: '#4aa8ff', epic: '#b56cff', legendary: '#ffc23d' }[rar];
  const hex = (r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${f(50 + r * Math.cos(a))},${f(50 + r * Math.sin(a))}`; }).join(' ');
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `<rect width="100" height="100" fill="#07070f"/><polygon points="${hex(48)}" fill="#0d0e1e" stroke="${edge}" stroke-width="4"/><polygon points="${hex(41)}" fill="none" stroke="${NEON.cyan}" stroke-width="1.2" stroke-dasharray="4 3"/>${circuit(R, 100, 100, NEON.pink, 8)}`) },
      { d: 2, svg: svg('0 0 100 100', `${glowDefs(id)}<polygon points="${hex(22)}" fill="#07070f" stroke="${NEON.pink}" stroke-width="1.4"/><text x="50" y="56" text-anchor="middle" font-family="Unbounded, Arial Black, sans-serif" font-weight="800" font-size="15" fill="${NEON.white}" ${atLeast(rar, 'epic') ? `filter="url(#GL${id})"` : ''}>VB</text>`) }],
    ink: '', live: null, cls: 'cy',
  };
}

/** Перемога: глітч-вибух неонових пікселів, смуги збою; на легендарній — короткий цифровий дощ на весь екран. */
function win(layer, rar, limit) {
  const box = document.createElement('div');
  box.className = `skwin cyber r-${rar}`;
  const n = Math.min(limit, { common: 14, rare: 22, epic: 30, legendary: 40 }[rar]);
  const R = rng(Date.now() % 7919);
  let html = '';
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = 60 + R() * 120;
    html += `<i class="px" style="--tx:${f(Math.cos(a) * d)}px;--ty:${f(Math.sin(a) * d)}px;--c:${[NEON.cyan, NEON.pink, NEON.acid, NEON.yellow][i % 4]};animation-delay:${f(R() * .25)}s"></i>`;
  }
  for (let i = 0; i < { common: 2, rare: 3, epic: 5, legendary: 7 }[rar]; i++) html += `<i class="bar" style="top:${f(R() * 100)}%;--c:${i % 2 ? NEON.cyan : NEON.pink};animation-delay:${f(R() * .6)}s"></i>`;
  box.innerHTML = html;
  if (rar === 'legendary') { const rain = document.createElement('div'); rain.className = 'rainwrap'; box.append(rain); setTimeout(() => liveRain(rain, 16), 0); }
  layer.append(box);
  setTimeout(() => box.remove(), 3200);
}

export default registerSet({
  id: 'cyber', name: 'Кіберпанк', icon: '🌆', accent: 'synth', accentName: 'синтвейв',
  blurb: 'Глітч, сканлайни, хроматична аберація, кислотний неон.',
  legendaryNote: 'Карта збоїть і перебудовується, по ній біжить цифровий дощ.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
