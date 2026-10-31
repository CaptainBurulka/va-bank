// Стан партії, правила та reducer дій. Чиста логіка без DOM і мережі.
// Усі випадкові рішення беруться з ctx.rng(), час — з ctx.now.

import { CONFIG, JOKER_DEAL } from '../config.js';
import { buildDeck, shuffle, compareDetail, scoutClass, donOdds, SUITS } from './cards.js';
import { resolveJokers, jokerCard, sanitizeSet, JOKER_BY_ID } from './jokers.js';

export const STATE_VERSION = 2;

const other = (p) => 1 - p; // лише для двох гравців
const clone = (o) => JSON.parse(JSON.stringify(o));

// ───────────── місця за столом (2 або 3 гравці) ─────────────
const N = (s) => s.players.length;
const seats = (s) => s.players.map((_, i) => i);
/** У партії (не вибув). */
const inGame = (s, p) => !s.players[p].out;
/** У раунді: не вибув і не спасував. */
const inRound = (s, p) => !s.players[p].out && !s.players[p].folded;
/** Наступне місце за годинниковою стрілкою, що задовольняє pred. */
function nextSeat(s, p, pred = (q) => inGame(s, q)) {
  for (let i = 1; i <= N(s); i++) { const q = (p + i) % N(s); if (pred(q)) return q; }
  return p;
}
/** Учасники розкриття в порядку місць. */
export const participants = (s) => seats(s).filter((q) => inRound(s, q));
/**
 * «Суперник» для джокера: у грі вдвох — інший гравець; утрьох — лідер за фішками серед
 * інших учасників розкриття (за рівності — найближчий за годинниковою стрілкою).
 */
export function jokerTarget(s, me) {
  let best = null;
  for (let i = 1; i < N(s); i++) {
    const q = (me + i) % N(s);
    if (!inRound(s, q)) continue;
    if (best === null || s.players[q].chips > s.players[best].chips) best = q;
  }
  return best ?? nextSeat(s, me);
}

function newStats(start = 100) {
  return {
    biggestPot: 0, bluffs: 0, donWon: 0, donLost: 0, donPush: 0, roundsWon: 0, scouts: 0, folds: 0, swaps: 0,
    // для досягнень
    jokers: [], minChips: start, bluffOne: 0, legendary: 0, knife10: 0, allinWins: 0, donRoundMax: 0,
    outRound: null, place: null,
  };
}

/** Ділить amount між платниками пропорційно вагам (метод найбільших залишків), не більше їхніх фішок. */
function splitByWeight(weights, amount) {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
  const out = weights.map(() => 0);
  if (!total || amount <= 0) return out;
  let rest = amount;
  const fr = weights.map((w, i) => { const x = (Math.max(0, w) * amount) / total; out[i] = Math.floor(x); rest -= out[i]; return [x - out[i], i]; });
  fr.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0 && k < fr.length; k++) if (weights[fr[k][1]] > 0) { out[fr[k][1]] += 1; rest -= 1; }
  return out;
}

/** Анте для раунду: 5 → 10 → 15 → … кожні anteEvery раундів. */
export function anteFor(round, cfg) {
  return cfg.anteBase + cfg.anteStep * Math.floor((round - 1) / cfg.anteEvery);
}

/**
 * Створює нову партію і одразу починає перший раунд.
 * @param {object} opts { config?, timers?: boolean, deck?: card[] (для тестів), firstToAct?, trumps?: string[] (для тестів) }
 * @param {object} ctx { rng, now }
 */
export function createGame(opts = {}, ctx) {
  const n = opts.players === 3 ? 3 : 2;
  // Режим на трьох має власні числа (стартові фішки, анте…) — режим на двох їх не бачить
  const cfg = { ...CONFIG, ...(n === 3 ? CONFIG.three || {} : {}), ...(opts.config || {}) };
  cfg.players = n;
  cfg.features = { trump: true, swap: true, ...(CONFIG.features || {}), ...(opts.config?.features || {}) };
  const deck = opts.deck ? clone(opts.deck) : shuffle(buildDeck(), ctx.rng);
  const s = {
    v: STATE_VERSION,
    cfg,
    timersEnabled: opts.timers !== false,
    phase: 'play',
    round: 0,
    deck,
    discard: [],
    pot: 0,
    carry: 0,
    jackpot: 0,
    trump: null,
    fixedTrumps: opts.trumps || null,
    contrib: Array(n).fill(0),
    players: Array.from({ length: n }, () => ({
      chips: cfg.startChips,
      hand: [],
      played: null,
      swapped: false,
      scouted: false,
      scoutDecided: false,
      scoutSeen: null,
      shown: false,
      ready: false,
      folded: false,
      out: false,
      scoutTarget: null,
    })),
    bet: null,
    firstToAct: opts.firstToAct ?? Math.floor(ctx.rng() * n),
    lastLoser: null,
    lastWinner: null,
    outOrder: [],
    result: null,
    log: [],
    stats: Array.from({ length: n }, () => newStats(cfg.startChips)),
    places: null,
    winner: null,
    endReason: null,
    timer: null,
    seq: 0,
    // Джокери: набори фіксуються на хості на початку партії
    jokerSets: Array.from({ length: n }, (_, i) => sanitizeSet(opts.jokerSets?.[i], cfg.jokerSetSize ?? JOKER_DEAL.setSize)),
    jokerRound: null,
    lastJoker: null,
    roundRaises: Array(n).fill(0),
    roundAllin: false,
    jokerTrash: [],
  };
  if (s.jokerSets.some((x) => x.length)) {
    const from = cfg.jokerFrom ?? JOKER_DEAL.fromRound, to = cfg.jokerTo ?? JOKER_DEAL.toRound;
    s.jokerRound = opts.jokerRound ?? from + Math.floor(ctx.rng() * (to - from + 1));
  }
  startRound(s, ctx, true);
  return s;
}

// ───────────── допоміжне ─────────────

function log(s, entry) {
  s.log.push({ r: s.round, ...entry });
  if (s.log.length > s.cfg.logSize) s.log.splice(0, s.log.length - s.cfg.logSize);
}

