// Протокол обміну повідомленнями між хостом і гостем. Без DOM і без PeerJS — тестується в node.

export const PROTOCOL_VERSION = 1;

/** Без схожих символів: немає O (≈0) та I (≈1, L). */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PEER_PREFIX = 'vabank-ua-v1-';

export const REACTIONS = ['😂', '😱', '😎', '🔥', '🤡', '👏'];

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

const ACTION_TYPES = new Set(['play', 'scout', 'skipScout', 'check', 'raise', 'call', 'fold', 'don', 'show', 'ready', 'rematch']);

/**
 * Перевірка повідомлення від гостя на боці хоста.
 * @returns {{ ok: true, m } | { ok: false, error }}
 */
export function parseGuestMessage(m) {
  if (!m || typeof m !== 'object') return { ok: false, error: 'not-object' };
  if (m.v !== PROTOCOL_VERSION) return { ok: false, error: 'version' };
  switch (m.type) {
    case 'hello':
      if (m.token !== null && m.token !== undefined && (typeof m.token !== 'string' || m.token.length > 64)) return { ok: false, error: 'bad-token' };
      return { ok: true, m: { type: 'hello', token: m.token || null } };
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
  if (m.v !== PROTOCOL_VERSION) return { ok: false, error: 'version' };
  if (!['welcome', 'state', 'react', 'ping', 'pong', 'error', 'bye'].includes(m.type)) return { ok: false, error: 'unknown-type' };
  if (m.type === 'react' && !REACTIONS.includes(m.emoji)) return { ok: false, error: 'bad-emoji' };
  return { ok: true, m };
}
