// Усі числа балансу гри «Ва-банк». Змінюйте тут — логіка підхопить автоматично.
export const APP_VERSION = '2.1.0'; // змінюйте з кожним релізом разом із CACHE у sw.js

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
    cautious: Object.freeze({ raiseAt: 0.72, reraiseAt: 0.88, allinAt: 0.97, callSlack: 0.32, bluff: 0.03, scoutProb: 0.45, donStart: 0.25, donMinP: 0.75, swapMax: 3, swapProb: 0.7, playStrong: 0.3, playWeak: 0.15, showProb: 0.1 }),
    aggressive: Object.freeze({ raiseAt: 0.5, reraiseAt: 0.7, allinAt: 0.86, callSlack: 0.12, bluff: 0.12, scoutProb: 0.2, donStart: 0.7, donMinP: 0.55, swapMax: 4, swapProb: 0.6, playStrong: 0.4, playWeak: 0.15, showProb: 0.3 }),
    bluffer: Object.freeze({ raiseAt: 0.6, reraiseAt: 0.8, allinAt: 0.93, callSlack: 0.2, bluff: 0.3, scoutProb: 0.3, donStart: 0.5, donMinP: 0.6, swapMax: 2, swapProb: 0.4, playStrong: 0.25, playWeak: 0.35, showProb: 0.8 }),
  }),
});
