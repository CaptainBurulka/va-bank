// DOM-елементи карт. Масті — SVG-іконки різної форми (крапля / полум'я / гранований камінь).
import { SUIT, SPECIAL } from './text.js';
import { JOKER_BY_ID, RARITY_NAME } from '../game/jokers.js';
import { renderItem, SETS as SKIN_SETS } from './skins/render.js';
import { openViewer } from './skins/ceremony.js';
import { RAR } from './skins/core.js';

/**
 * Скін колоди/сорочки для карти: з найближчої зони ([data-skin-deck]/[data-skin-back]) або мій (на <html>).
 * Порожнє значення — класика. Повертає { set, rarity } або null.
 */
function zoneSkin(el, attr, explicit) {
  const raw = explicit !== undefined ? explicit : (el.closest?.(`[data-${attr}]`) || document.documentElement).getAttribute(`data-${attr}`);
  if (!raw) return null;
  const [set, rarity, serial] = raw.split(':');
  return { set, rarity: rarity || 'common', serial: Number(serial) || null };
}

/** Сорочка набору: малюється, коли карта вже в DOM (тоді відома зона власника). */
function skinBack(el, o) {
  const back = el.querySelector('.back');
  if (!back) return;
  const s = zoneSkin(el, 'skin-back', o.skinBack);
  const key = s ? `${s.set}:${s.rarity}` : '';
  if (back.dataset.skin === key) return;
  back.dataset.skin = key;
  back.querySelector('.sk-item')?.remove();
  back.classList.toggle('skinned', !!s);
  if (s) back.append(renderItem({ set: s.set, kind: 'back', rarity: s.rarity, w: 'var(--cw)', live: false, observe: false }));
}

const ico = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

/**
 * @param {object|null} card — null означає сорочку
 * @param {object} [o] { faceDown, trump: масть-козир, bonus: +сила козиря }
 */
export function cardEl(card, o = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = '<div class="inner"><div class="face"></div><div class="back"><span>ВБ</span></div></div>';
  if (card) fillFace(el, card, o);
  if (!card || o.faceDown) el.classList.add('back-up');
  // зона власника відома лише після вставки в DOM — тому сорочку (і лице) з набору малюємо мікрозадачею
  queueMicrotask(() => { skinBack(el, o); if (card && el.dataset.skinPending) fillFace(el, card, { ...o, late: true }); });
  return el;
}

/** Тема мастей (тематична колода): явна, від найближчої зони суперника або моя (на <html>). */
function suitTheme(el, o) {
  if (o.suits !== undefined) return o.suits || '';
  return el.closest?.('[data-suits]')?.dataset.suits ?? document.documentElement.dataset.suits ?? '';
}

