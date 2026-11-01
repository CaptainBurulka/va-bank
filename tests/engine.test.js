import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { buildDeck, compareCards, compareDetail, donOdds, scoutClass } from '../game/cards.js';
import { reduce, viewFor, legalActions, createGame, anteFor } from '../game/engine.js';
import { newGame, run, play, act, skipBoth, ctx, stackedDeck } from './helpers.js';

// Руки: P0 = f7 w3 s2 s9, P1 = w7 f3 s5 s8
const HANDS = ['f7', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8'];
const total = (s) => s.players[0].chips + s.players[1].chips + s.pot;
const card = (id) => buildDeck().find((x) => x.id === id);
const showdownCheck = [act('check', 0), act('check', 1)];

test('колода: 33 карти, унікальні id', () => {
  const d = buildDeck();
  assert.equal(d.length, 33);
  assert.equal(new Set(d.map((c) => c.id)).size, 33);
});

test('старт: анте 5, по 4 карти, фаза play', () => {
  const s = newGame(HANDS);
  assert.equal(s.phase, 'play');
  assert.equal(s.round, 1);
  assert.equal(s.pot, 10);
  assert.equal(s.players[0].chips, CONFIG.startChips - 5);
  assert.deepEqual(s.players[0].hand.map((c) => c.id), ['f7', 'w3', 's2', 's9']);
  assert.equal(s.players[1].hand.length, 4);
});

test('анте росте: 5 (1–4), 10 (5–8), 15 (9–12), 20 (13–16)', () => {
  const r = (n) => anteFor(n, CONFIG);
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16].map(r), [5, 5, 10, 10, 15, 15, 20, 20]);
});

test('масті: Вода > Вогонь > Камінь > Вода', () => {
  assert.equal(compareCards(card('w5'), card('f5'), CONFIG), 1);
  assert.equal(compareCards(card('f5'), card('s5'), CONFIG), 1);
  assert.equal(compareCards(card('s5'), card('w5'), CONFIG), 1);
  assert.equal(compareCards(card('s9'), card('w3'), CONFIG), 1);
});

test('спецкарти: Ніж, Дзеркало, Подвоєння', () => {
  assert.equal(compareCards(card('knife'), card('w10'), CONFIG), 1, 'ніж б\'є десятку');
  assert.equal(compareCards(card('knife'), card('w1'), CONFIG), -1, 'ніж має силу 0');
  assert.equal(compareCards(card('mirror'), card('w10'), CONFIG), 1, 'дзеркало копіює і виграє нічию');
  assert.equal(compareCards(card('mirror'), card('double'), CONFIG), 1);
  assert.equal(compareCards(card('w1'), card('mirror'), CONFIG), -1);
  assert.equal(compareCards(card('knife'), card('mirror'), CONFIG), 1, 'дзеркало програє лише ножу');
  assert.equal(compareCards(card('mirror'), card('knife'), CONFIG), -1);
  assert.equal(compareCards(card('double'), card('f4'), CONFIG), 1, 'подвоєння = 5');
  assert.equal(compareCards(card('double'), card('f6'), CONFIG), -1);
  assert.equal(compareCards(card('double'), card('f5'), CONFIG), 0);
  assert.equal(compareCards(card('double'), card('knife'), CONFIG), 1);
});

test('козир: +1 лише числовим картам; Ніж б\'є козирну 10; спецкарти без козиря', () => {
  assert.equal(compareCards(card('f7'), card('w7'), CONFIG, 'fire'), 1, 'козир +1: 7 Вогню > 7 Води');
  assert.equal(compareCards(card('f7'), card('w8'), CONFIG, 'fire'), -1, 'рівна сила 8 = 8 → масті по колу: Вода б\'є Вогонь');
  assert.equal(compareDetail(card('f7'), card('w8'), CONFIG, 'fire').reason, 'suit');
  assert.equal(compareCards(card('s4'), card('double'), CONFIG, 'stone'), 0, '4+1 = 5 = Подвоєння');
  assert.equal(compareCards(card('knife'), card('f10'), CONFIG, 'fire'), 1, 'ніж б\'є козирну десятку');
  assert.equal(compareCards(card('mirror'), card('f10'), CONFIG, 'fire'), 1);
  const d = compareDetail(card('f7'), card('w7'), CONFIG, 'fire');
  assert.deepEqual([d.reason, d.pa, d.pb, d.trumped], ['power', 8, 7, true]);
});