function reshuffle(s, ctx) {
  s.deck = s.deck.concat(shuffle(s.discard, ctx.rng));
  s.discard = [];
  log(s, { t: 'reshuffle' });
}

function drawCard(s, ctx) {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return null;
    reshuffle(s, ctx);
  }
  return s.deck.shift();
}

/** Наступна числова карта (спецкарти йдуть у відбій). Для «подвій або нічого». */
function drawNumeric(s, ctx) {
  for (let guard = 0; guard < 80; guard++) {
    if (!s.deck.some((c) => c.kind === 'num')) {
      if (!s.discard.some((c) => c.kind === 'num')) return null;
      reshuffle(s, ctx);
    }
    const c = s.deck.shift();
    if (c.kind === 'num') return c;
    s.discard.push(c);
  }
  return null;
}

function pay(s, p, amount) {
  const a = Math.max(0, Math.min(amount, s.players[p].chips));
  s.players[p].chips -= a;
  s.pot += a;
  s.contrib[p] += a;
  return a;
}

function transfer(s, from, to, amount) {
  const a = Math.max(0, Math.min(amount, s.players[from].chips));
  s.players[from].chips -= a;
  s.players[to].chips += a;
  return a;
}

function setTimer(s, phase, ctx) {
  if (!s.timersEnabled) { s.timer = null; return; }
  const duration = s.cfg.timers[phase] * 1000;
  const paused = s.timer?.paused || false;
  s.timer = paused
    ? { phase, duration, deadline: null, remaining: duration, paused: true }
    : { phase, duration, deadline: ctx.now + duration, remaining: duration, paused: false };
}

function startRound(s, ctx, first = false) {
  s.round += 1;
  s.carry = s.pot;
  // Першим ходить гравець після переможця минулого раунду (удвох — це той, хто програв)
  if (!first && s.lastWinner !== null) s.firstToAct = nextSeat(s, s.lastWinner);
  if (!inGame(s, s.firstToAct)) s.firstToAct = nextSeat(s, s.firstToAct);
  s.result = null;
  s.bet = null;
  s.contrib = Array(N(s)).fill(0);
  s.roundRaises = Array(N(s)).fill(0);
  s.roundAllin = false;
  s.jokerTrash = [];
  if (s.pot === 0) s.jackpot = 0;
  for (const pl of s.players) {
    Object.assign(pl, { played: null, swapped: false, scouted: false, scoutDecided: false, scoutSeen: null, scoutTarget: null, shown: false, ready: false, folded: false });
  }
  // Козир раунду
  s.trump = s.cfg.features.trump
    ? (s.fixedTrumps ? s.fixedTrumps[(s.round - 1) % s.fixedTrumps.length] : SUITS[Math.floor(ctx.rng() * SUITS.length)])
    : null;
  log(s, { t: 'round', trump: s.trump });
  const ante = anteFor(s.round, s.cfg);
  const live = seats(s).filter((q) => inGame(s, q));
  for (const p of live) {
    const a = pay(s, p, ante);
    log(s, { t: 'ante', p, amount: a });
  }
  for (const p of live) {
    const hand = s.players[p].hand;
    while (hand.length < s.cfg.handSize) {
      const c = drawCard(s, ctx);
      if (!c) break;
      hand.push(c);
    }
  }
  // Раунд джокерів: обидва отримують по одному випадковому джокеру зі свого набору
  if (s.round === s.jokerRound && !s.jokersDealt) {
    s.jokersDealt = true; // лише раз за партію (навіть якщо раунд переграється)
    const per = s.cfg.jokersPerPlayer ?? 1;
    for (const p of live) {
      const set = s.jokerSets[p].slice();
      for (let k = 0; k < per && set.length; k++) {
        const jid = set.splice(Math.floor(ctx.rng() * set.length), 1)[0];
        const card = jokerCard(jid, p, N(s));
        if (k) card.id += `-${k}`;
        s.players[p].hand.push(card);
      }
    }
    log(s, { t: 'jokerDeal', who: live.filter((p) => s.jokerSets[p].length) });
  }
  s.phase = 'play';
  setTimer(s, 'play', ctx);
}

function enterScout(s, ctx) {
  s.phase = 'scout';
  for (const p of seats(s)) {
    const pl = s.players[p];
    if (pl.out || pl.chips < s.cfg.scoutCost || s.cfg.features.scout === false) pl.scoutDecided = true;
  }
  if (s.players.every((pl) => pl.out || pl.scoutDecided)) return enterBet(s, ctx);
  setTimer(s, 'scout', ctx);
}

function enterBet(s, ctx) {
  s.phase = 'bet';
  const first = inRound(s, s.firstToAct) ? s.firstToAct : nextSeat(s, s.firstToAct, (q) => inRound(s, q));
  // need — скільки кожен має докласти, щоб зрівнятися; pending — хто ще не відповів на поточну ставку
  s.bet = { toAct: first, raises: 0, toCall: 0, checks: 0, need: Array(N(s)).fill(0), pending: participants(s) };
  setTimer(s, 'bet', ctx);
}

/** Передає хід наступному, хто ще має відповісти; якщо таких немає — розкриття. */
function advanceBet(s, ctx, p) {
  if (!s.bet.pending.length) return showdown(s, ctx);
  const q = nextSeat(s, p, (x) => s.bet.pending.includes(x));
  s.bet.toAct = q;
  s.bet.toCall = s.bet.need[q];
  setTimer(s, 'bet', ctx);
}

function doCheck(s, ctx, p, auto = false) {
  s.bet.checks += 1;
  s.bet.pending = s.bet.pending.filter((x) => x !== p);
  log(s, auto ? { t: 'check', p, auto: true } : { t: 'check', p });
  advanceBet(s, ctx, p);
}

function doFold(s, ctx, p, auto = false) {
  log(s, auto ? { t: 'fold', p, auto: true } : { t: 'fold', p });
  s.players[p].folded = true;
  s.stats[p].folds += 1;
  s.bet.pending = s.bet.pending.filter((x) => x !== p);
  const left = participants(s);
  if (left.length === 1) return enterResult(s, ctx, left[0], 'fold');
  advanceBet(s, ctx, p);
}

