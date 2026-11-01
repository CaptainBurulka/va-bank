// Набір «Нічний Київ»: нічне місто, силуети пагорбів і куполів, вогні вікон, неонові вивіски, каштани.
// Легендарна: місто «вмикає» вогні хвилею, по мосту їдуть автівки, вивіска мерехтить, золотий пил.
import { registerSet, rng, uid, atLeast, f } from '../core.js';

const SKY = { common: ['#1c2547', '#2a2f57', '#3b3560'], rare: ['#0f1a3d', '#1f2a5c', '#45356b'], epic: ['#0b1233', '#1d2058', '#58306f'], legendary: ['#070d29', '#1a1650', '#6b2f6a'] };
const SUIT_COLOR = { water: '#4aa3ff', fire: '#ffb547', stone: '#b9743f' };
const svg = (vb, inner, ar = 'xMidYMid slice') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="${ar}">${inner}</svg>`;

// ── масті набору: хвиля Дніпра, ліхтар, каштан ──
export const SUITS = {
  water: '<path d="M2 10.5c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 4.4-2.4 6.8 0v3.2c-2.4-2.4-4.6-2.4-6.8 0s-4.4 2.4-6.6 0-4.4-2.4-6.6 0Z" fill="currentColor"/><path d="M2 16.5c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 4.4-2.4 6.8 0V20H2Z" fill="currentColor" opacity=".6"/><circle cx="18" cy="5" r="2" fill="currentColor" opacity=".7"/>',
  fire: '<path d="M11 21h2V11h-2Z" fill="currentColor"/><path d="M8.5 21h7v-1.6h-7Z" fill="currentColor"/><path d="M9 4.5h6l1.2 5.5H7.8Z" fill="currentColor"/><path d="M10.5 6h3l.6 3h-4.2Z" fill="#fff" fill-opacity=".75"/><path d="M10 2.5h4v2h-4Z" fill="currentColor"/>',
  stone: '<path d="M12 3.5c4.8 0 8 3.6 8 8.4 0 4.8-3.4 8.6-8 8.6s-8-3.8-8-8.6C4 7.1 7.2 3.5 12 3.5Z" fill="currentColor"/><path d="M6.3 15.5c1.5 2.2 3.5 3.3 5.7 3.3s4.2-1.1 5.7-3.3c-1.6.8-3.6 1.2-5.7 1.2s-4.1-.4-5.7-1.2Z" fill="#fff" fill-opacity=".45"/><path d="M9 7.5c.8-1.3 2-2 3.4-2" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  knife: '<path d="M20.5 2.5c-4.5 1.2-9.3 5.4-12.2 9.6l3.6 3.6c4.2-2.9 8.2-7.6 8.6-13.2Z" fill="currentColor"/><path d="M7.4 15.1 3 19.5 4.5 21l4.4-4.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  mirror: '<ellipse cx="12" cy="9.5" rx="6.3" ry="7.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M9.2 7.4 12.3 4.3M9.2 10.7l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/><path d="M12 17v4.5M8.5 21.5h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  double: '<path d="M5 5l6 7-6 7M12 5l6 7-6 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
};
const suitG = (kind, x, y, s, color) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s / 24)})" style="color:${color}">${SUITS[kind]}</g>`;

// ── сцена: небо, пагорби з куполами, квартали з вікнами, міст, Дніпро ──
function stars(R, n, w, h, cls = '') {
  let o = '';
  for (let i = 0; i < n; i++) o += `<circle class="${cls}" style="animation-delay:${f(R() * 4)}s" cx="${f(R() * w)}" cy="${f(R() * h)}" r="${f(.25 + R() * .55)}" fill="#fff" opacity="${f(.35 + R() * .6)}"/>`;
  return o;
}

