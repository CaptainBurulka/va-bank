// Гра втрьох: правила раунду, вибування, місця і закон збереження фішок.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, viewFor, legalActions } from '../game/engine.js';
import { JOKERS, jokerDesc, JOKERS_3 } from '../game/jokers.js';
import { CONFIG } from '../config.js';
import { botDecide, BOT_STYLES } from '../game/bot.js';
import { stackedDeck, ctx, run, play, act, seededRng } from './helpers.js';
import { parseGuestMessage, cleanName, PROTOCOL_VERSION } from '../net/protocol.js';

/** Утрьох: руки по 4 карти — P0 = ids[0..3], P1 = ids[4..7], P2 = ids[8..11]. Козир вимкнено. */
function game3(ids, opts = {}) {
  const { config = {}, ...rest } = opts;
  return createGame({ players: 3, deck: stackedDeck(ids), firstToAct: 0, core: 'single', ...rest, config: { ...config, features: { trump: false, swap: true, ...(config.features || {}) } } }, ctx());
}
const H = ['w9', 'w1', 'w2', 'w3', 'f5', 'f1', 'f2', 'f3', 's7', 's1', 's2', 's3'];
const skip3 = [act('skipScout', 0), act('skipScout', 1), act('skipScout', 2)];
/** Пропустити розвідку всім, хто ще не вирішив. */
const skipAll = (s) => [0, 1, 2].reduce((t, q) => (t.phase === 'scout' && !t.players[q].scoutDecided ? reduce(t, act('skipScout', q), ctx()).state : t), s);
const total = (s) => s.players.reduce((a, p) => a + p.chips, 0) + s.pot;

test('утрьох: старт — три гравці, власні стартові фішки, анте з усіх', () => {
  const s = game3(H);
  assert.equal(s.players.length, 3);
  assert.equal(s.cfg.startChips, CONFIG.three.startChips);
  assert.equal(s.pot, 3 * CONFIG.anteBase);
  assert.equal(total(s), 3 * CONFIG.three.startChips);
});

test('утрьох: гра вдвох не бачить налаштувань для трьох', () => {
  const s = createGame({ firstToAct: 0 }, ctx());
  assert.equal(s.cfg.startChips, CONFIG.startChips);
  assert.equal(s.players.length, 2);
});

test('утрьох: торги по колу, три чеки — розкриття, перемагає той, хто б\'є обох', () => {
  let s = run(game3(H), [play(0, 'w9'), play(1, 'f5'), play(2, 's7'), ...skip3]);
  assert.equal(s.bet.toAct, 0);
  s = run(s, [act('check', 0)]);
  assert.equal(s.bet.toAct, 1);
  s = run(s, [act('check', 1), act('check', 2)]);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 0);
  assert.equal(s.players[0].chips, CONFIG.three.startChips - 5 + 15);
});

test('утрьох: підняття — відповісти мають обидва; ліміт підняттів на весь раунд', () => {
  let s = run(game3(H), [play(0, 'w9'), play(1, 'f5'), play(2, 's7'), ...skip3, act('raise', 0, { amount: 5 })]);
  assert.deepEqual(s.bet.pending.sort(), [1, 2]);
  s = run(s, [act('raise', 1, { amount: 5 })]); // друге підняття — ліміт (2 на раунд) вичерпано
  assert.equal(s.bet.raises, 2);
  assert.ok(!legalActions(s, 2).some((a) => a.type === 'raise'));
  s = run(s, [act('call', 2)]);
  assert.equal(s.bet.toAct, 0); // P0 ще має відповісти на ре-рейз
  s = run(s, [act('call', 0)]);
  assert.equal(s.phase, 'result');
  assert.equal(s.contrib[0], s.contrib[1]);
  assert.equal(s.contrib[1], s.contrib[2]);
});

test('утрьох: ставка обмежена найменшим стеком серед тих, хто в раунді', () => {
  let s = game3(H);
  s.players[2].chips = 12; // найменший стек
  s = run(s, [play(0, 'w9'), play(1, 'f5'), play(2, 's7'), ...skip3]);
  const allin = legalActions(s, 0).find((a) => a.amount === 'allin');
  assert.ok(allin.value <= 12);
});

test('утрьох: пас — вихід із раунду; лишився один — забирає банк', () => {
  let s = run(game3(H), [play(0, 'w1'), play(1, 'f5'), play(2, 's7'), ...skip3, act('raise', 0, { amount: 10 }), act('fold', 1)]);
  assert.equal(s.phase, 'bet');
  assert.ok(s.players[1].folded);
  s = run(s, [act('fold', 2)]);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.reason, 'fold');
  assert.ok(s.result.bluff, 'w1 проти сильніших — вдалий блеф');
});

