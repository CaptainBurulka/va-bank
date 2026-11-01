// Усі числа балансу гри «Ва-банк». Змінюйте тут — логіка підхопить автоматично.
export const APP_VERSION = '7.0.0'; // змінюйте з кожним релізом разом із CACHE у sw.js

export const CONFIG = Object.freeze({
  rules: 3,             // версія правил (для бота і симуляцій): 3 — комбінації з 3 карт
  // Основа раунду. 'combo' — рука 6, граєш 3 карти (одна відкрита), перемагає сильніша комбінація.
  // 'single' — стара гра однією картою (лишається в лобі як «Класика (1 карта)» на час тестування; без джокерів).
  core: 'combo',
  combo: Object.freeze({
    handSize: 6,        // карт у руці
    playCount: 3,       // скільки карт грається за раунд (одна з них відкрита)
    scoutHighFrom: 8,   // розвідка: «чи є серед закритих карт висока (від 8)»
  }),
  startChips: 100,      // фішок у кожного гравця на старті
  // Анте зростає: anteBase, далі +anteStep кожні anteEvery раундів (5 → 10 → 15 → 20)
  anteBase: 5,
  anteStep: 5,
  anteEvery: 4,
  handSize: 4,          // скільки карт тримати в руці
  maxRounds: 12,        // довжина партії за замовчуванням
  roundOptions: Object.freeze([8, 12, 16]), // хост обирає в лобі
  scoutCost: 5,         // ціна розвідки: за 3 «завжди підглядати» давало 59% перемог, за 5 — 54% (корисно, але не обов'язково)
  scoutHighFrom: 6,     // розвідка: «висока» від цієї номінальної сили
  swapCost: 2,          // обмін карти до вибору
  allinFreeFromRound: 4, // у раундах 1–3 ва-банк не більший за банк (інакше 21% партій кінчались до 4-го раунду)
  trumpBonus: 1,        // козирна масть додає до сили
  raiseSizes: Object.freeze([5, 10]), // фіксовані підняття (плюс «ва-банк»)
  maxRaises: 2,         // максимум піднять за раунд (сумарно для обох)
  knifePower: 0,        // сила «Ножа»
  knifeBeats: 10,       // кого б'є «Ніж» (за номіналом)
  doublePower: 5,       // сила «Подвоєння»
  don: Object.freeze({
    houseEdge: 0.1,     // множник на ~10% нижчий за справедливий
    maxWin: 20,         // максимальний виграш з однієї спроби: метрики однакові для 10…∞, ліміт лише ріже рідкісні стрибки
    secondFromRound: 6, // з якого раунду дозволена друга спроба поспіль
  }),
  // Таймери у секундах (у режимі «передай телефон» вимкнені)
  // Комбінації — окремий таймер на кожен крок: open — відкрита карта, closed — дві закриті (бачачи відкриті суперників)
  timers: Object.freeze({ play: 20, open: 15, closed: 30, scout: 12, bet: 25, result: 20 }),
  // Швидкість гри (хост обирає в лобі): множник таймерів; 0 — без таймера
  timerSpeeds: Object.freeze({ fast: 0.6, normal: 1, slow: 1.6, off: 0 }),
  // WebRTC: STUN безкоштовні; TURN — ретранслятор для мобільних мереж (LTE/5G часто за «симетричним» NAT,
  // де пряме з'єднання без TURN не встановлюється). Можна вказати кілька серверів масивом, напр.:
  // turn: [{ urls: ['turn:a.relay.example.com:80', 'turn:a.relay.example.com:443?transport=tcp', 'turns:a.relay.example.com:443?transport=tcp'], username: 'user', credential: 'pass' }],
  turn: null,
  // Онлайн: перепідключення
  net: Object.freeze({
    pingMs: 2000,          // серцебиття
    deadMs: 7000,          // без відповіді стільки — з'єднання вважаємо мертвим
    holdSec: 300,          // хост тримає місце гравця, що зник; далі за нього грає бот, доки не повернеться
    resumeWindowSec: 900,  // після перезапуску застосунку автоматично повертаємось у партію, якщо минуло не більше
  }),
  logSize: 40,
  // Гра на трьох: власні числа (режим на двох їх не бачить). Підібрано симуляціями tools/simulate3.js:
  // перший гравець вибуває в середньому не раніше ~2/3 партії, перемоги за місцями 28–38%.
  three: Object.freeze({
    startChips: 180,         // більше фішок: утрьох банки більші, а вибувати рано — нудно
    allinFreeFromRound: 8,   // до 8-го раунду ва-банк не більший за банк
    anteEvery: 6,            // анте росте повільніше: 5 → 10 кожні 6 раундів
  }),
  // Стилі бота (рівні складності і гравці для симуляцій). Пороги — оцінка шансу виграти 0..1.
  botStyles: Object.freeze({
    cautious: Object.freeze({ jokerPlay: 0.4, raiseAt: 0.72, reraiseAt: 0.88, allinAt: 0.97, callSlack: 0.32, bluff: 0.03, scoutProb: 0.45, donStart: 0.25, donMinP: 0.75, swapMax: 3, swapProb: 0.7, playStrong: 0.3, playWeak: 0.15, showProb: 0.1 }),
    aggressive: Object.freeze({ jokerPlay: 0.6, raiseAt: 0.5, reraiseAt: 0.7, allinAt: 0.86, callSlack: 0.12, bluff: 0.12, scoutProb: 0.2, donStart: 0.7, donMinP: 0.55, swapMax: 4, swapProb: 0.6, playStrong: 0.4, playWeak: 0.15, showProb: 0.3 }),
    // для метрики глибини в «Класиці (1 карта)»: жадібний — завжди найсильніша карта, без блефу; розумний — як агресивний
    greedy: Object.freeze({ jokerPlay: 1, raiseAt: 0.7, reraiseAt: 0.85, allinAt: 0.95, callSlack: 0.1, bluff: 0, scoutProb: 0, donStart: 0.5, donMinP: 0.6, swapMax: 0, swapProb: 0, playStrong: 1, playWeak: 0, showProb: 0 }),
    greedyPick: Object.freeze({ jokerPlay: 0.6, raiseAt: 0.5, reraiseAt: 0.7, allinAt: 0.86, callSlack: 0.12, bluff: 0.12, scoutProb: 0.2, donStart: 0.7, donMinP: 0.55, swapMax: 0, swapProb: 0, playStrong: 1, playWeak: 0, showProb: 0.3 }),
    smart: Object.freeze({ jokerPlay: 0.6, raiseAt: 0.5, reraiseAt: 0.7, allinAt: 0.86, callSlack: 0.12, bluff: 0.12, scoutProb: 0.2, donStart: 0.7, donMinP: 0.55, swapMax: 4, swapProb: 0.6, playStrong: 0.4, playWeak: 0.15, showProb: 0.3 }),
    gambler: Object.freeze({ jokerPlay: 0.8, raiseAt: 0.45, reraiseAt: 0.62, allinAt: 0.78, callSlack: 0.05, bluff: 0.18, scoutProb: 0.2, donStart: 0.92, donMinP: 0.5, swapMax: 3, swapProb: 0.5, playStrong: 0.5, playWeak: 0.15, showProb: 0.5 }),
    tilter: Object.freeze({ jokerPlay: 0.6, raiseAt: 0.55, reraiseAt: 0.75, allinAt: 0.9, callSlack: 0.15, bluff: 0.08, scoutProb: 0.35, donStart: 0.4, donMinP: 0.65, swapMax: 3, swapProb: 0.6, playStrong: 0.35, playWeak: 0.15, showProb: 0.2 }),
    bluffer: Object.freeze({ jokerPlay: 0.5, raiseAt: 0.6, reraiseAt: 0.8, allinAt: 0.93, callSlack: 0.2, bluff: 0.3, scoutProb: 0.3, donStart: 0.5, donMinP: 0.6, swapMax: 2, swapProb: 0.4, playStrong: 0.25, playWeak: 0.35, showProb: 0.8 }),
  }),
});

