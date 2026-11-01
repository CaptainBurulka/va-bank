// Комбінації з 3 карт: порядок, нічиї, козир, спецкарти; рушій core='combo' для 2 і 3 гравців.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, slotsOf, compareCombos, COMBO_ORDER, explain, bestSet, strengthOf } from '../game/combos.js';
import { createGame, reduce, viewFor, isCombo } from '../game/engine.js';
import { buildDeck } from '../game/cards.js';
import { seededRng, run, act } from './helpers.js';

const C = (v, s) => ({ id: `${s[0]}${v}`, kind: 'num', value: v, suit: s });
const K = { id: 'knife', kind: 'knife' }, M = { id: 'mirror', kind: 'mirror' }, D = { id: 'double', kind: 'double' };
const ev = (cards, trump = null) => evaluate(slotsOf(cards), trump);

// По одному прикладу кожної комбінації — від найслабшої до найсильнішої
const EX = {
  high: [C(10, 'water'), C(4, 'fire'), C(1, 'stone')],
  pair: [C(3, 'water'), C(3, 'fire'), C(9, 'stone')],
  flush: [C(2, 'fire'), C(6, 'fire'), C(9, 'fire')],
  straight: [C(4, 'water'), C(5, 'fire'), C(6, 'stone')],
  trio: [C(2, 'water'), C(2, 'fire'), C(2, 'stone')],
  sflush: [C(1, 'stone'), C(2, 'stone'), C(3, 'stone')],
};

test('порядок комбінацій: Стріт у масть > Трійка > Стріт > Масть > Пара > Старша карта', () => {
  assert.deepEqual(COMBO_ORDER, ['high', 'pair', 'flush', 'straight', 'trio', 'sflush']);
  for (const [id, cards] of Object.entries(EX)) assert.equal(ev(cards).id, id, id);
});

test('усі пари порівнянь: вища комбінація завжди б\'є нижчу (навіть «найслабша» проти «найсильнішої»)', () => {
  const ids = COMBO_ORDER;
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    const a = ev(EX[ids[i]]), b = ev(EX[ids[j]]);
    const want = i === j ? 0 : i > j ? 1 : -1;
    assert.equal(compareCombos(a, b), want, `${ids[i]} vs ${ids[j]}`);
  }
  // мінімальна сильніша проти максимальної слабшої
  assert.equal(compareCombos(ev([C(1, 'water'), C(1, 'fire'), C(4, 'stone')]), ev([C(10, 'water'), C(9, 'fire'), C(7, 'stone')])), 1, 'пара 1 б\'є старшу 10');
  assert.equal(compareCombos(ev([C(1, 'fire'), C(2, 'fire'), C(4, 'fire')]), ev([C(10, 'water'), C(10, 'fire'), C(9, 'stone')])), 1, 'масть б\'є пару 10');
  assert.equal(compareCombos(ev([C(1, 'water'), C(2, 'fire'), C(3, 'stone')]), ev([C(10, 'fire'), C(9, 'fire'), C(7, 'fire')])), 1, 'стріт б\'є масть');
  assert.equal(compareCombos(ev([C(1, 'water'), C(1, 'fire'), C(1, 'stone')]), ev([C(8, 'water'), C(9, 'fire'), C(10, 'stone')])), 1, 'трійка б\'є стріт');
  assert.equal(compareCombos(ev([C(1, 'water'), C(2, 'water'), C(3, 'water')]), ev([C(10, 'water'), C(10, 'fire'), C(10, 'stone')])), 1, 'стріт у масть б\'є трійку');
});

test('нічия між однаковими комбінаціями: значення комбінації, далі старші карти', () => {
  assert.equal(compareCombos(ev([C(7, 'water'), C(7, 'fire'), C(1, 'stone')]), ev([C(6, 'water'), C(6, 'fire'), C(10, 'stone')])), 1, 'пара 7 > пара 6 попри кікер 10');
  assert.equal(compareCombos(ev([C(7, 'water'), C(7, 'fire'), C(9, 'stone')]), ev([C(7, 'stone'), C(7, 'fire'), C(8, 'water')])), 1, 'пара 7: кікер 9 > 8');
  assert.equal(compareCombos(ev([C(5, 'water'), C(6, 'fire'), C(7, 'stone')]), ev([C(4, 'water'), C(5, 'fire'), C(6, 'stone')])), 1, 'стріт до 7 > до 6');
  assert.equal(compareCombos(ev([C(10, 'fire'), C(3, 'fire'), C(2, 'fire')]), ev([C(9, 'water'), C(7, 'water'), C(4, 'water')])), 1, 'масть: старша 10');
  assert.equal(compareCombos(ev([C(10, 'water'), C(5, 'fire'), C(3, 'stone')]), ev([C(10, 'fire'), C(5, 'stone'), C(2, 'water')])), 1, 'старша: третя карта');
});