test('чек-чек → розкриття, переможець забирає банк', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 'f7'), play(1, 'w7'), ...skipBoth, ...showdownCheck]);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 1, 'w7 б\'є f7');
  assert.equal(s.result.detail.reason, 'suit');
  assert.equal(s.players[1].chips, 105);
  assert.equal(s.pot, 0);
  assert.equal(s.lastLoser, 0);
});

test('торги: підняття, ре-рейз, колл; ліміт піднять', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth, act('raise', 0, { amount: 5 })]);
  assert.equal(s.pot, 15);
  assert.ok(!legalActions(s, 1).some((a) => a.type === 'check'));
  s = run(s, [act('raise', 1, { amount: 10 })]);
  assert.equal(s.pot, 30);
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'raise'), 'максимум 2 підняття');
  assert.equal(reduce(s, act('raise', 0, { amount: 5 }), ctx()).ok, false);
  s = run(s, [act('call', 0)]);
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.won, 40);
  assert.equal(total(s), 200);
});

test('хост валідує: не твій хід, чужа карта, невірна сума', () => {
  let s = newGame(HANDS);
  assert.equal(reduce(s, play(0, 'w7'), ctx()).error, 'no-such-card');
  assert.equal(reduce(s, act('check', 0), ctx()).error, 'wrong-phase');
  s = run(s, [play(0, 'f7')]);
  assert.equal(reduce(s, play(0, 'w3'), ctx()).error, 'already-played');
  assert.equal(reduce(s, act('swap', 0, { cardId: 'w3' }), ctx()).error, 'already-played');
  s = run(s, [play(1, 'w7'), ...skipBoth]);
  assert.equal(reduce(s, act('check', 1), ctx()).error, 'not-your-turn');
  assert.equal(reduce(s, act('raise', 0, { amount: 7 }), ctx()).error, 'bad-amount');
  assert.equal(reduce(s, act('call', 0), ctx()).error, 'nothing-to-call');
  assert.equal(reduce(s, { type: 'check', player: 5 }, ctx()).error, 'bad-player');
});

test('у ранніх раундах ва-банк не більший за банк', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth]);
  assert.equal(legalActions(s, 0).find((a) => a.amount === 'allin').value, 10, 'банк 10');
  s = run(s, [act('raise', 0, { amount: 'allin' })]);
  assert.equal(legalActions(s, 1).find((a) => a.amount === 'allin').value, 30, 'колл 10 + банк 20');
});

test('ва-банк обмежений фішками суперника; банкрут програє', () => {
  let s = newGame(HANDS, { config: { allinFreeFromRound: 1 } });
  s.players[1].chips = 30;
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth]);
  assert.equal(legalActions(s, 0).find((a) => a.amount === 'allin').value, 30);
  s = run(s, [act('raise', 0, { amount: 'allin' }), act('call', 1)]);
  assert.equal(s.players[1].chips, 0);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.phase, 'over');
  assert.equal(s.endReason, 'bankrupt');
  assert.equal(s.winner, 0);
});

test('пас: банк без розкриття, блеф рахується, можна показати карту', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's2'), play(1, 's8'), ...skipBoth, act('raise', 0, { amount: 10 }), act('fold', 1)]);
  assert.equal(s.result.reason, 'fold');
  assert.equal(s.result.revealed, false);
  assert.equal(s.stats[0].bluffs, 1);
  assert.equal(viewFor(s, 1, 0).opp.played, null);
  assert.equal(viewFor(s, 1, 0).result.detail, null);
  s = run(s, [act('show', 0)]);
  assert.equal(viewFor(s, 1, 0).opp.played.id, 's2');
});