// ───────── Джокери: числа ефектів (комбінації з 3 карт; підібрано симуляціями на 45–55% перемог) ─────────
// Значення — у комбінації (1–10). Ключі — id джокерів (переосмислені джокери зберегли id).
export const JOKER_TUNING = Object.freeze({
  turncoat: { v: 10 },                   // Перевертень: сам — 10 без масті (заважає власній «слабкості»)
  roulette: { k: 8 },
  thief: { max: 3, loseTie: false },     // Дикун
  fist: { v: 8, fee: 10 },
  insurance: { v: 1 },                   // Чет-нечет
  twin: {},
  chameleon: { v: 7 },
  modest: { alt: 6 },                    // Підробка
  tax: { v: 6, fee: 5 },
  dice: { d: 2 },                        // Стрибок
  counter: { v: null, ranks: 1, bonusP: 0.5, loseTie: false }, // +1 сходинка, з шансом 50% — ще +1           // Сходинка
  brazen: { suit: false, loseTie: true, p: 0.8 },               // Близнюк
  magnet: { v: 6 },
  temptation: { v: 1, gap: 60 },         // Аутсайдер
  storm: { v: 5 },
  swap: {},
  shadow: { v: 2 },
  trap: { v: 2, ranks: 1 },
  highroller: { v: 6 },
  pocket: { v: 6 },
  sharper: { v: 4, alt: 7 },
  luck: { v: 5, up: 1 },
  brave: { v: 6, perRaise: 1 },
  antitrump: { ranks: 2 },               // Ламач
  echo: { v: 7 },
  quake: { v: 7 },
  castling: { v: 6, myTie: true },
  frenzy: { v: 6 },
  mirrorworld: { v: 7 },
  duel: { extra: 2 },
});