/** Силует правого берега: Лавра (дзвіниця + куполи), Батьківщина-мати — абстрактно, пагорби. */
function hills(w, y, s, fill, dome = fill) {
  // пагорб
  let o = `<path d="M0 ${y + 6 * s} C${w * .18} ${y - 2 * s} ${w * .32} ${y + 1 * s} ${w * .48} ${y + 3 * s} S${w * .78} ${y - 4 * s} ${w} ${y + 2 * s} V${y + 60 * s} H0Z" fill="${fill}"/>`;
  // дзвіниця
  const bx = w * .3;
  o += `<rect x="${f(bx - 2.2 * s)}" y="${f(y - 14 * s)}" width="${f(4.4 * s)}" height="${f(16 * s)}" fill="${fill}"/><rect x="${f(bx - 1.5 * s)}" y="${f(y - 19 * s)}" width="${f(3 * s)}" height="${f(6 * s)}" fill="${fill}"/>`;
  o += `<ellipse cx="${f(bx)}" cy="${f(y - 19.5 * s)}" rx="${f(1.7 * s)}" ry="${f(2.4 * s)}" fill="${fill}"/><path d="M${f(bx)} ${f(y - 25 * s)}v${f(4 * s)}M${f(bx - 1 * s)} ${f(y - 23.6 * s)}h${f(2 * s)}" stroke="${fill}" stroke-width="${f(.5 * s)}"/>`;
  // куполи собору
  for (const [dx, r] of [[-9, 2.6], [-5, 3.4], [-1.2, 2.4]]) {
    const cx = w * .5 + dx * s;
    o += `<rect x="${f(cx - r * .8 * s)}" y="${f(y - 4 * s)}" width="${f(r * 1.6 * s)}" height="${f(6 * s)}" fill="${fill}"/>`;
    o += `<path d="M${f(cx - r * s)} ${f(y - 4 * s)} C${f(cx - r * s)} ${f(y - (6 + r) * s)} ${f(cx)} ${f(y - (7 + r) * s)} ${f(cx)} ${f(y - (8.5 + r) * s)} C${f(cx)} ${f(y - (7 + r) * s)} ${f(cx + r * s)} ${f(y - (6 + r) * s)} ${f(cx + r * s)} ${f(y - 4 * s)}Z" fill="${dome}"/>`;
    o += `<path d="M${f(cx)} ${f(y - (12 + r) * s)}v${f(3.5 * s)}M${f(cx - .9 * s)} ${f(y - (11 + r) * s)}h${f(1.8 * s)}" stroke="${dome === fill ? fill : '#ffe39a'}" stroke-width="${f(.45 * s)}"/>`;
  }
  // дзвіниця з позолоченою банею
  o += `<path d="M${f(bx - 1.3 * s)} ${f(y - 18.6 * s)} C${f(bx - 1.3 * s)} ${f(y - 20.6 * s)} ${f(bx)} ${f(y - 21 * s)} ${f(bx)} ${f(y - 22.2 * s)} C${f(bx)} ${f(y - 21 * s)} ${f(bx + 1.3 * s)} ${f(y - 20.6 * s)} ${f(bx + 1.3 * s)} ${f(y - 18.6 * s)}Z" fill="${dome}"/>`;
  return o;
}

/** Квартали з вікнами. lit — частка запалених вікон; live — вікна «вмикаються» анімацією. */
function blocks(R, w, y, s, fill, lit, live, out = null) {
  let o = '', x = 0, n = 0;
  while (x < w) {
    const bw = (5 + R() * 7) * s, bh = (6 + R() * 13) * s;
    o += `<rect x="${f(x)}" y="${f(y - bh)}" width="${f(bw)}" height="${f(bh + 30 * s)}" fill="${fill}"/>`;
    for (let wy = y - bh + 1.6 * s; wy < y - 1 * s; wy += 2.6 * s) {
      for (let wx = x + 1.2 * s; wx < x + bw - 1.4 * s; wx += 2.2 * s) {
        if (R() > lit) continue;
        const warm = R() < .8;
        if (live) R(); // (раніше — затримка анімації кожного вікна; лишаємо виклик, щоб малюнок не змінився)
        const win = `<rect x="${f(wx)}" y="${f(wy)}" width="${f(1.1 * s)}" height="${f(1.4 * s)}" fill="${warm ? '#ffd27a' : '#9fd0ff'}" opacity="${f(.55 + R() * .45)}"/>`;
        // живе місто: вікна — окремим шаром, який «вмикається» хвилею зліва направо (bitmap + transform)
        if (live && out) out.win += win; else o += win;
        n++;
      }
    }
    x += bw + R() * 1.5 * s;
  }
  return o;
}