test('нічия: банк переходить у наступний раунд', () => {
  let s = newGame(['double', 'w3', 's2', 's9', 'f5', 'f3', 's6', 's8']);
  s = run(s, [play(0, 'double'), play(1, 'f5'), ...skipBoth, ...showdownCheck]);
  assert.equal(s.result.winner, null);
  assert.equal(s.result.don, null);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.round, 2);
  assert.equal(s.carry, 10);
  assert.equal(s.pot, 20);
  assert.equal(s.firstToAct, 0, 'при нічиїй першим ходить той самий');
});

test('першим ходить той, хто програв минулий раунд', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth, ...showdownCheck, act('ready', 0), act('ready', 1)]);
  s = run(s, [play(0, s.players[0].hand[0].id), play(1, s.players[1].hand[0].id), ...skipBoth]);
  assert.equal(s.bet.toAct, 1);
});

test('Подвоєння: програвший доплачує суму банку (у межах того, що має)', () => {
  let s = newGame(['double', 'w3', 's2', 's9', 'w4', 'f3', 's5', 's8']);
  s = run(s, [play(0, 'double'), play(1, 'w4'), ...skipBoth, act('raise', 0, { amount: 10 }), act('call', 1)]);
  assert.equal(s.result.penalty, 30);
  assert.equal(s.result.won, 60);
  assert.equal(total(s), 200);
  let t = newGame(['double', 'w3', 's2', 's9', 'w4', 'f3', 's5', 's8']);
  t.players[1].chips = 2;
  t = run(t, [play(0, 'double'), play(1, 'w4'), act('skipScout', 0), ...showdownCheck]);
  assert.equal(t.result.penalty, 2);
});

test('розвідка: ціна з config, бачиш «висока/низька», суперник бачить факт', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 'f7'), play(1, 'f3')]);
  s = run(s, [act('scout', 0)]);
  assert.equal(s.players[0].chips, 95 - CONFIG.scoutCost);
  const v0 = viewFor(s, 0, 0);
  assert.equal(v0.me.scoutSeen, 'low');
  assert.equal(v0.opp.played, null);
  const v1 = viewFor(s, 1, 0);
  assert.equal(v1.opp.scouted, true);
  assert.equal(JSON.stringify(v1).includes('"f7"'), false);
});

test('розвідка спецкарт: за силою, Дзеркало — «висока»', () => {
  assert.equal(scoutClass(card('knife'), CONFIG), 'low');
  assert.equal(scoutClass(card('double'), CONFIG), 'low');
  assert.equal(scoutClass(card('mirror'), CONFIG), 'high');
  assert.equal(scoutClass(card('w6'), CONFIG), 'high');
  assert.equal(scoutClass(card('w5'), CONFIG), 'low');
});

test('обмін: раз за раунд, 2 фішки в банк, суперник бачить факт, але не карту', () => {
  let s = newGame([...HANDS, 'w10']);
  s = run(s, [act('swap', 0, { cardId: 's2' })]);
  assert.equal(s.players[0].chips, 95 - CONFIG.swapCost);
  assert.equal(s.pot, 10 + CONFIG.swapCost);
  assert.deepEqual(s.players[0].hand.map((c) => c.id), ['f7', 'w3', 'w10', 's9']);
  assert.equal(s.discard.at(-1).id, 's2');
  assert.equal(reduce(s, act('swap', 0, { cardId: 'w3' }), ctx()).error, 'already-swapped');
  const v1 = viewFor(s, 1, 0);
  assert.equal(v1.opp.swapped, true);
  assert.equal(JSON.stringify(v1).includes('"w10"'), false);
  assert.equal(JSON.stringify(v1).includes('"s2"'), false);
  s = run(s, [play(0, 'w10'), play(1, 'w7')]);
  assert.equal(s.phase, 'scout');
  assert.equal(total(s), 200);
});