// Гра втрьох: ті самі ідеї джокерів, інші числа (треба побити двох суперників). Решта — як для двох.
export const JOKER_TUNING_3 = Object.freeze({
});

// Коли роздаються джокери: один і той самий випадковий раунд для обох
export const JOKER_DEAL = Object.freeze({ fromRound: 3, toRound: 7, setSize: 3 });

// ───────── Відчуття гри: коли раунд «гарячий» (великий банк або ва-банк) ─────────
export const FEEL = Object.freeze({
  hotPot: 50,        // банк від стількох фішок…
  hotShare: 0.3,     // …або від такої частки всіх фішок за столом
  tensionMs: 1100,   // пауза-напруга перед розкриттям у гарячому раунді
  weakCard: 3,       // перемога картою з номіналом до цього — «слабкою картою!»
  bluffCard: 4,      // пас суперника на мою карту до цього номіналу — «блеф пройшов!»
});

// ───────── Скіни: мова рідкостей (лише вигляд, на гру не впливає) ─────────
// Кольори дублюються в ui/skins/skins.css (--rar-*). Тривалості церемоній — мс; частинки — максимум на один предмет.
export const SKINS = Object.freeze({
  rarities: Object.freeze({
    common: Object.freeze({ name: 'Звичайна', color: '#9aa4ad', material: 'друк, мат' }),
    rare: Object.freeze({ name: 'Рідкісна', color: '#4aa8ff', material: 'метал, глянець' }),
    epic: Object.freeze({ name: 'Епічна', color: '#b56cff', material: 'голографічна фольга' }),
    legendary: Object.freeze({ name: 'Легендарна', color: '#ffc23d', material: 'жива голографія' }),
  }),
  ceremony: Object.freeze({ common: 900, rare: 1900, epic: 3400, legendary: 7200, legendaryDupe: 3600 }),
  particles: Object.freeze({ epic: 8, legendary: 26, win: 40, matchWin: 18 }), // matchWin — перемога в матчі (полегшено заради 60 fps)
  tiltMaxDeg: 16, // максимальний 3D-нахил карти
});

