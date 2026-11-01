// Каталог косметики і досягнень. Уся графіка — процедурна (CSS/SVG), без картинок.
// Рідкість впливає лише на вигляд: рідкісна — блиск, епічна — світіння і градієнт, легендарна — анімація.

export const COSMETIC_CATS = {
  deck: 'Колода', back: 'Сорочка', felt: 'Сукно', chips: 'Фішки', win: 'Перемога', sound: 'Звук', emoji: 'Емодзі', frame: 'Рамка',
};

// source: start — є одразу; shop — магазин і автомат; slot — лише автомат; ach — лише за досягнення; set — за повний набір
// Тут лише «класика» (стартовий вигляд), емодзі й рамки профілю. Колоди, сорочки, сукна, фішки, перемоги й звуки —
// предмети тематичних наборів (SKIN_ITEMS нижче) з рідкістю конкретного екземпляра.
export const COSMETICS = [
  { id: 'deck_classic', cat: 'deck', name: 'Класика', rarity: 'common', source: 'start', vars: {} },
  { id: 'back_burgundy', cat: 'back', name: 'Бордо', rarity: 'common', source: 'start', vars: {} },
  { id: 'felt_green', cat: 'felt', name: 'Класичне зелене', rarity: 'common', source: 'start', vars: {} },
  { id: 'chips_gold', cat: 'chips', name: 'Золото', rarity: 'common', source: 'start', vars: {} },
  { id: 'win_chips', cat: 'win', name: 'Дощ фішок', rarity: 'common', source: 'start', fx: 'chips' },
  { id: 'sound_classic', cat: 'sound', name: 'Класика', rarity: 'common', source: 'start', accent: null },
  // Набори емодзі для реакцій
  { id: 'emoji_classic', cat: 'emoji', name: 'Класика', rarity: 'common', source: 'start', set: ['😂', '😱', '😎', '🔥', '🤡', '👏'] },
  { id: 'emoji_casino', cat: 'emoji', name: 'Казино', rarity: 'common', source: 'shop', set: ['🎰', '🃏', '💰', '🍀', '🎲', '🥂'] },
  { id: 'emoji_animals', cat: 'emoji', name: 'Звірята', rarity: 'rare', source: 'shop', set: ['🐱', '🦊', '🐸', '🐔', '🦁', '🐙'] },
  { id: 'emoji_collector', cat: 'emoji', name: 'Колекціонер', rarity: 'epic', source: 'ach', set: ['👑', '💎', '🗿', '🦄', '🧠', '🫡'] },
  // Рамка профілю
  { id: 'frame_basic', cat: 'frame', name: 'Базова', rarity: 'common', source: 'start', vars: {} },
  { id: 'frame_brass', cat: 'frame', name: 'Латунь', rarity: 'common', source: 'shop', vars: { '--frame': '#b88a2c' } },
  { id: 'frame_silver', cat: 'frame', name: 'Срібло', rarity: 'rare', source: 'shop', vars: { '--frame': '#d7dde5' } },
  { id: 'frame_fire', cat: 'frame', name: 'Полум\'я', rarity: 'epic', source: 'shop', vars: { '--frame': '#ff7a3d' } },
  { id: 'frame_cosmic', cat: 'frame', name: 'Космос', rarity: 'legendary', source: 'slot', vars: { '--frame': '#b48cff' }, anim: 'spin' },
  { id: 'frame_legend', cat: 'frame', name: 'Легенда', rarity: 'legendary', source: 'ach', vars: { '--frame': '#f3cf78' }, anim: 'spin' },
];

