// Нічиї з джокерами: єдиний порядок порівняння для КОЖНОЇ пари джокерів.
// Обидва гравці мають однакові звичайні карти (масті дзеркальні) — різницю дають лише джокери.
// Порядок: 1) умовна перемога («перемагає, якщо…») лише в одного → він; 2) комбінації (+ «перемагає слабша»);
// 3) повна нічия: «нічию виграє/програє», інакше банк у джекпот.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOKERS } from '../game/jokers.js';
import { createGame, reduce, comboWinner } from '../game/engine.js';
import { buildDeck } from '../game/cards.js';
import { seededRng, act } from './helpers.js';

const chips = (s) => s.players.reduce((a, p) => a + p.chips, 0) + s.pot; // джекпот — частина банку
function deckWith(ids) {
  const all = buildDeck();
  const top = ids.map((id) => all.find((x) => x.id === id));
  return [...top, ...all.filter((c) => !ids.includes(c.id))];
}
// однакові звичайні карти, масті дзеркальні (w ↔ f), без козиря
const H0 = ['w7', 'f3', 's5', 'w9', 'f1', 's2'];
const H1 = ['f7', 'w3', 's6', 'f9', 'w1', 's4'];

const RANDOM = new Set(['brazen', 'duel', 'luck', 'mirrorworld', 'pocket', 'redeal', 'roulette', 'storm', 'swap', 'chaosking', 'coin', 'apocalypse', 'quake']);

function duel(j0, j1, { first = 0, seed = 3, flip = false } = {}) {
  const [a, b] = flip ? [j1, j0] : [j0, j1];
  const [h0, h1] = flip ? [H1, H0] : [H0, H1];
  const ctx = { rng: seededRng(seed), now: 0 };
  let s = createGame({ deck: deckWith([...h0, ...h1]), firstToAct: first, core: 'combo', timers: false, jokerSets: [[a], [b]], jokerRound: 1, config: { features: { trump: false, swap: true } } }, ctx);
  const total = chips(s);
  const set = (p, j, h) => ({ type: 'playSet', player: p, cards: [`J${p}-${j}`, h[0], h[1]], open: h[0] });
  const run = (x) => { const r = reduce(s, x, ctx); if (!r.ok) throw new Error(`${a}/${b}: ${JSON.stringify(x)} → ${r.error}`); s = r.state; };
  run(set(0, a, h0)); run(set(1, b, h1));
  for (const p of [0, 1]) if (s.phase === 'scout' && !s.players[p].scoutDecided) run(act('skipScout', p));
  const order = [first, 1 - first];
  for (const p of order) if (s.phase === 'bet') run(act('check', p));
  assert.equal(s.phase, 'result', `${a}/${b}: розкриття`);
  assert.equal(chips(s), total, `${a}/${b}: фішки зберігаються`);
  return s;
}

test('порядок порівняння: умовна перемога → комбінація → «нічию виграє» → джекпот', () => {
  const C = (rank, key) => ({ rank, key: [rank, ...key] });
  const X = (o = {}) => ({ winIf: [false, false], winTie: [false, false], loseTie: [false, false], lowWins: false, ...o });
  const pair = C(1, [7]), high = C(0, [9]);
  // 1. умовна перемога в одного б'є сильнішу комбінацію
  assert.equal(comboWinner([0, 1], [high, pair], X({ winIf: [true, false] })).winner, 0);
  // в обох — звичайне порівняння
  assert.equal(comboWinner([0, 1], [high, pair], X({ winIf: [true, true] })).winner, 1);
  // 2. «перемагає слабша» не скасовує умовну перемогу
  assert.equal(comboWinner([0, 1], [pair, high], X({ winIf: [true, false], lowWins: true })).winner, 0);
  assert.equal(comboWinner([0, 1], [pair, high], X({ lowWins: true })).winner, 1);
  // 3. рівні комбінації: «нічию виграє» в одного → він; в обох → нічия
  assert.equal(comboWinner([0, 1], [pair, pair], X({ winTie: [false, true] })).winner, 1);
  assert.equal(comboWinner([0, 1], [pair, pair], X({ winTie: [true, true] })).winner, null);
  assert.equal(comboWinner([0, 1], [pair, pair], X({ loseTie: [true, false] })).winner, 1);
  assert.equal(comboWinner([0, 1], [pair, pair], X()).winner, null);
  // утрьох: двоє з умовною перемогою порівнюються комбінаціями, третій програє
  assert.equal(comboWinner([0, 1, 2], [high, pair, C(5, [9])], { winIf: [true, true, false], winTie: [], loseTie: [] }).winner, 1);
});

