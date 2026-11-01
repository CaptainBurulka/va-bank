// Протокол обміну повідомленнями між хостом і гостем. Без DOM і без PeerJS — тестується в node.

export const PROTOCOL_VERSION = 7; // 5 — комбінації з 3 карт (playSet); 6 — «away», епохи ID хоста; 7 — покроковий раунд (playOpen/playClosed)

/** Порівняння версій «2.0.1» → -1 / 0 / 1. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Зрозуміле повідомлення про різні версії з точки зору цього гравця.
 * mine/theirs — версії застосунку (theirs може бути невідома для дуже старих версій).
 */
export function versionAdvice(mine, theirs) {
  const c = compareVersions(mine, theirs || '1.0.0');
  if (c > 0) return `У суперника стара версія гри${theirs ? ` (${theirs})` : ''}, у тебе ${mine}. Суперникові треба оновитися: закрити й знову відкрити гру та натиснути «Оновити».`;
  if (c < 0) return `У тебе стара версія гри (${mine}), у суперника ${theirs}. Онови гру на своєму телефоні: закрий і знову відкрий її, потім натисни «Оновити».`;
  return 'Версії гри збігаються, але протокол різний — оновіть гру на обох телефонах.';
}

/** Без схожих символів: немає O (≈0) та I (≈1, L). */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// Префікс не залежить від версії протоколу: так стара й нова версії «бачать» одна одну
// і можуть чесно сказати, кому оновитися.
export const PEER_PREFIX = 'vabank-ua-v1-';

import { COSMETICS } from '../meta/catalog.js';
import { PHRASES, isPid, cleanTitle } from '../meta/rivals.js';
// Дозволені реакції — усі емодзі з усіх наборів косметики
export const REACTIONS = [...new Set(COSMETICS.filter((c) => c.cat === 'emoji').flatMap((c) => c.set))];
/** Реакція — емодзі з наборів або швидка фраза. */
export const isReaction = (x) => REACTIONS.includes(x) || PHRASES.includes(x);

export function randomCode(rng) {
  let s = '';
  for (let i = 0; i < 4; i++) s += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)];
  return s;
}

export function isValidCode(code) {
  return typeof code === 'string' && code.length === 4 && [...code].every((c) => ROOM_ALPHABET.includes(c));
}

/**
 * ID хоста на сервері сигналізації. Після обриву мобільної мережі сервер ще до ~60 с тримає
 * старе з'єднання і відповідає «ID taken», тож хост переходить на наступну «епоху» ID,
 * а гість шукає кімнату одразу за всіма епохами. Епоха 0 — старий формат (сумісність).
 */
export const HOST_EPOCHS = 8;
export const peerIdFor = (code, epoch = 0) => PEER_PREFIX + code + (epoch ? `-${epoch}` : '');

export function randomToken(rng) {
  let s = '';
  for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rng() * 36)];
  return s;
}

export const msg = (type, body = {}) => ({ v: PROTOCOL_VERSION, type, ...body });

/** Нікнейм: 1–16 видимих символів, без керівних; інакше null. */
export function cleanName(x) {
  if (typeof x !== 'string') return null;
  const t = x.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return t || null;
}

const ACTION_TYPES = new Set(['play', 'playSet', 'playOpen', 'playClosed', 'swap', 'donStart', 'scout', 'skipScout', 'check', 'raise', 'call', 'fold', 'don', 'show', 'ready', 'rematch']);

/**
 * Перевірка повідомлення від гостя на боці хоста.
 * @returns {{ ok: true, m } | { ok: false, error }}
 */
export function parseGuestMessage(m) {
  if (!m || typeof m !== 'object') return { ok: false, error: 'not-object' };
  const app = typeof m.app === 'string' && m.app.length < 20 ? m.app : null;
  if (m.v !== PROTOCOL_VERSION) return { ok: false, error: 'version', app, v: m.v };
  switch (m.type) {
    case 'hello':
      if (m.token !== null && m.token !== undefined && (typeof m.token !== 'string' || m.token.length > 64)) return { ok: false, error: 'bad-token' };
      return {
        ok: true,
        m: {
          type: 'hello', token: m.token || null, app,
          // набір джокерів і косметика гостя (довіряємо, але обрізаємо форму; повна перевірка — на хості)
          set: Array.isArray(m.set) ? m.set.filter((x) => typeof x === 'string' && x.length < 24).slice(0, 3) : [],
          look: m.look && typeof m.look === 'object' && !Array.isArray(m.look) ? m.look : null,
          name: cleanName(m.name),
          pid: isPid(m.pid) ? m.pid : null,
          title: cleanTitle(m.title),
        },
      };
    case 'action': {
      const a = m.action;
      if (!a || typeof a !== 'object' || !ACTION_TYPES.has(a.type)) return { ok: false, error: 'bad-action' };
      const clean = { type: a.type };
      if (typeof a.cardId === 'string' && a.cardId.length <= 24) clean.cardId = a.cardId; // id джокера довший за звичайну карту
      // комбінації: 3 карти одним кроком (id джокерів довші за id звичайних карт)
      if (Array.isArray(a.cards) && a.cards.length <= 3 && a.cards.every((x) => typeof x === 'string' && x.length <= 24)) clean.cards = a.cards.slice();
      if (typeof a.open === 'string' && a.open.length <= 24) clean.open = a.open;
      if (a.amount === 'allin' || (Number.isInteger(a.amount) && a.amount > 0 && a.amount < 1e6)) clean.amount = a.amount;
      if (a.guess === 'higher' || a.guess === 'lower') clean.guess = a.guess;
      if (Number.isInteger(a.target) && a.target >= 0 && a.target < 3) clean.target = a.target;
      // aid — номер дії гостя: хост підтверджує його в стані й відкидає повтори
      const aid = Number.isSafeInteger(m.aid) && m.aid > 0 ? m.aid : null;
      return { ok: true, m: { type: 'action', action: clean, aid } };
    }
    case 'react':
      if (!isReaction(m.emoji)) return { ok: false, error: 'bad-emoji' };
      return { ok: true, m: { type: 'react', emoji: m.emoji } };
    case 'away':
      return { ok: true, m: { type: 'away', hidden: m.hidden === true } };
    case 'ping':
    case 'pong':
    case 'bye':
      return { ok: true, m: { type: m.type } };
  }
  return { ok: false, error: 'unknown-type' };
}

/** Перевірка повідомлення від хоста на боці гостя. */
export function parseHostMessage(m) {
  if (!m || typeof m !== 'object') return { ok: false, error: 'not-object' };
  // Повідомлення про різні версії приймаємо з будь-якою версією протоколу
  if (m.type === 'error' && m.code === 'version') return { ok: true, m: { type: 'error', code: 'version', app: typeof m.app === 'string' ? m.app : null } };
  if (m.v !== PROTOCOL_VERSION) return { ok: false, error: 'version', app: typeof m.app === 'string' ? m.app : null };
  if (!['welcome', 'state', 'react', 'ping', 'pong', 'error', 'bye'].includes(m.type)) return { ok: false, error: 'unknown-type' };
  if (m.type === 'react' && !isReaction(m.emoji)) return { ok: false, error: 'bad-emoji' };
  return { ok: true, m };
}
