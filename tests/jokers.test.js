// Джокери в грі комбінаціями з 3 карт: каталог, роздача, кожен джокер, порядок спрацювання, фішки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOKERS, JOKER_BY_ID, JOKER_TYPES, JOKER_ROLES, jokerDesc } from '../game/jokers.js';
import { createGame, reduce, viewFor, legalActions } from '../game/engine.js';
import { buildDeck } from '../game/cards.js';
import { JOKER_TUNING as T } from '../config.js';
import { seededRng, run, act } from './helpers.js';

const ctx = (seed = 5) => ({ rng: seededRng(seed), now: 0 });
const playSet = (p, cards, open = cards[0]) => ({ type: 'playSet', player: p, cards, open });
const chips = (s) => s.players.reduce((a, p) => a + p.chips, 0) + s.pot;

/** Колода: перші 6 — P0, наступні 6 — P1 (утрьох — ще 6 для P2), далі deck, далі решта. */
function deckWith(ids) {
  const all = buildDeck();
  const top = ids.map((id) => { const c = all.find((x) => x.id === id); if (!c) throw new Error('no card ' + id); return c; });
  return [...top, ...all.filter((c) => !ids.includes(c.id))];
}
const H0 = ['w7', 'f7', 's2', 'w4', 'f9', 's5'];
const H1 = ['w8', 'f8', 's3', 'w1', 'f2', 's6'];

/**
 * Розкриття з джокерами: P0 грає набір p0 (за замовчуванням — джокер j0 + дві перші карти руки),
 * P1 — p1. o0/o1 — відкриті карти. bets — торги (за замовчуванням обидва чекають).
 */
function duel({ j0, j1, h0 = H0, h1 = H1, deck = [], p0, p1, o0, o1, trumps, bets, scout1 = false, setup, seed = 5 }) {
  const J0 = j0 && `J0-${j0}`, J1 = j1 && `J1-${j1}`;
  let s = createGame({
    deck: deckWith([...h0, ...h1, ...deck]), firstToAct: 0, core: 'combo', timers: false, trumps,
    jokerSets: [j0 ? [j0] : [], j1 ? [j1] : []], jokerRound: 1,
    config: { features: { trump: !!trumps, swap: true } },
  }, ctx(seed));
  setup?.(s);
  const T0 = chips(s);
  const set0 = p0 || (J0 ? [J0, h0[0], h0[1]] : h0.slice(0, 3));
  const set1 = p1 || (J1 ? [J1, h1[0], h1[1]] : h1.slice(0, 3));
  s = run(s, [playSet(0, set0, o0 || set0[0]), playSet(1, set1, o1 || set1[0])], ctx(seed));
  if (s.phase === 'scout') s = run(s, [scout1 ? act('scout', 1) : act('skipScout', 1), act('skipScout', 0)].filter((a) => !s.players[a.player].scoutDecided), ctx(seed));
  const potBefore = s.pot, jackpotBefore = s.jackpot;
  s = run(s, bets || [act('check', 0), act('check', 1)], ctx(seed));
  assert.equal(s.phase, 'result');
  assert.equal(chips(s), T0, 'фішки не з\'являються і не зникають');
  return { s, potBefore, jackpotBefore, combo: (p) => s.result.detail?.combos?.[p] };
}
const notes = (s) => s.result.jokers.notes.map((n) => n.text).join(' | ');

// ───────── каталог і роздача ─────────
test('каталог: 36 джокерів, рідкості 14/10/7/5, три типи, опис в один рядок', () => {
  assert.equal(JOKERS.length, 36);
  const by = {};
  for (const j of JOKERS) by[j.rarity] = (by[j.rarity] || 0) + 1;
  assert.deepEqual(by, { common: 14, rare: 10, epic: 7, legendary: 5 });
  for (const j of JOKERS) {
    assert.ok(JOKER_TYPES[j.type], `${j.id}: тип`);
    // режим комбінацій: рівно одна роль і жодної «сили»
    assert.ok(JOKER_ROLES[j.role], `${j.id}: роль`);
    for (const n of [2, 3]) assert.ok(!/сил[аиу]/i.test(jokerDesc(j, n)), `${j.id}: без «сили»`);
    for (const n of [2, 3]) { const d = jokerDesc(j, n); assert.ok(d && !d.includes('\n') && d.length <= 130, `${j.id}: ${d}`); }
    assert.ok(j.icon && j.name, j.id);
  }
  // збережені id старих джокерів (колекції гравців не ламаються)
  for (const id of ['thief', 'dice', 'counter', 'brazen', 'antitrump']) assert.ok(JOKER_BY_ID[id], id);
});

