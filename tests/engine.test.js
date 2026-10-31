import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { buildDeck, compareCards } from '../game/cards.js';
import { reduce, viewFor, legalActions, createGame } from '../game/engine.js';
import { newGame, run, play, act, skipBoth, ctx, stackedDeck } from './helpers.js';

// Руки: P0 = f7 w3 s2 s9, P1 = w7 f3 s5 s8
const HANDS = ['f7', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8'];
const total = (s) => s.players[0].chips + s.players[1].chips + s.pot;

test('колода: 33 карти, унікальні id', () => {
  const d = buildDeck();
  assert.equal(d.length, 33);
  assert.equal(new Set(d.map((c) => c.id)).size, 33);
});

test('старт: анте, по 4 карти, фаза play', () => {
  const s = newGame(HANDS);
  assert.equal(s.phase, 'play');
  assert.equal(s.round, 1);
  assert.equal(s.pot, 2 * CONFIG.ante);
  assert.equal(s.players[0].chips, CONFIG.startChips - CONFIG.ante);
  assert.deepEqual(s.players[0].hand.map((c) => c.id), ['f7', 'w3', 's2', 's9']);
  assert.equal(s.players[1].hand.length, 4);
});

test('масті: Вода > Вогонь > Камінь > Вода', () => {
  const c = (id) => buildDeck().find((x) => x.id === id);
  assert.equal(compareCards(c('w5'), c('f5'), CONFIG), 1);
  assert.equal(compareCards(c('f5'), c('s5'), CONFIG), 1);
  assert.equal(compareCards(c('s5'), c('w5'), CONFIG), 1);
  assert.equal(compareCards(c('f5'), c('w5'), CONFIG), -1);
  assert.equal(compareCards(c('s9'), c('w3'), CONFIG), 1);
});

test('спецкарти: Ніж, Дзеркало, Подвоєння', () => {
  const c = (id) => buildDeck().find((x) => x.id === id);
  assert.equal(compareCards(c('knife'), c('w10'), CONFIG), 1, 'ніж б\'є десятку');
  assert.equal(compareCards(c('s10'), c('knife'), CONFIG), -1);
  assert.equal(compareCards(c('knife'), c('w1'), CONFIG), -1, 'ніж має силу 0');
  assert.equal(compareCards(c('mirror'), c('w10'), CONFIG), 0, 'дзеркало — нічия');
  assert.equal(compareCards(c('knife'), c('mirror'), CONFIG), 0);
  assert.equal(compareCards(c('double'), c('f4'), CONFIG), 1, 'подвоєння = 5');
  assert.equal(compareCards(c('double'), c('f6'), CONFIG), -1);
  assert.equal(compareCards(c('double'), c('f5'), CONFIG), 0);
  assert.equal(compareCards(c('double'), c('knife'), CONFIG), 1);
});

test('чек-чек → розкриття, переможець забирає банк', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 'f7'), play(1, 'w7'), ...skipBoth]);
  assert.equal(s.phase, 'bet');
  assert.equal(s.bet.toAct, 0);
  s = run(s, [act('check', 0), act('check', 1)]);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 1, 'w7 б\'є f7');
  assert.equal(s.result.revealed, true);
  assert.equal(s.players[1].chips, 105);
  assert.equal(s.players[0].chips, 95);
  assert.equal(s.pot, 0);
  assert.equal(s.lastLoser, 0);
});

test('торги: підняття, ре-рейз, колл; ліміт піднять', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth]);
  s = run(s, [act('raise', 0, { amount: 5 })]);
  assert.equal(s.pot, 15);
  assert.equal(s.bet.toCall, 5);
  assert.ok(!legalActions(s, 1).some((a) => a.type === 'check'));
  s = run(s, [act('raise', 1, { amount: 10 })]); // колл 5 + 10
  assert.equal(s.pot, 30);
  assert.equal(s.players[1].chips, 80);
  assert.equal(s.bet.raises, 2);
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'raise'), 'максимум 2 підняття');
  assert.equal(reduce(s, act('raise', 0, { amount: 5 }), ctx()).ok, false);
  s = run(s, [act('call', 0)]);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.won, 40);
  assert.equal(s.players[0].chips, 120);
  assert.equal(total(s), 200);
});

