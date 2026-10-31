// Усі числа балансу гри «Ва-банк». Змінюйте тут — логіка підхопить автоматично.
export const CONFIG = Object.freeze({
  startChips: 100,      // фішок у кожного гравця на старті
  ante: 5,              // обов'язкова ставка на початку раунду
  handSize: 4,          // скільки карт тримати в руці
  maxRounds: 12,        // кількість раундів у партії
  scoutCost: 4,         // ціна розвідки (підглянути масть)
  raiseSizes: [5, 10],  // фіксовані підняття (плюс «ва-банк»)
  maxRaises: 2,         // максимум піднять за раунд (сумарно для обох)
  donMaxAttempts: 2,    // скільки разів поспіль можна «подвоїти або нічого»
  knifePower: 0,        // сила «Ножа»
  knifeBeats: 10,       // кого б'є «Ніж»
  doublePower: 5,       // сила «Подвоєння»
  // Таймери у секундах (у режимі «передай телефон» вимкнені)
  timers: Object.freeze({ play: 20, scout: 12, bet: 25, result: 20 }),
  logSize: 40,
  // Стилі бота (рівні складності і гравці для симуляцій). Пороги — оцінка шансу виграти 0..1.
  botStyles: Object.freeze({
    cautious: Object.freeze({ raiseAt: 0.72, reraiseAt: 0.88, allinAt: 0.97, callSlack: 0.32, bluff: 0.03, scoutProb: 0.45, donStart: 0.25, donMinP: 0.75, swapMax: 3, swapProb: 0.7, playStrong: 0.3, playWeak: 0.15, showProb: 0.1 }),
    aggressive: Object.freeze({ raiseAt: 0.5, reraiseAt: 0.7, allinAt: 0.86, callSlack: 0.12, bluff: 0.12, scoutProb: 0.2, donStart: 0.7, donMinP: 0.55, swapMax: 4, swapProb: 0.6, playStrong: 0.4, playWeak: 0.15, showProb: 0.3 }),
    bluffer: Object.freeze({ raiseAt: 0.6, reraiseAt: 0.8, allinAt: 0.93, callSlack: 0.2, bluff: 0.3, scoutProb: 0.3, donStart: 0.5, donMinP: 0.6, swapMax: 2, swapProb: 0.4, playStrong: 0.25, playWeak: 0.35, showProb: 0.8 }),
  }),
});