// ───────── Режими-модифікатори: лише пресети наявних налаштувань (для 2 і 3 гравців) ─────────
// preset(n, cfg) повертає зміни налаштувань поверх звичайних (cfg — уже з урахуванням гри втрьох).
export const MODES = Object.freeze({
  classic: Object.freeze({ name: 'Класика', icon: '♠️', desc: 'Звичайні правила', preset: () => ({}) }),
  chaos: Object.freeze({ name: 'Ніч хаосу', icon: '🌪️', desc: 'Джокери з 1-го раунду, по 2 на гравця', preset: () => ({ jokerFrom: 1, jokerTo: 1, jokersPerPlayer: 2 }) }),
  blitz: Object.freeze({ name: 'Бліц', icon: '⚡', desc: '8 раундів, анте росте вдвічі швидше', preset: (n, c) => ({ maxRounds: 8, anteEvery: Math.max(1, Math.round(c.anteEvery / 2)) }) }),
  blind: Object.freeze({ name: 'Сліпа гра', icon: '🙈', desc: 'Без розвідки', preset: (n, c) => ({ features: { ...c.features, scout: false } }) }),
  highstakes: Object.freeze({ name: 'Великі ставки', icon: '💎', desc: 'Старт 50 фішок, програний «подвій» кидає в джекпот удвічі більше', preset: () => ({ startChips: 50, jackpotMult: 2 }) }),
  // Стара гра однією картою (рука 4, без джокерів) — для порівняння й тестів; не буває «режимом дня»
  single: Object.freeze({ name: 'Класика (1 карта)', icon: '1️⃣', desc: 'Стара гра: одна карта за раунд, рука 4, без джокерів', noDay: true, preset: () => ({ core: 'single' }) }),
});
export const MODE_IDS = Object.freeze(Object.keys(MODES));

// ───────── Суперництво: титули, рахунок зустрічей, «момент партії» ─────────
export const RIVALS = Object.freeze({
  keep: 50, // скільки суперників пам'ятати (найдавніші відпадають)
  titles: Object.freeze({
    shark: Object.freeze({ wins: 20, rate: 0.6 }),
    bluffking: Object.freeze({ total: 10, perGame: 0.8 }),
    kamikaze: Object.freeze({ lost: 8 }),
    lucky: Object.freeze({ won: 12 }),
    allin: Object.freeze({ wins: 6 }),
    rock: Object.freeze({ games: 10, foldsPerGame: 0.6 }),
    spy: Object.freeze({ games: 8, perGame: 2 }),
    jester: Object.freeze({ jokers: 15 }),
  }),
  // вага кандидатів у «момент партії»
  moment: Object.freeze({ pot: 1, bluff: 40, bluffWeak: 40, legend: 150, don: 30, tie3: 60, comeback: 120, comebackFrom: 0.2 }),
});

// ───────── Прогресія: бали, магазин, автомат, уламки (лише віртуальні, без реальних грошей) ─────────
export const META = Object.freeze({
  schema: 3, // 3 — предмети тематичних наборів із рідкістю екземпляра (міграція старої косметики)
  // Бали за партію: участь + бонус за перемогу (слабший гравець теж прогресує)
  points: Object.freeze({ play: 40, win: 40, firstWinOfDay: 60, mult: Object.freeze({ online: 1, bot: 0.3, hotseat: 0.3 }),
    // гра втрьох: бонус за місце (1-ше, 2-ге, 3-тє) замість бонусу за перемогу
    place3: Object.freeze([40, 15, 0]),
    modeOfDay: 30 }), // бонус за партію в режимі дня (× множник режиму гри)
  // Ціни в магазині. Джокер: звичайний ≈ 2 партії, рідкісний ≈ 4, епічний ≈ 8 (у середньому ~60 балів за партію з другом)
  prices: Object.freeze({
    joker: Object.freeze({ common: 120, rare: 240, epic: 480 }),
    // косметика напряму дорожча, ніж середня ціна предмета з автомата (1 спін = 100)
    cosmetic: Object.freeze({ common: 180, rare: 360, epic: 720, legendary: 1500 }),
  }),
  spin: Object.freeze({
    cost: 100,
    odds: Object.freeze({ common: 0.62, rare: 0.27, epic: 0.09, legendary: 0.02 }),
    pityEpic: 15,       // епічне або краще — не рідше ніж раз на 15 спінів
    pityLegendary: 60,  // легендарне — не рідше ніж раз на 60 спінів
    jokerShare: 0.55,   // частка джокерів серед виграшів (решта — косметика)
  }),
  shards: Object.freeze({
    dupe: Object.freeze({ common: 20, rare: 50, epic: 120, legendary: 300 }), // дублікат → уламки
    exchange: Object.freeze({ common: 150, rare: 350, epic: 800, legendary: 2000 }), // уламки → предмет (легендарні джокери — ні)
  }),
  startJokers: Object.freeze(['roulette', 'thief', 'insurance']),
});
