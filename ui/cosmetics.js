// Застосування косметики: CSS-змінні й класи. Уся графіка процедурна.
import { COSMETIC_BY_ID, DEFAULT_EQUIPPED } from '../meta/catalog.js';

const VAR_CATS = ['deck', 'back', 'felt', 'chips', 'frame'];

function varsOf(look) {
  const vars = {};
  const anim = [];
  for (const cat of VAR_CATS) {
    const c = COSMETIC_BY_ID[look[cat]];
    if (!c) continue;
    Object.assign(vars, c.vars || {});
    if (c.anim) anim.push(`fx-${cat}-${c.anim}`);
  }
  return { vars, anim };
}

function applyTo(el, look, cats = VAR_CATS) {
  if (!el) return;
  const prev = el.dataset.cosVars ? el.dataset.cosVars.split(',') : [];
  for (const k of prev) el.style.removeProperty(k);
  for (const k of [...el.classList]) if (k.startsWith('fx-')) el.classList.remove(k);
  const sub = {};
  for (const cat of cats) sub[cat] = look[cat];
  const { vars, anim } = varsOf({ ...DEFAULT_EQUIPPED, ...sub });
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.cosVars = Object.keys(vars).join(',');
  for (const a of anim) el.classList.add(a);
}

/** Моя косметика — на весь документ. */
export function applyMyLook(look) {
  applyTo(document.documentElement, look);
}

/** Косметика суперника — лише на його зону (рамка, фішки, сорочка, лице карти). */
export function applyOppLook(look, panel = 'opp') {
  for (const id of [panel, `slot-${panel}`, `${panel}-hand`]) applyTo(document.getElementById(id), look || DEFAULT_EQUIPPED, ['deck', 'back', 'chips', 'frame']);
}

export const emojiSet = (look) => COSMETIC_BY_ID[look?.emoji]?.set || COSMETIC_BY_ID.emoji_classic.set;

/** Анімація перемоги (процедурні частинки; лише transform/opacity). */
export function playWin(layer, fxId = 'chips', reduced = false) {
  if (!layer || reduced) return;
  const kinds = {
    chips: { n: 18, html: () => '<svg class="chip-token"><use href="#i-chip"/></svg>' },
    confetti: { n: 36, html: (i) => `<i class="confetti" style="--c:${['#f3cf78', '#86c3ff', '#ff9568', '#8fe07c', '#d6b0ff'][i % 5]}"></i>` },
    hearts: { n: 20, html: () => '<i class="emo">❤️</i>' },
    fireworks: { n: 30, html: (i) => `<i class="spark" style="--c:${['#f3cf78', '#ff6f91', '#86c3ff'][i % 3]}"></i>` },
    goldrain: { n: 44, html: (i) => (i % 3 ? '<i class="coin"></i>' : '<svg class="chip-token"><use href="#i-chip"/></svg>') },
  };
  const k = kinds[fxId] || kinds.chips;
  const box = document.createElement('div');
  box.className = `winfx winfx-${fxId}`;
  for (let i = 0; i < k.n; i++) {
    const wrap = document.createElement('span');
    wrap.className = 'p';
    wrap.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
    wrap.style.setProperty('--d', `${Math.round(Math.random() * 600)}ms`);
    wrap.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 160)}px`);
    wrap.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    wrap.innerHTML = k.html(i);
    box.append(wrap);
  }
  layer.append(box);
  setTimeout(() => box.remove(), 2600);
}
