// Міграція профілю схеми 2 (стара косметика) → 3 (предмети тематичних наборів із рідкістю і серійним номером).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { META } from '../config.js';
import { LEGACY_SKINS, SKIN_BY_ID } from '../meta/catalog.js';
import { migrate, normalize, exportCode, importCode, checksum, RANK, serialText } from '../meta/profile.js';

// Профіль 4.0.x: усе з тієї версії, що могло бути в гравця
const V2 = {
  v: 2, points: 340, shards: 15, pid: 'pk7m3x9qa2b',
  jokers: { roulette: 1, thief: 1, insurance: 1, storm: 1 },
  cosmetics: {
    deck_classic: true, back_burgundy: true, felt_green: true, chips_gold: true, win_chips: true, sound_classic: true, emoji_classic: true, frame_basic: true,
    deck_kyiv: true, deck_holo: true, // тематична легендарна і загальна легендарна
    felt_blue: true, felt_kyiv: true, // обидві лягають у «Нічний Київ»: лишається епічна, за звичайну — уламки
    win_fireworks: true, win_kyiv: true, // обидві епічні → один предмет, другий — уламки
    chips_cyber: true, chips_holo: true, // звичайна + легендарна → легендарна, за звичайну — уламки
    back_bluff: true, sound_samurai: true, frame_kyiv: true, emoji_animals: true,
    deck_unknown: true, // сміття
  },
  equipped: { deck: 'deck_holo', back: 'back_bluff', felt: 'felt_blue', chips: 'chips_cyber', win: 'win_fireworks', sound: 'sound_samurai', emoji: 'emoji_animals', frame: 'frame_kyiv' },
  set: ['roulette', 'storm'], pity: { epic: 3, legendary: 12 }, spins: 8, achievements: { bluff_one: 1 }, games: 12, wins: 7,
  nick: 'Оля', life: { games: 12, wins: 7 }, rivals: {},
};

test('міграція 2 → 3: жоден предмет не зникає, рідкість зберігається', () => {
  const p = migrate(structuredClone(V2));
  assert.equal(p.v, 3);
  for (const old of Object.keys(V2.cosmetics)) {
    if (!LEGACY_SKINS[old]) continue;
    const [id, r] = LEGACY_SKINS[old];
    assert.ok(p.skins[id], `${old} → ${id}`);
    assert.ok(RANK[p.skins[id].r] >= RANK[r], `${old}: рідкість не нижча за стару`);
  }
  assert.equal(p.skins.deck_kyiv.r, 'legendary');
  assert.equal(p.skins.deck_space.r, 'legendary');
  assert.equal(p.skins.felt_kyiv.r, 'epic');
  assert.equal(p.skins.chips_cyber.r, 'legendary');
  assert.equal(p.skins.back_pixel.r, 'rare');
  assert.equal(p.skins.sound_samurai.r, 'common');
  // старі id прибрано з косметики, класика, емодзі й рамки лишились
  assert.ok(!p.cosmetics.deck_kyiv && !p.cosmetics.felt_blue && !p.cosmetics.deck_unknown);
  for (const id of ['deck_classic', 'emoji_animals', 'frame_kyiv', 'frame_basic']) assert.ok(p.cosmetics[id], id);
});

test('міграція 2 → 3: злиті предмети компенсуються уламками за нижчу рідкість', () => {
  const p = migrate(structuredClone(V2));
  const d = META.shards.dupe;
  // felt_blue (звичайна) під felt_kyiv (епічна), win_kyiv (епічна) = win_fireworks (епічна), chips_cyber (звичайна) під chips_holo
  assert.equal(p.shards, V2.shards + d.common + d.epic + d.common);
  assert.equal(p.points, V2.points, 'бали не чіпаємо');
});

test('міграція 2 → 3: вдягнене перекладається на предмети наборів', () => {
  const p = migrate(structuredClone(V2));
  assert.deepEqual(p.equipped, { deck: 'deck_space', back: 'back_pixel', felt: 'felt_kyiv', chips: 'chips_cyber', win: 'win_kyiv', sound: 'sound_samurai', emoji: 'emoji_animals', frame: 'frame_kyiv' });
  for (const cat of ['deck', 'back', 'felt', 'chips', 'win', 'sound']) assert.equal(SKIN_BY_ID[p.equipped[cat]].cat, cat);
});

test('міграція 2 → 3: серійні номери стабільні, у межах 1…9999', () => {
  const a = migrate(structuredClone(V2));
  const b = migrate(structuredClone(V2));
  assert.deepEqual(a.skins, b.skins, 'той самий профіль — ті самі номери');
  for (const x of Object.values(a.skins)) assert.ok(Number.isInteger(x.n) && x.n >= 1 && x.n <= 9999);
  assert.equal(serialText(42), '№ 0042');
});

test('міграція ідемпотентна, а решта профілю не змінюється', () => {
  const p = migrate(structuredClone(V2));
  assert.deepEqual(migrate(structuredClone(p)), p);
  assert.deepEqual(normalize(p), p);
  assert.equal(p.nick, 'Оля');
  assert.equal(p.pid, V2.pid);
  assert.deepEqual(p.set, ['roulette', 'storm']);
  assert.equal(p.pity.legendary, 12);
  assert.equal(p.life.games, 12);
});

test('ланцюжок: профіль v0/v1 зі старою косметикою теж доходить до v3', () => {
  const v1 = migrate({ v: 1, points: 10, cosmetics: { felt_aurora: true }, equipped: { felt: 'felt_aurora' } });
  assert.equal(v1.v, 3);
  assert.equal(v1.skins.felt_space.r, 'legendary');
  assert.equal(v1.equipped.felt, 'felt_space');
  const v0 = migrate({ points: 5, jokers: ['thief'], cosmetics: { chips_ruby: true } });
  assert.equal(v0.skins.chips_pixel.r, 'rare');
});

test('імпорт старого коду (VB2) мігрує косметику', () => {
  const body = Buffer.from(JSON.stringify(V2), 'utf8').toString('base64');
  const r = importCode(`VB2.${body}.${checksum(body)}`);
  assert.ok(r.ok);
  assert.equal(r.profile.skins.deck_space.r, 'legendary');
  // і експорт нового — уже VB3
  assert.match(exportCode(r.profile), /^VB3\./);
});

test('зламані предмети наборів відкидаються при нормалізації', () => {
  const p = normalize({ v: 3, skins: { deck_kyiv: { r: 'mythic', n: 5 }, felt_space: { r: 'epic', n: -3 }, nope: { r: 'rare', n: 1 }, back_deco: null }, equipped: { deck: 'deck_kyiv', felt: 'felt_space' } });
  assert.deepEqual(p.skins, { felt_space: { r: 'epic', n: 1 } });
  assert.equal(p.equipped.deck, 'deck_classic', 'невалідний предмет не вдягається');
  assert.equal(p.equipped.felt, 'felt_space');
});
