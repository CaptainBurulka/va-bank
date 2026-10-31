// Бот із трьома стилями. Працює ЛИШЕ з view (тим, що бачить гравець), тож не підглядає.
// Підтримує і старі правила (rules 1), і нові (rules 2) — це потрібно для симуляцій «до/після».
import { CONFIG } from '../config.js';

export const BOT_STYLES = ['cautious', 'aggressive', 'bluffer'];

const SUIT_BEATS = { water: 'fire', fire: 'stone', stone: 'water' };

/** Ефективна сила моєї карти (з урахуванням козиря) і грубий шанс виграти 0..1. */
function estimate(view) {
  const card = view.me.played;
  const v2 = (view.rules || 1) >= 2;
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

function handPower(card, view) {
  const v2 = (view.rules || 1) >= 2;
  if (card.kind === 'num') return card.value + (v2 && view.trump === card.suit ? 1 : 0);
  if (card.kind === 'mirror') return v2 ? 11 : 5;
  if (card.kind === 'knife') return 2;
  return 5;
}

/**
 * Повертає дію для бота або null, якщо зараз не його черга.
 * @param {object} view — viewFor(state, botSeat)
 * @param {() => number} rng
 * @param {string} style — 'cautious' | 'aggressive' | 'bluffer'
 */
export function botDecide(view, rng = Math.random, style = 'aggressive') {
  const P = CONFIG.botStyles[style] || CONFIG.botStyles.aggressive;
  const legal = view.legal;
  if (!legal.length) return null;
  const has = (t) => legal.find((a) => a.type === t);

  switch (view.phase) {
    case 'play': {
      const hand = view.me.hand.slice().sort((a, b) => handPower(a, view) - handPower(b, view));
      // Обмін найслабшої карти
      if (has('swap')) {
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
      if (r?.don?.pending && has('don')) {
        const o = r.don.pending.odds;
        const pick = o.higher.p * o.higher.m >= o.lower.p * o.lower.m ? 'higher' : 'lower';
        if (o[pick].m <= 1) return { type: 'don', guess: o.higher.p >= o.lower.p ? 'higher' : 'lower' };
        return { type: 'don', guess: pick };
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