export function fillFace(el, card, o = {}) {
  const face = el.querySelector('.face');
  const theme = suitTheme(el, o);
  const sico = (suit, cls = '') => ico(theme ? `${theme}-${suit}` : suit, cls);
  el.dataset.id = card.id;
  el.classList.remove('water', 'fire', 'stone', 'special', 'trumped', 'joker', 'r-common', 'r-rare', 'r-epic', 'r-legendary');
  if (card.kind === 'joker') {
    const j = JOKER_BY_ID[card.joker];
    el.classList.add('joker', `r-${j.rarity}`);
    face.innerHTML = `<div class="jk-tag">${o.small ? 'ДЖОКЕР' : RARITY_NAME[j.rarity].toUpperCase()}</div><div class="jk-ico">${j.icon}</div><div class="jk-name">${j.name}</div>`;
    el.setAttribute('aria-label', `Джокер ${j.name}: ${j.desc}`);
    el.title = j.desc;
    return;
  }
  el.querySelector('.tb')?.remove();
  // колода набору: увесь малюнок лиця — скін (цифри, масті, спецкарти), класичні класи лишаються для логіки стилів
  // карта ще не в DOM — зона власника невідома: домалюємо мікрозадачею (до відмальовки кадру)
  if (!el.isConnected && o.skinDeck === undefined && !o.late) { el.dataset.skinPending = '1'; return; }
  delete el.dataset.skinPending;
  const sk = zoneSkin(el, 'skin-deck', o.skinDeck);
  el.classList.toggle('skinned', !!sk);
  if (!sk) { delete el.dataset.skr; el._skin = null; }
  if (sk) {
    el.classList.add(card.kind === 'num' ? card.suit : 'special');
    face.innerHTML = '';
    el.dataset.skr = sk.rarity;
    el._skin = { set: sk.set, rarity: sk.rarity, serial: sk.serial, card };
    const it = renderItem({ set: sk.set, kind: 'card', card, rarity: sk.rarity, w: 'var(--cw)', live: false, observe: false });
    face.append(it);
    const s = card.kind === 'num' ? SUIT[card.suit] : null;
    el.setAttribute('aria-label', s ? `${card.value} ${s.gen}` : `${SPECIAL[card.kind].name}: ${SPECIAL[card.kind].sub}`);
    if (s && o.trump && card.suit === o.trump) {
      el.classList.add('trumped');
      if (o.showBoost) {
        const tb = document.createElement('span');
        tb.className = 'tb';
        tb.textContent = `${card.value} → ${card.value + (o.bonus || 1)}`;
        el.append(tb);
      }
      el.setAttribute('aria-label', `${card.value} ${s.gen}, козир: сила ${card.value + (o.bonus || 1)}`);
    }
    return;
  }
  if (card.kind === 'num') {
    const s = SUIT[card.suit];
    el.classList.add(card.suit);
    face.innerHTML = `<div class="cor">${card.value}${sico(card.suit)}</div><div class="big">${card.value}</div>${sico(card.suit, 'pip')}`;
    el.setAttribute('aria-label', `${card.value} ${s.gen}`);
    if (o.trump && card.suit === o.trump) {
      el.classList.add('trumped');
      if (o.showBoost) {
        const tb = document.createElement('span');
        tb.className = 'tb';
        tb.textContent = `${card.value} → ${card.value + (o.bonus || 1)}`;
        el.append(tb);
      }
      el.setAttribute('aria-label', `${card.value} ${s.gen}, козир: сила ${card.value + (o.bonus || 1)}`);
    }
  } else {
    const sp = SPECIAL[card.kind];
    el.classList.add('special');
    face.innerHTML = `${o.small ? '' : `<div class="sp-sub">${sp.sub}</div>`}${ico(card.kind, 'sp-ico')}<div class="sp-name">${sp.name}</div>`;
    el.setAttribute('aria-label', `${sp.name}: ${sp.sub}`);
  }
}

/** Маленька іконка масті для тексту. */
export function suitIcon(suit) {
  return `<svg class="ico" style="color:var(--${suit}-ui)" aria-hidden="true"><use href="#i-${suit}"/></svg>`;
}

/**
 * Утримання карти набору (рука, слоти) → огляд із нахилом: назва, набір, рідкість, серійний номер.
 * Тап після утримання «з'їдається», щоб не вибрати карту випадково.
 */
export function bindCardHold(root, holdMs = 450) {
  let t = null, sx = 0, sy = 0, fired = false;
  root.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.card.skinned');
    fired = false;
    clearTimeout(t);
    if (!c?._skin) return;
    sx = e.clientX; sy = e.clientY;
    t = setTimeout(() => {
      fired = true;
      const { set, rarity, serial, card } = c._skin;
      const nm = card.kind === 'num' ? `${card.value} ${SUIT[card.suit].gen}` : SPECIAL[card.kind].name;
      navigator.vibrate?.(12);
      openViewer({ item: { set, kind: 'card', card, rarity }, name: `${nm} · ${SKIN_SETS[set].name}`, serial: serial ? `№ ${String(serial).padStart(4, '0')}` : `${RAR[rarity].name}` });
    }, holdMs);
  });
  root.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(ev, () => clearTimeout(t));
  root.addEventListener('click', (e) => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('.card.skinned')) e.preventDefault(); });
}
