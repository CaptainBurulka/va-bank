// Усі числа балансу гри «Ва-банк». Змінюйте тут — логіка підхопить автоматично.
export const APP_VERSION = '3.0.0'; // змінюйте з кожним релізом разом із CACHE у sw.js

export const CONFIG = Object.freeze({
  rules: 2,             // версія правил (для бота і симуляцій)
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
  timers: Object.freeze({ play: 20, scout: 12, bet: 25, result: 20 }),
  // WebRTC: STUN безкоштовні; TURN потрібен лише для «важких» мобільних мереж.
  // Приклад: { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }
  turn: null,
  logSize: 40,
  // Стилі бота (рівні складності і гравці для симуляцій). Пороги — оцінка шансу виграти 0..1.
  botStyles: Object.freeze({
    cautious: Object.freeze({ jokerPlay: 0.4, raiseAt: 0.72, reraiseAt: 0.88, allinAt: 0.97, callSlack: 0.32, bluff: 0.03, scoutProb: 0.45, donStart: 0.25, donMinP: 0.75, swapMax: 3, swapProb: 0.7, playStrong: 0.3, playWeak: 0.15, showProb: 0.1 }),
    aggressive: Object.freeze({ jokerPlay: 0.6, raiseAt: 0.5, reraiseAt: 0.7, allinAt: 0.86, callSlack: 0.12, bluff: 0.12, scoutProb: 0.2, donStart: 0.7, donMinP: 0.55, swapMax: 4, swapProb: 0.6, playStrong: 0.4, playWeak: 0.15, showProb: 0.3 }),
    bluffer: Object.freeze({ jokerPlay: 0.5, raiseAt: 0.6, reraiseAt: 0.8, allinAt: 0.93, callSlack: 0.2, bluff: 0.3, scoutProb: 0.3, donStart: 0.5, donMinP: 0.6, swapMax: 2, swapProb: 0.4, playStrong: 0.25, playWeak: 0.35, showProb: 0.8 }),
  }),
});

// ───────── Джокери: числа ефектів (підібрано симуляціями на ~50% перемог) ─────────
export const JOKER_TUNING = Object.freeze({
  turncoat: { power: 6 },
  roulette: { max: 12 },
  thief: { power: 2, steal: 8 },
  fist: { power: 7 },
  insurance: { power: 3 },
  chameleon: { power: 5 },
  modest: { power: 6 },
  tax: { power: 6, fee: 5 },
  dice: { minus: 1 },
  counter: { plus: 2 },
  brazen: { power: 6, fine: 5 },
  magnet: { power: 7 },
  temptation: { power: 7, pct: 30 },
  shadow: { power: 6, scouted: 10 },
  trap: { power: 5 },
  highroller: { power: 6 },
  sharper: { power: 5 },
  luck: { high: 10, low: 1 },
  brave: { power: 6, perRaise: 2 },
  antitrump: { power: 6 },
  quake: { power: 6 },
  frenzy: { power: 6 },
  mirrorworld: { power: 6 },
  echo: { power: 6 },
  storm: { oppBonus: 1 },
  redeal: { oppBonus: 1 },
  castling: { power: 7 },
});

// Коли роздаються джокери: один і той самий випадковий раунд для обох
export const JOKER_DEAL = Object.freeze({ fromRound: 3, toRound: 7, setSize: 3 });

// ───────── Прогресія: бали, магазин, автомат, уламки (лише віртуальні, без реальних грошей) ─────────
export const META = Object.freeze({
  schema: 1,
  // Бали за партію: участь + бонус за перемогу (слабший гравець теж прогресує)
  points: Object.freeze({ play: 40, win: 40, firstWinOfDay: 60, mult: Object.freeze({ online: 1, bot: 0.3, hotseat: 0.3 }) }),
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