test('роздача: джокер приходить у руку сьомою картою, суперник бачить лише факт; обміняти не можна', () => {
  const s = createGame({ deck: deckWith([...H0, ...H1]), firstToAct: 0, core: 'combo', timers: false, jokerSets: [['thief'], ['storm']], jokerRound: 1, config: { features: { trump: false, swap: true } } }, ctx());
  assert.equal(s.players[0].hand.length, 7);
  assert.ok(s.players[0].hand.some((c) => c.id === 'J0-thief'));
  const v1 = viewFor(s, 1, 0);
  assert.equal(v1.opp.jokerInHand, true);
  assert.equal(JSON.stringify(v1).includes('thief'), false, 'чужого джокера не видно');
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'swap' && a.cardId === 'J0-thief'));
});

test('джокер займає місце в наборі й може бути відкритим: суперник бачить його до торгів', () => {
  let s = createGame({ deck: deckWith([...H0, ...H1]), firstToAct: 0, core: 'combo', timers: false, jokerSets: [['magnet'], []], jokerRound: 1, config: { features: { trump: false, swap: true } } }, ctx());
  s = run(s, [playSet(0, ['J0-magnet', 'w7', 'f7'], 'J0-magnet'), playSet(1, ['w8', 'f8', 's3'])], ctx());
  assert.equal(viewFor(s, 1, 0).opp.open.joker, 'magnet');
});

test('джокер згорає: при пасі ефекту немає, у колоду не повертається', () => {
  const { s } = duel({ j0: 'tax', bets: [act('raise', 0, { amount: 5 }), act('fold', 1)] });
  assert.equal(s.result.jokers, undefined);
  const t = run(s, [act('ready', 0), act('ready', 1)], ctx());
  assert.ok(![...t.deck, ...t.discard].some((c) => c.kind === 'joker'));
});