// ───── Тематичні набори (графіка — ui/skins/sets/*.js). Кожен: колода, сорочка, сукно, фішки, перемога, звук; повний набір — рамка. ─────
export const SKIN_KINDS = ['deck', 'back', 'felt', 'chips', 'win', 'sound'];
export const SKIN_SETS_META = [
  { id: 'kyiv', name: 'Нічний Київ', icon: '🌃', accent: 'bells', frame: '#ffb547' },
  { id: 'samurai', name: 'Самурай', icon: '🗡️', accent: 'koto', frame: '#e23b3b' },
  { id: 'cyber', name: 'Кіберпанк', icon: '🌆', accent: 'synth', frame: '#2ff3ff' },
  { id: 'cossack', name: 'Козацький', icon: '⚔️', accent: 'bandura', frame: '#d32f2f' },
  { id: 'deco', name: 'Ар-деко казино', icon: '🎰', accent: 'jazz', frame: '#e5b04a' },
  { id: 'abyss', name: 'Безодня', icon: '🪼', accent: 'sonar', frame: '#3ff7ff' },
  { id: 'pixel', name: 'Піксель', icon: '👾', accent: 'chip', frame: '#ffec27' },
  { id: 'space', name: 'Космос', icon: '🪐', accent: 'cosmos', frame: '#b97cff' },
];
export const SKIN_SET_BY_ID = Object.fromEntries(SKIN_SETS_META.map((s) => [s.id, s]));
const KIND_NAME = { deck: 'Колода', back: 'Сорочка', felt: 'Сукно', chips: 'Фішки', win: 'Перемога', sound: 'Звук' };
export const SKIN_ITEMS = SKIN_SETS_META.flatMap((st) => SKIN_KINDS.map((cat) => ({ id: `${cat}_${st.id}`, set: st.id, cat, name: `${KIND_NAME[cat]} «${st.name}»`, skin: true })));
export const SKIN_BY_ID = Object.fromEntries(SKIN_ITEMS.map((x) => [x.id, x]));
// рамки за повні набори
for (const st of SKIN_SETS_META) COSMETICS.push({ id: `frame_${st.id}`, set: st.id, cat: 'frame', name: st.name, rarity: 'legendary', source: 'set', vars: { '--frame': st.frame }, anim: 'spin' });

/**
 * Міграція старої косметики (схема ≤ 2) у предмети наборів — із збереженням рідкості.
 * Тематичні предмети старих 4 наборів переходять у той самий набір; загальні — у набір близький за духом.
 */
export const LEGACY_SKINS = Object.freeze({
  deck_ivory: ['deck_deco', 'common'], deck_mint: ['deck_abyss', 'rare'], deck_parchment: ['deck_samurai', 'epic'], deck_holo: ['deck_space', 'legendary'],
  back_emerald: ['back_cossack', 'common'], back_sapphire: ['back_abyss', 'rare'], back_filigree: ['back_deco', 'epic'], back_starry: ['back_space', 'legendary'], back_bluff: ['back_pixel', 'rare'],
  felt_blue: ['felt_kyiv', 'common'], felt_wine: ['felt_deco', 'rare'], felt_night: ['felt_cyber', 'epic'], felt_aurora: ['felt_space', 'legendary'], felt_goldrush: ['felt_pixel', 'legendary'],
  chips_silver: ['chips_space', 'common'], chips_ruby: ['chips_pixel', 'rare'], chips_emerald: ['chips_abyss', 'epic'], chips_holo: ['chips_cyber', 'legendary'],
  win_confetti: ['win_pixel', 'common'], win_hearts: ['win_samurai', 'rare'], win_fireworks: ['win_kyiv', 'epic'], win_goldrain: ['win_deco', 'legendary'],
  ...Object.fromEntries(['kyiv', 'samurai', 'cyber', 'cossack'].flatMap((s) => [
    [`deck_${s}`, [`deck_${s}`, 'legendary']], [`back_${s}`, [`back_${s}`, 'rare']], [`felt_${s}`, [`felt_${s}`, 'epic']],
    [`chips_${s}`, [`chips_${s}`, 'common']], [`win_${s}`, [`win_${s}`, 'epic']], [`sound_${s}`, [`sound_${s}`, 'common']],
  ])),
});