test('хост валідує: не твій хід, чужа карта, невірна сума', () => {
  let s = newGame(HANDS);
  assert.equal(reduce(s, play(0, 'w7'), ctx()).error, 'no-such-card');
  assert.equal(reduce(s, act('check', 0), ctx()).error, 'wrong-phase');
  s = run(s, [play(0, 'f7')]);
  assert.equal(reduce(s, play(0, 'w3'), ctx()).error, 'already-played');
  s = run(s, [play(1, 'w7'), ...skipBoth]);
  assert.equal(reduce(s, act('check', 1), ctx()).error, 'not-your-turn');
  assert.equal(reduce(s, act('raise', 0, { amount: 7 }), ctx()).error, 'bad-amount');
  assert.equal(reduce(s, act('call', 0), ctx()).error, 'nothing-to-call');
  assert.equal(reduce(s, { type: 'check', player: 5 }, ctx()).error, 'bad-player');
});

test('ва-банк обмежений фішками суперника', () => {
  let s = newGame(HANDS);
  s.players[1].chips = 30;
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth]);
  const allin = legalActions(s, 0).find((a) => a.amount === 'allin');
  assert.equal(allin.value, 30);
  s = run(s, [act('raise', 0, { amount: 'allin' })]);
  assert.equal(s.players[0].chips, 95 - 30);
  assert.ok(!legalActions(s, 1).some((a) => a.type === 'raise'), 'немає чим ре-рейзити');
  s = run(s, [act('call', 1)]);
  assert.equal(s.players[1].chips, 0);
  assert.equal(s.result.winner, 0);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.phase, 'over');
  assert.equal(s.endReason, 'bankrupt');
  assert.equal(s.winner, 0);
});

test('пас: суперник забирає банк без розкриття, блеф рахується', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's2'), play(1, 's8'), ...skipBoth]);
  s = run(s, [act('raise', 0, { amount: 10 }), act('fold', 1)]);
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.reason, 'fold');
  assert.equal(s.result.revealed, false);
  assert.equal(s.players[0].chips, 95 - 10 + 20);
  assert.equal(s.stats[0].bluffs, 1, 's2 слабша за s8 — вдалий блеф');
  // Карту P0 суперник не бачить
  assert.equal(viewFor(s, 1, 0).opp.played, null);
  // Хизування: показати карту
  s = run(s, [act('show', 0)]);
  assert.equal(viewFor(s, 1, 0).opp.played.id, 's2');
  assert.equal(viewFor(s, 0, 0).opp.played, null, 'P1 свою не показував');
});

test('нічия: банк переходить у наступний раунд', () => {
  let s = newGame(['mirror', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8']);
  s = run(s, [play(0, 'mirror'), play(1, 'w7'), ...skipBoth, act('check', 0), act('check', 1)]);
  assert.equal(s.result.winner, null);
  assert.equal(s.pot, 10);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.round, 2);
  assert.equal(s.carry, 10);
  assert.equal(s.pot, 20, 'перенесений банк + нове анте');
  assert.equal(s.firstToAct, 0, 'при нічиїй першим ходить той самий');
  assert.equal(s.players[0].hand.length, 4);
});

test('першим ходить той, хто програв минулий раунд', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 's9'), play(1, 's8'), ...skipBoth, act('check', 0), act('check', 1)]);
  assert.equal(s.result.winner, 0);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  s = run(s, [play(0, s.players[0].hand[0].id), play(1, s.players[1].hand[0].id), ...skipBoth]);
  assert.equal(s.bet.toAct, 1);
});

test('Подвоєння: програвший доплачує суму банку', () => {
  let s = newGame(['double', 'w3', 's2', 's9', 'w4', 'f3', 's5', 's8']);
  s = run(s, [play(0, 'double'), play(1, 'w4'), ...skipBoth, act('raise', 0, { amount: 10 }), act('call', 1)]);
  // банк = 10 + 20 = 30; штраф = 30
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.penalty, 30);
  assert.equal(s.result.won, 60);
  assert.equal(s.players[1].chips, 100 - 5 - 10 - 30);
  assert.equal(total(s), 200);
});

test('Подвоєння: штраф обмежений тим, що є в програвшого', () => {
  let s = newGame(['double', 'w3', 's2', 's9', 'w4', 'f3', 's5', 's8']);
  s.players[1].chips = 3; // не вистачає на розвідку
  s = run(s, [play(0, 'double'), play(1, 'w4'), act('skipScout', 0), act('check', 0), act('check', 1)]);
  assert.equal(s.result.penalty, 3);
  assert.equal(s.players[1].chips, 0);
});

test('Ніж б\'є десятку в розкритті', () => {
  let s = newGame(['knife', 'w3', 's2', 's9', 'w10', 'f3', 's5', 's8']);
  s = run(s, [play(0, 'knife'), play(1, 'w10'), ...skipBoth, act('check', 0), act('check', 1)]);
  assert.equal(s.result.winner, 0);
});

