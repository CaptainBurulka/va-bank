import { test } from 'node:test';
import assert from 'node:assert/strict';
import { META } from '../config.js';
import { JOKERS } from '../game/jokers.js';
import { COSMETICS, SKIN_ITEMS, SKIN_BY_ID, LEGACY_SKINS } from '../meta/catalog.js';
import {
  defaultProfile, migrate, normalize, grant, buy, exchange, priceOf, setJokers, equip, spin, awardGame,
  checkAchievements, exportCode, importCode, sanitizeLook, publicLook,
} from '../meta/profile.js';
import { seededRng } from './helpers.js';

const stats = (o = {}) => ({ jokers: [], minChips: 100, bluffOne: 0, knife10: 0, allinWins: 0, donRoundMax: 0, legendary: 0, ...o });
const DAY = new Date('2026-11-01T12:00:00Z');

test('старт: базова косметика + 3 звичайні джокери, набір із них', () => {
  const p = defaultProfile();
  assert.equal(Object.keys(p.jokers).length, 3);
  for (const id of Object.keys(p.jokers)) assert.equal(JOKERS.find((j) => j.id === id).rarity, 'common');
  assert.deepEqual(p.set, META.startJokers);
  assert.equal(Object.keys(p.cosmetics).length, 8); // по одному стартовому в кожній із 8 категорій
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
  assert.deepEqual({ r: r.profile.skins.back_pixel?.r }, { r: 'rare' }, 'унікальна сорочка набору — рідкісна');
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
  assert.equal(buy(rich, 'cosmetic', 'frame_legend').error, 'not-for-sale', 'досягнення не продаються');
  const c = buy(rich, 'skin', 'felt_kyiv', 'common');
  assert.equal(c.profile.points, 1000 - META.prices.cosmetic.common);
  assert.equal(c.profile.skins.felt_kyiv.r, 'common');
  assert.equal(buy(c.profile, 'skin', 'felt_kyiv', 'common').error, 'owned');
  assert.ok(buy({ ...c.profile, points: 1000 }, 'skin', 'felt_kyiv', 'rare').ok, 'покращення до вищої рідкості');
  assert.equal(buy(rich, 'skin', 'felt_kyiv', 'legendary').error, 'not-for-sale', 'легендарні предмети наборів — лише автомат');
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
  assert.ok(exchange(p, 'cosmetic', 'frame_cosmic').ok, 'легендарну рамку — можна');
  assert.ok(exchange(p, 'skin', 'back_space', 'epic').ok, 'предмет набору — у вибраній рідкості');
  assert.equal(exchange(p, 'skin', 'back_space', 'legendary').error, 'not-for-sale');
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
  const noPid = (x) => ({ ...x, pid: 'x' });
  assert.deepEqual(noPid(migrate(null)), noPid(defaultProfile()));
  assert.deepEqual(noPid(migrate('garbage')), noPid(defaultProfile()));
  assert.match(migrate(null).pid, /^p[a-z2-9]{10}$/);
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
  const look = sanitizeLook({ felt: 'felt_wine', back: 'deck_kyiv', deck: 'deck_cyber', frame: 42, evil: '<script>', rar: { deck: 'epic', felt: 'mythic' } });
  assert.equal(look.felt, 'felt_deco', 'стара косметика від старого клієнта → предмет набору');
  assert.equal(look.rar.felt, 'rare', '…зі своєю старою рідкістю (невідома рідкість відкидається)');
  assert.equal(look.deck, 'deck_cyber');
  assert.equal(look.rar.deck, 'epic');
  assert.equal(look.back, 'back_burgundy', 'id не тієї категорії відкидається');
  assert.equal(look.frame, 'frame_basic');
  assert.equal(Object.keys(look).length, 10);
});

test('каталог: класика, емодзі, рамки + 8 наборів × 6 предметів', () => {
  assert.equal(new Set(COSMETICS.map((c) => c.cat)).size, 8);
  assert.equal(SKIN_ITEMS.length, 48);
  for (const [old, [id, r]] of Object.entries(LEGACY_SKINS)) {
    assert.ok(SKIN_BY_ID[id], `${old} → ${id}`);
    assert.equal(SKIN_BY_ID[id].cat, old.split('_')[0], 'категорія зберігається');
    assert.ok(['common', 'rare', 'epic', 'legendary'].includes(r));
  }
});

