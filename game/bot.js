// Бот із трьома стилями. Працює ЛИШЕ з view (тим, що бачить гравець), тож не підглядає.
// Підтримує і старі правила (rules 1), і нові (rules 2) — це потрібно для симуляцій «до/після».
import { CONFIG } from '../config.js';

export const BOT_STYLES = ['cautious', 'aggressive', 'bluffer'];

const SUIT_BEATS = { water: 'fire', fire: 'stone', stone: 'water' };

/** Ефективна сила моєї карти (з урахуванням козиря) і грубий шанс виграти 0..1. */
function estimate(view) {
  const card = view.me.played;
  const v2 = (view.rules || 1) >= 2;
  // Джокер: бот знає, наскільки він сильний у розкритті (і що в деяких це залежить від ставок)
  if (card.kind === 'joker') return { power: 5.5, win: jokerWin(card.joker, view) };
  const trump = view.trump;
  let power;
  if (card.kind === 'num') power = card.value + (v2 && trump === card.suit ? 1 : 0);
  else if (card.kind === 'knife') power = 0;
  else if (card.kind === 'double') power = 5;
  else power = v2 ? 10.5 : 5; // Дзеркало: у нових правилах виграє все, крім Ножа

  // Базова ймовірність: чим сильніша, тим краще (сила суперника ~ рівномірна 0..11)
  let win = Math.min(1, Math.max(0, (power + 0.3) / 11));
  if (card.kind === 'knife') win = 0.15;
  if (!v2 && card.kind === 'mirror') win = 0.5;

  const seen = view.me.scoutSeen;
  if (seen) {
    if (v2) {
      if (seen === 'high') win = card.kind === 'knife' ? 0.3 : card.kind === 'mirror' ? 0.95 : Math.max(0, Math.min(1, (power - 5.5) / 5.5));
      if (seen === 'low') win = card.kind === 'mirror' ? 0.95 : card.kind === 'knife' ? 0.05 : Math.max(0, Math.min(1, (power + 0.5) / 6.5));
    } else if (card.kind === 'num' && seen !== 'special') {
      if (SUIT_BEATS[card.suit] === seen) win += 0.05;
      if (SUIT_BEATS[seen] === card.suit) win -= 0.05;
    }
  }
  return { power, win: Math.max(0, Math.min(1, win)) };
}

/** Оцінка шансу виграти розкриття з джокером (для ставок бота). */
const JOKER_EST = {
  turncoat: 0.5, roulette: 0.5, thief: 0.2, fist: 0.55, insurance: 0.3, twin: 0.5, chameleon: 0.55, modest: 0.5,
  tax: 0.5, dice: 0.55, counter: 0.5, brazen: 0.5, magnet: 0.55, temptation: 0.55, storm: 0.45, swap: 0.55,
  highroller: 0.5, pocket: 0.5, sharper: 0.5, luck: 0.5, antitrump: 0.55, boom: 0.5, coin: 0.5, redeal: 0.45,
  echo: 0.5, quake: 0.5, castling: 0.5, frenzy: 0.5, apocalypse: 0.5, rewind: 0.5, chaosking: 0.5, duel: 0.5, mirrorworld: 0.5,
};
function jokerWin(id, view) {
  if (id === 'shadow') return view.opp.scouted ? 0.92 : 0.45;
  if (id === 'trap') return view.bet?.toCall > 0 ? 0.95 : 0.35;
  if (id === 'brave') return Math.min(0.9, 0.45 + 0.12 * (view.bet?.raises || 0));
  return JOKER_EST[id] ?? 0.5;
}

function handPower(card, view) {
  const v2 = (view.rules || 1) >= 2;
  if (card.kind === 'num') return card.value + (v2 && view.trump === card.suit ? 1 : 0);
  if (card.kind === 'mirror') return v2 ? 11 : 5;
  if (card.kind === 'knife') return 2;
  if (card.kind === 'joker') return 5.5;
  return 5;
}

/**
 * Повертає дію для бота або null, якщо зараз не його черга.
 * @param {object} view — viewFor(state, botSeat)
 * @param {() => number} rng
 * @param {string} style — 'cautious' | 'aggressive' | 'bluffer'
 */
