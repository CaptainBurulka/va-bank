// Каталог косметики і досягнень. Уся графіка — процедурна (CSS/SVG), без картинок.
// Рідкість впливає лише на вигляд: рідкісна — блиск, епічна — світіння і градієнт, легендарна — анімація.

export const COSMETIC_CATS = {
  deck: 'Колода', back: 'Сорочка', felt: 'Сукно', chips: 'Фішки', win: 'Перемога', emoji: 'Емодзі', frame: 'Рамка',
};

// source: start — є одразу; shop — магазин і автомат; slot — лише автомат; ach — лише за досягнення
export const COSMETICS = [
  // Колода (лице карт)
  { id: 'deck_classic', cat: 'deck', name: 'Класика', rarity: 'common', source: 'start', vars: {} },
  { id: 'deck_ivory', cat: 'deck', name: 'Слонова кістка', rarity: 'common', source: 'shop', vars: { '--card-face': 'linear-gradient(170deg,#fffdf6,#efe8d6)', '--card-edge': '#b9a77e' } },
  { id: 'deck_mint', cat: 'deck', name: 'М\'ята', rarity: 'rare', source: 'shop', vars: { '--card-face': 'linear-gradient(170deg,#f2fff9,#d8f1e6)', '--card-edge': '#6fb79a' } },
  { id: 'deck_parchment', cat: 'deck', name: 'Пергамент', rarity: 'epic', source: 'shop', vars: { '--card-face': 'radial-gradient(circle at 30% 20%,#fff6dc,#ecd6a4 70%,#d9bb7c)', '--card-edge': '#9c7a3a' } },
  { id: 'deck_holo', cat: 'deck', name: 'Голограма', rarity: 'legendary', source: 'slot', vars: { '--card-face': 'linear-gradient(120deg,#fff 0%,#f4e9ff 25%,#e3fbff 50%,#fff5e0 75%,#fff 100%)', '--card-edge': '#b48cff' }, anim: 'holo' },
  // Сорочка
  { id: 'back_burgundy', cat: 'back', name: 'Бордо', rarity: 'common', source: 'start', vars: {} },
  { id: 'back_emerald', cat: 'back', name: 'Смарагд', rarity: 'common', source: 'shop', vars: { '--card-back-1': '#1d6b4a', '--card-back-2': '#0b3a26' } },
  { id: 'back_sapphire', cat: 'back', name: 'Сапфір', rarity: 'rare', source: 'shop', vars: { '--card-back-1': '#2a4f9e', '--card-back-2': '#101f4a' } },
  { id: 'back_filigree', cat: 'back', name: 'Золота філігрань', rarity: 'epic', source: 'shop', vars: { '--card-back-1': '#3a2410', '--card-back-2': '#120a03', '--back-line': 'rgba(243,207,120,.45)' } },
  { id: 'back_starry', cat: 'back', name: 'Зоряне небо', rarity: 'legendary', source: 'slot', vars: { '--card-back-1': '#1a1240', '--card-back-2': '#05030f' }, anim: 'stars' },
  { id: 'back_bluff', cat: 'back', name: 'Покер-фейс', rarity: 'rare', source: 'ach', vars: { '--card-back-1': '#4b4b4b', '--card-back-2': '#141414', '--back-line': 'rgba(255,255,255,.25)' } },
  // Сукно
  { id: 'felt_green', cat: 'felt', name: 'Класичне зелене', rarity: 'common', source: 'start', vars: {} },
  { id: 'felt_blue', cat: 'felt', name: 'Нічне синє', rarity: 'common', source: 'shop', vars: { '--felt-1': '#1f4f7a', '--felt-2': '#123657', '--felt-3': '#0a2036' } },
  { id: 'felt_wine', cat: 'felt', name: 'Вишневий оксамит', rarity: 'rare', source: 'shop', vars: { '--felt-1': '#7a1f36', '--felt-2': '#541227', '--felt-3': '#320a17' } },
  { id: 'felt_night', cat: 'felt', name: 'Нічне місто', rarity: 'epic', source: 'shop', vars: { '--felt-1': '#3b2a6b', '--felt-2': '#1f3a5e', '--felt-3': '#0d1426' } },
  { id: 'felt_aurora', cat: 'felt', name: 'Полярне сяйво', rarity: 'legendary', source: 'slot', vars: { '--felt-1': '#1b6b5a', '--felt-2': '#24406b', '--felt-3': '#0c1830' }, anim: 'aurora' },
  { id: 'felt_goldrush', cat: 'felt', name: 'Золота лихоманка', rarity: 'legendary', source: 'ach', vars: { '--felt-1': '#6b5216', '--felt-2': '#4a370c', '--felt-3': '#241a04', '--brass': '#e2b75a' }, anim: 'sparkle' },
  // Фішки
  { id: 'chips_gold', cat: 'chips', name: 'Золото', rarity: 'common', source: 'start', vars: {} },
  { id: 'chips_silver', cat: 'chips', name: 'Срібло', rarity: 'common', source: 'shop', vars: { '--chip': '#cfd6df' } },
  { id: 'chips_ruby', cat: 'chips', name: 'Рубін', rarity: 'rare', source: 'shop', vars: { '--chip': '#e0475f' } },
  { id: 'chips_emerald', cat: 'chips', name: 'Смарагд', rarity: 'epic', source: 'shop', vars: { '--chip': '#3fd18b' } },
  { id: 'chips_holo', cat: 'chips', name: 'Голографічні', rarity: 'legendary', source: 'slot', vars: { '--chip': '#b48cff' }, anim: 'holo' },
  // Анімація перемоги
  { id: 'win_chips', cat: 'win', name: 'Дощ фішок', rarity: 'common', source: 'start', fx: 'chips' },
  { id: 'win_confetti', cat: 'win', name: 'Конфеті', rarity: 'common', source: 'shop', fx: 'confetti' },
  { id: 'win_hearts', cat: 'win', name: 'Серця', rarity: 'rare', source: 'shop', fx: 'hearts' },
  { id: 'win_fireworks', cat: 'win', name: 'Феєрверк', rarity: 'epic', source: 'shop', fx: 'fireworks' },
  { id: 'win_goldrain', cat: 'win', name: 'Золотий дощ', rarity: 'legendary', source: 'slot', fx: 'goldrain' },
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
export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_EQUIPPED = Object.fromEntries(Object.keys(COSMETIC_CATS).map((cat) => [cat, COSMETICS.find((c) => c.cat === cat && c.source === 'start').id]));

/** Досягнення: перевірка за підсумком партії (summary) і профілем. Нагорода — бали або унікальна косметика. */
export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Перша кров', desc: 'Виграти партію', reward: { points: 60 }, check: (s) => s.won },
  { id: 'bluff_one', name: 'Покер-фейс', desc: 'Виграти пасом суперника, маючи карту 1', reward: { cosmetic: 'back_bluff' }, check: (s) => s.me.bluffOne > 0 },
  { id: 'comeback', name: 'Камбек', desc: 'Виграти партію, маючи посеред гри менше 15 фішок', reward: { points: 150 }, check: (s) => s.won && s.me.minChips < 15 },
  { id: 'legend_play', name: 'Легенда', desc: 'Зіграти легендарного джокера', reward: { cosmetic: 'frame_legend' }, check: (s) => s.me.legendary > 0 },
  { id: 'knife10', name: 'Ніж у спину', desc: 'Перемогти десятку Ножем', reward: { points: 80 }, check: (s) => s.me.knife10 > 0 },
  { id: 'double_don', name: 'Двічі пощастило', desc: 'Вгадати «Подвій або нічого» двічі за раунд', reward: { points: 100 }, check: (s) => s.me.donRoundMax >= 2 },
  { id: 'allin_win', name: 'Ва-банк!', desc: 'Виграти розкриття після ва-банку', reward: { points: 60 }, check: (s) => s.me.allinWins > 0 },
  { id: 'bankrupt_win', name: 'Сухий рахунок', desc: 'Забрати всі фішки суперника', reward: { points: 80 }, check: (s) => s.won && s.endReason === 'bankrupt' },
  { id: 'chaos_trio', any: true, name: 'Майстер хаосу', desc: 'Зіграти звичайного, рідкісного й епічного джокера (за весь час)', reward: { points: 100 }, check: (s, p) => ['common', 'rare', 'epic'].every((r) => p.playedRarities.includes(r)) },
  { id: 'collector', any: true, name: 'Колекціонер', desc: 'Зібрати 10 різних джокерів', reward: { cosmetic: 'emoji_collector' }, check: (s, p) => Object.keys(p.jokers).length >= 10 },
  { id: 'marathon', any: true, name: 'Марафон', desc: 'Зіграти 10 партій', reward: { points: 100 }, check: (s, p) => p.games >= 10 },
  { id: 'lucky_spin', any: true, name: 'Щасливий спін', desc: 'Вибити легендарне з автомата', reward: { cosmetic: 'felt_goldrush' }, check: (s, p) => p.flags.legendarySpin },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