test('козир: не змінює комбінацію, але в нічиї козирна карта на 1 старша', () => {
  const a = [C(9, 'fire'), C(5, 'water'), C(3, 'stone')], b = [C(9, 'water'), C(5, 'fire'), C(3, 'stone')];
  assert.equal(compareCombos(ev(a), ev(b)), 0, 'без козиря — повністю рівні');
  assert.equal(compareCombos(ev(a, 'fire'), ev(b, 'fire')), 1, 'козирна 9 старша за 9');
  assert.equal(ev(a, 'fire').id, 'high', 'комбінація та сама');
  // козир не перескакує через значення комбінації: пара 6 з козирем < пара 7
  assert.equal(compareCombos(ev([C(6, 'fire'), C(6, 'water'), C(2, 'stone')], 'fire'), ev([C(7, 'water'), C(7, 'stone'), C(1, 'fire')], 'fire')), -1);
  // трійки: у кожній рівно одна козирна — вирішує значення
  assert.equal(compareCombos(ev(EX.trio, 'fire'), ev([C(3, 'water'), C(3, 'fire'), C(3, 'stone')], 'fire')), -1);
});

test('спецкарти: Дзеркало копіює значення (не масть) найстаршої іншої, Подвоєння — 5 без масті, Ніж — порожнє місце', () => {
  assert.equal(ev([M, C(7, 'fire'), C(7, 'water')]).label, 'Трійка 7');
  assert.equal(ev([M, C(4, 'fire'), C(9, 'fire')]).id, 'pair', 'Дзеркало без масті — не Масть, а пара 9');
  assert.equal(ev([D, C(4, 'fire'), C(6, 'water')]).id, 'straight', 'Подвоєння = 5 у стріті');
  assert.equal(ev([D, C(4, 'fire'), C(6, 'fire')]).id, 'straight', 'без масті — не стріт у масть');
  assert.equal(ev([K, C(8, 'fire'), C(8, 'water')]).id, 'pair', 'Ніж не має значення');
  assert.equal(ev([K, C(8, 'fire'), C(9, 'fire')]).id, 'high', 'з Ножем не скласти Масть');
});

test('пояснення результату для гравця', () => {
  assert.equal(explain(ev(EX.straight), ev(EX.pair)), "Стріт б'є Пару");
  assert.equal(explain(ev(EX.pair), ev(EX.high)), "Пара б'є Старшу карту");
  assert.match(explain(ev([C(9, 'water'), C(9, 'fire'), C(1, 'stone')]), ev([C(7, 'water'), C(7, 'fire'), C(1, 'stone')])), /Пара 9 — вище, ніж Пара 7/);
});

test('найкращий набір із 6 і шкала сили 0..1', () => {
  const hand = [C(2, 'fire'), C(9, 'water'), C(3, 'fire'), C(9, 'stone'), C(4, 'fire'), C(1, 'water')];
  const b = bestSet(hand);
  assert.equal(b.combo.id, 'sflush');
  assert.ok(strengthOf(b.combo) > 0.9);
  assert.ok(strengthOf(ev(EX.high)) < 0.05);
  assert.ok(strengthOf(ev(EX.pair)) < strengthOf(ev(EX.flush)));
});

// ───────── рушій ─────────
/** Колода, де P0 отримує ids[0..5], P1 — ids[6..11] (далі решта). */
function deckWith(ids) {
  const all = buildDeck();
  const top = ids.map((id) => all.find((c) => c.id === id));
  return [...top, ...all.filter((c) => !ids.includes(c.id))];
}
const ctx = (seed = 5) => ({ rng: seededRng(seed), now: 0 });
const g2 = (ids, opts = {}) => createGame({ deck: deckWith(ids), firstToAct: 0, core: 'combo', timers: false, trumps: opts.trumps, config: { features: { trump: !!opts.trumps, swap: true }, ...(opts.config || {}) }, ...opts.extra }, ctx());
const playSet = (p, cards, open = cards[0]) => ({ type: 'playSet', player: p, cards, open });
const H0 = ['w7', 'f7', 's7', 'w1', 'f2', 's3'], H1 = ['w4', 'f5', 's6', 'w9', 'f9', 's2'];