/** Міст через Дніпро з ліхтарями; live — автівки (пари фар) їдуть мостом. */
function bridge(w, y, s, rar, live, id) {
  let o = `<path d="M${f(-2)} ${f(y)} Q${f(w / 2)} ${f(y - 5 * s)} ${f(w + 2)} ${f(y)}" stroke="#0a0f24" stroke-width="${f(2.2 * s)}" fill="none"/>`;
  for (let i = 1; i < 6; i++) { const x = (w / 6) * i; o += `<rect x="${f(x - .6 * s)}" y="${f(y - 2 * s)}" width="${f(1.2 * s)}" height="${f(9 * s)}" fill="#0a0f24"/>`; }
  for (let i = 0; i <= 12; i++) {
    const x = (w / 12) * i, yy = y - 5 * s * (1 - ((x / w) * 2 - 1) ** 2) - 1.4 * s;
    o += `<circle cx="${f(x)}" cy="${f(yy)}" r="${f(.55 * s)}" fill="#ffe2a0" opacity="${atLeast(rar, 'rare') ? .95 : .6}"/>`;
  }
  if (live) {
    // автівки: пари фар (білі — туди, червоні — назад); SVG animateMotion працює і в старих Safari
    const road = `M-6 ${f(y - 1.2 * s)} Q${f(w / 2)} ${f(y - 6 * s)} ${f(w + 6)} ${f(y - 1.2 * s)}`;
    for (let i = 0; i < 4; i++) {
      const back = i % 2, col = back ? '#ff4d4d' : '#fff7d6';
      o += `<g><circle r="${f(.6 * s)}" fill="${col}"/><circle cx="${f(1.4 * s)}" r="${f(.6 * s)}" fill="${col}"/><animateMotion dur="${f(7 + i)}s" begin="-${f(i * 2.3)}s" repeatCount="indefinite" path="${road}" ${back ? 'keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}/></g>`;
    }
  }
  return o;
}

function river(R, w, y, h, s) {
  let o = `<rect x="0" y="${f(y)}" width="${w}" height="${f(h)}" fill="url(#RIV)"/>`;
  for (let i = 0; i < 16; i++) {
    const x = R() * w, len = (3 + R() * 9) * s;
    o += `<rect class="kref" style="animation-delay:${f(R() * 3)}s" x="${f(x)}" y="${f(y + 1.5 * s + R() * 2 * s)}" width="${f(.8 * s)}" height="${f(len)}" fill="${R() < .7 ? '#ffd27a' : '#9fd0ff'}" opacity="${f(.18 + R() * .25)}"/>`;
  }
  return o;
}

