// Протокол обміну повідомленнями між хостом і гостем. Без DOM і без PeerJS — тестується в node.

export const PROTOCOL_VERSION = 3;

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
// Дозволені реакції — усі емодзі з усіх наборів косметики
export const REACTIONS = [...new Set(COSMETICS.filter((c) => c.cat === 'emoji').flatMap((c) => c.set))];

export function randomCode(rng) {
  let s = '';
  for (let i = 0; i < 4; i++) s += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)];
  return s;
}

export function isValidCode(code) {
  return typeof code === 'string' && code.length === 4 && [...code].every((c) => ROOM_ALPHABET.includes(c));
}

export const peerIdFor = (code) => PEER_PREFIX + code;

export function randomToken(rng) {
  let s = '';
  for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rng() * 36)];
  return s;
}

export const msg = (type, body = {}) => ({ v: PROTOCOL_VERSION, type, ...body });

const ACTION_TYPES = new Set(['play', 'swap', 'donStart', 'scout', 'skipScout', 'check', 'raise', 'call', 'fold', 'don', 'show', 'ready', 'rematch']);

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
        },
      };
    case 'action': {
      const a = m.action;
      if (!a || typeof a !== 'object' || !ACTION_TYPES.has(a.type)) return { ok: false, error: 'bad-action' };
      const clean = { type: a.type };
      if (typeof a.cardId === 'string' && a.cardId.length <= 10) clean.cardId = a.cardId;
      if (a.amount === 'allin' || (Number.isInteger(a.amount) && a.amount > 0 && a.amount < 1e6)) clean.amount = a.amount;
      if (a.guess === 'higher' || a.guess === 'lower') clean.guess = a.guess;
      return { ok: true, m: { type: 'action', action: clean } };
    }
    case 'react':
      if (!REACTIONS.includes(m.emoji)) return { ok: false, error: 'bad-emoji' };
      return { ok: true, m: { type: 'react', emoji: m.emoji } };
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
  if (m.type === 'react' && !REACTIONS.includes(m.emoji)) return { ok: false, error: 'bad-emoji' };
  return { ok: true, m };
}