test('утрьох: розкриття серед тих, хто не спасував; карта спасованого не розкривається', () => {
  let s = run(game3(H), [play(0, 'w9'), play(1, 'f5'), play(2, 's7'), ...skip3, act('raise', 0, { amount: 5 }), act('fold', 1), act('call', 2)]);
  assert.equal(s.result.winner, 0);
  const v2 = viewFor(s, 2, 0);
  assert.equal(v2.players[1].played, null, 'карта того, хто спасував, лишається таємницею');
  assert.ok(v2.players[0].played);
  const last = s.log.filter((e) => e.t === 'showdown').at(-1);
  assert.equal(last.cards[1], null);
});

test('утрьох: нічия за перше місце — банк іде в джекпот', () => {
  // w5 б'є f5 (вода > вогонь), f5 б'є s5, s5 б'є w5 — коло, ніхто не б'є обох
  let s = run(game3(['w5', 'w1', 'w2', 'w3', 'f5', 'f1', 'f2', 'f3', 's5', 's1', 's2', 's3']),
    [play(0, 'w5'), play(1, 'f5'), play(2, 's5'), ...skip3, act('check', 0), act('check', 1), act('check', 2)]);
  assert.equal(s.result.winner, null);
  assert.equal(s.jackpot, s.pot);
  assert.equal(s.result.detail.reason, 'tie3');
});

test('утрьох: розвідка — обираєш, до кого підглянути', () => {
  let s = run(game3(H), [play(0, 'w9'), play(1, 'f5'), play(2, 's7')]);
  const L = legalActions(s, 0).filter((a) => a.type === 'scout');
  assert.deepEqual(L.map((a) => a.target).sort(), [1, 2]);
  s = run(s, [act('scout', 0, { target: 2 })]);
  assert.equal(s.players[0].scoutTarget, 2);
  assert.equal(s.players[0].scoutSeen, 'high');
  assert.equal(reduce(s, act('scout', 1, { target: 1 }), ctx()).error, 'bad-target');
});

test('утрьох: «подвій або нічого» — виграш платять суперники пропорційно внескам', () => {
  let s = run(game3(H, { firstToAct: 0 }), [play(0, 'w9'), play(1, 'f5'), play(2, 's7'), ...skip3, act('raise', 0, { amount: 10 }), act('call', 1), act('fold', 2)]);
  assert.equal(s.result.winner, 0);
  // внески: P1 = 5 + 10, P2 = 5 (спасував)
  assert.equal(s.result.don.stake, 20);
  assert.deepEqual(s.result.don.payers, [0, 15, 5]);
  const before = s.players.map((p) => p.chips);
  let t = reduce(s, act('donStart', 0), ctx()).state;
  const base = t.result.don.pending.base.value;
  const g = base <= 5 ? 'higher' : 'lower';
  t.result.don.pending.odds[g].m = 2; // перевіряємо розподіл виплати, а не шанси колоди
  // наступна карта колоди — виграшна
  const win = t.deck.find((c) => c.kind === 'num' && (g === 'higher' ? c.value > base : c.value < base));
  t.deck = [win, ...t.deck.filter((c) => c !== win)];
  t = reduce(t, act('don', 0, { guess: g }), ctx()).state;
  const a = t.result.don.attempts[0];
  assert.equal(a.outcome, 'win');
  const paid1 = before[1] - t.players[1].chips, paid2 = before[2] - t.players[2].chips;
  assert.equal(paid1 + paid2, a.delta);
  assert.ok(paid1 >= paid2 * 2, `P1 вніс утричі більше: ${paid1} vs ${paid2}`);
  assert.equal(total(t), 3 * CONFIG.three.startChips);
});

test('утрьох: банкрут вибуває і стає глядачем, гра триває', () => {
  let s = game3(H);
  s.players[2].chips = 0; // P2 уже заплатив анте і більше не має фішок
  s = skipAll(run(s, [play(0, 'w9'), play(1, 'f5'), play(2, 's7')]));
  s = run(s, [act('check', 0), act('check', 1), act('check', 2), act('ready', 0), act('ready', 1), act('ready', 2)]);
  assert.ok(s.players[2].out);
  assert.equal(s.stats[2].outRound, 1);
  assert.equal(s.phase, 'play');
  assert.deepEqual(legalActions(s, 2), []);
  assert.equal(reduce(s, play(2, s.players[2].hand[0]?.id || 'x'), ctx()).error, 'spectator');
  assert.equal(s.players[2].hand.length, 0);
  const v = viewFor(s, 2, 0);
  assert.equal(v.me.out, true);
  assert.equal(v.players[0].played, null, 'глядач бачить лише публічне');
  // далі ходять двоє; розкриття — без вибулого
  s = skipAll(run(s, [play(0, s.players[0].hand[0].id), play(1, s.players[1].hand[0].id)]));
  assert.equal(s.phase, 'bet');
});