test('розвідка: платиш 4, бачиш лише масть, суперник бачить факт', () => {
  let s = newGame(HANDS);
  s = run(s, [play(0, 'f7'), play(1, 'w7')]);
  assert.equal(s.phase, 'scout');
  s = run(s, [act('scout', 0)]);
  assert.equal(s.players[0].chips, 91);
  assert.equal(s.pot, 14);
  const v0 = viewFor(s, 0, 0);
  assert.equal(v0.me.scoutSeen, 'water');
  assert.equal(v0.opp.played, null, 'значення не видно');
  const v1 = viewFor(s, 1, 0);
  assert.equal(v1.opp.scouted, true, 'суперник бачить, що за ним підглядали');
  assert.equal(v1.me.scoutSeen, null);
  assert.equal(JSON.stringify(v1).includes('"f7"'), false);
  assert.equal(reduce(s, act('scout', 0), ctx()).error, 'already-decided');
  s = run(s, [act('skipScout', 1)]);
  assert.equal(s.phase, 'bet');
});

test('розвідка спецкарти показує «special»', () => {
  let s = newGame(['f7', 'w3', 's2', 's9', 'knife', 'f3', 's5', 's8']);
  s = run(s, [play(0, 'f7'), play(1, 'knife'), act('scout', 0)]);
  assert.equal(s.players[0].scoutSeen, 'special');
});

test('розвідка недоступна без фішок', () => {
  let s = newGame(HANDS);
  s.players[0].chips = 3;
  s = run(s, [play(0, 'f7'), play(1, 'w7')]);
  assert.equal(s.players[0].scoutDecided, true);
  assert.equal(reduce(s, act('scout', 0), ctx()).ok, false);
});

// Колода: після 8 карт рук верх колоди = наступні id
function donGame(next) {
  return newGame([...HANDS, ...next]);
}

test('подвій або нічого: вгадав — виграш ×2, максимум 2 рази', () => {
  let s = donGame(['w9', 'f1', 's6']);
  s = run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, act('check', 0), act('check', 1)]);
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.don.stake, 10);
  assert.equal(reduce(s, act('don', 1, { guess: 'higher' }), ctx()).error, 'not-winner');
  s = run(s, [act('don', 0, { guess: 'higher' })]); // w9 > 7
  assert.equal(s.result.don.stake, 20);
  assert.equal(s.players[0].chips, 95 + 10 + 10);
  s = run(s, [act('don', 0, { guess: 'lower' })]); // f1 < 7
  assert.equal(s.result.don.stake, 40);
  assert.equal(s.result.don.done, true);
  assert.equal(s.players[0].chips, 135);
  assert.equal(s.players[1].chips, 65);
  assert.equal(s.stats[0].donWon, 2);
  assert.equal(reduce(s, act('don', 0, { guess: 'lower' }), ctx()).error, 'don-unavailable');
  // суперник бачить усе наживо
  const v1 = viewFor(s, 1, 0);
  assert.equal(v1.result.don.attempts.length, 2);
  assert.equal(v1.result.don.attempts[0].card.id, 'w9');
});

test('подвій або нічого: не вгадав — виграш забирає суперник', () => {
  let s = donGame(['w9']);
  s = run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, act('check', 0), act('check', 1)]);
  s = run(s, [act('don', 0, { guess: 'lower' })]); // w9 не менше 7
  assert.equal(s.result.don.done, true);
  assert.equal(s.result.don.stake, 0);
  assert.equal(s.players[0].chips, 95);
  assert.equal(s.players[1].chips, 105);
  assert.equal(s.stats[0].donLost, 1);
  assert.equal(total(s), 200);
});

test('подвій або нічого: рівне значення — програш', () => {
  let s = donGame(['w7']);
  s = run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, act('check', 0), act('check', 1)]);
  s = run(s, [act('don', 0, { guess: 'higher' })]);
  assert.equal(s.result.don.attempts[0].win, false);
});

test('подвій після пасу розкриває карту переможця', () => {
  let s = donGame(['w9']);
  s = run(s, [play(0, 'f7'), play(1, 'f3'), ...skipBoth, act('fold', 0)]);
  assert.equal(s.result.winner, 1);
  assert.equal(viewFor(s, 0, 0).opp.played, null);
  s = run(s, [act('don', 1, { guess: 'higher' })]);
  assert.equal(viewFor(s, 0, 0).opp.played.id, 'f3');
});