test('козир раунду видно обом ще до вибору карти', () => {
  const s = newGame(HANDS, { trumps: ['stone'] });
  assert.equal(viewFor(s, 0, 0).trump, 'stone');
  assert.equal(viewFor(s, 1, 0).trump, 'stone');
});

// ───────────── «Подвій або нічого» ─────────────
// Після рук (8 карт) верх колоди — наступні id.
function donGame(next, opts) {
  let s = newGame([...HANDS, ...next], opts);
  // P0: f7 vs P1: f3 → P0 виграє 10, чистий виграш (внесок P1) = 5
  return run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, ...showdownCheck]);
}

test('подвій: ставка — лише чистий виграш, база — нова карта, шанси від залишку колоди', () => {
  let s = donGame(['w5', 'w9']);
  assert.equal(s.result.don.stake, 5, 'лише внесок суперника');
  assert.ok(legalActions(s, 0).some((a) => a.type === 'donStart'));
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'don'), 'спершу відкривається база');
  s = run(s, [act('donStart', 0)]);
  const pend = s.result.don.pending;
  assert.equal(pend.base.id, 'w5');
  const expected = donOdds(5, s.deck, CONFIG);
  assert.deepEqual(pend.odds, expected);
  // Суперник бачить базу і шанси наживо
  assert.equal(viewFor(s, 1, 0).result.don.pending.base.id, 'w5');
  assert.ok(legalActions(s, 0).some((a) => a.type === 'don' && a.guess === 'higher'));
});

test('подвій: множник ~10% нижчий за справедливий, округлення вниз до 0.1', () => {
  const deck = buildDeck().filter((c) => c.kind === 'num'); // 30 карт, база 5: вище 15, нижче 12, рівних 3
  const o = donOdds(5, deck, CONFIG);
  assert.equal(o.higher.count, 15);
  assert.equal(o.lower.count, 12);
  assert.equal(o.higher.m, Math.floor((1 + 12 / 15) * 0.9 * 10) / 10); // 1.62 → 1.6
  assert.equal(o.higher.m, 1.6);
  assert.equal(o.lower.m, Math.floor((1 + 15 / 12) * 0.9 * 10) / 10); // 2.02 → 2.0
  const edge = donOdds(1, deck, CONFIG);
  assert.equal(edge.lower.m, 0, 'нижче одиниці не буває — опція недоступна');
});

test('подвій: вгадав — платить суперник, з обмеженням maxWin', () => {
  let s = donGame(['w4', 'w9']);
  s = run(s, [act('donStart', 0), act('don', 0, { guess: 'higher' })]);
  const a = s.result.don.attempts[0];
  assert.equal(a.outcome, 'win');
  const want = Math.min(Math.max(1, Math.floor(5 * (a.m - 1))), CONFIG.don.maxWin);
  assert.equal(a.delta, want);
  assert.equal(s.players[0].chips, 105 + want);
  assert.equal(s.players[1].chips, 95 - want);
  assert.equal(s.result.don.done, true, 'у раунді 1 — лише одна спроба');
  assert.equal(total(s), 200);
  // обмеження maxWin
  let big = donGame(['w4', 'w9'], { config: { don: { ...CONFIG.don, maxWin: 1 } } });
  big = run(big, [act('donStart', 0), act('don', 0, { guess: 'higher' })]);
  assert.equal(big.result.don.attempts[0].delta, 1);
});

