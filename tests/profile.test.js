import { test } from 'node:test';
import assert from 'node:assert/strict';
import { META } from '../config.js';
import { JOKERS } from '../game/jokers.js';
import { COSMETICS } from '../meta/catalog.js';
import {
  defaultProfile, migrate, normalize, grant, buy, exchange, priceOf, setJokers, equip, spin, awardGame,
  checkAchievements, exportCode, importCode, sanitizeLook,
} from '../meta/profile.js';
import { seededRng } from './helpers.js';

const stats = (o = {}) => ({ jokers: [], minChips: 100, bluffOne: 0, knife10: 0, allinWins: 0, donRoundMax: 0, legendary: 0, ...o });
const DAY = new Date('2026-11-01T12:00:00Z');

test('старт: базова косметика + 3 звичайні джокери, набір із них', () => {
  const p = defaultProfile();
  assert.equal(Object.keys(p.jokers).length, 3);
  for (const id of Object.keys(p.jokers)) assert.equal(JOKERS.find((j) => j.id === id).rarity, 'common');
  assert.deepEqual(p.set, META.startJokers);
  assert.equal(Object.keys(p.cosmetics).length, 7);
});

test('бали: участь + бонус за перемогу, проти бота ×0.3, перша перемога дня', () => {
  let r = awardGame(defaultProfile(), { won: false, mode: 'online', me: stats() }, DAY);
  assert.equal(r.profile.points, META.points.play);
  r = awardGame(defaultProfile(), { won: true, mode: 'online', me: stats() }, DAY);
  // участь + перемога + перша перемога дня + досягнення «Перша кров»
  assert.equal(r.profile.points, META.points.play + META.points.win + META.points.firstWinOfDay + 60);
  const r2 = awardGame(r.profile, { won: true, mode: 'online', me: stats() }, DAY);
  assert.equal(r2.profile.points - r.profile.points, META.points.play + META.points.win, 'бонус дня лише раз');
  const b = awardGame(defaultProfile(), { won: false, mode: 'bot', me: stats() }, DAY);
  assert.equal(b.profile.points, Math.round(META.points.play * META.points.mult.bot));
});

test('досягнення: бали або унікальна косметика, лише раз', () => {
  let r = awardGame(defaultProfile(), { won: false, mode: 'online', me: stats({ bluffOne: 1, legendary: 1 }) }, DAY);
  assert.ok(r.achievements.includes('bluff_one'));
  assert.ok(r.profile.cosmetics.back_bluff, 'унікальна сорочка');
  assert.ok(r.profile.cosmetics.frame_legend);
  const again = awardGame(r.profile, { won: false, mode: 'online', me: stats({ bluffOne: 1 }) }, DAY);
  assert.ok(!again.achievements.includes('bluff_one'));
  let p = defaultProfile();
  p.games = 9;
  p = awardGame(p, { won: false, mode: 'online', me: stats() }, DAY).profile;
  assert.ok(p.achievements.marathon);
});

test('магазин: ціни з config, не можна піти в мінус, легендарні не продаються', () => {
  const p = defaultProfile();
  assert.equal(buy(p, 'joker', 'storm').error, 'no-points');
  const rich = { ...p, points: 1000 };
  const r = buy(rich, 'joker', 'storm');
  assert.ok(r.ok);
  assert.equal(r.profile.points, 1000 - META.prices.joker.rare);
  assert.equal(buy(r.profile, 'joker', 'storm').error, 'owned');
  assert.equal(priceOf('joker', 'apocalypse'), null);
  assert.equal(buy(rich, 'joker', 'apocalypse').error, 'not-for-sale');
  assert.equal(buy(rich, 'cosmetic', 'back_bluff').error, 'not-for-sale', 'досягнення не продаються');
  const c = buy(rich, 'cosmetic', 'felt_blue');
  assert.equal(c.profile.points, 1000 - META.prices.cosmetic.common);
  assert.ok(META.prices.cosmetic.common > META.spin.cost, 'косметика напряму дорожча за спін');
});

test('уламки: дублікат → уламки; обмін на будь-що, крім легендарних джокерів', () => {
  let p = defaultProfile();
  const g = grant(p, 'joker', 'roulette');
  assert.equal(g.duplicate, true);
  assert.equal(g.profile.shards, META.shards.dupe.common);
  p = { ...g.profile, shards: 5000 };
  assert.ok(exchange(p, 'joker', 'boom').ok);
  assert.equal(exchange(p, 'joker', 'duel').error, 'not-for-sale');
  assert.ok(exchange(p, 'cosmetic', 'back_starry').ok, 'легендарну косметику — можна');
  assert.equal(exchange({ ...p, shards: 10 }, 'joker', 'storm').error, 'no-shards');
});