function updateBiggest(s, p, amount) {
  s.stats[p].biggestPot = Math.max(s.stats[p].biggestPot, amount);
}

function enterResult(s, ctx, winner, reason, detail = null, winnerCard = null) {
  s.phase = 'result';
  s.bet = null;
  const res = { winner, reason, won: 0, penalty: 0, revealed: reason === 'showdown' || reason === 'void' || reason === 'replay', bluff: false, don: null, detail };
  res.parts = participants(s);
  // У журнал потрапляють лише карти учасників розкриття (карти тих, хто спасував, — таємниця)
  const shownCards = s.players.map((pl, q) => (res.parts.includes(q) ? pl.played : null));
  if (winner === null) {
    res.carry = s.pot;
    if (N(s) > 2 && reason === 'showdown') s.jackpot = s.pot; // нічия за перше місце утрьох — банк у джекпот
    log(s, { t: 'tie', pot: s.pot, cards: shownCards, detail });
  } else {
    const opps = seats(s).filter((q) => q !== winner && inGame(s, q));
    const potAmount = s.pot;
    s.players[winner].chips += potAmount;
    s.pot = 0;
    s.jackpot = 0;
    const paid = Array(N(s)).fill(0);
    if (reason === 'showdown' && (winnerCard || s.players[winner].played).kind === 'double') {
      // «Подвоєння»: суперники в розкритті доплачують ще один банк (пропорційно внескам)
      const losers = res.parts.filter((q) => q !== winner);
      const share = splitByWeight(seats(s).map((q) => (losers.includes(q) ? s.contrib[q] || 1 : 0)), potAmount);
      for (const q of losers) { paid[q] = transfer(s, q, winner, share[q]); res.penalty += paid[q]; }
    }
    res.won = potAmount + res.penalty;
    s.lastWinner = winner;
    if (N(s) === 2) s.lastLoser = other(winner);
    s.stats[winner].roundsWon += 1;
    updateBiggest(s, winner, res.won);
    if (reason === 'fold') {
      // Вдалий блеф: суперник спасував, хоча його карта була сильніша.
      const wc = s.players[winner].played;
      res.bluff = opps.some((q) => s.players[q].folded && s.players[q].played && compareDetail(wc, s.players[q].played, s.cfg, s.trump).cmp < 0);
      if (res.bluff) s.stats[winner].bluffs += 1;
      if (wc.kind === 'num' && wc.value === 1) s.stats[winner].bluffOne += 1;
    }
    // Ризикувати можна лише чистим виграшем: тим, що внесли суперники (+ штраф «Подвоєння»).
    const weights = seats(s).map((q) => (opps.includes(q) ? s.contrib[q] + paid[q] : 0));
    const stake = weights.reduce((a, b) => a + b, 0);
    if (stake > 0) {
      res.don = {
        stake,
        attempts: [],
        done: false,
        pending: null,
        maxAttempts: s.round >= s.cfg.don.secondFromRound ? 2 : 1,
        payers: weights,
      };
    }
    if (reason === 'showdown') {
      if (s.roundAllin) s.stats[winner].allinWins += 1;
      if (detail?.reason === 'knife10' && (winnerCard || s.players[winner].played).kind === 'knife') s.stats[winner].knife10 += 1;
      log(s, { t: 'showdown', p: winner, amount: res.won, penalty: res.penalty, cards: shownCards, detail });
    } else {
      log(s, { t: 'foldwin', p: winner, amount: res.won });
    }
  }
  s.result = res;
  setTimer(s, 'result', ctx);
}

function cancelPending(s) {
  const d = s.result?.don;
  if (d?.pending) {
    s.discard.push(d.pending.base);
    d.pending = null;
    d.done = true;
  }
}

function endRound(s, ctx) {
  cancelPending(s);
  for (const pl of s.players) {
    // зіграний джокер згорає (не повертається в колоду)
    if (pl.played && pl.played.kind !== 'joker') s.discard.push(pl.played);
    pl.played = null;
  }
  for (const c of s.jokerTrash) if (c.kind !== 'joker') s.discard.push(c);
  s.jokerTrash = [];
  for (const p of seats(s)) if (inGame(s, p)) s.stats[p].minChips = Math.min(s.stats[p].minChips, s.players[p].chips);
  if (s.result?.replay) s.round -= 1; // «Назад у часі»: той самий раунд ще раз
  const bankrupt = seats(s).filter((p) => inGame(s, p) && s.players[p].chips === 0);
  if (bankrupt.length && s.pot === 0) {
    if (N(s) === 2) return finish(s, 'bankrupt');
    // Утрьох банкрут вибуває і далі дивиться гру як глядач
    for (const p of bankrupt) {
      const pl = s.players[p];
      pl.out = true;
      for (const c of pl.hand) if (c.kind !== 'joker') s.discard.push(c);
      pl.hand = [];
      s.stats[p].outRound = s.round;
      log(s, { t: 'out', p });
    }
    s.outOrder.push(bankrupt);
    if (seats(s).filter((p) => inGame(s, p)).length <= 1) return finish(s, 'bankrupt');
  }
  if (s.round >= s.cfg.maxRounds) {
    if (s.pot > 0) {
      // Банк лишився (нічия чи джекпот) після останнього раунду: ділиться порівну,
      // непарні фішки — тим, у кого менше.
      const live = seats(s).filter((p) => inGame(s, p));
      const part = Math.floor(s.pot / live.length);
      let rest = s.pot - part * live.length;
      for (const p of live) s.players[p].chips += part;
      for (const p of live.slice().sort((a, b) => s.players[a].chips - part - (s.players[b].chips - part) || a - b)) {
        if (rest <= 0) break;
        s.players[p].chips += 1; rest -= 1;
      }
      log(s, { t: 'split', amount: s.pot });
      s.pot = 0;
      s.jackpot = 0;
    }
    return finish(s, 'rounds');
  }
  startRound(s, ctx);
}