test('подвій: не вгадав — ставка йде в банк наступного раунду (джекпот)', () => {
  let s = donGame(['w5', 'w9']);
  s = run(s, [act('donStart', 0), act('don', 0, { guess: 'lower' })]);
  assert.equal(s.result.don.attempts[0].outcome, 'lose');
  assert.equal(s.players[0].chips, 100, 'втрачено лише чистий виграш');
  assert.equal(s.players[1].chips, 95);
  assert.equal(s.pot, 5);
  assert.equal(s.jackpot, 5);
  assert.equal(total(s), 200);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.round, 2);
  assert.equal(s.pot, 5 + 10, 'джекпот + анте');
  assert.equal(s.jackpot, 5);
  assert.equal(viewFor(s, 1, 0).jackpot, 5);
});

test('подвій: рівне значення — ставка повертається', () => {
  let s = donGame(['w5', 's5']);
  s = run(s, [act('donStart', 0), act('don', 0, { guess: 'higher' })]);
  assert.equal(s.result.don.attempts[0].outcome, 'push');
  assert.equal(s.players[0].chips, 105);
  assert.equal(s.result.don.stake, 5);
  assert.equal(total(s), 200);
});

test('подвій: спецкарти при відкритті пропускаються', () => {
  let s = donGame(['knife', 'w5', 'mirror', 'w9']);
  s = run(s, [act('donStart', 0)]);
  assert.equal(s.result.don.pending.base.id, 'w5');
  s = run(s, [act('don', 0, { guess: 'higher' })]);
  assert.equal(s.result.don.attempts[0].card.id, 'w9');
});

test('подвій: друга спроба поспіль лише з 6-го раунду; відмова після бази дозволена', () => {
  let s = donGame(['w4', 'w9', 'w6', 'w10']);
  s.round = CONFIG.don.secondFromRound; // імітуємо пізній раунд
  // перерахуємо доступну кількість спроб, як це робить enterResult
  s.result.don.maxAttempts = 2;
  s = run(s, [act('donStart', 0), act('don', 0, { guess: 'higher' })]);
  assert.equal(s.result.don.done, false);
  assert.ok(legalActions(s, 0).some((a) => a.type === 'donStart'));
  s = run(s, [act('donStart', 0), act('ready', 0)]);
  assert.equal(s.result.don.pending, null);
  assert.equal(s.result.don.done, true);
  assert.equal(total(s), 200);
  // реальний раунд 6
  let late = newGame(HANDS);
  late.round = 5;
  late = run(late, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, ...showdownCheck, act('ready', 0), act('ready', 1)]);
  assert.equal(late.round, 6);
  const [a, b] = [late.players[0].hand[0].id, late.players[1].hand[0].id];
  late = run(late, [play(0, a), play(1, b), ...skipBoth, act('check', 1), act('check', 0)]);
  if (late.result.don) assert.equal(late.result.don.maxAttempts, 2);
  else assert.equal(late.result.winner, null);
});

test('подвій після пасу: база окрема, карту переможця не розкриває', () => {
  let s = newGame([...HANDS, 'w5', 'w9']);
  s = run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, act('raise', 0, { amount: 5 }), act('fold', 1)]);
  assert.equal(s.result.don.stake, 5);
  s = run(s, [act('donStart', 0), act('don', 0, { guess: 'higher' })]);
  assert.equal(viewFor(s, 1, 0).opp.played, null);
});

test('кінець за раундами: довжина 8 / 12 / 16, фішки не зникають', () => {
  for (const maxRounds of CONFIG.roundOptions) {
    let s = newGame([], { config: { maxRounds } });
    for (let r = 1; r <= maxRounds; r++) {
      assert.equal(s.round, r);
      s = run(s, [play(0, s.players[0].hand[0].id), play(1, s.players[1].hand[0].id)]);
      s = run(s, [0, 1].filter((p) => s.phase === 'scout' && !s.players[p].scoutDecided).map((p) => act('skipScout', p)));
      const first = s.bet.toAct;
      s = run(s, [act('check', first), act('check', 1 - first), act('ready', 0), act('ready', 1)]);
      assert.equal(total(s), 200);
      if (s.phase === 'over') break;
    }
    assert.equal(s.phase, 'over');
    const [a, b] = s.players.map((p) => p.chips);
    assert.equal(s.winner, a === b ? 'draw' : a > b ? 0 : 1);
  }
});

