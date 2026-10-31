import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOKERS, JOKER_BY_ID } from '../game/jokers.js';
import { reduce, viewFor, legalActions } from '../game/engine.js';
import { JOKER_TUNING as T } from '../config.js';
import { newGame, run, play, act, ctx } from './helpers.js';

const total = (s) => s.players[0].chips + s.players[1].chips + s.pot;
const skips = (s) => [0, 1].filter((p) => s.phase === 'scout' && !s.players[p].scoutDecided).map((p) => act('skipScout', p));

/**
 * Розкриття: P0 грає джокера j0 (або карту c0), P1 — карту c1 (або джокера j1).
 * Руки: P0 = h0 (4 карти), P1 = h1; далі колода deck.
 */
function duel({ j0, j1, c0, c1 = 'w7', h0 = ['f7', 'w3', 's2', 's9'], h1 = ['w7', 'f3', 's5', 's8'], deck = [], trumps, bets, scout1 = false, setup }) {
  let s = newGame([...h0, ...h1, ...deck], { jokerSets: [j0 ? [j0] : [], j1 ? [j1] : []], jokerRound: 1, trumps });
  setup?.(s);
  s = run(s, [play(0, c0 || `J0-${j0}`), play(1, j1 ? `J1-${j1}` : c1)]);
  if (scout1 && s.phase === 'scout') s = run(s, [act('scout', 1)]);
  s = run(s, skips(s));
  s = run(s, bets || [act('check', 0), act('check', 1)]);
  assert.equal(total(s), 200, 'фішки не з\'являються і не зникають');
  return s;
}
const notes = (s) => s.result.jokers.notes.map((n) => n.text).join(' | ');

test('каталог: 36 джокерів, рідкості 14/10/7/5, у кожного опис в один рядок', () => {
  assert.equal(JOKERS.length, 36);
  const by = {};
  for (const j of JOKERS) by[j.rarity] = (by[j.rarity] || 0) + 1;
  assert.deepEqual(by, { common: 14, rare: 10, epic: 7, legendary: 5 });
  for (const j of JOKERS) {
    assert.ok(j.desc && !j.desc.includes('\n') && j.desc.length < 90, j.id);
    assert.ok(j.icon && j.name, j.id);
  }
});

test('роздача: обидва отримують джокера в той самий раунд, суперник бачить лише факт', () => {
  let s = newGame([], { jokerSets: [['thief'], ['storm']], jokerRound: 2 });
  assert.equal(s.players[0].hand.length, 4);
  s = run(s, [play(0, s.players[0].hand[0].id), play(1, s.players[1].hand[0].id), ...skips(s)]);
  s = run(s, skips(s));
  s = run(s, [act('check', s.bet.toAct), act('check', 1 - s.bet.toAct), act('ready', 0), act('ready', 1)]);
  assert.equal(s.round, 2);
  assert.ok(s.players[0].hand.some((c) => c.id === 'J0-thief'));
  assert.ok(s.players[1].hand.some((c) => c.id === 'J1-storm'));
  const v1 = viewFor(s, 1, 0);
  assert.equal(v1.opp.jokerInHand, true);
  assert.equal(JSON.stringify(v1).includes('thief'), false, 'чужого джокера не видно');
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'swap' && a.cardId === 'J0-thief'), 'джокера не можна обміняти');
});

test('без набору джокерів гра незмінна (jokerRound не призначається)', () => {
  const s = newGame([]);
  assert.equal(s.jokerRound, null);
});