export function botDecide(view, rng = Math.random, style = 'aggressive', over = null) {
  const P = over ? { ...(CONFIG.botStyles[style] || CONFIG.botStyles.aggressive), ...over } : (CONFIG.botStyles[style] || CONFIG.botStyles.aggressive);
  const legal = view.legal;
  if (!legal.length) return null;
  const has = (t) => legal.find((a) => a.type === t);

  switch (view.phase) {
    case 'play': {
      // Джокер: розігрує з імовірністю jokerPlay (інакше тримає на потім)
      const jk = view.me.hand.find((c) => c.kind === 'joker');
      if (jk && (rng() < (P.jokerPlay ?? 0.5) || view.round >= view.maxRounds)) return { type: 'play', cardId: jk.id };
      const hand = view.me.hand.filter((c) => c.kind !== 'joker').sort((a, b) => handPower(a, view) - handPower(b, view));
      if (!hand.length) return { type: 'play', cardId: view.me.hand[0].id };
      // Обмін найслабшої карти
      if (has('swap') && hand.length) {
        const worst = hand[0];
        if (handPower(worst, view) <= P.swapMax && rng() < P.swapProb) return { type: 'swap', cardId: worst.id };
      }
      // Сильну карту — коли банк великий, слабку — для блефу.
      const r = rng();
      let idx;
      if (r < P.playStrong) idx = hand.length - 1;
      else if (r < P.playStrong + P.playWeak) idx = 0;
      else idx = Math.floor(rng() * hand.length);
      return { type: 'play', cardId: hand[idx].id };
    }
    case 'scout': {
      if (has('scout') && view.me.chips > 25 && rng() < P.scoutProb) return { type: 'scout' };
      return { type: 'skipScout' };
    }
    case 'bet': {
      const { win } = estimate(view);
      const s = win + (rng() - 0.5) * 0.15;
      const raises = legal.filter((a) => a.type === 'raise');
      const bluff = rng() < P.bluff;
      const pickRaise = () => {
        if (!raises.length) return null;
        const allin = raises.find((a) => a.amount === 'allin');
        if (s > P.allinAt && allin) return allin;
        if (s > P.raiseAt + 0.12 || (bluff && rng() < 0.5)) return raises.find((a) => a.amount === 10) || raises[raises.length - 1];
        return raises[0];
      };
      const strip = (a) => (a ? { type: a.type, amount: a.amount } : null);
      if (has('check')) {
        if ((s > P.raiseAt || bluff) && raises.length) return strip(pickRaise());
        return { type: 'check' };
      }
      const toCall = view.bet.toCall;
      const potOdds = toCall / (view.pot + toCall);
      if (s > P.reraiseAt && raises.length && rng() < 0.6) return strip(pickRaise());
      if (s > potOdds + P.callSlack || (bluff && s > 0.2)) return { type: 'call' };
      return { type: 'fold' };
    }
    case 'result': {
      const r = view.result;
      // Нові правила: спершу відкривається база, потім вибір із шансами
      if (r?.don?.pending) {
        const o = r.don.pending.odds;
        const opts = legal.filter((a) => a.type === 'don');
        if (!opts.length) return { type: 'ready' };
        // Обираємо варіант із більшим шансом; обережний відмовляється, якщо шанс малий
        const best = opts.reduce((x, y) => (o[y.guess].p > o[x.guess].p ? y : x));
        if (o[best.guess].p < P.donMinP - 0.1) return { type: 'ready' };
        return { type: 'don', guess: best.guess };
      }
      if (has('donStart')) {
        if (rng() < P.donStart) return { type: 'donStart' };
      } else if (has('don')) {
        // Старі правила: вгадування відносно власної карти
        const ref = view.me.played.kind === 'num' ? view.me.played.value : view.me.played.kind === 'knife' ? 0 : 5;
        const pHigher = (10 - ref) / 10;
        const pLower = (ref - 1) / 10;
        if (Math.max(pHigher, pLower) >= P.donMinP) return { type: 'don', guess: pHigher >= pLower ? 'higher' : 'lower' };
      }
      if (has('show') && r.winner === view.you && rng() < P.showProb) return { type: 'show' };
      return { type: 'ready' };
    }
  }
  return null;
}