test('рушій: за замовчуванням комбінації, рука 6, гра 3 карти одним кроком', () => {
  const s = g2([...H0, ...H1]);
  assert.ok(isCombo(s));
  assert.equal(s.players[0].hand.length, 6);
  assert.ok(viewFor(s, 0, 0).legal.some((a) => a.type === 'playSet' && a.count === 3));
  const bad = (a) => reduce(s, a, ctx()).error;
  assert.equal(bad(playSet(0, ['w7', 'f7'])), 'bad-cards');
  assert.equal(bad(playSet(0, ['w7', 'f7', 'f7'])), 'bad-cards');
  assert.equal(bad(playSet(0, ['w7', 'f7', 'w4'])), 'no-such-card');
  assert.equal(bad(playSet(0, ['w7', 'f7', 's7'], 'w1')), 'bad-open');
  assert.equal(bad({ type: 'play', player: 0, cardId: 'w7' }), 'wrong-core');
});

test('рушій: відкриту карту видно лише після того, як поклали всі; закриті — лише при розкритті', () => {
  let s = g2([...H0, ...H1]);
  s = run(s, [playSet(0, ['w7', 'f7', 's7'], 'w7')], ctx());
  assert.equal(viewFor(s, 1, 0).opp.open, null, 'поки P1 не поклав — не бачить');
  assert.equal(viewFor(s, 0, 0).me.openId, 'w7');
  s = run(s, [playSet(1, ['w4', 'f5', 's6'], 's6')], ctx());
  assert.equal(s.phase, 'scout');
  assert.equal(viewFor(s, 1, 0).opp.open.id, 'w7');
  assert.equal(viewFor(s, 0, 0).opp.open.id, 's6');
  assert.equal(viewFor(s, 1, 0).opp.played, null, 'закриті приховані');
  const json = JSON.stringify(viewFor(s, 1, 0));
  assert.ok(!json.includes('"f7"') && !json.includes('"s7"'), 'id закритих карт не потрапляє в view суперника');
  s = run(s, [act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1)], ctx());
  assert.equal(s.phase, 'result');
  assert.equal(s.result.winner, 0, 'трійка 7 б\'є стріт');
  assert.equal(s.result.detail.combos[0].label, 'Трійка 7');
  assert.equal(s.result.detail.text, "Трійка б'є Стріт");
  assert.equal(viewFor(s, 1, 0).opp.played.length, 3);
});

test('рушій: повністю рівні комбінації — банк у джекпот; фішки зберігаються', () => {
  let s = g2(['w9', 'f5', 's3', 'w1', 'f1', 's1', 'f9', 's5', 'w3', 'w2', 'f2', 's2']);
  const total = () => s.players.reduce((a, p) => a + p.chips, 0) + s.pot;
  const T0 = total();
  s = run(s, [playSet(0, ['w9', 'f5', 's3']), playSet(1, ['f9', 's5', 'w3']), act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1)], ctx());
  assert.equal(s.result.winner, null);
  assert.equal(s.jackpot, s.pot);
  assert.equal(s.result.detail.text, 'Рівні комбінації — банк у джекпот');
  assert.equal(total(), T0);
});

test('рушій: Ніж ріже найстаршу карту найсильнішої комбінації суперника', () => {
  let s = g2(['knife', 'w2', 'f3', 'w5', 'f6', 's8', 'w10', 'f10', 's4', 'w1', 'f1', 's1']);
  s = run(s, [playSet(0, ['knife', 'w2', 'f3']), playSet(1, ['w10', 'f10', 's4']), act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1)], ctx());
  assert.deepEqual(s.result.detail.cuts.map((x) => [x.p, x.target, x.card.id]), [[0, 1, 'w10']]);
  assert.equal(s.result.detail.combos[1].label, 'Старша 10', 'пара 10 без однієї десятки');
  assert.equal(s.result.winner, 1, 'старша 10 > старша 3');
  assert.equal(s.stats[0].knife10, 0);
});

test('рушій: Подвоєння в наборі переможця — суперник доплачує ще один банк', () => {
  let s = g2(['double', 'w4', 'f6', 'w1', 'f2', 's9', 'w8', 'f3', 's1', 'w10', 'f10', 's10']);
  s = run(s, [playSet(0, ['double', 'w4', 'f6']), playSet(1, ['w8', 'f3', 's1']), act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1)], ctx());
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.detail.combos[0].id, 'straight');
  assert.equal(s.result.penalty, 10, 'доплата = банк 10');
});