test('утрьох: кінець партії — місця 1, 2, 3; вибулий раніше — нижче', () => {
  let s = game3(H, { config: { maxRounds: 1 } });
  s.players[1].chips = 0;
  s = skipAll(run(s, [play(0, 'w9'), play(1, 'f5'), play(2, 's7')]));
  s = run(s, [act('check', 0), act('check', 1), act('check', 2), act('ready', 0), act('ready', 1), act('ready', 2)]);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.places, [1, 3, 2]);
  assert.equal(s.winner, 0);
});

test('утрьох: перший хід — гравець після переможця минулого раунду', () => {
  let s = run(game3(H), [play(0, 'w1'), play(1, 'f5'), play(2, 's7'), ...skip3, act('check', 0), act('check', 1), act('check', 2)]);
  assert.equal(s.result.winner, 2);
  s = run(s, [act('ready', 0), act('ready', 1), act('ready', 2)]);
  assert.equal(s.firstToAct, 0);
});

test('утрьох: таймаут у торгах — чек або пас за того, хто не встиг', () => {
  let s = createGame({ players: 3, deck: stackedDeck(H), firstToAct: 0, core: 'single', config: { features: { trump: false } } }, ctx(0));
  s = run(s, [play(0, 'w9'), play(1, 'f5'), play(2, 's7'), ...skip3, act('raise', 0, { amount: 5 })], ctx(0));
  const t = reduce(s, { type: 'timeout' }, ctx(1e9)).state;
  assert.ok(t.players[1].folded);
  assert.equal(t.bet.toAct, 2);
});

test('утрьох: кожен джокер має опис для трьох або загальний', () => {
  for (const j of JOKERS) assert.ok(jokerDesc(j.id, 3).length > 10, j.id);
  assert.equal(JOKERS_3.length, JOKERS.length);
});

test('утрьох: закон збереження фішок — 600 партій ботів з джокерами (джекпот усередині банку)', () => {
  const ids = JOKERS.map((j) => j.id);
  for (let g = 0; g < 600; g++) {
    const rng = seededRng(g * 31 + 7);
    const c = { rng, now: 0 };
    const sets = [0, 1, 2].map((p) => [ids[(g + p * 5) % ids.length], ids[(g * 3 + p) % ids.length]]);
    let s = createGame({ players: 3, timers: false, jokerSets: sets, config: { maxRounds: 12 } }, c);
    const start = total(s);
    for (let i = 0; i < 4000 && s.phase !== 'over'; i++) {
      let acted = false;
      for (const p of [0, 1, 2]) {
        const a = botDecide(viewFor(s, p, 0), rng, BOT_STYLES[(g + p) % 3], { jokerPlay: 0.8 });
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, c);
        assert.ok(r.ok, `гра ${g}: ${JSON.stringify(a)} → ${r.error}`);
        s = r.state; acted = true;
        assert.equal(total(s), start, `гра ${g}: фішки не зберігаються після ${JSON.stringify(a)}`);
        assert.ok(s.players.every((pl) => pl.chips >= 0), 'від\'ємні фішки');
        assert.ok(s.jackpot <= s.pot, 'джекпот — частина банку');
        break;
      }
      assert.ok(acted, `гра ${g}: ніхто не може ходити (${s.phase})`);
    }
    assert.equal(s.phase, 'over', `гра ${g} не завершилась`);
    assert.equal(s.pot, 0);
  }
});

test('удвох: закон збереження фішок — 400 партій ботів з джокерами', () => {
  const ids = JOKERS.map((j) => j.id);
  for (let g = 0; g < 400; g++) {
    const rng = seededRng(g * 17 + 3);
    const c = { rng, now: 0 };
    let s = createGame({ timers: false, jokerSets: [[ids[g % ids.length]], [ids[(g * 7) % ids.length]]], config: { maxRounds: 12 } }, c);
    const start = total(s);
    for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
      for (const p of [0, 1]) {
        const a = botDecide(viewFor(s, p, 0), rng, BOT_STYLES[(g + p) % 3], { jokerPlay: 0.8 });
        if (!a) continue;
        s = reduce(s, { ...a, player: p }, c).state;
        assert.equal(total(s), start);
        break;
      }
    }
    assert.equal(s.phase, 'over');
  }
});

test('протокол: ціль розвідки і нікнейм проходять перевірку', () => {
  const m = parseGuestMessage({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'scout', target: 2 } });
  assert.equal(m.m.action.target, 2);
  assert.equal(parseGuestMessage({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'scout', target: 9 } }).m.action.target, undefined);
  assert.equal(cleanName('  Андрій  <script> '), 'Андрій script');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName(''), null);
});
