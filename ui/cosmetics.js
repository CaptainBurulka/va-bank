// Застосування косметики. Класика — CSS-змінні; предмети тематичних наборів — процедурна графіка ui/skins/
// з рідкістю конкретного екземпляра. Зони: моя — <html>, суперника — його панель, слот і міні-карти.
import { COSMETIC_BY_ID, DEFAULT_EQUIPPED, SKIN_BY_ID, SKIN_SET_BY_ID } from '../meta/catalog.js';
import { setAccent, setAccentPlayer } from './sound.js';
import { renderItem, disposeItem, playWinFx } from './skins/render.js';
import { playAccent } from './skins/sound.js';

setAccentPlayer(playAccent);

const VAR_CATS = ['deck', 'back', 'felt', 'chips', 'frame'];
const RARITIES = ['common', 'rare', 'epic', 'legendary'];

/** Предмет набору у «зовнішності»: { set, rarity } або null для класики. */
export function skinOf(look, cat) {
  const it = SKIN_BY_ID[look?.[cat]];
  if (!it) return null;
  const r = look.rar?.[cat];
  return { set: it.set, rarity: RARITIES.includes(r) ? r : 'common', serial: look.ser?.[cat] || null };
}

function varsOf(look) {
  const vars = {};
  const anim = [];
  for (const cat of VAR_CATS) {
    const c = COSMETIC_BY_ID[look[cat]];
    if (!c) continue;
    Object.assign(vars, c.vars || {});
    if (c.anim) anim.push(`fx-${cat}-${c.anim}`);
  }
  // фішки набору: колір токенів — колір набору
  const ch = skinOf(look, 'chips');
  if (ch) vars['--chip'] = SKIN_SET_BY_ID[ch.set].frame;
  return { vars, anim };
}

function applyTo(el, look, cats = VAR_CATS) {
  if (!el) return;
  const prev = el.dataset.cosVars ? el.dataset.cosVars.split(',') : [];
  for (const k of prev) el.style.removeProperty(k);
  for (const k of [...el.classList]) if (k.startsWith('fx-')) el.classList.remove(k);
  const sub = { rar: look.rar || {}, ser: look.ser || {} };
  for (const cat of cats) sub[cat] = look[cat];
  const { vars, anim } = varsOf({ ...DEFAULT_EQUIPPED, ...sub });
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.cosVars = Object.keys(vars).join(',');
  for (const a of anim) el.classList.add(a);
  // колода й сорочка набору: порожній рядок = класика (щоб зона суперника не «успадкувала» мою)
  for (const cat of ['deck', 'back']) {
    if (!cats.includes(cat)) continue;
    const s = skinOf(sub, cat);
    el.dataset[cat === 'deck' ? 'skinDeck' : 'skinBack'] = s ? `${s.set}:${s.rarity}:${s.serial || ''}` : '';
  }
  // фішка набору в «стосі» гравця
  if (cats.includes('chips') && el !== document.documentElement) for (const st of el.querySelectorAll?.(':scope .stack') || []) mountChip(st, skinOf(sub, 'chips'));
}

function mountChip(stack, s) {
  stack.querySelector('.sk-item')?.remove();
  const icon = stack.querySelector('svg.chip');
  if (icon) icon.style.display = s ? 'none' : '';
  if (!s) return;
  const it = renderItem({ set: s.set, kind: 'chip', rarity: s.rarity, w: '24px', live: false, observe: false });
  it.classList.add('stack-chip');
  stack.prepend(it);
}

/** Сукно набору — шар під столом (лише мій стіл). */
function mountFelt(look) {
  const table = document.getElementById('table');
  if (!table) return;
  const old = table.querySelector(':scope > .felt-skin');
  if (old) { disposeItem(old.firstChild); old.remove(); }
  const s = skinOf(look, 'felt');
  table.classList.toggle('skinned', !!s);
  table.style.removeProperty('--rc');
  if (!s) return;
  const wrap = document.createElement('div');
  wrap.className = 'felt-skin';
  wrap.append(renderItem({ set: s.set, kind: 'felt', rarity: s.rarity, w: '360px', full: true }));
  table.style.setProperty('--rc', `var(--rar-${s.rarity})`);
  table.prepend(wrap);
}

/** Моя косметика — на весь документ. look — publicLook(профілю) (з рідкістю). */
export function applyMyLook(look) {
  applyTo(document.documentElement, look);
  for (const st of document.querySelectorAll('#me .stack')) mountChip(st, skinOf(look, 'chips'));
  mountFelt(look);
  const snd = skinOf(look, 'sound');
  if (snd) setAccent(SKIN_SET_BY_ID[snd.set].accent, snd.rarity);
  else setAccent(COSMETIC_BY_ID[look?.sound]?.accent || null);
}

/** Косметика суперника — лише на його зону (рамка, фішки, сорочка, лице карти). */
export function applyOppLook(look, panel = 'opp') {
  for (const id of [panel, `slot-${panel}`, `${panel}-hand`]) applyTo(document.getElementById(id), look || DEFAULT_EQUIPPED, ['deck', 'back', 'chips', 'frame']);
}

export const emojiSet = (look) => COSMETIC_BY_ID[look?.emoji]?.set || COSMETIC_BY_ID.emoji_classic.set;

/** Ефект перемоги для «зовнішності»: класичний id або skin:набір:рідкість. */
export function winFxOf(look) {
  const s = skinOf(look, 'win');
  return s ? `skin:${s.set}:${s.rarity}` : COSMETIC_BY_ID[look?.win]?.fx || 'chips';
}

/** Анімація перемоги (процедурні частинки; лише transform/opacity). */
export function playWin(layer, fxId = 'chips', reduced = false) {
  if (!layer || reduced) return;
  if (String(fxId).startsWith('skin:')) {
    const [, set, rarity] = fxId.split(':');
    playWinFx(layer, set, rarity);
    return;
  }
  const kinds = {
    chips: { n: 18, html: () => '<svg class="chip-token"><use href="#i-chip"/></svg>' },
    confetti: { n: 36, html: (i) => `<i class="confetti" style="--c:${['#f3cf78', '#86c3ff', '#ff9568', '#8fe07c', '#d6b0ff'][i % 5]}"></i>` },
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