function defs(rar) {
  const [a, b, c] = SKY[rar];
  return `<defs><linearGradient id="SKY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".62" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
<linearGradient id="RIV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2350"/><stop offset="1" stop-color="#05081a"/></linearGradient>
<linearGradient id="DOME" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c0"/><stop offset=".45" stop-color="#e2a52a"/><stop offset="1" stop-color="#7a4b06"/></linearGradient>
<radialGradient id="HAL" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".22"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>`;
}
// унікалізація id градієнтів у межах SVG (на сторінці багато карт)
const uniq = (s, id) => s.replace(/id="(SKY|RIV|HAL|NEON|MET|GOLD|DOME)"/g, `id="$1${id}"`).replace(/url\(#(SKY|RIV|HAL|NEON|MET|GOLD|DOME)\)/g, `url(#$1${id})`);

function moon(x, y, r, fillSky) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffeab8"/><circle cx="${f(x + r * .45)}" cy="${f(y - r * .25)}" r="${f(r * .9)}" fill="${fillSky}"/>`;
}

/** Гілка каштана (п'ятипалий лист) — передній план, найглибший паралакс. */
function chestnutLeaf(x, y, s, rot, fill) {
  let o = `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${f(s)})" fill="${fill}">`;
  for (const [a, l] of [[-70, 9], [-35, 12], [0, 14], [35, 12], [70, 9]]) o += `<ellipse cx="0" cy="${-l / 2}" rx="${f(l * .2)}" ry="${f(l / 2)}" transform="rotate(${a})"/>`;
  return `${o}<circle r="1.2"/></g>`;
}

/** Неонова вивіска на будинку: на легендарній мерехтить, на звичайній — вимкнена. */
function neonSign(x, y, s, rar, text = 'КИЇВ') {
  const on = atLeast(rar, 'epic');
  const col = '#ff4fa3';
  return `<g transform="translate(${f(x)} ${f(y)})"><rect x="0" y="0" width="${f(15 * s)}" height="${f(5.4 * s)}" rx="${f(1 * s)}" fill="#0b0f22" stroke="${on ? col : '#5a3550'}" stroke-width="${f(.45 * s)}" ${on ? `filter="url(#NEON)"` : ''}/>
<text class="${rar === 'legendary' ? 'kneon' : ''}" x="${f(7.5 * s)}" y="${f(4.1 * s)}" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="${f(3.8 * s)}" fill="${on ? '#ffd3ea' : '#6b4a63'}" ${on ? `filter="url(#NEON)"` : ''}>${text}</text></g>`;
}
const neonFilter = `<filter id="NEON" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// ── цифри: вузький «вивісковий» шрифт; рідкість змінює матеріал цифри ──
function bigValue(text, rar, x, y, size, id) {
  const fill = { common: '#f3e7cc', rare: `url(#MET${id})`, epic: '#fff3dc', legendary: `url(#GOLD${id})` }[rar];
  const glow = atLeast(rar, 'epic') ? `filter="url(#NEON${id})"` : '';
  const stroke = rar === 'epic' ? 'stroke="#ff7ac0" stroke-width=".6"' : rar === 'legendary' ? 'stroke="#fff4c8" stroke-width=".35"' : 'stroke="rgba(0,0,0,.35)" stroke-width=".5"';
  return `<text class="${rar === 'legendary' ? 'kbig' : ''}" x="${x}" y="${y}" text-anchor="middle" font-family="Oswald, Impact, 'Arial Narrow', sans-serif" font-weight="700" font-size="${size}" letter-spacing="-1" fill="${fill}" ${stroke} ${glow} paint-order="stroke">${text}</text>`;
}
const inkDefs = (id) => `<defs><linearGradient id="MET${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#b9d8f5"/><stop offset=".55" stop-color="#6f93b8"/><stop offset="1" stop-color="#e9f5ff"/></linearGradient>
<linearGradient id="GOLD${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d0"/><stop offset=".45" stop-color="#ffcf55"/><stop offset=".55" stop-color="#c98a10"/><stop offset="1" stop-color="#ffe9a0"/></linearGradient>
<filter id="NEON${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

const SPECIAL = { knife: 'НІЖ', mirror: 'ДЗЕРКАЛО', double: 'ПОДВОЄННЯ' };

/**
 * Лице карти. card: { kind: 'num'|'knife'|'mirror'|'double', value, suit }.
 * Повертає шари арту (глибина 0..3), шар цифр і (для легендарної) живу анімацію.
 */
function face(card, rar, opts = {}) {
  const id = uid('ky');
  const R = rng(`kyiv-${card.kind}-${card.suit || ''}-${card.value || ''}`);
  const live = rar === 'legendary' && opts.live !== false;
  const lit = { common: .32, rare: .45, epic: .55, legendary: .68 }[rar];
  // зорі: у живої легендарної — два шари, що по черзі мерехтять (анімується лише opacity шару)
  const starStr = stars(R, atLeast(rar, 'epic') ? 34 : 22, 100, 78);
  const sky = uniq(svg('0 0 100 140', `${defs(rar)}<rect width="100" height="140" fill="url(#SKY)"/><rect width="100" height="140" fill="url(#HAL)"/>${live ? '' : starStr}${moon(80, 18, 6, SKY[rar][0])}`), id);
  const starBits = starStr.split('/>').filter(Boolean).map((x) => `${x}/>`);
  const twinkle = live ? ['ktwA', 'ktwB'].map((c, k) => ({ d: 0, svg: svg('0 0 100 140', starBits.filter((_, i) => i % 2 === k).join('')), cls: c })) : [];
  const far = uniq(svg('0 0 100 140', `${defs(rar)}${hills(100, 98, 1.05, '#121a3e', atLeast(rar, 'epic') ? 'url(#DOME)' : '#121a3e')}`), id);
  // вивіска (неоновий текст із фільтром) — окремим шаром: квартали без тексту малюються в bitmap
  const lights = { win: '' };
  const near = uniq(svg('0 0 100 140', `${defs(rar)}${blocks(R, 100, 112, 1, '#0c1330', lit, live, lights)}${bridge(100, 116, 1, rar, live, id)}${river(R, 100, 118, 26, 1)}`), id);
  const sign = uniq(svg('0 0 100 140', `${neonFilter}${neonSign(60, 93, 1, rar)}`), id);
  // передній план: гілка каштана в нижньому лівому куті над Дніпром
  const front = svg('0 0 100 140', `${chestnutLeaf(-2, 142, 1.7, 35, 'rgba(6,9,24,.95)')}${chestnutLeaf(10, 146, 1.2, 70, 'rgba(6,9,24,.9)')}${atLeast(rar, 'rare') ? '<g transform="translate(13 128)"><circle r="3" fill="#2c1d0c"/><path d="M-2.6 -1.4 -4 -2.6M2.6 -1.4 4 -2.6M0 -3 0 -4.6M-3 1 -4.6 1.4M3 1 4.6 1.4" stroke="#2c1d0c" stroke-width=".7"/><circle cx="-.7" cy="-.6" r="1.1" fill="#9a6230"/></g>' : ''}`);

  // цифри й масті
  let center;
  if (card.kind === 'num') {
    const col = SUIT_COLOR[card.suit];
    center = `${card.value > 9 ? bigValue(card.value, rar, 57, 64, 40, id) : bigValue(card.value, rar, 50, 66, 46, id)}`
      + suitG(card.suit, 85, 124, 12, col);
  } else {
    const col = { knife: '#d6dbe8', mirror: '#c8a8ff', double: '#ffcf55' }[card.kind];
    center = suitG(card.kind, 32, 18, 36, col) + `<text x="50" y="66" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="9" letter-spacing="1" fill="#f6ead2" stroke="rgba(0,0,0,.5)" stroke-width=".6" paint-order="stroke">${SPECIAL[card.kind]}</text>`;
  }
  const ink = svg('0 0 100 140', `${inkDefs(id)}${center}`, 'xMidYMid meet');
  const wins = live ? [{ d: 2, svg: svg('0 0 100 140', lights.win), wipe: true, cls: 'kwwipe' }] : [];
  return { layers: [{ d: 0, svg: sky }, ...twinkle, { d: 1, svg: far }, { d: 2, svg: near }, ...wins, { d: 2, svg: sign }, { d: 3, svg: front }], ink, live: live ? liveDust : null };
}

/** Легендарна: золотий пил піднімається над містом (кількість обмежена). */
function liveDust(el, n) {
  n = Math.min(n, 14); // світіння — градієнтом (без box-shadow), частинок небагато
  let o = '';
  const R = rng(n * 7 + 3);
  for (let i = 0; i < n; i++) o += `<i class="pt" style="left:${f(R() * 100)}%;top:${f(70 + R() * 30)}%;--d:${f(4 + R() * 4)}s;--delay:-${f(R() * 8)}s;--dx:${f((R() - .5) * 30)}px;--c:${R() < .7 ? '#ffd27a' : '#ffe9c4'}"></i>`;
  el.innerHTML = o;
}

// ── сорочка: темно-синє поле, візерунок каштанового листя, медальйон з куполами і монограмою ──
function back(rar) {
  const id = uid('kb');
  const gold = atLeast(rar, 'rare') ? '#e7b75a' : '#a88a52';
  let leaves = '';
  for (let y = 8; y < 140; y += 18) for (let x = (y / 18) % 2 ? 6 : 15; x < 100; x += 18) leaves += chestnutLeaf(x, y, .6, (x * 7 + y * 3) % 360, 'rgba(231,183,90,.13)');
  const field = svg('0 0 100 140', `<defs><radialGradient id="BG${id}" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#22306a"/><stop offset="1" stop-color="#070b22"/></radialGradient></defs><rect width="100" height="140" fill="url(#BG${id})"/>${leaves}`);
  const med = svg('0 0 100 140', `${defs(rar).replace(/id="(SKY|RIV|HAL)"/g, `id="$1${id}"`)}
<rect x="7" y="7" width="86" height="126" rx="6" fill="none" stroke="${gold}" stroke-width=".8"/><rect x="10" y="10" width="80" height="120" rx="4.5" fill="none" stroke="${gold}" stroke-width=".4" opacity=".7"/>
<circle cx="50" cy="70" r="27" fill="#0b1233" stroke="${gold}" stroke-width="1.2"/><clipPath id="C${id}"><circle cx="50" cy="70" r="26"/></clipPath>
<g clip-path="url(#C${id})"><rect x="20" y="40" width="60" height="60" fill="url(#SKY${id})"/>${hills(100, 80, .9, '#0b1030').replace(/<path d="M0/, '<path transform="translate(0 0)" d="M0')}${stars(rng('kb'), 10, 100, 60)}</g>
<text x="50" y="${70 + 26 + 12}" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="9" letter-spacing="3" fill="${gold}">ВА·БАНК</text>`);
  return { layers: [{ d: 0, svg: field }, { d: 2, svg: med }], ink: '', live: rar === 'legendary' ? liveDust : null };
}