test('з 0 фішок при перенесеному банку гра триває', () => {
  let s = newGame(['double', 'w3', 's2', 's9', 'f5', 'f3', 's6', 's8']);
  s.players[0].chips = 0;
  s = run(s, [play(0, 'double'), play(1, 'f5'), act('skipScout', 1), ...showdownCheck, act('ready', 0), act('ready', 1)]);
  assert.equal(s.phase, 'play');
  assert.equal(s.players[0].chips, 0);
});

test('таймери: тайм-аут грає випадкову карту, пауза зупиняє час', () => {
  let s = createGame({ deck: stackedDeck(HANDS), firstToAct: 0, core: 'single' }, ctx(1000));
  assert.equal(s.timer.deadline, 1000 + CONFIG.timers.play * 1000);
  assert.equal(reduce(s, { type: 'timeout' }, ctx(2000)).error, 'not-expired');
  s = run(s, [{ type: 'pause' }], ctx(6000));
  assert.equal(s.timer.remaining, 15000);
  assert.equal(reduce(s, { type: 'timeout' }, ctx(999999)).ok, false);
  s = run(s, [{ type: 'resume' }], ctx(100000));
  assert.equal(s.timer.deadline, 115000);
  s = run(s, [play(0, 'f7'), { type: 'timeout' }], ctx(115000));
  assert.ok(s.players[1].played);
  assert.equal(s.phase, 'scout');
});

test('тайм-аут на виборі «подвоєння» — ставка лишається, раунд іде далі', () => {
  let s = createGame({ deck: stackedDeck([...HANDS, 'w5', 'w9']), firstToAct: 0, core: 'single', config: { features: { trump: false } } }, ctx(0));
  s = run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, ...showdownCheck, act('donStart', 0)], ctx(0));
  s = run(s, [{ type: 'timeout' }], ctx(10 ** 7));
  assert.equal(s.round, 2);
  assert.equal(s.players[0].chips + s.players[1].chips + s.pot, 200);
  assert.equal(s.players[0].chips, 105 - 5);
});

test('приховування: суперник ніколи не отримує чужих карт', () => {
  let s = newGame([...HANDS, 'w10'], { trumps: ['fire'] });
  const check = (st) => {
    const json = JSON.stringify(viewFor(st, 1, 0));
    for (const c of [...st.players[0].hand, st.players[0].played].filter(Boolean)) {
      const visible = st.players[0].played?.id === c.id && (st.result?.revealed || st.players[0].shown);
      if (!visible) assert.equal(json.includes(`"${c.id}"`), false, `P1 бачить ${c.id} у фазі ${st.phase}`);
    }
    assert.equal(json.includes('"s2"'), false, 'скинуту при обміні карту не видно');
    assert.equal(json.includes('bluff'), false);
  };
  check(s);
  s = run(s, [act('swap', 0, { cardId: 's2' })]); check(s);
  s = run(s, [play(0, 'w3')]); check(s);
  s = run(s, [play(1, 's8')]); check(s);
  s = run(s, [act('scout', 1)]); check(s);
  s = run(s, [act('skipScout', 0)]); check(s);
  s = run(s, [act('raise', 0, { amount: 5 })]); check(s);
  s = run(s, [act('fold', 1)]); check(s);
  assert.equal(viewFor(s, 1, 0).opp.handCount, 3);
});

test('лічильник колоди: високі / низькі / спец', () => {
  const s = newGame(HANDS);
  const d = viewFor(s, 0, 0).deck;
  assert.equal(d.total, 25);
  assert.equal(d.high + d.low + d.special, 25);
  assert.equal(d.special, 3);
  // у руках: f7 s9 w7 s8 — високі (4); w3 s2 f3 s5 — низькі (4)
  assert.equal(d.high, 15 - 4);
  assert.equal(d.low, 15 - 4);
});