// ───────── кожен джокер ─────────
test('Перевертень: перемагає слабша комбінація', () => {
  const { s, combo } = duel({ j0: 'turncoat', p0: ['J0-turncoat', 'w4', 's2'], p1: ['w8', 'f8', 's3'] });
  assert.equal(combo(0).id, 'high');
  assert.equal(s.result.winner, 0, 'старша б\'є пару, бо перемагає слабша');
});
test('Рулетка: кілька випадкових значень — береться найкраще', () => {
  const { s, combo } = duel({ j0: 'roulette', p0: ['J0-roulette', 'w7', 'f7'] });
  const xs = notes(s).match(/Рулетка: ([\d /]+)/)[1].split(' / ').map(Number);
  assert.equal(xs.length, T.roulette.k);
  assert.ok(xs.includes(7) ? combo(0).id === 'trio' : combo(0).id === 'pair');
});
test('Дикун: підлаштовується під найкращу комбінацію (до 3)', () => {
  const { combo } = duel({ j0: 'thief', h0: ['w2', 'w3', 's9', 'f4', 'f9', 's5'], p0: ['J0-thief', 'w2', 'w3'] });
  assert.equal(combo(0).id, 'sflush');
});
test('Важкий кулак: значення 8 без масті, удар коштує фішки в джекпот', () => {
  const { s, combo, jackpotBefore } = duel({ j0: 'fist', h0: ['w8', 'f4', 's2', 'w4', 'f9', 's5'], h1: ['w7', 'f7', 's3', 'w1', 'f2', 's6'], p0: ['J0-fist', 'w8', 'f4'] });
  assert.equal(combo(0).label, `Пара ${T.fist.v}`);
  assert.equal(s.jackpot - jackpotBefore, s.result.winner === null ? s.pot - jackpotBefore : T.fist.fee);
});
test('Чет-нечет: парна відкрита карта суперника — комбінація на сходинку сильніша', () => {
  const even = duel({ j0: 'insurance', p0: ['J0-insurance', 'w4', 'f9'], o1: 'w8' });
  assert.equal(even.combo(0).rank, 1);
  const odd = duel({ j0: 'insurance', p0: ['J0-insurance', 'w4', 'f9'], o1: 's3' });
  assert.equal(odd.combo(0).rank, 0);
});
test('Двійник: копіює найкраще значення з руки (без масті)', () => {
  const { combo } = duel({ j0: 'twin', p0: ['J0-twin', 'w7', 'f9'] });
  // у руці лишились f7, s2, w4, s5 → копія 7 дає пару 7
  assert.equal(combo(0).label, 'Пара 7');
});
test('Хамелеон: масть будь-яка (стріт у масть), нічию виграє', () => {
  // значення Хамелеона — T.chameleon.v (зараз 7): разом із 5 і 6 тієї ж масті — стріт у масть
  const v = T.chameleon.v;
  const { combo } = duel({ j0: 'chameleon', h0: [`w${v - 2}`, `w${v - 1}`, 's9', 'f4', 'f9', 's5'].map((x) => x), p0: ['J0-chameleon', `w${v - 2}`, `w${v - 1}`] });
  assert.equal(combo(0).id, 'sflush');
  const tie = duel({ j0: 'chameleon', h0: ['w2', 'f3', 's9', 'f4', 'f9', 's5'], h1: [`s${v}`, 'w3', 'f2', 'w1', 'f8', 's8'], p0: ['J0-chameleon', 'w2', 'f3'], p1: [`s${v}`, 'w3', 'f2'] });
  assert.equal(tie.s.result.winner, 0, `рівні «Старша ${v}» — нічия Хамелеона`);
});
test('Підробка: значення відкритої карти суперника — трійка', () => {
  const { combo } = duel({ j0: 'modest', h0: ['w9', 'f9', 's2', 'w4', 'f4', 's5'], h1: ['s9', 'f8', 's3', 'w1', 'f2', 's6'], p0: ['J0-modest', 'w9', 'f9'], p1: ['s9', 'f8', 's3'], o1: 's9' });
  assert.equal(combo(0).label, 'Трійка 9');
});
test('Податок: усі платять у джекпот', () => {
  const { s, jackpotBefore } = duel({ j0: 'tax' });
  if (s.result.winner !== null) assert.equal(s.jackpot - jackpotBefore, 2 * T.tax.fee);
});
test('Стрибок: ±1..3 від своєї карти тієї ж масті — стріт у масть', () => {
  const { combo } = duel({ j0: 'dice', h0: ['w4', 'w5', 's9', 'f4', 'f9', 's5'], p0: ['J0-dice', 'w4', 'w5'] });
  assert.equal(combo(0).id, 'sflush');
});
test('Сходинка: комбінація на T.counter.ranks сходинок сильніша', () => {
  const { combo } = duel({ j0: 'counter', p0: ['J0-counter', 'w7', 'f7'] });
  assert.ok([1 + T.counter.ranks, 2 + T.counter.ranks].includes(combo(0).rank), 'пара → вище на 1–2 сходинки');
  assert.match(combo(0).label, /↑/);
});
test('Близнюк: копія наймолодшої іншої карти або 1', () => {
  for (const seed of [1, 2, 3, 4, 5, 6].map((k) => k * 2654435761)) {
    const { s, combo } = duel({ j0: 'brazen', p0: ['J0-brazen', 'w4', 'f9'], seed });
    if (/не вдався/.test(notes(s))) assert.equal(combo(0).id, 'high');
    else assert.equal(combo(0).label, 'Пара 4');
  }
});
test('Магніт: нічию виграє', () => {
  const { s } = duel({ j0: 'magnet', h0: ['w2', 'f3', 's9', 'f4', 'f9', 's5'], h1: ['s6', 'w3', 'f2', 'w1', 'f8', 's8'], p0: ['J0-magnet', 'w2', 'f3'], p1: ['s6', 'w3', 'f2'] });
  assert.equal(s.result.winner, 0);
});
test('Аутсайдер: відстаєш на багато фішок — перемагає попри слабшу комбінацію', () => {
  const setup = (s) => { s.players[0].chips -= T.temptation.gap; s.players[1].chips += T.temptation.gap; };
  const won = duel({ j0: 'temptation', p0: ['J0-temptation', 'w4', 'f9'], setup });
  assert.equal(won.combo(0).rank, 0); // комбінація не змінюється — спрацьовує умова
  assert.equal(won.s.result.winner, 0);
  assert.match(won.s.result.detail.text, /Умова джокера/);
  assert.equal(duel({ j0: 'temptation', p0: ['J0-temptation', 'w4', 'f9'] }).s.result.winner, 1); // P1 — пара 8
});
test('Буря: закриті карти на столі замінюються, відкриті лишаються', () => {
  const { s } = duel({ j0: 'storm', o1: 'w8' });
  const c1 = s.result.jokers.cards[1].map((c) => c.id);
  assert.ok(c1.includes('w8'), 'відкрита лишилась');
  assert.ok(!c1.includes('f8') && !c1.includes('s3'), 'закриті замінено');
  assert.ok(s.result.jokers.cards[0].some((c) => c.id === 'J0-storm'));
});
test('Обмін: забираєш закриту карту суперника', () => {
  const { s } = duel({ j0: 'swap', o1: 'w8' });
  const mine = s.result.jokers.cards[0].map((c) => c.id);
  assert.ok(mine.includes('f8') || mine.includes('s3'));
  assert.ok(!mine.includes('J0-swap'));
});
test('Тінь: суперник підглядав — перемога', () => {
  assert.equal(duel({ j0: 'shadow', p0: ['J0-shadow', 'w7', 'f9'], scout1: true }).s.result.winner, 0);
  assert.equal(duel({ j0: 'shadow', p0: ['J0-shadow', 'w7', 'f9'] }).s.result.winner, 1);
});
test('Пастка: суперник піднімав — комбінація сильніша', () => {
  const caught = duel({ j0: 'trap', p0: ['J0-trap', 'w7', 'f9'], bets: [act('check', 0), act('raise', 1, { amount: 5 }), act('call', 0)] });
  assert.equal(caught.combo(0).rank, T.trap.ranks);
  assert.equal(duel({ j0: 'trap', p0: ['J0-trap', 'w7', 'f9'] }).combo(0).rank, 0);
});
test('Ва-банкір: банк подвоюється', () => {
  const { s, potBefore } = duel({ j0: 'highroller' });
  assert.match(notes(s), new RegExp(`банк \\+${potBefore}`));
});
test('Кишеньковий: після розкриття забирає карту з руки суперника', () => {
  const { s } = duel({ j0: 'pocket' });
  assert.equal(s.players[0].hand.length, 5, '7 − 3 + 1');
  assert.equal(s.players[1].hand.length, 2);
});
test('Шулер: одне з двох значень — що краще', () => {
  const a = T.sharper.alt;
  const { combo } = duel({ j0: 'sharper', h0: [`w${a}`, `f${a}`, 's2', 'w4', 'f4', 's5'], h1: ['w10', 'f10', 's3', 'w1', 'f2', 's6'], p0: ['J0-sharper', `w${a}`, `f${a}`] });
  assert.equal(combo(0).label, `Трійка ${T.sharper.alt}`);
});
test('Удача: комбінація на сходинку сильніша або слабша', () => {
  let ups = 0, downs = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8].map((k) => k * 2654435761)) {
    const { s, combo } = duel({ j0: 'luck', p0: ['J0-luck', 'w7', 'f7'], seed });
    if (/всміхнулась/.test(notes(s))) { ups++; assert.equal(combo(0).rank, 1 + T.luck.up); } else { downs++; assert.equal(combo(0).rank, 0); }
  }
  assert.ok(ups && downs, `${ups}/${downs}`);
});
test('Сміливець: значення росте з підняттями', () => {
  const calm = duel({ j0: 'brave', h0: ['w8', 'f9', 's2', 'w4', 'f4', 's5'], p0: ['J0-brave', 'w8', 'f9'] });
  assert.equal(calm.combo(0).label, `Старша 9`, `без піднять — лише ${T.brave.v}`);
  const hot = duel({ j0: 'brave', h0: ['w8', 'f9', 's2', 'w4', 'f4', 's5'], p0: ['J0-brave', 'w8', 'f9'], bets: [act('raise', 0, { amount: 5 }), act('raise', 1, { amount: 5 }), act('call', 0)] });
  assert.equal(hot.combo(0).label, 'Стріт 7–9', 'з двома підняттями доступна 7');
});
test('Ламач: комбінація суперника на 3 сходинки слабша, своє місце порожнє', () => {
  const { s, combo } = duel({ j0: 'antitrump', h1: ['w8', 'f8', 's8', 'w1', 'f2', 's6'], p1: ['w8', 'f8', 's8'] });
  assert.equal(combo(1).rank, 4 - T.antitrump.ranks);
  assert.equal(combo(0).label, 'Пара 7', 'місце Ламача порожнє — рахуються лише дві карти');
});
test('Вибух: банк — у джекпот', () => {
  const { s } = duel({ j0: 'boom' });
  assert.equal(s.result.reason, 'void');
  assert.equal(s.jackpot, s.pot);
});
test('Монетка: банк подвоєно, вирішує монетка', () => {
  const { s, potBefore } = duel({ j0: 'coin' });
  assert.equal(s.result.detail.text, 'Вирішила монетка');
  assert.match(notes(s), /банк подвоєно/);
  assert.ok(potBefore > 0);
});
test('Нова роздача: руки скинуто, зіграні карти — з колоди', () => {
  const { s } = duel({ j0: 'redeal' });
  const ids = s.result.jokers.cards.flat().map((c) => c.id);
  for (const id of ['J0-redeal', 'w7', 'w8', 'f8']) assert.ok(!ids.includes(id), id);
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[1].hand.length, 0);
});
test('Ехо: повторює джокера суперника, інакше — значення', () => {
  assert.match(notes(duel({ j0: 'echo', j1: 'magnet' }).s), /Ехо → Магніт/);
  const alone = duel({ j0: 'echo', p0: ['J0-echo', 'w7', 'f7'] });
  assert.equal(alone.combo(0).label, 'Трійка 7', `без джокерів у партії — значення ${T.echo.v}`);
});
test('Землетрус: руки перемішуються, кількість карт зберігається', () => {
  const { s } = duel({ j0: 'quake' });
  assert.equal(s.players[0].hand.length + s.players[1].hand.length, 4 + 3);
});
test('Рокіровка: обмін зіграними наборами', () => {
  const { s } = duel({ j0: 'castling' });
  assert.ok(s.result.jokers.cards[1].some((c) => c.id === 'J0-castling'));
  assert.ok(s.result.jokers.cards[0].some((c) => c.id === 'w8'));
});
test('Ажіотаж: банк утричі', () => {
  const { s, potBefore } = duel({ j0: 'frenzy' });
  assert.match(notes(s), new RegExp(`банк \\+${2 * potBefore}`));
});
test('Апокаліпсис: половина фішок у банк, вирішує монетка', () => {
  const { s, potBefore } = duel({ j0: 'apocalypse' });
  assert.match(notes(s), /АПОКАЛІПСИС/);
  assert.equal(s.result.detail.text, 'Вирішила монетка');
  assert.ok(potBefore > 0);
});
test('Назад у часі: ставки повертаються, раунд переграється', () => {
  const { s } = duel({ j0: 'rewind', bets: [act('raise', 0, { amount: 10 }), act('call', 1)] });
  assert.equal(s.result.reason, 'replay');
  const t = run(s, [act('ready', 0), act('ready', 1)], ctx());
  assert.equal(t.round, 1, 'раунд переграється');
  assert.ok(!t.players[0].hand.some((c) => c.kind === 'joker'), 'джокер не повертається і новий не приходить');
});
test('Король хаосу: обирає ефект іншого джокера', () => {
  assert.match(notes(duel({ j0: 'chaosking' }).s), /Король хаосу обрав/);
});
test('Дуель: кожен грає найкращою трійкою зі своїх і нових карт', () => {
  const { s } = duel({ j0: 'duel' });
  for (const p of [0, 1]) assert.equal(s.result.jokers.cards[p].length, 3);
  assert.ok(!s.result.jokers.cards[0].some((c) => c.kind === 'joker'));
});
test('Задзеркалля: ставки подвоєні, перемагає слабша', () => {
  const { s, combo, potBefore } = duel({ j0: 'mirrorworld', p0: ['J0-mirrorworld', 'w4', 's2'], p1: ['w8', 'f8', 's3'] });
  assert.match(notes(s), new RegExp(`банк \\+${potBefore}`));
  assert.equal(combo(0).id, 'high');
  assert.equal(s.result.winner, 0);
});

