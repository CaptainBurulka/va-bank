// Простий бот. Працює ЛИШЕ з view (тим, що бачить гравець), тож не підглядає.
import { CONFIG } from '../config.js';
import { cardValue } from './cards.js';

const SUIT_BEATS = { water: 'fire', fire: 'stone', stone: 'water' };

/** Оцінка сили карти 0..1 */
function strength(card, scoutSeen) {
  let s;
  if (card.kind === 'num') s = (card.value - 0.5) / 10;
  else if (card.kind === 'knife') s = 0.25; // інколи вбиває десятку
  else if (card.kind === 'mirror') s = 0.5; // завжди нічия
  else s = 0.5; // подвоєння: сила 5, але болючий штраф
  if (scoutSeen && card.kind === 'num') {
    if (scoutSeen === 'special') s -= 0.05;
    else if (SUIT_BEATS[card.suit] === scoutSeen) s += 0.05;
    else if (SUIT_BEATS[scoutSeen] === card.suit) s -= 0.05;
  }
  return Math.max(0, Math.min(1, s));
}

/**
 * Повертає дію для бота або null, якщо зараз не його черга.
 * @param {object} view — viewFor(state, botSeat)
 * @param {() => number} rng
 */
export function botDecide(view, rng = Math.random) {
  const legal = view.legal;
  if (!legal.length) return null;
  const has = (t) => legal.find((a) => a.type === t);

  switch (view.phase) {
    case 'play': {
      const hand = view.me.hand.slice().sort((a, b) => strength(a) - strength(b));
      // Іноді сильна карта, іноді слабка (для блефу), частіше середня.
      const r = rng();
      const idx = r < 0.35 ? hand.length - 1 : r < 0.55 ? 0 : Math.floor(rng() * hand.length);
      return { type: 'play', cardId: hand[idx].id };
    }
    case 'scout': {
      if (has('scout') && view.me.chips > 40 && rng() < 0.25) return { type: 'scout' };
      return { type: 'skipScout' };
    }
    case 'bet': {
      const s = strength(view.me.played, view.me.scoutSeen) + (rng() - 0.5) * 0.2;
      const raises = legal.filter((a) => a.type === 'raise');
      const bluff = rng() < 0.12;
      const pickRaise = () => {
        if (!raises.length) return null;
        if (s > 0.9 && rng() < 0.3) return raises.find((a) => a.amount === 'allin');
        if (s > 0.75) return raises.find((a) => a.amount === 10) || raises[raises.length - 1];
        return raises[0];
      };
      if (has('check')) {
        if ((s > 0.65 || bluff) && raises.length) return strip(pickRaise());
        return { type: 'check' };
      }
      // Треба відповідати на підняття
      const toCall = view.bet.toCall;
      const potOdds = toCall / (view.pot + toCall);
      if (s > 0.85 && raises.length && rng() < 0.5) return strip(pickRaise());
      if (s > 0.35 + potOdds * 0.6 || (bluff && s > 0.25)) return { type: 'call' };
      return { type: 'fold' };
    }
    case 'result': {
      if (has('don')) {
        const ref = cardValue(view.me.played, view.opp.played, CONFIG);
        if (ref <= 3 && rng() < 0.85) return { type: 'don', guess: 'higher' };
        if (ref >= 8 && rng() < 0.85) return { type: 'don', guess: 'lower' };
        if (ref <= 4 && rng() < 0.4) return { type: 'don', guess: 'higher' };
        if (ref >= 7 && rng() < 0.4) return { type: 'don', guess: 'lower' };
      }
      if (has('show') && view.result.winner === view.you && rng() < 0.3) return { type: 'show' };
      return { type: 'ready' };
    }
  }
  return null;
}

function strip(a) {
  return a ? { type: a.type, amount: a.amount } : { type: 'check' };
}
