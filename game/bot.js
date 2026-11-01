// Бот із трьома стилями. Працює ЛИШЕ з view (тим, що бачить гравець), тож не підглядає.
// Підтримує і старі правила (rules 1), і нові (rules 2) — це потрібно для симуляцій «до/після».
import { CONFIG } from '../config.js';
import { slotOf, slotsOf, evaluate, compareCombos, bestSet, subsets, strengthOf } from './combos.js';
import { jokerSlot } from './jokers.js';

// Стилі в лобі (особистість у торгах; вибір карт — «розумний»). Для метрик глибини є ще 'greedy' і 'smart'.
export const BOT_STYLES = ['cautious', 'aggressive', 'bluffer'];
export const ALL_BOT_STYLES = ['greedy', 'smart', ...BOT_STYLES];

const SUIT_BEATS = { water: 'fire', fire: 'stone', stone: 'water' };

/** Ефективна сила моєї карти (з урахуванням козиря) і грубий шанс виграти 0..1. */
function estimate(view) {
  const card = view.me.played;
  const v2 = (view.rules || 1) >= 2;
  // Джокер: бот знає, наскільки він сильний у розкритті (і що в деяких це залежить від ставок)
  if (card.kind === 'joker') {
    const w = jokerWin(card.joker, view);
    const rivals = (view.n || 2) > 2 ? view.players.filter((x) => x.seat !== view.you && !x.out && !x.folded).length : 1;
    return { power: 5.5, win: rivals > 1 ? w ** rivals : w };
  }
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
  const base = win;

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
  win = Math.max(0, Math.min(1, win));
  // Утрьох треба побити кожного, хто ще в раунді: розвідка стосується лише одного з них
  const rivals = (view.n || 2) > 2 ? view.players.filter((x) => x.seat !== view.you && !x.out && !x.folded).length : 1;
  if (rivals > 1) win = (seen ? win : base) * base ** (rivals - 1);
  return { power, win };
}

/** Оцінка шансу виграти розкриття з джокером (для ставок бота). */
const JOKER_EST = {
  turncoat: 0.5, roulette: 0.5, thief: 0.45, fist: 0.55, insurance: 0.5, twin: 0.5, chameleon: 0.55, modest: 0.5,
  tax: 0.5, dice: 0.55, counter: 0.5, brazen: 0.45, magnet: 0.55, temptation: 0.45, storm: 0.45, swap: 0.55,
  highroller: 0.5, pocket: 0.5, sharper: 0.5, luck: 0.5, antitrump: 0.55, boom: 0.5, coin: 0.5, redeal: 0.45,
  echo: 0.5, quake: 0.5, castling: 0.5, frenzy: 0.5, apocalypse: 0.5, rewind: 0.5, chaosking: 0.5, duel: 0.5, mirrorworld: 0.5,
};
function jokerWin(id, view) {
  if (id === 'shadow') {
    const seen = (view.n || 2) > 2 ? view.players.some((x) => x.scouted && x.scoutTarget === view.you) : view.opp.scouted;
    return seen ? 0.92 : 0.45;
  }
  if (id === 'trap') return (view.bet?.owe ?? view.bet?.toCall) > 0 ? 0.95 : 0.35;
  if (id === 'temptation') { // Аутсайдер: сильніший, коли відстаєш
    const gap = Math.max(0, ...(view.players || [view.opp]).filter((x) => x.seat !== view.you).map((x) => x.chips)) - view.me.chips;
    return Math.min(0.9, 0.35 + Math.max(0, gap) / 100);
  }
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
  if ((view.core || view.cfg?.core) !== 'single' && (view.rules || 1) >= 3) return comboDecide(view, rng, style, over);
  return classicDecide(view, rng, style, over);
}