// ───────── порядок спрацювання ─────────
test('порядок: Вибух скасовує раунд — Податок суперника не спрацьовує', () => {
  const { s, jackpotBefore } = duel({ j0: 'boom', j1: 'tax' });
  assert.equal(s.result.reason, 'void');
  assert.ok(!/Податок/.test(notes(s)));
  assert.ok(s.jackpot >= jackpotBefore);
});
test('порядок: два скасування — першою діє нижча рідкість (Вибух раніше за «Назад у часі»)', () => {
  assert.equal(duel({ j0: 'rewind', j1: 'boom' }).s.result.reason, 'void');
});
test('Обмін не краде джокерів суперника', () => {
  const { s } = duel({ j0: 'swap', j1: 'magnet', o1: 'J1-magnet' });
  assert.ok(s.result.jokers.cards[1].some((c) => c.id === 'J1-magnet'), 'джокер суперника не вкрадено');
});
test('порядок: Рокіровка — Кулак тепер у суперника, але «нічию програє» діє на власника', () => {
  const { s } = duel({ j0: 'castling', j1: 'fist' });
  assert.ok(s.result.jokers.cards[0].some((c) => c.id === 'J1-fist'));
});
test('два Перевертні знімають один одного', () => {
  const { s } = duel({ j0: 'turncoat', j1: 'turncoat', p0: ['J0-turncoat', 'w4', 's2'], p1: ['J1-turncoat', 'w8', 'f8'] });
  assert.equal(s.result.winner, 1, 'перемагає сильніша: пара 8 + 10 > старша 10');
});
test('джокер з Дзеркалом: Дзеркало копіює значення джокера', () => {
  const { combo } = duel({ j0: 'fist', h0: ['mirror', 'w2', 's2', 'w4', 'f9', 's5'], p0: ['J0-fist', 'mirror', 'w2'] });
  assert.equal(combo(0).label, `Пара ${T.fist.v}`);
});
test('Ніж проти джокера: ріже найстаршу карту, джокера-значення теж', () => {
  const { s, combo } = duel({ j1: 'fist', h0: ['knife', 'w2', 's2', 'w4', 'f9', 's5'], p0: ['knife', 'w2', 's2'], h1: ['w3', 'f4', 's3', 'w1', 'f2', 's6'], p1: ['J1-fist', 'w3', 'f4'] });
  assert.equal(s.result.detail.cuts[0].card.id, 'J1-fist');
  assert.equal(combo(1).label, 'Старша 4');
});

