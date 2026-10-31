// Збирає предмет скіна з шарів: арт (паралакс) → цифри → жива анімація → фольга → відблиск → рамка → камінь.
// Жива анімація — лише для легендарних, лише коли рух дозволено, і пауза поза екраном.
import { SKINS } from '../../config.js';
import { SETS, reducedMotion, RAR } from './core.js';
import './sets/kyiv.js';
import './sets/cyber.js';
import './sets/samurai.js';
import './sets/cossack.js';
import './sets/deco.js';
import './sets/abyss.js';

export { SETS };
export const ITEM_KINDS = {
  deck: { name: 'Колода', shape: '' },
  back: { name: 'Сорочка', shape: '' },
  felt: { name: 'Сукно', shape: 'wide' },
  chips: { name: 'Фішки', shape: 'round' },
  win: { name: 'Перемога', shape: 'wide' },
  sound: { name: 'Звук', shape: 'round' },
};

// Легендарна: гравіровані золоті філігранні кути і тонка внутрішня лінія (однакові для всіх наборів)
const cornerPath = 'M0 18 C0 8 8 0 18 0 M4 22 C4 11 11 4 22 4 M9 9 C13 13 13 19 9 23 M9 9 C13 13 19 13 23 9 M9 9 l-3 -3';
const ORN = `<div class="sk-orn"><svg viewBox="0 0 100 140" preserveAspectRatio="none"><defs><linearGradient id="ornG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e0a316"/><stop offset="1" stop-color="#fff1b0"/></linearGradient></defs>
<rect x="5.4" y="5.4" width="89.2" height="129.2" rx="4" fill="none" stroke="url(#ornG)" stroke-width=".5" opacity=".9"/>
${[[5.4, 5.4, 1, 1], [94.6, 5.4, -1, 1], [5.4, 134.6, 1, -1], [94.6, 134.6, -1, -1]].map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx * .42} ${sy * .42})" fill="none" stroke="url(#ornG)" stroke-width="1.6" stroke-linecap="round"><path d="${cornerPath}"/><circle cx="9" cy="9" r="1.8" fill="url(#ornG)" stroke="none"/></g>`).join('')}</svg></div>`;

// поза екраном — пауза анімацій (CSS і canvas)
const io = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((es) => { for (const e of es) e.target.classList.toggle('sk-paused', !e.isIntersecting); }, { rootMargin: '80px' })
  : null;

/**
 * @param {object} o { set, kind: 'card'|'back'|'felt'|'chip', card?, rarity, w?, live? }
 * @returns HTMLElement .sk-item
 */
export function renderItem(o) {
  const set = SETS[o.set];
  const rarity = o.rarity || 'common';
  const live = o.live !== false && !reducedMotion();
  const el = document.createElement('div');
  const shape = o.kind === 'felt' ? 'wide' : o.kind === 'chip' ? 'round' : '';
  el.className = `sk-item sk-${o.set} r-${rarity} ${shape}`;
  if (o.w) el.style.setProperty('--w', typeof o.w === 'number' ? `${o.w}px` : o.w);
  const built = o.kind === 'card' ? set.face(o.card, rarity, { live })
    : o.kind === 'back' ? set.back(rarity, { live })
      : o.kind === 'felt' ? set.felt(rarity, { live })
        : set.chip(rarity, { live });
  el.innerHTML = `<div class="sk-tilt ${built.cls || ''}"><div class="sk-art">${built.layers.map((l) => `<div class="plx d${l.d}">${l.svg}</div>`).join('')}</div>`
    + `<div class="sk-ink">${built.ink || ''}</div><div class="sk-live"></div><div class="sk-foil"></div><div class="sk-glare"></div><div class="sk-frame"></div><div class="sk-bevel"></div>${rarity === 'legendary' && !shape ? ORN : ''}<div class="sk-gem" title="${RAR[rarity].name}"></div></div>`;
  if (built.live && live && rarity === 'legendary') {
    const stop = built.live(el.querySelector('.sk-live'), SKINS.particles.legendary);
    if (typeof stop === 'function') el._stop = stop;
  }
  io?.observe(el);
  el.dataset.rarity = rarity;
  el.dataset.set = o.set;
  return el;
}

/** Прибрати предмет (зупинити canvas-цикли). */
export function disposeItem(el) { el?._stop?.(); io?.unobserve(el); el?.remove(); }

/** Анімація перемоги набору. */
export function playWinFx(layer, setId, rarity) {
  if (reducedMotion()) return;
  SETS[setId].win(layer, rarity, SKINS.particles.win);
}

/**
 * Знімок для «Поділитися»: композиція SVG (шари арту, цифри, рамка кольору рідкості, підписи) → PNG.
 * Ефекти CSS (фольга) у знімок не потрапляють — замість них статичний відблиск.
 */
export async function snapshot(o, meta) {
  const set = SETS[o.set];
  const built = o.kind === 'card' ? set.face(o.card, o.rarity, { live: false }) : set.back(o.rarity, { live: false });
  const W = 600, H = 900, cw = 420, ch = 588, cx = (W - cw) / 2, cy = 120;
  const col = RAR[o.rarity].color;
  const inner = (s) => s.replace('<svg ', `<svg x="${cx}" y="${cy}" width="${cw}" height="${ch}" `);
  const svgs = built.layers.map((l) => inner(l.svg)).join('') + (built.ink ? inner(built.ink) : '');
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="bgS" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="#05060c"/></radialGradient>
<linearGradient id="glS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".45" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="cS"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="30"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="url(#bgS)"/>
<g clip-path="url(#cS)"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="#111"/>${svgs}<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="url(#glS)"/></g>
<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="30" fill="none" stroke="${col}" stroke-width="14"/>
<text x="${W / 2}" y="74" text-anchor="middle" font-family="Arial Black, sans-serif" font-weight="900" font-size="34" letter-spacing="6" fill="${col}">${RAR[o.rarity].name.toUpperCase()}</text>
<text x="${W / 2}" y="${cy + ch + 62}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="30" fill="#fff">${meta.name}</text>
<text x="${W / 2}" y="${cy + ch + 102}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#cfd3dc">${set.name} · ${meta.serial || ''} · Ва-банк</text></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(img, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/** Поділитися знімком (Web Share API з файлом; інакше — завантаження). */
export async function shareSnapshot(o, meta) {
  const blob = await snapshot(o, meta);
  const file = new File([blob], `vabank-${o.set}-${o.rarity}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: meta.name, text: `${RAR[o.rarity].name}: ${meta.name} — Ва-банк` }); return 'shared'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