test('джокер згорає: після раунду не повертається в колоду, при пасі ефекту немає', () => {
  let s = newGame(['f7', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8'], { jokerSets: [['thief'], []], jokerRound: 1 });
  s = run(s, [play(0, 'J0-thief'), play(1, 'w7'), ...skips(s)]);
  s = run(s, skips(s));
  s = run(s, [act('raise', 0, { amount: 5 }), act('fold', 1)]);
  assert.equal(s.result.jokers, undefined, 'при пасі джокер не спрацював');
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.ok(![...s.deck, ...s.discard].some((c) => c.kind === 'joker'));
  assert.equal(total(s), 200);
});

// ───────── кожен джокер ─────────
test('Перевертень: перемагає менша карта', () => { const s = duel({ j0: 'turncoat', c1: 's8' }); assert.equal(s.result.winner, 0); });
test('Рулетка: сила 1–12', () => {
  const s = duel({ j0: 'roulette' });
  const v = Number(notes(s).match(/сила (\d+)/)[1]);
  assert.ok(v >= 1 && v <= T.roulette.max);
  assert.equal(s.result.winner, v > 7 ? 0 : v < 7 ? 1 : null);
});
test('Злодій: сила 2, але краде 10 за будь-якого результату', () => {
  const s = duel({ j0: 'thief' });
  assert.equal(s.result.winner, 1);
  assert.equal(s.players[0].chips, 95 + T.thief.steal);
  assert.equal(s.players[1].chips, 105 - T.thief.steal);
});
test('Важкий кулак: без масті, нічию програє', () => { const s = duel({ j0: 'fist', c1: 'w7' }); assert.equal(s.result.winner, 1); });
test('Страховка: при програші ставка повертається', () => {
  const s = duel({ j0: 'insurance' });
  assert.equal(s.result.winner, 1);
  assert.equal(s.players[0].chips, 100);
});
test('Двійник: копіює випадкову карту з руки', () => { const s = duel({ j0: 'twin' }); const v = Number(notes(s).match(/сила (\d+)/)[1]); assert.ok([7, 3, 2, 9].includes(v)); });
test('Хамелеон: сила + бонус козиря і масть козиря', () => {
  const s = duel({ j0: 'chameleon', c1: 's6', h1: ['s6', 'f3', 's5', 's8'], trumps: ['fire'] });
  assert.equal(s.result.detail.pa, T.chameleon.power + 1);
  assert.equal(s.result.winner, T.chameleon.power + 1 >= 6 ? 0 : 1, 'за рівної сили Вогонь б\'є Камінь');
});
test('Скромник: переміг — суперник доплачує половину банку', () => {
  const s = duel({ j0: 'modest', c1: 'w1', h1: ['w1', 'f3', 's5', 's8'] });
  assert.equal(s.result.winner, 0);
  assert.equal(s.players[0].chips, 95 + 10 + 5);
});
test('Податок: обидва платять у джекпот', () => {
  const s = duel({ j0: 'tax' });
  assert.equal(s.result.winner, 1);
  assert.equal(s.players[0].chips, 95 - T.tax.fee);
  assert.equal(s.jackpot, 2 * T.tax.fee);
  assert.equal(s.pot, 2 * T.tax.fee);
});
test('Кості: сума двох кубиків', () => { const s = duel({ j0: 'dice' }); const m = notes(s).match(/(\d)\+(\d)/); assert.ok(m); });
test('Рахівник: сила = номер раунду + бонус', () => { const s = duel({ j0: 'counter' }); assert.match(notes(s), new RegExp(`сила ${1 + T.counter.plus}\\b`)); assert.equal(s.result.winner, 1); });
test('Нахаба: програв — доплачує', () => {
  const s = duel({ j0: 'brazen', c1: 's8' });
  assert.equal(s.result.winner, 1);
  assert.equal(s.players[0].chips, 95 - T.brazen.fine);
});
test('Магніт: тягне силу суперника до своєї', () => { const s = duel({ j0: 'magnet', c1: 'f3' }); assert.equal(s.result.detail.pb, Math.round((3 + T.magnet.power) / 2)); assert.equal(s.result.winner, 0); });
test('Спокуса: переміг — 25% виграшу в джекпот', () => {
  const s = duel({ j0: 'temptation', c1: 'f3' });
  assert.equal(s.result.winner, 0);
  assert.equal(s.jackpot, Math.floor((10 * T.temptation.pct) / 100));
});
test('Буря: обидві карти — з колоди', () => { const s = duel({ j0: 'storm', deck: ['w10', 'f2'] }); assert.equal(s.result.jokers.cards[0].id, 'w10'); assert.equal(s.result.winner, 0); });
test('Обмін: забираєш карту суперника', () => { const s = duel({ j0: 'swap', deck: ['f2'] }); assert.equal(s.result.jokers.cards[0].id, 'w7'); assert.equal(s.result.winner, 0); });
test('Тінь: сила 6, а якщо підглядали — 10', () => {
  assert.equal(duel({ j0: 'shadow' }).result.winner, 1);
  assert.equal(duel({ j0: 'shadow', scout1: true }).result.winner, 0);
});
test('Пастка: суперник піднімав — ти перемагаєш', () => {
  const s = duel({ j0: 'trap', bets: [act('check', 0), act('raise', 1, { amount: 5 }), act('call', 0)] });
  assert.equal(s.result.winner, 0);
  assert.equal(duel({ j0: 'trap' }).result.winner, 1);
});
test('Ва-банкір: банк подвоюється', () => { const s = duel({ j0: 'highroller' }); assert.equal(s.result.won, 20); assert.equal(s.players[0].chips, 90); });
test('Кишеньковий: випадкова карта з руки суперника', () => {
  const s = duel({ j0: 'pocket' });
  const c = s.result.jokers.cards[0];
  assert.ok(['f3', 's5', 's8'].includes(c.id));
  assert.equal(s.players[1].hand.length, 2, 'суперник втратив карту');
});
test('Шулер: нічию виграє', () => { assert.equal(duel({ j0: 'sharper', c1: 's5' }).result.winner, 0); });
test('Удача: 10 або 1', () => { const s = duel({ j0: 'luck' }); assert.match(notes(s), /сила (10|1)\b/); });
test('Сміливець: +2 за кожне підняття', () => {
  const s = duel({ j0: 'brave', c1: 's8', bets: [act('raise', 0, { amount: 5 }), act('raise', 1, { amount: 5 }), act('call', 0)] });
  assert.match(notes(s), new RegExp(`сила ${T.brave.power + 2 * T.brave.perRaise}\\b`));
  assert.equal(s.result.winner, 0);
});
test('Анти-козир: козир суперника −1', () => { const s = duel({ j0: 'antitrump', trumps: ['water'] }); assert.equal(s.result.detail.pb, 6); });
test('Вибух: банк — у джекпот', () => {
  let s = duel({ j0: 'boom' });
  assert.equal(s.result.reason, 'void');
  assert.equal(s.jackpot, 10);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.pot, 20);
});
test('Монетка: банк подвоєно, вирішує монетка', () => { const s = duel({ j0: 'coin' }); assert.ok([0, 1].includes(s.result.winner)); assert.equal(s.result.won, 20); });
test('Нова роздача: руки скинуто, карти з колоди', () => {
  const s = duel({ j0: 'redeal', deck: ['w10', 'f2'] });
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[1].hand.length, 0);
  assert.equal(s.result.winner, 0);
});
test('Ехо: повторює джокера суперника або останнього, без них — сила 6', () => {
  assert.equal(duel({ j0: 'echo' }).result.winner, 1);
  assert.match(notes(duel({ j0: 'echo', j1: 'thief' })), /Ехо → Злодій/);
  const s = duel({ j0: 'echo', setup: (st) => { st.lastJoker = 'turncoat'; } });
  assert.match(notes(s), /Ехо → Перевертень/);
  assert.equal(s.result.winner, 0);
});
test('Землетрус: руки перемішуються, кількість зберігається', () => {
  const s = duel({ j0: 'quake', c1: 'f3' });
  assert.equal(s.result.winner, 0);
  assert.equal(s.players[0].hand.length, 4);
  assert.equal(s.players[1].hand.length, 3);
});
test('Рокіровка: обмін зіграними картами', () => { const s = duel({ j0: 'castling', c1: 's8' }); assert.equal(s.result.jokers.cards[0].id, 's8'); assert.equal(s.result.winner, 0); });
test('Ажіотаж: банк утричі', () => { const s = duel({ j0: 'frenzy' }); assert.equal(s.result.won, 30); });
test('Апокаліпсис: половина фішок у банк, монетка', () => {
  const s = duel({ j0: 'apocalypse' });
  assert.equal(s.result.won, 10 + 47 + 47);
  assert.equal(s.stats[0].legendary, 1);
});
test('Назад у часі: ставки повертаються, раунд переграється', () => {
  let s = duel({ j0: 'rewind', bets: [act('raise', 0, { amount: 10 }), act('call', 1)] });
  assert.equal(s.result.reason, 'replay');
  assert.equal(s.players[0].chips, 100);
  assert.equal(s.players[1].chips, 100);
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.round, 1, 'той самий раунд ще раз');
  assert.equal(s.pot, 10);
});
test('Король хаосу: обирає ефект іншого джокера', () => { const s = duel({ j0: 'chaosking' }); assert.match(notes(s), /Король хаосу обрав/); });
test('Дуель: сума трьох карт', () => {
  const s = duel({ j0: 'duel', deck: ['w10', 'w9', 'w8', 'f1', 'f2', 's1'] });
  assert.equal(s.result.detail.pa, 27);
  assert.equal(s.result.winner, 0);
});
test('Задзеркалля: ставки подвоєні, перемагає менша', () => { const s = duel({ j0: 'mirrorworld' }); assert.equal(s.result.winner, 0); assert.equal(s.result.won, 20); });

