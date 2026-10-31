import { buildDeck } from '../game/cards.js';
import { createGame, reduce } from '../game/engine.js';

export function seededRng(seed = 42) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

export const ctx = (now = 0, seed = 7) => ({ rng: seededRng(seed), now });

/** Колода, де спершу йдуть вказані id (рука P0 — перші 4, P1 — наступні 4), далі решта. */
export function stackedDeck(ids) {
  const all = buildDeck();
  const top = ids.map((id) => {
    const c = all.find((x) => x.id === id);
    if (!c) throw new Error('no card ' + id);
    return c;
  });
  return [...top, ...all.filter((c) => !ids.includes(c.id))];
}

export function newGame(ids = [], opts = {}) {
  return createGame({ deck: stackedDeck(ids), firstToAct: 0, ...opts }, ctx());
}

/** Послідовно застосовує дії; кидає помилку, якщо якась невалідна. */
export function run(state, actions, c = ctx()) {
  let s = state;
  for (const a of actions) {
    const r = reduce(s, a, c);
    if (!r.ok) throw new Error(`action ${JSON.stringify(a)} failed: ${r.error}`);
    s = r.state;
  }
  return s;
}

export const play = (p, cardId) => ({ type: 'play', player: p, cardId });
export const act = (type, p, extra = {}) => ({ type, player: p, ...extra });
export const skipBoth = [act('skipScout', 0), act('skipScout', 1)];