test('статистика: рушій позначає, чи джокер змінив результат розкриття', () => {
  const { s } = duel({ j0: 'antitrump', p0: ['J0-antitrump', 'w4', 'f9'], p1: ['w8', 'f8', 's3'] });
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.jokers.changed, true);
  assert.deepEqual(s.stats[0].jokerLog, [{ id: 'antitrump', won: true, changed: true }]);
});

// ───────── усі пари, 2 і 3 гравці ─────────
test('усі джокери проти кількох інших: фішки зберігаються, гра не ламається', () => {
  for (const a of JOKERS) for (const b of [JOKERS[(JOKERS.indexOf(a) * 7) % 36], JOKERS[(JOKERS.indexOf(a) * 13 + 5) % 36]]) {
    const { s } = duel({ j0: a.id, j1: b.id, bets: [act('raise', 0, { amount: 10 }), act('call', 1)] });
    for (const p of [0, 1]) assert.ok(s.players[p].chips >= 0, `${a.id} vs ${b.id}`);
    const T0 = chips(s);
    const t = run(s, [act('ready', 0), act('ready', 1)], ctx());
    assert.equal(chips(t), T0, `${a.id} vs ${b.id}`);
  }
});

test('утрьох: кожен джокер спрацьовує, фішки зберігаються', () => {
  const ids = ['w7', 'f7', 's2', 'w4', 'f9', 's5', 'w8', 'f8', 's3', 'w1', 'f2', 's6', 'w10', 'f10', 's4', 'w3', 'f5', 's9'];
  for (const j of JOKERS) {
    let s = createGame({ players: 3, deck: deckWith(ids), firstToAct: 0, core: 'combo', timers: false, jokerSets: [[j.id], ['magnet'], []], jokerRound: 1, config: { features: { trump: false, swap: true } } }, ctx());
    const T0 = chips(s);
    s = run(s, [playSet(0, [`J0-${j.id}`, 'w7', 'f7']), playSet(1, ['J1-magnet', 'w8', 'f8']), playSet(2, ['w10', 'f10', 's4'])], ctx());
    s = run(s, [0, 1, 2].filter((p) => s.phase === 'scout' && !s.players[p].scoutDecided).map((p) => act('skipScout', p)), ctx());
    s = run(s, [act('check', 0), act('check', 1), act('check', 2)], ctx());
    assert.equal(s.phase, 'result', j.id);
    assert.equal(chips(s), T0, j.id);
    assert.ok(s.result.jokers.fired.some((f) => f.joker === j.id), j.id);
    s = run(s, [act('ready', 0), act('ready', 1), act('ready', 2)], ctx());
    assert.equal(chips(s), T0, j.id);
  }
});

test('після розкриття з джокером торги закриті', () => {
  const { s } = duel({ j0: 'magnet' });
  assert.equal(reduce(s, act('check', 0), ctx()).ok, false);
});