/** Стара гра однією картою («Класика (1 карта)»). greedy — завжди найсильніша карта, без блефу. */
function classicDecide(view, rng, style, over) {
  const P = over ? { ...(CONFIG.botStyles[style] || CONFIG.botStyles.aggressive), ...over } : (CONFIG.botStyles[style] || CONFIG.botStyles.aggressive);
  const legal = view.legal;
  if (!legal.length) return null;
  const multi = (view.n || 2) > 2;
  const k = multi ? view.players.filter((x) => x.seat !== view.you && !x.out && !x.folded).length : 1;
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
      if (has('scout') && view.me.chips > 25 && rng() < P.scoutProb) {
        const opts = legal.filter((a) => a.type === 'scout');
        const pick = opts.length > 1 ? opts[Math.floor(rng() * opts.length)] : opts[0];
        return pick.target === undefined ? { type: 'scout' } : { type: 'scout', target: pick.target };
      }
      return { type: 'skipScout' };
    }
    case 'bet': {
      const { win } = estimate(view);
      // утрьох пороги м'якші: шанс «побити обох» природно нижчий
      const s = (multi ? Math.min(1, win * (1 + 0.6 * (k - 1)) + 0.05) : win) + (rng() - 0.5) * 0.15;
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
      const toCall = view.bet.owe ?? view.bet.toCall;
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

// ═════════════ Комбінації з 3 карт ═════════════
// «Жадібний»: завжди найсильніша комбінація, відкриває найслабшу карту, без блефу, ставить за силою своєї комбінації.
// «Розумний» (і стилі лобі): тримає карти під майбутні комбінації, думає, що відкрити, читає відкриту карту
// суперника (Монте-Карло з урахуванням розвідки), блефує.

const FULL_DECK = (() => {
  const d = [];
  for (const su of ['water', 'fire', 'stone']) for (let v = 1; v <= 10; v++) d.push({ id: `${su[0]}${v}`, kind: 'num', suit: su, value: v });
  d.push({ id: 'knife', kind: 'knife' }, { id: 'mirror', kind: 'mirror' }, { id: 'double', kind: 'double' });
  return d;
})();

const slot = (c) => slotOf(c, jokerSlot);
const comboOf = (cards, trump) => evaluate(slotsOf(cards.map(slot)), trump);

/** Потенціал карт, що лишаються в руці (під майбутні комбінації): пари, однакові масті, сусіди, джокер. */
function potential(cards) {
  let p = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = slot(cards[i]), b = slot(cards[j]);
    if (a.wild || b.wild) { p += 0.25; continue; }
    if (a.v == null || b.v == null) continue;
    if (a.v === b.v) p += 0.22;
    if (a.s && a.s === b.s) p += 0.07;
    const d = Math.abs(a.v - b.v);
    if (d === 1) p += 0.07; else if (d === 2) p += 0.04;
  }
  for (const c of cards) {
    const sl = slot(c);
    if (c.kind === 'joker') p += 0.12;
    else if (c.kind === 'mirror') p += 0.15;
    else if (sl.v != null) p += sl.v / 200;
  }
  return p;
}

/** Очікувана сила наступного раунду: залишок руки + випадкові добрані карти (Монте-Карло, m вибірок). */
function futureMC(rest, pool, rng, m, size = 6) {
  const need = Math.max(0, size - rest.length);
  let sum = 0;
  for (let k = 0; k < m; k++) {
    const h = rest.slice();
    const p2 = pool.slice();
    for (let i = 0; i < need && p2.length; i++) h.push(p2.splice(Math.floor(rng() * p2.length), 1)[0]);
    sum += strengthOf(bestSet(h, null, { joker: jokerSlot }).combo);
  }
  return sum / m;
}

/** Невидимі карти (кандидати в закриті карти суперників). */
function unseen(view) {
  const seen = new Set();
  for (const c of view.me.hand) seen.add(c.id);
  for (const c of [].concat(view.me.played || [])) seen.add(c.id);
  for (const x of view.players || []) if (x.open) seen.add(x.open.id);
  return FULL_DECK.filter((c) => !seen.has(c.id));
}

/**
 * Шанс, що моя комбінація б'є суперника q: дорозкладаємо йому 5 карт до відкритої і беремо найкращий набір
 * із відкритою картою (бо він її поклав). Розвідка («є висока / нема») відсіює вибірки.
 */