test('матриця: кожна пара джокерів у нічиїй — без збоїв, фішки цілі, порядок однаковий з будь-якого місця', () => {
  const ids = JOKERS.map((j) => j.id);
  let pairs = 0, symmetric = 0;
  for (const a of ids) {
    for (const b of ids) {
      const s = duel(a, b);
      pairs++;
      const r = s.result;
      const jk = r.jokers;
      // умовна перемога рівно в одного вирішує раунд (якщо раунд не скасовано і не вирішила монетка)
      if (r.reason === 'showdown' && jk && !r.detail?.coin && jk.winIf && jk.winIf[0] !== jk.winIf[1]) {
        assert.equal(r.winner, jk.winIf[0] ? 0 : 1, `${a} проти ${b}: умовна перемога`);
      }
      // повна нічия → банк у джекпот, ніхто не виграє
      if (r.reason === 'showdown' && r.winner === null) assert.ok(s.jackpot > 0, `${a}/${b}: нічия → джекпот`);
      // Детерміновані пари: результат не залежить від місця і того, хто ходив першим
      // (джокери з випадковістю або доборами з колоди — без дзеркальної перевірки: колода в дзеркалі інша)
      if (RANDOM.has(a) || RANDOM.has(b)) continue;
      const again = duel(a, b, { seed: 11 });
      if (again.result.winner !== r.winner || again.result.reason !== r.reason) continue;
      const mirror = duel(a, b, { flip: true, first: 1 });
      const w = r.winner === null ? null : 1 - r.winner;
      assert.equal(mirror.result.winner, w, `${a} проти ${b}: дзеркально (місця переставлено) — той самий переможець`);
      symmetric++;
    }
  }
  assert.equal(pairs, ids.length ** 2);
  assert.ok(symmetric > pairs * 0.4, `симетрію перевірено для ${symmetric} з ${pairs} пар`);
});

test('Аутсайдер проти іншого джокера при рівних комбінаціях: умова вирішує, а не порядок спрацювання', () => {
  for (const other of JOKERS.map((j) => j.id)) {
    if (['boom', 'rewind', 'coin', 'apocalypse', 'chaosking', 'castling', 'duel', 'shadow', 'temptation'].includes(other)) continue;
    for (const first of [0, 1]) {
      const ctx = { rng: seededRng(7), now: 0 };
      let s = createGame({ deck: deckWith([...H0, ...H1]), firstToAct: first, core: 'combo', timers: false, jokerSets: [['temptation'], [other]], jokerRound: 1, config: { features: { trump: false, swap: true } } }, ctx);
      s.players[0].chips -= 70; s.players[1].chips += 70;
      const step = (x) => { const r = reduce(s, x, ctx); assert.ok(r.ok, `${other}: ${r.error}`); s = r.state; };
      step({ type: 'playSet', player: 0, cards: ['J0-temptation', H0[0], H0[1]], open: H0[0] });
      step({ type: 'playSet', player: 1, cards: [`J1-${other}`, H1[0], H1[1]], open: H1[0] });
      for (const p of [0, 1]) if (s.phase === 'scout' && !s.players[p].scoutDecided) step(act('skipScout', p));
      for (const p of [first, 1 - first]) if (s.phase === 'bet') step(act('check', p));
      if (s.result.reason !== 'showdown' || s.result.detail?.coin) continue;
      assert.equal(s.result.winner, 0, `Аутсайдер (відстає на 140) проти ${other}, першим ходив ${first}`);
    }
  }
});
