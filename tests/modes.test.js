// Режими-модифікатори: лише пресети наявних налаштувань, для 2 і 3 гравців.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, viewFor, legalActions } from '../game/engine.js';
import { botDecide, BOT_STYLES } from '../game/bot.js';
import { CONFIG, MODES, MODE_IDS, META } from '../config.js';
import { modeOfDay, awardGame, defaultProfile } from '../meta/profile.js';
import { seededRng, ctx } from './helpers.js';

const make = (mode, players = 2, extra = {}) => createGame({ mode, players, timers: false, jokerSets: [['roulette', 'thief'], ['insurance', 'dice'], ['storm', 'coin']], ...extra }, ctx());

test('режими: класика нічого не змінює', () => {
  const a = createGame({ firstToAct: 0 }, ctx()), b = createGame({ firstToAct: 0, mode: 'classic' }, ctx());
  assert.deepEqual({ ...a.cfg, mode: 'classic' }, b.cfg);
});

test('Ніч хаосу: джокери з 1-го раунду, по 2 на гравця (удвох і втрьох)', () => {
  for (const n of [2, 3]) {
    const s = make('chaos', n);
    assert.equal(s.jokerRound, 1);
    for (let p = 0; p < n; p++) assert.equal(s.players[p].hand.filter((c) => c.kind === 'joker').length, 2, `гравець ${p}`);
  }
});

test('Бліц: 8 раундів і анте росте вдвічі швидше', () => {
  const two = make('blitz', 2), three = make('blitz', 3);
  assert.equal(two.cfg.maxRounds, 8);
  assert.equal(two.cfg.anteEvery, CONFIG.anteEvery / 2);
  assert.equal(three.cfg.anteEvery, CONFIG.three.anteEvery / 2);
});

test('Сліпа гра: розвідки немає — після карт одразу торги', () => {
  for (const n of [2, 3]) {
    let s = make('blind', n);
    for (let p = 0; p < n; p++) s = reduce(s, { type: 'play', player: p, cardId: s.players[p].hand[0].id }, ctx()).state;
    assert.equal(s.phase, 'bet');
    assert.ok(!legalActions(s, s.bet.toAct).some((a) => a.type === 'scout'));
  }
});

test('Великі ставки: старт 50 фішок, програний «подвій» кидає в джекпот удвічі більше', () => {
  const s = make('highstakes', 3);
  assert.equal(s.cfg.startChips, 50);
  assert.equal(s.players[0].chips + s.contrib[0], 50);
  assert.equal(s.cfg.jackpotMult, 2);
});

test('усі режими × 2 і 3 гравці: партії ботів завершуються, фішки зберігаються', () => {
  for (const mode of MODE_IDS) for (const n of [2, 3]) for (let g = 0; g < 40; g++) {
    const rng = seededRng(g * 7 + n);
    const c = { rng, now: 0 };
    let s = createGame({ mode, players: n, timers: false, jokerSets: [['roulette', 'boom', 'coin'], ['thief', 'storm', 'rewind'], ['dice', 'swap', 'apocalypse']].slice(0, n), config: { maxRounds: 12 } }, c);
    const total = (x) => x.players.reduce((a, p) => a + p.chips, 0) + x.pot;
    const start = total(s);
    for (let i = 0; i < 5000 && s.phase !== 'over'; i++) {
      let acted = false;
      for (let p = 0; p < n; p++) {
        const a = botDecide(viewFor(s, p, 0), rng, BOT_STYLES[(g + p) % 3], { jokerPlay: 0.7 });
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, c);
        assert.ok(r.ok, `${mode}/${n}: ${r.error}`);
        s = r.state; acted = true;
        assert.equal(total(s), start, `${mode}/${n}: фішки`);
        break;
      }
      assert.ok(acted, `${mode}/${n}: гра застрягла`);
    }
    assert.equal(s.phase, 'over', `${mode}/${n} не завершилась`);
    assert.equal(viewFor(s, 0, 0).cfg.mode, mode);
  }
});

test('режим дня: щодня інший, без класики, і дає бонус до балів', () => {
  const days = Array.from({ length: 8 }, (_, i) => modeOfDay(new Date(2026, 9, 1 + i)));
  assert.ok(days.every((m) => MODES[m] && m !== 'classic'));
  assert.ok(new Set(days).size === MODE_IDS.length - 1, 'за тиждень зустрічаються всі');
  assert.notEqual(days[0], days[1]);
  const now = new Date(2026, 9, 3);
  const st = { jokers: [], minChips: 100 };
  const withBonus = awardGame(defaultProfile(), { won: false, mode: 'online', gameMode: modeOfDay(now), me: st }, now);
  const without = awardGame(defaultProfile(), { won: false, mode: 'online', gameMode: 'classic', me: st }, now);
  assert.equal(withBonus.profile.points - without.profile.points, META.points.modeOfDay);
});