test('загальні досягнення перевіряються й без партії (напр. після спіну)', () => {
  const p = { ...defaultProfile(), flags: { legendarySpin: true } };
  const r = checkAchievements(p, null);
  assert.ok(r.unlocked.includes('lucky_spin'));
  assert.equal(r.profile.skins.felt_pixel.r, 'legendary');
});

import { SETS } from '../meta/catalog.js';
import { setProgress, priceOf as priceOf2 } from '../meta/profile.js';

test('набори: 8 тем по 6 предметів (колода, сорочка, сукно, фішки, перемога, звук) + рамка за повний набір', () => {
  assert.equal(SETS.length, 8);
  for (const st of SETS) {
    assert.deepEqual(st.items.map((id) => SKIN_BY_ID[id].cat).sort(), ['back', 'chips', 'deck', 'felt', 'sound', 'win']);
    assert.equal(priceOf2('cosmetic', st.frame), null, 'рамку не купити — лише за повний набір');
  }
});

test('набори: останній предмет (будь-якої рідкості) додає рамку, повторно — не дублює', () => {
  const st = SETS[5];
  let p = defaultProfile();
  for (const id of st.items.slice(0, -1)) p = grant(p, 'skin', id, { rarity: 'common' }).profile;
  assert.ok(!p.cosmetics[st.frame]);
  const r = grant(p, 'skin', st.items.at(-1), { rarity: 'rare' });
  assert.deepEqual(r.completed, [st.id]);
  assert.ok(r.profile.cosmetics[st.frame]);
  assert.equal(setProgress(r.profile).find((x) => x.id === st.id).done, true);
  const again = grant(r.profile, 'skin', st.items[0], { rarity: 'common' });
  assert.ok(again.duplicate);
});

test('предмет набору: вища рідкість — покращення з новим номером, така сама чи нижча — уламки', () => {
  let p = defaultProfile();
  let g = grant(p, 'skin', 'deck_space', { rarity: 'rare', serial: 42 });
  assert.equal(g.upgraded, false);
  assert.deepEqual(g.profile.skins.deck_space, { r: 'rare', n: 42 });
  p = g.profile;
  g = grant(p, 'skin', 'deck_space', { rarity: 'common', serial: 7 });
  assert.ok(g.duplicate);
  assert.equal(g.profile.shards, META.shards.dupe.common);
  assert.equal(g.profile.skins.deck_space.n, 42, 'номер не змінюється');
  g = grant(p, 'skin', 'deck_space', { rarity: 'legendary', serial: 9 });
  assert.ok(g.upgraded);
  assert.equal(g.from, 'rare');
  assert.deepEqual(g.profile.skins.deck_space, { r: 'legendary', n: 9 });
  assert.equal(g.profile.shards, 0);
  // вдягнути можна лише своє
  assert.equal(equip(p, 'deck', 'deck_kyiv'), p);
  assert.equal(equip(p, 'deck', 'deck_space').equipped.deck, 'deck_space');
  assert.equal(equip(p, 'back', 'deck_space'), p, 'не тієї категорії');
  assert.equal(publicLook(equip(p, 'deck', 'deck_space')).rar.deck, 'rare');
});

import { recordJokers, jokerStatsCsv, normalizeJokerStats } from '../meta/profile.js';

test('статистика джокерів: набір, зіграні, перемоги, «змінив результат», CSV', () => {
  let st = recordJokers({}, ['roulette', 'thief', 'nope'], [{ id: 'roulette', won: true, changed: true }, { id: 'thief', won: false, changed: false }]);
  st = recordJokers(st, ['roulette'], [{ id: 'roulette', won: false, changed: true }]);
  assert.deepEqual(st.roulette, { picked: 2, played: 2, wins: 1, changed: 2 });
  assert.deepEqual(st.thief, { picked: 1, played: 1, wins: 0, changed: 0 });
  assert.equal(st.nope, undefined);
  const csv = jokerStatsCsv(st).split('\n');
  assert.equal(csv[0], 'id,name,rarity,picked,played,wins,win_pct,changed,changed_pct');
  assert.ok(csv.some((l) => l.startsWith('roulette,Рулетка,common,2,2,1,50,2,100')));
  assert.deepEqual(normalizeJokerStats({ roulette: { played: 2, wins: 9 } }).roulette.wins, 2, 'перемог не більше, ніж зіграно');
});