// ── сукно: панорама нічного міста по нижньому краю, тепле сяйво в центрі ──
function felt(rar, opts = {}) {
  const id = uid('kf');
  const R = rng('kyiv-felt');
  const live = rar === 'legendary' && opts.live !== false;
  const base = svg('0 0 320 180', `<defs><radialGradient id="F${id}" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#22376e"/><stop offset=".6" stop-color="#121d44"/><stop offset="1" stop-color="#070b20"/></radialGradient></defs><rect width="320" height="180" fill="url(#F${id})"/>${stars(R, 40, 320, 110, live ? 'ktw' : '')}`);
  const lights = { win: '' };
  const city = uniq(svg('0 0 320 180', `${defs(rar)}${hills(320, 128, 3.6, '#0d1534', atLeast(rar, 'epic') ? 'url(#DOME)' : '#0d1534')}${blocks(R, 320, 150, 2.6, '#0a1029', { common: .3, rare: .42, epic: .52, legendary: .62 }[rar], live, lights)}${bridge(320, 156, 2.2, rar, live, id)}${river(R, 320, 158, 24, 2)}`), id);
  const sign = uniq(svg('0 0 320 180', `${neonFilter}${neonSign(196, 104, 2.2, rar)}`), id);
  const wins = live ? [{ d: 2, svg: svg('0 0 320 180', lights.win), wipe: true, cls: 'kwwipe' }] : [];
  return { layers: [{ d: 0, svg: base }, { d: 2, svg: city }, ...wins, { d: 2, svg: sign }], ink: '', live: live ? liveDust : null };
}