function finish(s, reason) {
  s.phase = 'over';
  s.timer = null;
  s.endReason = reason;
  if (N(s) === 2) {
    const [a, b] = s.players.map((p) => p.chips);
    s.winner = a === b ? 'draw' : a > b ? 0 : 1;
    s.places = s.winner === 'draw' ? [1, 1] : s.winner === 0 ? [1, 2] : [2, 1];
  } else {
    // Місця: ті, хто лишився, — за фішками; вибулі — за тим, хто протримався довше
    const key = (p) => (s.players[p].out ? -1000 + s.outOrder.findIndex((g) => g.includes(p)) : s.players[p].chips);
    s.places = seats(s).map((p) => 1 + seats(s).filter((q) => key(q) > key(p)).length);
    const firsts = seats(s).filter((p) => s.places[p] === 1);
    s.winner = firsts.length === 1 ? firsts[0] : 'draw';
  }
  for (const p of seats(s)) s.stats[p].place = s.places[p];
  log(s, { t: 'over', p: s.winner === 'draw' ? null : s.winner });
}

/** Максимальне підняття: обмежене найменшим стеком серед тих, хто ще в раунді. */
function maxRaiseFor(s, p) {
  const need = s.bet.need;
  let max = s.players[p].chips - need[p];
  for (const q of participants(s)) if (q !== p) max = Math.min(max, s.players[q].chips - need[q]);
  // Ліміт банку в ранніх раундах: ва-банк не більший за банк (після колу)
  if (s.round < (s.cfg.allinFreeFromRound ?? 1)) max = Math.min(max, s.pot + need[p]);
  return Math.max(0, max);
}

const donPayers = (s) => seats(s).filter((q) => (s.result.don.payers?.[q] || 0) > 0 && s.players[q].chips > 0);

function donCanStart(s, p) {
  const r = s.result;
  const d = r?.don;
  return !!(d && r.winner === p && !d.done && !d.pending && d.stake > 0 && d.attempts.length < d.maxAttempts && donPayers(s).length > 0);
}

// ───────────── легальні дії ─────────────

/** Список дій, доступних гравцю p зараз. */
export function legalActions(s, p) {
  const me = s.players[p];
  const out = [];
  if (!me || me.out) return out;
  switch (s.phase) {
    case 'play':
      if (!me.played) {
        if (s.cfg.features.swap && !me.swapped && me.chips >= s.cfg.swapCost) {
          for (const c of me.hand) if (c.kind !== 'joker') out.push({ type: 'swap', cardId: c.id });
        }
        for (const c of me.hand) out.push({ type: 'play', cardId: c.id });
      }
      break;
    case 'scout':
      if (!me.scoutDecided) {
        if (me.chips >= s.cfg.scoutCost) {
          // Утрьох — тапом обираєш, до кого підглянути
          if (N(s) === 2) out.push({ type: 'scout' });
          else for (const q of participants(s)) if (q !== p) out.push({ type: 'scout', target: q });
        }
        out.push({ type: 'skipScout' });
      }
      break;
    case 'bet': {
      if (s.bet.toAct !== p) break;
      const owe = s.bet.need[p];
      if (owe === 0) out.push({ type: 'check' });
      else out.push({ type: 'call', amount: Math.min(owe, me.chips) });
      const maxR = maxRaiseFor(s, p);
      if (s.bet.raises < s.cfg.maxRaises && maxR > 0) {
        for (const size of s.cfg.raiseSizes) if (size <= maxR) out.push({ type: 'raise', amount: size });
        out.push({ type: 'raise', amount: 'allin', value: maxR });
      }
      out.push({ type: 'fold' });
      break;
    }
    case 'result': {
      if (me.ready) break;
      const r = s.result;
      const d = r.don;
      if (d?.pending && r.winner === p) {
        for (const g of ['higher', 'lower']) if (d.pending.odds[g].m > 1) out.push({ type: 'don', guess: g });
      } else if (donCanStart(s, p)) {
        out.push({ type: 'donStart' });
      }
      if (!(r.revealed && !me.folded) && !me.shown && me.played && !(d?.pending && r.winner === p)) out.push({ type: 'show' });
      out.push({ type: 'ready' });
      break;
    }
  }
  return out;
}

// ───────────── reducer ─────────────

/**
 * Застосовує дію. Ніколи не мутує вхідний стан.
 * action: { type, player?, ... }. Системні дії без player: timeout, pause, resume.
 * @returns {{ ok: boolean, state: object, error?: string }}
 */