function winVs(view, my, q, rng, samples) {
  const x = view.players[q];
  const pool = unseen(view);
  const open = x.open;
  const seen = view.me.scoutTarget === q || (view.n || 2) === 2 ? view.me.scoutSeen : null;
  let win = 0, tot = 0;
  for (let k = 0; k < samples * 3 && tot < samples; k++) {
    const hand = [];
    const p2 = pool.slice();
    for (let i = 0; i < 5 && p2.length; i++) hand.push(p2.splice(Math.floor(rng() * p2.length), 1)[0]);
    const cards = open ? [open, ...hand] : hand;
    const best = open
      ? bestSet(cards, view.trump, { joker: jokerSlot, filter: (idx) => idx.includes(0) })
      : bestSet(cards, view.trump, { joker: jokerSlot });
    if (seen) {
      const closed = best.idx.filter((i) => !(open && i === 0)).map((i) => cards[i]);
      const high = closed.some((c) => c.kind === 'mirror' || (slot(c).v ?? 0) >= (view.cfg.scoutHighFrom || 8));
      if ((seen === 'high') !== high) continue;
    }
    tot++;
    const c = compareCombos(my, best.combo);
    win += c > 0 ? 1 : c === 0 ? 0.5 : 0;
  }
  return tot ? win / tot : 0.5;
}

/** Оцінка шансу виграти розкриття: проти кожного, хто ще в раунді. */
function comboWin(view, rng, P) {
  const my = comboOf(view.me.played, view.trump);
  const rivals = view.players.filter((x) => x.seat !== view.you && !x.out && !x.folded);
  if (P.greedy) {
    // Жадібний не читає суперника: лише сила власної комбінації
    const st = strengthOf(my);
    return { my, win: st ** rivals.length };
  }
  let w = 1;
  for (const x of rivals) w *= winVs(view, my, x.seat, rng, P.samples || 30);
  // джокер у моєму наборі: ефект невідомий наперед — тягнемо оцінку до середини
  if (view.me.played.some((c) => c.kind === 'joker')) w = 0.65 * w + 0.35 * (rivals.length > 1 ? 0.3 : 0.5);
  return { my, win: w };
}

function comboDecide(view, rng, style, over) {
  const base = COMBO_STYLES[style] || COMBO_STYLES.smart;
  const P = over ? { ...base, ...over } : base;
  const legal = view.legal;
  if (!legal.length) return null;
  const has = (t) => legal.find((a) => a.type === t);
  const trump = view.trump;

  switch (view.phase) {
    case 'play': {
      const hand = view.me.hand;
      const k = Math.min(view.cfg.playCount || 3, hand.length);
      // Обмін: найменш корисна карта, якщо рука слабка
      if (has('swap') && !P.greedy && view.me.chips > 20) {
        const best = bestSet(hand, trump, { k, joker: jokerSlot });
        if (strengthOf(best.combo) < P.swapBelow && rng() < P.swapProb) {
          // карта, без якої потенціал руки найменше страждає (не джокер)
          let worst = null;
          for (const c of hand) {
            if (c.kind === 'joker') continue;
            const rest = hand.filter((x) => x !== c);
            const sc = strengthOf(bestSet(rest, trump, { k, joker: jokerSlot }).combo) + potential(rest);
            if (!worst || sc > worst.sc) worst = { c, sc };
          }
          if (worst) return { type: 'swap', cardId: worst.c.id };
        }
      }
      let pick;
      if (P.greedy || P.greedyPick) {
        const jk = P.forceJoker && hand.findIndex((c) => c.kind === 'joker');
        pick = bestSet(hand, trump, { k, joker: jokerSlot, filter: jk >= 0 && jk !== false ? (idx) => idx.includes(jk) : null }).idx.map((i) => hand[i]);
      } else {
        // Розумний: сила зараз + потенціал того, що лишиться в руці; джокер — за бажанням стилю
        const keepJoker = hand.some((c) => c.kind === 'joker') && rng() > (P.jokerPlay ?? 0.6) && view.round < view.maxRounds;
        const pool = P.mc ? unseen(view) : null;
        let best = null;
        for (const idx of subsets(hand.length, k)) {
          const cards = idx.map((i) => hand[i]);
          if (keepJoker && cards.some((c) => c.kind === 'joker')) continue;
          if (P.forceJoker && hand.some((c) => c.kind === 'joker') && !cards.some((c) => c.kind === 'joker')) continue;
          const rest = hand.filter((c) => !cards.includes(c));
          const st = strengthOf(comboOf(cards, trump));
          const late = view.round >= view.maxRounds; // в останньому раунді майбутнього немає
          const fut = late ? 0 : P.mc ? futureMC(rest, pool, rng, P.mc, view.cfg.handSize || 6) : potential(rest);
          const sc = st + (late ? 0 : P.future * fut) + (rng() - 0.5) * P.noise;
          if (!best || sc > best.sc) best = { sc, cards };
        }
        pick = best.cards;
      }
      // Що відкрити
      const bySlot = pick.slice().sort((a, b) => (slot(a).v ?? -1) - (slot(b).v ?? -1));
      let open = bySlot[0];
      if (!P.greedy && !P.greedyPick) {
        const st = strengthOf(comboOf(pick, trump));
        const r = rng();
        if (st < 0.35 && r < P.bluffOpen) open = bySlot[bySlot.length - 1]; // слабко — лякаємо старшою картою
        else if (st > 0.7 && r < P.trapOpen) open = bySlot[0]; // сильно — ховаємо силу
        else if (r < P.randomOpen) open = pick[Math.floor(rng() * pick.length)];
      }
      return { type: 'playSet', cards: pick.map((c) => c.id), open: open.id };
    }
    case 'scout': {
      if (has('scout') && !P.greedy && view.me.chips > 20) {
        const my = comboOf(view.me.played, trump);
        const st = strengthOf(my);
        // підглядати має сенс, коли рука «посередині»
        if (st > P.scoutLo && st < P.scoutHi && rng() < P.scoutProb) {
          const opts = legal.filter((a) => a.type === 'scout');
          const pick = opts.length > 1 ? opts.reduce((a, b) => ((view.players[b.target]?.chips || 0) > (view.players[a.target]?.chips || 0) ? b : a)) : opts[0];
          return pick.target === undefined ? { type: 'scout' } : { type: 'scout', target: pick.target };
        }
      }
      return { type: 'skipScout' };
    }
    case 'bet': {
      const { win } = comboWin(view, rng, P);
      const s = win + (rng() - 0.5) * P.betNoise;
      const raises = legal.filter((a) => a.type === 'raise');
      // блеф: частіше, коли відкрита карта суперника слабка
      const opens = view.players.filter((x) => x.seat !== view.you && !x.folded && x.open).map((x) => slot(x.open).v ?? 5);
      const weakOpp = opens.length && Math.max(...opens) <= 5;
      const bluff = !P.greedy && rng() < P.bluff * (weakOpp ? 1.6 : 1);
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
      const toCall = view.bet.owe ?? view.bet.toCall;
      const potOdds = toCall / (view.pot + toCall);
      if (s > P.reraiseAt && raises.length && rng() < 0.6) return strip(pickRaise());
      if (s > potOdds + P.callSlack || (bluff && s > 0.2)) return { type: 'call' };
      return { type: 'fold' };
    }
    case 'result':
      return classicDecide(view, rng, P.resultStyle || 'aggressive', null);
  }
  return null;
}