/** Тематичні набори: предмети (без рамки) і рамка за повний набір. */
export const SETS = SKIN_SETS_META.map((st) => ({ id: st.id, name: st.name, icon: st.icon, items: SKIN_KINDS.map((k) => `${k}_${st.id}`), frame: `frame_${st.id}` }));
export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_EQUIPPED = Object.fromEntries(Object.keys(COSMETIC_CATS).map((cat) => [cat, COSMETICS.find((c) => c.cat === cat && c.source === 'start').id]));

/** Досягнення: перевірка за підсумком партії (summary) і профілем. Нагорода — бали або унікальна косметика. */
export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Перша кров', desc: 'Виграти партію', reward: { points: 60 }, check: (s) => s.won },
  { id: 'bluff_one', name: 'Покер-фейс', desc: 'Виграти пасом суперника зі Старшою картою (у класиці — з карткою 1)', reward: { skin: 'back_pixel', rarity: 'rare' }, check: (s) => s.me.bluffOne > 0 },
  { id: 'comeback', name: 'Камбек', desc: 'Виграти партію, маючи посеред гри менше 15 фішок', reward: { points: 150 }, check: (s) => s.won && s.me.minChips < 15 },
  { id: 'legend_play', name: 'Легенда', desc: 'Зіграти легендарного джокера', reward: { cosmetic: 'frame_legend' }, check: (s) => s.me.legendary > 0 },
  { id: 'knife10', name: 'Ніж у спину', desc: 'Відрізати Ножем десятку суперника й виграти (у класиці — побити Ножем 10)', reward: { points: 80 }, check: (s) => s.me.knife10 > 0 },
  { id: 'trio10', name: 'Трійка десяток', desc: 'Виграти розкриття Трійкою 10', reward: { points: 120 }, check: (s) => (s.me.trio10 || 0) > 0 },
  { id: 'high_beats_pair', name: 'Нахаба', desc: 'Виграти розкриття Старшою картою проти Пари чи сильнішої', reward: { points: 80 }, check: (s) => (s.me.highBeatsPair || 0) > 0 },
  { id: 'combo_all', any: true, name: 'Повна колода', desc: 'Виграти розкриття кожною з 6 комбінацій (за весь час)', reward: { points: 150 }, check: (s, p) => ['high', 'pair', 'flush', 'straight', 'trio', 'sflush'].every((c) => (p.comboWins || {})[c] > 0) },
  { id: 'double_don', name: 'Двічі пощастило', desc: 'Вгадати «Подвій або нічого» двічі за раунд', reward: { points: 100 }, check: (s) => s.me.donRoundMax >= 2 },
  { id: 'allin_win', name: 'Ва-банк!', desc: 'Виграти розкриття після ва-банку', reward: { points: 60 }, check: (s) => s.me.allinWins > 0 },
  { id: 'bankrupt_win', name: 'Сухий рахунок', desc: 'Забрати всі фішки суперника', reward: { points: 80 }, check: (s) => s.won && s.endReason === 'bankrupt' },
  { id: 'chaos_trio', any: true, name: 'Майстер хаосу', desc: 'Зіграти звичайного, рідкісного й епічного джокера (за весь час)', reward: { points: 100 }, check: (s, p) => ['common', 'rare', 'epic'].every((r) => p.playedRarities.includes(r)) },
  { id: 'collector', any: true, name: 'Колекціонер', desc: 'Зібрати 10 різних джокерів', reward: { cosmetic: 'emoji_collector' }, check: (s, p) => Object.keys(p.jokers).length >= 10 },
  { id: 'marathon', any: true, name: 'Марафон', desc: 'Зіграти 10 партій', reward: { points: 100 }, check: (s, p) => p.games >= 10 },
  { id: 'lucky_spin', any: true, name: 'Щасливий спін', desc: 'Вибити легендарне з автомата', reward: { skin: 'felt_pixel', rarity: 'legendary' }, check: (s, p) => p.flags.legendarySpin },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