test('кінець за раундами: 12 раундів, більше фішок перемагає', () => {
  let s = newGame([]);
  for (let r = 1; r <= CONFIG.maxRounds; r++) {
    assert.equal(s.round, r);
    s = run(s, [play(0, s.players[0].hand[0].id), play(1, s.players[1].hand[0].id), ...skipBoth]);
    const first = s.bet.toAct;
    s = run(s, [act('check', first), act('check', 1 - first), act('ready', 0), act('ready', 1)]);
    assert.equal(total(s), 200, 'фішки не зникають');
  }
  assert.equal(s.phase, 'over');
  assert.equal(s.endReason, 'rounds');
  const [a, b] = s.players.map((p) => p.chips);
  assert.equal(s.winner, a === b ? 'draw' : a > b ? 0 : 1);
  assert.ok(viewFor(s, 0, 0).stats, 'статистика видна в кінці');
});

test('банкрут програє', () => {
  let s = newGame(HANDS);
  s.players[0].chips = 0; // анте вже сплачено
  s = run(s, [play(0, 'f7'), play(1, 'w7'), act('skipScout', 1), act('check', 0), act('check', 1)]);
  assert.equal(s.players[0].chips, 0);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 1);
  assert.equal(s.endReason, 'bankrupt');
});

test('з 0 фішок при перенесеному банку гра триває', () => {
  let s = newGame(['mirror', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8']);
  s.players[0].chips = 0;
  s = run(s, [play(0, 'mirror'), play(1, 'w7'), act('skipScout', 1), act('check', 0), act('check', 1), act('ready', 0), act('ready', 1)]);
  assert.equal(s.phase, 'play');
  assert.equal(s.players[0].chips, 0);
});

test('таймери: тайм-аут грає випадкову карту, пауза зупиняє час', () => {
  let s = createGame({ deck: stackedDeck(HANDS), firstToAct: 0 }, ctx(1000));
  assert.equal(s.timer.deadline, 1000 + CONFIG.timers.play * 1000);
  assert.equal(reduce(s, { type: 'timeout' }, ctx(2000)).error, 'not-expired');
  s = run(s, [{ type: 'pause' }], ctx(6000));
  assert.equal(s.timer.paused, true);
  assert.equal(s.timer.remaining, 15000);
  assert.equal(reduce(s, { type: 'timeout' }, ctx(999999)).ok, false, 'на паузі тайм-аут не спрацьовує');
  s = run(s, [{ type: 'resume' }], ctx(100000));
  assert.equal(s.timer.deadline, 115000);
  s = run(s, [play(0, 'f7'), { type: 'timeout' }], ctx(115000));
  assert.ok(s.players[1].played, 'випадкова карта');
  assert.equal(s.players[1].hand.length, 3);
  assert.equal(s.phase, 'scout');
});

test('тайм-аут у торгах: чек, а при боргу — пас', () => {
  let s = createGame({ deck: stackedDeck(HANDS), firstToAct: 0 }, ctx(0));
  s = run(s, [play(0, 'f7'), play(1, 'w7'), ...skipBoth], ctx(0));
  s = run(s, [{ type: 'timeout' }], ctx(10 ** 6));
  assert.equal(s.bet.toAct, 1);
  s = run(s, [act('raise', 1, { amount: 5 })], ctx(10 ** 7));
  s = run(s, [{ type: 'timeout' }], ctx(10 ** 8));
  assert.equal(s.result.reason, 'fold');
  assert.equal(s.result.winner, 1);
});

test('приховування: суперник ніколи не отримує чужих карт', () => {
  let s = newGame(HANDS);
  const hidden1 = ['f7', 'w3', 's2', 's9'];
  const check = (st) => {
    const json = JSON.stringify(viewFor(st, 1, 0));
    for (const id of hidden1) {
      const visible = st.players[0].played?.id === id && (st.result?.revealed || st.players[0].shown);
      if (!visible) assert.equal(json.includes(`"${id}"`), false, `P1 бачить ${id} у фазі ${st.phase}`);
    }
    assert.equal(json.includes('"deck"'), false);
    assert.equal(json.includes('bluff'), false);
  };
  check(s);
  s = run(s, [play(0, 's2')]); check(s);
  s = run(s, [play(1, 's8')]); check(s);
  s = run(s, [act('scout', 1)]); check(s);
  s = run(s, [act('skipScout', 0)]); check(s);
  s = run(s, [act('raise', 0, { amount: 5 })]); check(s);
  s = run(s, [act('fold', 1)]); check(s);
  const v = viewFor(s, 1, 0);
  assert.equal(v.opp.handCount, 3);
  assert.equal(v.me.hand.length, 3);
});