// Особистості для комбінацій: вибір карт (future — вага потенціалу руки), відкрита карта, розвідка, торги.
const SMART = { future: 1.0, mc: 10, noise: 0.04, bluffOpen: 0.35, trapOpen: 0.4, randomOpen: 0.2, swapBelow: 0.3, swapProb: 0.6,
  scoutLo: 0.3, scoutHi: 0.8, scoutProb: 0.5, raiseAt: 0.62, reraiseAt: 0.8, allinAt: 0.93, callSlack: 0.12, bluff: 0.1, betNoise: 0.1, samples: 30, jokerPlay: 0.6 };
export const COMBO_STYLES = {
  greedy: { greedy: true, raiseAt: 0.7, reraiseAt: 0.85, allinAt: 0.95, callSlack: 0.1, bluff: 0, betNoise: 0.1, jokerPlay: 1, resultStyle: 'aggressive' },
  smart: SMART,
  // контроль для метрики: торгує як Розумний, але карти обирає жадібно (найсильніша комбінація, відкриває найслабшу)
  greedyPick: { ...SMART, greedyPick: true },
  cautious: { ...SMART, raiseAt: 0.7, reraiseAt: 0.88, allinAt: 0.97, callSlack: 0.2, bluff: 0.04, scoutProb: 0.6, resultStyle: 'cautious' },
  aggressive: { ...SMART, raiseAt: 0.5, reraiseAt: 0.72, allinAt: 0.88, callSlack: 0.06, bluff: 0.14, scoutProb: 0.3, resultStyle: 'aggressive' },
  bluffer: { ...SMART, raiseAt: 0.58, reraiseAt: 0.8, allinAt: 0.93, callSlack: 0.1, bluff: 0.3, bluffOpen: 0.6, scoutProb: 0.35, resultStyle: 'bluffer' },
};