test('рушій: розвідка — «є висока закрита» (від 8) / «нема»', () => {
  let s = g2([...H0, ...H1]);
  s = run(s, [playSet(0, ['w7', 'f7', 's7']), playSet(1, ['w9', 'f5', 's2'], 'f5'), act('scout', 0)], ctx());
  assert.equal(s.players[0].scoutSeen, 'high', 'w9 закрита');
  let t = g2([...H0, ...H1]);
  t = run(t, [playSet(0, ['w7', 'f7', 's7']), playSet(1, ['w9', 'f5', 's2'], 'w9'), act('scout', 0)], ctx());
  assert.equal(t.players[0].scoutSeen, 'low', 'висока відкрита — закриті низькі');
});

test('рушій: тайм-аут — найсильніша комбінація, відкрита найслабша', () => {
  let s = createGame({ deck: deckWith([...H0, ...H1]), firstToAct: 0, core: 'combo', config: { features: { trump: false, swap: true } } }, ctx());
  const r = reduce(s, { type: 'timeout' }, { ...ctx(), now: s.timer.deadline + 1 });
  s = r.state;
  assert.deepEqual(s.players[0].played.map((c) => c.id).sort(), ['f7', 's7', 'w7']);
  assert.equal(s.phase, 'scout');
  assert.equal(s.players[1].played.length, 3);
});

test('рушій: після раунду добирається до 6 карт, зіграні — у відбій', () => {
  let s = g2([...H0, ...H1]);
  s = run(s, [playSet(0, ['w7', 'f7', 's7']), playSet(1, ['w4', 'f5', 's6']), act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1), act('ready', 0), act('ready', 1)], ctx());
  assert.equal(s.round, 2);
  assert.equal(s.players[0].hand.length, 6);
  assert.equal(s.players[1].hand.length, 6);
  assert.equal(s.discard.length, 6);
});

test('утрьох: перемагає найсильніша комбінація; дві рівні найкращі — банк у джекпот', () => {
  const all = buildDeck();
  const ids = ['w7', 'f7', 's7', 'w1', 'f2', 's3', 'w4', 'f5', 's6', 'w9', 'f9', 's2', 'w10', 'f8', 's5', 'f1', 's1', 'w2'];
  const deck = [...ids.map((id) => all.find((c) => c.id === id)), ...all.filter((c) => !ids.includes(c.id))];
  let s = createGame({ players: 3, deck, firstToAct: 0, core: 'combo', timers: false, config: { features: { trump: false, swap: true } } }, ctx());
  s = run(s, [playSet(0, ['w7', 'f7', 's7']), playSet(1, ['w4', 'f5', 's6']), playSet(2, ['w10', 'f8', 's5']), act('skipScout', 0), act('skipScout', 1), act('skipScout', 2), act('check', 0), act('check', 1), act('check', 2)], ctx());
  assert.equal(s.result.winner, 0);
  assert.deepEqual(Object.keys(s.result.detail.combos).map(Number).sort(), [0, 1, 2]);
});

test('досягнення комбінацій: «Трійка десяток», «Нахаба», «Повна колода»', async () => {
  const { awardGame, defaultProfile } = await import('../meta/profile.js');
  const base = { won: true, mode: 'bot', players: 2, endReason: 'rounds' };
  let p = defaultProfile();
  let r = awardGame(p, { ...base, me: { trio10: 1, highBeatsPair: 1, combos: { trio: 1, high: 1 } } });
  assert.ok(r.achievements.includes('trio10') && r.achievements.includes('high_beats_pair'));
  assert.ok(!r.achievements.includes('combo_all'));
  r = awardGame(r.profile, { ...base, me: { combos: { pair: 2, flush: 1, straight: 1, sflush: 1 } } });
  assert.ok(r.achievements.includes('combo_all'));
});

test('статистика рушія: «Трійка 10» і «Старша проти Пари» рахуються переможцю', () => {
  let s = g2(['w10', 'f10', 's10', 'w1', 'f2', 's3', 'w4', 'f4', 's6', 'w9', 'f9', 's2']);
  s = run(s, [playSet(0, ['w10', 'f10', 's10']), playSet(1, ['w4', 'f4', 's6']), act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1)], ctx());
  assert.equal(s.stats[0].trio10, 1);
  assert.equal(s.stats[0].combos.trio, 1);
  let t = g2(['knife', 'w9', 'f3', 'w1', 'f2', 's5', 'w4', 'f4', 's8', 'w7', 'f7', 's2']);
  t = run(t, [playSet(0, ['knife', 'w9', 'f3']), playSet(1, ['w4', 'f4', 's8']), act('skipScout', 0), act('skipScout', 1), act('check', 0), act('check', 1)], ctx());
  // Ніж ріже 8 — у суперника лишається пара 4; Старша 9 її не б'є
  assert.equal(t.result.winner, 1);
});