export function reduce(state, action, ctx) {
  const s = clone(state);
  const err = (error) => ({ ok: false, state, error });
  if (!action || typeof action.type !== 'string') return err('bad-action');

  // Системні дії
  if (action.type === 'pause') {
    if (!s.timer || s.timer.paused) return { ok: true, state };
    s.timer.remaining = Math.max(0, s.timer.deadline - ctx.now);
    s.timer.deadline = null;
    s.timer.paused = true;
    s.seq++;
    return { ok: true, state: s };
  }
  if (action.type === 'resume') {
    if (!s.timer || !s.timer.paused) return { ok: true, state };
    s.timer.deadline = ctx.now + s.timer.remaining;
    s.timer.paused = false;
    s.seq++;
    return { ok: true, state: s };
  }
  if (action.type === 'timeout') {
    if (!s.timer || s.timer.paused || ctx.now < s.timer.deadline - 50) return err('not-expired');
    applyTimeout(s, ctx);
    s.seq++;
    return { ok: true, state: s };
  }

  const p = action.player;
  if (!Number.isInteger(p) || p < 0 || p >= N(s)) return err('bad-player');
  if (s.phase === 'over') return err('game-over');
  const me = s.players[p];
  if (me.out) return err('spectator');

  switch (action.type) {
    case 'swap': {
      if (s.phase !== 'play') return err('wrong-phase');
      if (!s.cfg.features.swap) return err('disabled');
      if (me.played) return err('already-played');
      if (me.swapped) return err('already-swapped');
      if (me.chips < s.cfg.swapCost) return err('no-chips');
      const idx = me.hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) return err('no-such-card');
      if (me.hand[idx].kind === 'joker') return err('cannot-swap-joker');
      pay(s, p, s.cfg.swapCost);
      const old = me.hand.splice(idx, 1)[0];
      const fresh = drawCard(s, ctx);
      if (fresh) me.hand.splice(idx, 0, fresh);
      s.discard.push(old); // після добору, щоб не витягнути ту саму карту
      me.swapped = true;
      s.stats[p].swaps += 1;
      log(s, { t: 'swap', p, amount: s.cfg.swapCost });
      break;
    }
    case 'play': {
      if (s.phase !== 'play') return err('wrong-phase');
      if (me.played) return err('already-played');
      const idx = me.hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) return err('no-such-card');
      me.played = me.hand.splice(idx, 1)[0];
      log(s, { t: 'play', p });
      if (s.players.every((pl) => pl.out || pl.played)) enterScout(s, ctx);
      break;
    }
    case 'scout': {
      if (s.phase !== 'scout') return err('wrong-phase');
      if (me.scoutDecided) return err('already-decided');
      if (me.chips < s.cfg.scoutCost) return err('no-chips');
      const target = action.target ?? nextSeat(s, p, (q) => inRound(s, q));
      if (!Number.isInteger(target) || target === p || !s.players[target] || !inRound(s, target)) return err('bad-target');
      pay(s, p, s.cfg.scoutCost);
      me.scouted = true;
      me.scoutDecided = true;
      me.scoutTarget = target;
      me.scoutSeen = scoutClass(s.players[target].played, s.cfg);
      s.stats[p].scouts += 1;
      log(s, N(s) === 2 ? { t: 'scout', p, amount: s.cfg.scoutCost } : { t: 'scout', p, amount: s.cfg.scoutCost, target });
      if (s.players.every((pl) => pl.out || pl.scoutDecided)) enterBet(s, ctx);
      break;
    }
    case 'skipScout': {
      if (s.phase !== 'scout') return err('wrong-phase');
      if (me.scoutDecided) return err('already-decided');
      me.scoutDecided = true;
      if (s.players.every((pl) => pl.out || pl.scoutDecided)) enterBet(s, ctx);
      break;
    }
    case 'check': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      if (s.bet.need[p] !== 0) return err('must-call');
      doCheck(s, ctx, p);
      break;
    }
    case 'raise': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      if (s.bet.raises >= s.cfg.maxRaises) return err('raise-limit');
      const maxR = maxRaiseFor(s, p);
      let amt;
      if (action.amount === 'allin') amt = maxR;
      else if (s.cfg.raiseSizes.includes(action.amount)) amt = action.amount;
      else return err('bad-amount');
      if (amt <= 0 || amt > maxR) return err('cannot-raise');
      const called = pay(s, p, s.bet.need[p]);
      pay(s, p, amt);
      s.roundRaises[p] += 1;
      if (action.amount === 'allin') s.roundAllin = true;
      s.bet.need[p] = 0;
      const rest = participants(s).filter((q) => q !== p);
      for (const q of rest) s.bet.need[q] += amt;
      s.bet.pending = rest; // після підняття відповісти мають усі інші
      s.bet.raises += 1;
      log(s, { t: 'raise', p, amount: amt, called, allin: action.amount === 'allin' || me.chips === 0 });
      advanceBet(s, ctx, p);
      break;
    }
    case 'call': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      if (s.bet.need[p] === 0) return err('nothing-to-call');
      const a = pay(s, p, s.bet.need[p]);
      s.bet.need[p] = 0;
      s.bet.toCall = 0;
      s.bet.pending = s.bet.pending.filter((x) => x !== p);
      log(s, { t: 'call', p, amount: a });
      advanceBet(s, ctx, p);
      break;
    }
    case 'fold': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      doFold(s, ctx, p);
      break;
    }
    case 'donStart': {
      if (s.phase !== 'result') return err('wrong-phase');
      if (s.result.winner !== p) return err('not-winner');
      if (me.ready || !donCanStart(s, p)) return err('don-unavailable');
      const base = drawNumeric(s, ctx);
      if (!base) { s.result.don.done = true; break; }
      if (!s.deck.some((c) => c.kind === 'num')) reshuffle(s, ctx);
      s.result.don.pending = { base, odds: donOdds(base.value, s.deck, s.cfg) };
      log(s, { t: 'donBase', p, card: base, stake: s.result.don.stake });
      setTimer(s, 'result', ctx);
      break;
    }
    case 'don': {
      if (s.phase !== 'result') return err('wrong-phase');
      const r = s.result;
      if (r.winner !== p) return err('not-winner');
      if (me.ready || !r.don?.pending) return err('don-unavailable');
      if (action.guess !== 'higher' && action.guess !== 'lower') return err('bad-guess');
      if (!(r.don.pending.odds[action.guess].m > 1)) return err('bad-guess');
      resolveDon(s, ctx, p, action.guess);
      break;
    }
    case 'show': {
      if (s.phase !== 'result') return err('wrong-phase');
      if (s.result.revealed || me.shown) return err('already-visible');
      if (!me.played) return err('no-card');
      me.shown = true;
      log(s, { t: 'show', p, card: me.played });
      break;
    }
    case 'ready': {
      if (s.phase !== 'result') return err('wrong-phase');
      if (me.ready) return err('already-ready');
      me.ready = true;
      if (s.result.winner === p && s.result.don) {
        if (s.result.don.pending) log(s, { t: 'donCancel', p });
        cancelPending(s);
        s.result.don.done = true;
      }
      if (s.players.every((pl) => pl.out || pl.ready)) endRound(s, ctx);
      break;
    }
    default:
      return err('unknown-action');
  }
  s.seq++;
  return { ok: true, state: s };
}

function showdown(s, ctx) {
  const parts = participants(s);
  if (parts.some((q) => s.players[q].played.kind === 'joker')) return jokerShowdown(s, ctx);
  if (parts.length === 2) {
    const [x, y] = parts;
    const d = compareDetail(s.players[x].played, s.players[y].played, s.cfg, s.trump);
    if (N(s) > 2) Object.assign(d, { a: x, b: y });
    return enterResult(s, ctx, d.cmp > 0 ? x : d.cmp < 0 ? y : null, 'showdown', d);
  }
  // Утрьох: перемагає той, хто б'є кожного; якщо такого немає — нічия за перше місце
  const winner = parts.find((x) => parts.every((y) => y === x || compareDetail(s.players[x].played, s.players[y].played, s.cfg, s.trump).cmp > 0)) ?? null;
  let detail;
  if (winner !== null) {
    // Пояснення — проти найсильнішого з тих, кого переміг
    const rivals = parts.filter((y) => y !== winner).sort((y, z) => compareDetail(s.players[z].played, s.players[y].played, s.cfg, s.trump).cmp);
    const rival = rivals[0];
    detail = { ...compareDetail(s.players[winner].played, s.players[rival].played, s.cfg, s.trump), a: winner, b: rival };
  } else detail = { cmp: 0, reason: 'tie3' };
  enterResult(s, ctx, winner, 'showdown', detail);
}

