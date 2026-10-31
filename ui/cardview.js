// Створення DOM-елементів карт.
import { SUIT, SPECIAL } from './text.js';

/**
 * @param {object|null} card — null означає сорочку
 * @param {object} [o] { faceDown: boolean }
 */
export function cardEl(card, o = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  const inner = document.createElement('div');
  inner.className = 'inner';
  const face = document.createElement('div');
  face.className = 'face';
  const back = document.createElement('div');
  back.className = 'back';
  inner.append(face, back);
  el.append(inner);
  if (card) fillFace(el, card);
  if (!card || o.faceDown) el.classList.add('back-up');
  return el;
}

export function fillFace(el, card) {
  const face = el.querySelector('.face');
  el.dataset.id = card.id;
  el.classList.remove('water', 'fire', 'stone', 'special');
  if (card.kind === 'num') {
    const s = SUIT[card.suit];
    el.classList.add(card.suit);
    face.innerHTML = `<div class="corner">${card.value}<i>${s.ico}</i></div><div class="val">${card.value}</div><div class="suit-big">${s.ico}</div>`;
    el.setAttribute('aria-label', `${card.value} ${s.name}`);
  } else {
    const sp = SPECIAL[card.kind];
    el.classList.add('special');
    face.innerHTML = `<div class="sp-sub">${sp.sub}</div><div class="sp-ico">${sp.ico}</div><div class="sp-name">${sp.name}</div>`;
    el.setAttribute('aria-label', sp.name);
  }
}