// ───────── взаємодії ─────────
test('порядок: Вибух скасовує раунд — Злодій суперника не спрацьовує', () => {
  const s = duel({ j0: 'boom', j1: 'thief' });
  assert.equal(s.result.reason, 'void');
  assert.equal(s.players[0].chips, 95);
  assert.equal(s.players[1].chips, 95);
});
test('порядок: заміна карт раніше за силу — Буря «гасить» Рулетку', () => {
  const s = duel({ j0: 'storm', j1: 'roulette', deck: ['w10', 'f2'] });
  assert.ok(!/Рулетка/.test(notes(s)) || s.result.jokers.cards[1].id === 'f2');
  assert.equal(s.result.winner, 0);
});
test('порядок: Рокіровка міняє карти — Кулак тепер у суперника, але його ефект не діє', () => {
  const s = duel({ j0: 'castling', j1: 'fist' });
  assert.equal(s.result.jokers.cards[0].joker, 'fist');
  // сила кулака 7 проти Рокіровки 7; «програє нічию» не діє, бо кулак уже не в господаря
  assert.equal(s.result.winner, T.fist.power === T.castling.power ? null : T.fist.power > T.castling.power ? 0 : 1);
});
test('два Перевертні знімають один одного', () => { const s = duel({ j0: 'turncoat', j1: 'turncoat' }); assert.equal(s.result.winner, null); });
test('два скасування: першою діє нижча рідкість (Вибух раніше за «Назад у часі»)', () => {
  const s = duel({ j0: 'rewind', j1: 'boom' });
  assert.equal(s.result.reason, 'void');
});
test('джокер проти Дзеркала: Дзеркало копіює силу і виграє нічию', () => {
  const s = duel({ j0: 'fist', c1: 'mirror', h1: ['mirror', 'f3', 's5', 's8'] });
  assert.equal(s.result.winner, 1);
});
test('усі пари джокерів: фішки зберігаються, гра не ламається', () => {
  for (const a of JOKERS) for (const b of [JOKERS[(JOKERS.indexOf(a) * 7) % 36], JOKERS[(JOKERS.indexOf(a) * 13 + 5) % 36]]) {
    let s = duel({ j0: a.id, j1: b.id, bets: [act('raise', 0, { amount: 10 }), act('call', 1)] });
    for (const p of [0, 1]) assert.ok(s.players[p].chips >= 0, `${a.id} vs ${b.id}`);
    assert.ok(s.jackpot <= s.pot);
    s = run(s, [act('ready', 0), act('ready', 1)]);
    assert.equal(total(s), 200, `${a.id} vs ${b.id}`);
  }
});
test('розвідка джокера показує його номінальну силу', () => {
  let s = newGame(['f7', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8'], { jokerSets: [['fist'], []], jokerRound: 1 });
  s = run(s, [play(0, 'J0-fist'), play(1, 'w7'), act('scout', 1)]);
  assert.equal(s.players[1].scoutSeen, JOKER_BY_ID.fist.power >= 6 ? 'high' : 'low');
  assert.equal(reduce(s, act('scout', 1), ctx()).ok, false);
});

test('«Назад у часі» не роздає джокерів удруге (регресія із симуляцій)', () => {
  let s = duel({ j0: 'rewind', j1: 'thief' });
  s = run(s, [act('ready', 0), act('ready', 1)]);
  assert.equal(s.round, 1);
  assert.ok(!s.players[0].hand.some((c) => c.kind === 'joker'), 'новий джокер не прийшов');
  assert.equal(s.players[1].hand.filter((c) => c.kind === 'joker').length, 0, 'зіграний Злодій не повернувся');
});