// ───────────── джокери при розкритті ─────────────

function jokerEnv(s, ctx) {
  const burns = [];
  const env = {
    burns,
    api: (X) => ({
      contrib: (p) => s.contrib[p],
      parts: () => participants(s),
      target: (p) => jokerTarget(s, p),
      chips: (p) => s.players[p].chips,
      pay: (p, amt) => pay(s, p, amt),
      transfer: (from, to, amt) => transfer(s, from, to, amt),
      burn: (p, amt) => {
        const a = Math.max(0, Math.min(amt, s.players[p].chips));
        s.players[p].chips -= a;
        s.pot += a;
        s.jackpot += a; // згорілі фішки — у джекпот наступного раунду
        burns.push(a);
        return a;
      },
      drawNum: () => { const c = drawNumeric(s, ctx); if (c) s.jokerTrash.push(c); return c; },
      trumpDelta: (p) => X.trumpDelta[p],
      bestInHand: (p) => {
        let best = null;
        for (const c of s.players[p].hand) {
          const v = c.kind === 'num' ? c.value + (s.trump && c.suit === s.trump ? X.trumpDelta[p] : 0)
            : c.kind === 'knife' ? 0 : c.kind === 'double' ? 5 : c.kind === 'joker' ? -1 : 5;
          if (c.kind !== 'joker' && (!best || v > best.pow)) best = { card: c, pow: v };
        }
        return best;
      },
      randomInHand: (p) => {
        const h = s.players[p].hand.filter((c) => c.kind !== 'joker');
        if (!h.length) return null;
        const c = h[Math.floor(ctx.rng() * h.length)];
        const v = c.kind === 'num' ? c.value + (s.trump && c.suit === s.trump ? X.trumpDelta[p] : 0) : c.kind === 'knife' ? 0 : 5;
        return { card: c, pow: v };
      },
      takeFromHand: (p, card) => {
        const h = s.players[p].hand;
        const i = h.findIndex((c) => c.id === card.id);
        if (i >= 0) { h.splice(i, 1); s.jokerTrash.push(card); }
      },
      dumpHand: (p) => {
        for (const c of s.players[p].hand) if (c.kind !== 'joker') s.discard.push(c);
        s.players[p].hand = [];
      },
      quake: () => {
        const live = seats(s).filter((q) => inGame(s, q));
        const all = shuffle(live.flatMap((q) => s.players[q].hand), ctx.rng);
        let k = 0;
        for (const q of live) { const n = s.players[q].hand.length; s.players[q].hand = all.slice(k, k + n); k += n; }
      },
    }),
  };
  return env;
}

/** Сили карт з урахуванням ефектів джокерів і порівняння. */
function jokerCompare(s, X) {
  const parts = X.parts;
  const pw = Array(N(s)).fill(0);
  const suit = Array(N(s)).fill(null);
  const kind = seats(s).map((p) => X.cards[p]?.kind);
  for (const p of parts) {
    const c = X.cards[p];
    if (X.pow[p] != null) { pw[p] = X.pow[p]; suit[p] = X.suit[p] ?? (c?.kind === 'num' ? c.suit : null); continue; }
    if (!c) { pw[p] = 0; continue; }
    if (c.kind === 'num') { pw[p] = c.value + (s.trump && c.suit === s.trump ? X.trumpDelta[p] : 0); suit[p] = c.suit; }
    else if (c.kind === 'joker') { pw[p] = c.power ?? 5; suit[p] = X.suit[p]; }
    else if (c.kind === 'knife') pw[p] = s.cfg.knifePower;
    else if (c.kind === 'double') pw[p] = s.cfg.doublePower;
    else pw[p] = null; // Дзеркало — нижче
  }
  for (const fn of X.mods) fn(pw);
  // Ніж б'є десятку (за номіналом) і Дзеркало
  const knifeBeats = (p, q) => kind[p] === 'knife' && X.pow[p] == null && ((X.cards[q]?.kind === 'num' && X.cards[q].value === s.cfg.knifeBeats) || X.cards[q]?.kind === 'mirror');
  const [a, b] = parts;
  if (parts.length === 2) {
    for (const [p, q] of [[a, b], [b, a]]) if (knifeBeats(p, q)) {
      return { winner: p, detail: { cmp: p === a ? 1 : -1, reason: X.cards[q].kind === 'mirror' ? 'knife-mirror' : 'knife10', pa: pw[a] ?? 0, pb: pw[b] ?? 0, joker: true } };
    }
  }
  // Дзеркало копіює силу найсильнішого суперника й виграє нічию
  for (const p of parts) if (pw[p] === null) {
    const xs = parts.filter((q) => q !== p && pw[q] !== null).map((q) => pw[q]);
    pw[p] = xs.length ? (X.lowWins ? Math.min(...xs) : Math.max(...xs)) : 5;
    X.winTie[p] = true;
  }
  const pair = (p, q) => {
    if (knifeBeats(p, q)) return 1;
    if (knifeBeats(q, p)) return -1;
    let cmp = pw[p] === pw[q] ? 0 : pw[p] > pw[q] ? 1 : -1;
    if (X.lowWins) cmp = -cmp;
    if (cmp === 0) {
      if (X.winTie[p] !== X.winTie[q]) cmp = X.winTie[p] ? 1 : -1;
      else if (X.loseTie[p] !== X.loseTie[q]) cmp = X.loseTie[p] ? -1 : 1;
      else if (suit[p] && suit[q] && suit[p] !== suit[q]) {
        const beats = { water: 'fire', fire: 'stone', stone: 'water' };
        cmp = beats[suit[p]] === suit[q] ? 1 : beats[suit[q]] === suit[p] ? -1 : 0;
      }
    }
    return cmp;
  };
  if (parts.length === 2) {
    const cmp = pair(a, b);
    const detail = { cmp, reason: 'joker', pa: pw[a], pb: pw[b], lowWins: X.lowWins, joker: true };
    if (N(s) > 2) Object.assign(detail, { a, b });
    return { winner: cmp > 0 ? a : cmp < 0 ? b : null, detail };
  }
  const winner = parts.find((p) => parts.every((q) => q === p || pair(p, q) > 0)) ?? null;
  return { winner, detail: { cmp: winner === null ? 0 : 1, reason: winner === null ? 'tie3' : 'joker', pw: parts.map((q) => [q, pw[q]]), lowWins: X.lowWins, joker: true, a: winner } };
}

