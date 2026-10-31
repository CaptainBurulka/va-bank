// DOM-елементи карт. Масті — SVG-іконки різної форми (крапля / полум'я / гранований камінь).
import { SUIT, SPECIAL } from './text.js';
import { JOKER_BY_ID, RARITY_NAME } from '../game/jokers.js';

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
  return el;
}

export function fillFace(el, card, o = {}) {
  const face = el.querySelector('.face');
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
  if (card.kind === 'num') {
    const s = SUIT[card.suit];
    el.classList.add(card.suit);
    face.innerHTML = `<div class="cor">${card.value}${ico(card.suit)}</div><div class="big">${card.value}</div>${ico(card.suit, 'pip')}`;
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