// ── фішка: бурштин, кант із насічками, у центрі силует куполів ──
function chip(rar) {
  const id = uid('kc');
  const rim = { common: '#b98a3a', rare: '#7fc4ff', epic: '#c69bff', legendary: '#ffd56b' }[rar];
  let notches = '';
  for (let i = 0; i < 8; i++) notches += `<rect x="47" y="2" width="6" height="11" rx="1.5" fill="#fff4d6" opacity=".9" transform="rotate(${i * 45} 50 50)"/>`;
  return {
    layers: [{ d: 0, svg: svg('0 0 100 100', `<defs><radialGradient id="G${id}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffcf6a"/><stop offset="1" stop-color="#b8740f"/></radialGradient></defs><circle cx="50" cy="50" r="49" fill="url(#G${id})"/><circle cx="50" cy="50" r="46" fill="none" stroke="${rim}" stroke-width="5"/>${notches}<circle cx="50" cy="50" r="31" fill="#121a3e" stroke="#ffe2a0" stroke-width="1.6"/>`) },
      { d: 2, svg: svg('0 0 100 100', `<clipPath id="CC${id}"><circle cx="50" cy="50" r="30"/></clipPath><g clip-path="url(#CC${id})">${hills(100, 64, .9, '#ffcf6a')}</g><text x="50" y="76" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="7" fill="#ffe2a0">КИЇВ</text>`) }],
    ink: '', live: null,
  };
}

/** Анімація перемоги: салют над містом (кількість залпів — за рідкістю), на легендарній — каштани падають. */
function win(layer, rar, limit) {
  const box = document.createElement('div');
  box.className = `skwin kyiv r-${rar}`;
  const bursts = { common: 2, rare: 3, epic: 4, legendary: 6 }[rar];
  const per = Math.max(6, Math.floor(limit / bursts));
  const R = rng(Date.now() % 9973);
  let html = '';
  for (let b = 0; b < bursts; b++) {
    const x = 15 + R() * 70, y = 15 + R() * 35, col = ['#ffd27a', '#ff6fa8', '#8fd0ff', '#fff3c4'][b % 4];
    for (let i = 0; i < per; i++) {
      const a = (i / per) * Math.PI * 2, d = 40 + R() * 50;
      html += `<i class="fw" style="left:${f(x)}%;top:${f(y)}%;--tx:${f(Math.cos(a) * d)}px;--ty:${f(Math.sin(a) * d)}px;--c:${col};animation-delay:${f(b * .35)}s"></i>`;
    }
  }
  if (rar === 'legendary') for (let i = 0; i < 10; i++) html += `<i class="fall" style="left:${f(R() * 100)}%;animation-delay:${f(.6 + R() * 1.4)}s">🌰</i>`;
  box.innerHTML = html;
  layer.append(box);
  setTimeout(() => box.remove(), 3600);
}

export default registerSet({
  id: 'kyiv', name: 'Нічний Київ', icon: '🌃', accent: 'bells', accentName: 'дзвони',
  blurb: 'Нічне місто: пагорби з куполами, вогні вікон, неон і каштани.',
  legendaryNote: 'Місто вмикає вогні, мостом їдуть автівки, вивіска мерехтить.',
  face, back, felt, chip, win, suits: SUITS, suitColor: SUIT_COLOR,
});