function jokerShowdown(s, ctx) {
  const env = jokerEnv(s, ctx);
  const X = resolveJokers(s, ctx, env);
  for (const f of X.fired) {
    s.lastJoker = f.as;
    s.stats[f.p].jokers.push(f.joker);
    if (JOKER_BY_ID[f.joker].rarity === 'legendary') s.stats[f.p].legendary += 1;
  }
  for (const n of X.notes) log(s, { t: 'joker', p: n.p, joker: n.joker, text: n.text });
  const jokers = { notes: X.notes, fired: X.fired, cards: X.cards, duel: X.duel || null, coin: null, sum: X.sum };

  if (X.cancel === 'void') {
    s.jackpot = s.pot; // увесь банк — у джекпот
    enterResult(s, ctx, null, 'void', { reason: 'void', joker: true });
    s.result.jokers = jokers;
    return;
  }
  if (X.cancel === 'replay') {
    for (const p of seats(s)) {
      const a = Math.min(s.contrib[p], s.pot);
      s.players[p].chips += a;
      s.pot -= a;
    }
    s.jackpot = Math.min(s.jackpot, s.pot);
    enterResult(s, ctx, null, 'replay', { reason: 'replay', joker: true });
    s.result.replay = true;
    s.result.jokers = jokers;
    return;
  }
  let winner, detail;
  const parts = X.parts;
  const rel = (w) => (w === null ? 0 : w === parts[0] ? 1 : -1);
  if (X.forced !== undefined) { winner = X.forced; detail = { cmp: rel(winner), reason: 'forced', joker: true }; }
  else if (X.coin) { winner = parts[Math.floor(ctx.rng() * parts.length)]; jokers.coin = winner; detail = { cmp: rel(winner), reason: 'coin', joker: true }; }
  else if (X.sum) {
    const top = Math.max(...parts.map((q) => X.sum[q]));
    const best = parts.filter((q) => X.sum[q] === top);
    winner = best.length === 1 ? best[0] : null;
    detail = { cmp: rel(winner), reason: 'duel', pa: X.sum[parts[0]], pb: X.sum[parts[1]], sums: X.sum, joker: true };
  }
  else ({ winner, detail } = jokerCompare(s, X));
  if (N(s) > 2 && detail.a === undefined) detail.a = winner;
  const pot = s.pot;
  enterResult(s, ctx, winner, 'showdown', detail, winner === null ? null : X.cards[winner]);
  s.result.jokers = jokers;
  const before = X.notes.length;
  for (const fn of X.afters) fn({ winner, pot });
  for (const n of X.notes.slice(before)) log(s, { t: 'joker', p: n.p, joker: n.joker, text: n.text });
}

function resolveDon(s, ctx, p, guess) {
  const r = s.result;
  const d = r.don;
  const { base, odds } = d.pending;
  const m = odds[guess].m;
  const card = drawNumeric(s, ctx);
  d.pending = null;
  s.discard.push(base);
  if (!card) { d.done = true; return; }
  s.discard.push(card);
  const stakeBefore = d.stake;
  const attempt = { guess, base, card, m, stakeBefore, outcome: 'push', delta: 0 };
  if (card.value === base.value) {
    // Рівне значення — ставка повертається (лишається у гравця)
    s.stats[p].donPush += 1;
  } else if ((guess === 'higher') === (card.value > base.value)) {
    const want = Math.max(1, Math.min(Math.floor(stakeBefore * (m - 1)), s.cfg.don.maxWin));
    // Виграш платять суперники пропорційно своїм внескам у банк
    const payers = donPayers(s);
    const share = N(s) === 2 ? [0, 0].map((_, q) => (q === other(p) ? want : 0)) : splitByWeight(seats(s).map((q) => (payers.includes(q) ? d.payers[q] : 0)), want);
    let won = 0;
    for (const q of payers) won += transfer(s, q, p, share[q]);
    d.stake += won;
    d.wins = (d.wins || 0) + 1;
    s.stats[p].donRoundMax = Math.max(s.stats[p].donRoundMax, d.wins);
    attempt.outcome = 'win';
    attempt.delta = won;
    s.stats[p].donWon += 1;
    updateBiggest(s, p, r.won + (d.stake - stakeBefore));
  } else {
    // Програна ставка йде в банк наступного раунду як джекпот
    const lost = Math.min(stakeBefore, s.players[p].chips);
    s.players[p].chips -= lost;
    s.pot += lost;
    s.jackpot += lost;
    d.stake = 0;
    attempt.outcome = 'lose';
    attempt.delta = -lost;
    s.stats[p].donLost += 1;
  }
  d.attempts.push(attempt);
  if (attempt.outcome === 'lose' || d.attempts.length >= d.maxAttempts || donPayers(s).length === 0) d.done = true;
  log(s, { t: 'don', p, guess, base, card, m, outcome: attempt.outcome, amount: Math.abs(attempt.delta) });
  setTimer(s, 'result', ctx);
}