test('автомат: ціна, рідкість ↔ барабани, дублікати → уламки, без мінусу', () => {
  const rng = seededRng(5);
  let p = { ...defaultProfile(), points: 100000 };
  const seen = {};
  for (let i = 0; i < 400; i++) {
    const r = spin(p, rng);
    assert.ok(r.ok);
    p = r.profile;
    const { reels, rarity } = r.result;
    seen[rarity] = (seen[rarity] || 0) + 1;
    const uniq = new Set(reels).size;
    if (rarity === 'legendary') assert.deepEqual(reels, ['crown', 'crown', 'crown']);
    else if (rarity === 'epic') assert.equal(uniq, 1);
    else if (rarity === 'rare') assert.equal(uniq, 2);
    else assert.equal(uniq, 3);
  }
  assert.equal(p.points, 100000 - 400 * META.spin.cost);
  assert.ok(seen.common && seen.rare && seen.epic && seen.legendary);
  assert.equal(spin({ ...defaultProfile(), points: 50 }, rng).error, 'no-points');
});

test('автомат: гарантія епічного кожні 15 і легендарного кожні 60 спінів', () => {
  const unlucky = () => 0.0001 + 0.9998 * 0; // завжди «звичайне»
  let p = { ...defaultProfile(), points: 1e6 };
  let sinceEpic = 0, sinceLeg = 0, maxEpic = 0, maxLeg = 0;
  for (let i = 0; i < 300; i++) {
    // rng, що майже завжди дає «звичайне» (x ≈ 0 < 0.62)
    const r = spin(p, unlucky);
    p = r.profile;
    sinceEpic++; sinceLeg++;
    if (['epic', 'legendary'].includes(r.result.rarity)) { maxEpic = Math.max(maxEpic, sinceEpic); sinceEpic = 0; }
    if (r.result.rarity === 'legendary') { maxLeg = Math.max(maxLeg, sinceLeg); sinceLeg = 0; }
  }
  assert.ok(maxEpic <= META.spin.pityEpic && maxEpic > 0);
  assert.ok(maxLeg <= META.spin.pityLegendary && maxLeg > 0);
  assert.ok(p.achievements === undefined || true);
});

test('набір джокерів: до 3, лише свої', () => {
  let p = defaultProfile();
  p = setJokers(p, ['roulette', 'storm', 'thief', 'insurance']);
  assert.deepEqual(p.set, ['roulette', 'thief']);
  p = equip(p, 'felt', 'felt_wine');
  assert.equal(p.equipped.felt, 'felt_green', 'не можна вдягнути чуже');
});

test('міграції: v0 і зламані дані лікуються', () => {
  const v0 = { points: 250, jokers: ['storm', 'nope'], equipped: { felt: 'felt_wine' } };
  const p = migrate(v0);
  assert.equal(p.v, META.schema);
  assert.equal(p.points, 250);
  assert.ok(p.jokers.storm && !p.jokers.nope);
  assert.equal(p.equipped.felt, 'felt_green', 'невласне не вдягається');
  const broken = migrate({ v: 1, points: -50, shards: 'a', jokers: { boom: 1e9 }, set: ['boom', 'boom', 'x'], cosmetics: null, pity: 'x' });
  assert.equal(broken.points, 0);
  assert.equal(broken.shards, 0);
  assert.equal(broken.jokers.boom, 99);
  assert.deepEqual(broken.set, ['boom']);
  assert.deepEqual(migrate(null), defaultProfile());
  assert.deepEqual(migrate('garbage'), defaultProfile());
});

test('експорт/імпорт: код із контрольною сумою', () => {
  let p = { ...defaultProfile(), points: 777 };
  p = grant(p, 'joker', 'duel').profile;
  const code = exportCode(p);
  const r = importCode(code);
  assert.ok(r.ok);
  assert.deepEqual(r.profile, normalize(p));
  const bad = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
  assert.equal(importCode(bad).error, 'checksum');
  assert.equal(importCode('hello').error, 'format');
});

test('чужа косметика валідується', () => {
  const look = sanitizeLook({ felt: 'felt_wine', back: 'deck_ivory', frame: 42, evil: '<script>' });
  assert.equal(look.felt, 'felt_wine');
  assert.equal(look.back, 'back_burgundy', 'id не тієї категорії відкидається');
  assert.equal(look.frame, 'frame_basic');
  assert.equal(Object.keys(look).length, 7);
});

test('каталог: ~30 предметів косметики у 7 категоріях', () => {
  assert.ok(COSMETICS.length >= 30);
  assert.equal(new Set(COSMETICS.map((c) => c.cat)).size, 7);
});

test('загальні досягнення перевіряються й без партії (напр. після спіну)', () => {
  const p = { ...defaultProfile(), flags: { legendarySpin: true } };
  const r = checkAchievements(p, null);
  assert.ok(r.unlocked.includes('lucky_spin'));
  assert.ok(r.profile.cosmetics.felt_goldrush);
});