function applyTimeout(s, ctx) {
  log(s, { t: 'timeout', phase: s.phase });
  switch (s.phase) {
    case 'play':
      for (const p of seats(s)) {
        const me = s.players[p];
        if (!me.out && !me.played && me.hand.length) {
          const i = Math.floor(ctx.rng() * me.hand.length);
          me.played = me.hand.splice(i, 1)[0];
          log(s, { t: 'play', p, auto: true });
        }
      }
      enterScout(s, ctx);
      break;
    case 'scout':
      for (const pl of s.players) pl.scoutDecided = true;
      enterBet(s, ctx);
      break;
    case 'bet': {
      const p = s.bet.toAct;
      if (s.bet.need[p] === 0) doCheck(s, ctx, p, true);
      else doFold(s, ctx, p, true);
      break;
    }
    case 'result':
      cancelPending(s);
      if (s.result.don) s.result.don.done = true;
      for (const pl of s.players) pl.ready = true;
      endRound(s, ctx);
      break;
  }
}

// ───────────── приховування інформації ─────────────

/** Чи бачить гравець viewer зіграну карту гравця p. */
function playedVisible(s, viewer, p) {
  if (viewer === p) return true;
  return !!(s.result && ((s.result.revealed && !s.players[p].folded) || s.players[p].shown));
}

/** Публічна інформація про місце q (те, що бачить кожен за столом). */
function seatView(s, viewer, q) {
  const pl = s.players[q];
  return {
    seat: q,
    inPot: s.contrib[q],
    chips: pl.chips,
    handCount: pl.hand.length,
    hasPlayed: !!pl.played,
    played: pl.played && playedVisible(s, viewer, q) ? pl.played : null,
    swapped: pl.swapped,
    jokerInHand: pl.hand.some((c) => c.kind === 'joker'), // публічно: «джокер ще не зіграно»
    scouted: pl.scouted,
    scoutTarget: pl.scoutTarget,
    scoutDecided: pl.scoutDecided,
    shown: pl.shown,
    ready: pl.ready,
    folded: pl.folded,
    out: pl.out,
  };
}

/** Скільки високих / низьких / спецкарт лишилось у колоді (за номіналом). */
export function deckStats(deck, cfg) {
  let high = 0, low = 0, special = 0;
  for (const c of deck) {
    if (c.kind !== 'num') special++;
    else if (c.value >= cfg.scoutHighFrom) high++;
    else low++;
  }
  return { total: deck.length, high, low, special };
}

/**
 * Те, що гравець p має право бачити. Карти суперника (рука, а також зіграна до розкриття)
 * сюди не потрапляють ніколи.
 */
export function viewFor(s, p, now) {
  const me = s.players[p];
  const oppSeat = N(s) === 2 ? other(p) : nextSeat(s, p);
  const op = s.players[oppSeat];
  const r = s.result;
  const timer = s.timer
    ? {
        phase: s.timer.phase,
        duration: s.timer.duration,
        paused: s.timer.paused,
        remaining: s.timer.paused ? s.timer.remaining : Math.max(0, s.timer.deadline - (now ?? 0)),
      }
    : null;
  return clone({
    v: s.v,
    rules: s.cfg.rules,
    seq: s.seq,
    you: p,
    phase: s.phase,
    round: s.round,
    maxRounds: s.cfg.maxRounds,
    n: N(s),
    cfg: {
      scoutCost: s.cfg.scoutCost, swapCost: s.cfg.swapCost, raiseSizes: s.cfg.raiseSizes, maxRaises: s.cfg.maxRaises,
      startChips: s.cfg.startChips, trumpBonus: s.cfg.trumpBonus, scoutHighFrom: s.cfg.scoutHighFrom, mode: s.cfg.mode || 'classic',
      donMaxWin: s.cfg.don.maxWin, donSecondFromRound: s.cfg.don.secondFromRound, features: s.cfg.features,
      knifeBeats: s.cfg.knifeBeats, doublePower: s.cfg.doublePower, knifePower: s.cfg.knifePower,
    },
    ante: anteFor(s.round, s.cfg),
    nextAnte: s.round < s.cfg.maxRounds ? anteFor(s.round + 1, s.cfg) : null,
    trump: s.trump,
    pot: s.pot,
    carry: s.carry,
    jackpot: s.jackpot,
    deck: deckStats(s.deck, s.cfg),
    firstToAct: s.firstToAct,
    me: {
      inPot: s.contrib[p], // внесок у банк цього раунду (публічна інформація)
      chips: me.chips,
      hand: me.hand,
      played: me.played,
      swapped: me.swapped,
      jokerSet: s.jokerSets[p],
      scouted: me.scouted,
      scoutDecided: me.scoutDecided,
      scoutSeen: me.scoutSeen,
      scoutTarget: me.scoutTarget,
      shown: me.shown,
      ready: me.ready,
      folded: me.folded,
      out: me.out,
    },
    // Усі місця за столом (для гри втрьох; у грі вдвох дублює me/opp)
    players: seats(s).map((q) => seatView(s, p, q)),
    opp: {
      inPot: s.contrib[oppSeat],
      chips: op.chips,
      handCount: op.hand.length,
      hasPlayed: !!op.played,
      played: playedVisible(s, p, oppSeat) ? op.played : null,
      swapped: op.swapped,
      jokerInHand: op.hand.some((c) => c.kind === 'joker'), // публічно: «джокер ще не зіграно»
      scouted: op.scouted,
      scoutDecided: op.scoutDecided,
      shown: op.shown,
      ready: op.ready,
    },
    bet: s.bet ? { toAct: s.bet.toAct, raises: s.bet.raises, toCall: s.bet.toCall, owe: s.bet.need[p] ?? 0, checks: s.bet.checks, pending: s.bet.pending } : null,
    result: r
      ? {
          winner: r.winner, reason: r.reason, won: r.won, penalty: r.penalty, revealed: r.revealed, carry: r.carry ?? 0,
          don: r.don, detail: r.revealed ? r.detail : null, jokers: r.jokers || null, replay: !!r.replay, parts: r.parts,
        }
      : null,
    // Записи журналу публічні за побудовою: карти з'являються лише в showdown/tie/show/don.
    log: s.log,
    timer,
    winner: s.winner,
    places: s.places,
    endReason: s.endReason,
    // Статистика (зокрема блефи) розкривається лише в кінці партії.
    stats: s.phase === 'over' ? s.stats : null,
    legal: legalActions(s, p),
  });
}
