// Стан партії, правила та reducer дій. Чиста логіка без DOM і мережі.
// Усі випадкові рішення беруться з ctx.rng(), час — з ctx.now.

import { CONFIG } from '../config.js';
import { buildDeck, shuffle, compareDetail, scoutClass, donOdds, SUITS } from './cards.js';

export const STATE_VERSION = 2;

const other = (p) => 1 - p;
const clone = (o) => JSON.parse(JSON.stringify(o));

function newStats() {
  return { biggestPot: 0, bluffs: 0, donWon: 0, donLost: 0, donPush: 0, roundsWon: 0, scouts: 0, folds: 0, swaps: 0 };
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
  const cfg = { ...CONFIG, ...(opts.config || {}) };
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
    contrib: [0, 0],
    players: [0, 1].map(() => ({
      chips: cfg.startChips,
      hand: [],
      played: null,
      swapped: false,
      scouted: false,
      scoutDecided: false,
      scoutSeen: null,
      shown: false,
      ready: false,
    })),
    bet: null,
    firstToAct: opts.firstToAct ?? (ctx.rng() < 0.5 ? 0 : 1),
    lastLoser: null,
    result: null,
    log: [],
    stats: [newStats(), newStats()],
    winner: null,
    endReason: null,
    timer: null,
    seq: 0,
  };
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
  if (!first && s.lastLoser !== null) s.firstToAct = s.lastLoser;
  s.result = null;
  s.bet = null;
  s.contrib = [0, 0];
  if (s.pot === 0) s.jackpot = 0;
  for (const pl of s.players) {
    Object.assign(pl, { played: null, swapped: false, scouted: false, scoutDecided: false, scoutSeen: null, shown: false, ready: false });
  }
  // Козир раунду
  s.trump = s.cfg.features.trump
    ? (s.fixedTrumps ? s.fixedTrumps[(s.round - 1) % s.fixedTrumps.length] : SUITS[Math.floor(ctx.rng() * SUITS.length)])
    : null;
  log(s, { t: 'round', trump: s.trump });
  const ante = anteFor(s.round, s.cfg);
  for (const p of [0, 1]) {
    const a = pay(s, p, ante);
    log(s, { t: 'ante', p, amount: a });
  }
  for (const p of [0, 1]) {
    const hand = s.players[p].hand;
    while (hand.length < s.cfg.handSize) {
      const c = drawCard(s, ctx);
      if (!c) break;
      hand.push(c);
    }
  }
  s.phase = 'play';
  setTimer(s, 'play', ctx);
}

function enterScout(s, ctx) {
  s.phase = 'scout';
  for (const p of [0, 1]) {
    if (s.players[p].chips < s.cfg.scoutCost) s.players[p].scoutDecided = true;
  }
  if (s.players.every((pl) => pl.scoutDecided)) return enterBet(s, ctx);
  setTimer(s, 'scout', ctx);
}

function enterBet(s, ctx) {
  s.phase = 'bet';
  s.bet = { toAct: s.firstToAct, raises: 0, toCall: 0, checks: 0 };
  setTimer(s, 'bet', ctx);
}

function updateBiggest(s, p, amount) {
  s.stats[p].biggestPot = Math.max(s.stats[p].biggestPot, amount);
}

function enterResult(s, ctx, winner, reason, detail = null) {
  s.phase = 'result';
  s.bet = null;
  const res = { winner, reason, won: 0, penalty: 0, revealed: reason === 'showdown', bluff: false, don: null, detail };
  if (winner === null) {
    res.carry = s.pot;
    log(s, { t: 'tie', pot: s.pot, cards: [s.players[0].played, s.players[1].played], detail });
  } else {
    const loser = other(winner);
    const potAmount = s.pot;
    s.players[winner].chips += potAmount;
    s.pot = 0;
    s.jackpot = 0;
    if (reason === 'showdown' && s.players[winner].played.kind === 'double') {
      res.penalty = transfer(s, loser, winner, potAmount);
    }
    res.won = potAmount + res.penalty;
    s.lastLoser = loser;
    s.stats[winner].roundsWon += 1;
    updateBiggest(s, winner, res.won);
    if (reason === 'fold') {
      // Вдалий блеф: суперник спасував, хоча його карта була сильніша.
      res.bluff = compareDetail(s.players[winner].played, s.players[loser].played, s.cfg, s.trump).cmp < 0;
      if (res.bluff) s.stats[winner].bluffs += 1;
      s.stats[loser].folds += 1;
    }
    // Ризикувати можна лише чистим виграшем: тим, що вніс суперник (+ штраф «Подвоєння»).
    const stake = s.contrib[loser] + res.penalty;
    if (stake > 0) {
      res.don = {
        stake,
        attempts: [],
        done: false,
        pending: null,
        maxAttempts: s.round >= s.cfg.don.secondFromRound ? 2 : 1,
      };
    }
    if (reason === 'showdown') {
      log(s, { t: 'showdown', p: winner, amount: res.won, penalty: res.penalty, cards: [s.players[0].played, s.players[1].played], detail });
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
    if (pl.played) s.discard.push(pl.played);
    pl.played = null;
  }
  const bankrupt = [0, 1].filter((p) => s.players[p].chips === 0);
  if (bankrupt.length && s.pot === 0) {
    return finish(s, 'bankrupt');
  }
  if (s.round >= s.cfg.maxRounds) {
    if (s.pot > 0) {
      // Банк лишився (нічия чи джекпот) після останнього раунду: ділиться навпіл,
      // непарна фішка — тому, в кого менше.
      const half = Math.floor(s.pot / 2);
      const poorer = s.players[0].chips <= s.players[1].chips ? 0 : 1;
      s.players[0].chips += half;
      s.players[1].chips += half;
      s.players[poorer].chips += s.pot - half * 2;
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
  const [a, b] = s.players.map((p) => p.chips);
  s.winner = a === b ? 'draw' : a > b ? 0 : 1;
  log(s, { t: 'over', p: s.winner === 'draw' ? null : s.winner });
}

function maxRaiseFor(s, p) {
  const me = s.players[p];
  const opp = s.players[other(p)];
  let max = Math.min(me.chips - s.bet.toCall, opp.chips);
  // Ліміт банку в ранніх раундах: ва-банк не більший за банк (після колу)
  if (s.round < (s.cfg.allinFreeFromRound ?? 1)) max = Math.min(max, s.pot + s.bet.toCall);
  return Math.max(0, max);
}

function donCanStart(s, p) {
  const r = s.result;
  const d = r?.don;
  return !!(d && r.winner === p && !d.done && !d.pending && d.stake > 0 && d.attempts.length < d.maxAttempts && s.players[other(p)].chips > 0);
}

// ───────────── легальні дії ─────────────

/** Список дій, доступних гравцю p зараз. */
export function legalActions(s, p) {
  const me = s.players[p];
  const out = [];
  switch (s.phase) {
    case 'play':
      if (!me.played) {
        if (s.cfg.features.swap && !me.swapped && me.chips >= s.cfg.swapCost) {
          for (const c of me.hand) out.push({ type: 'swap', cardId: c.id });
        }
        for (const c of me.hand) out.push({ type: 'play', cardId: c.id });
      }
      break;
    case 'scout':
      if (!me.scoutDecided) {
        if (me.chips >= s.cfg.scoutCost) out.push({ type: 'scout' });
        out.push({ type: 'skipScout' });
      }
      break;
    case 'bet': {
      if (s.bet.toAct !== p) break;
      if (s.bet.toCall === 0) out.push({ type: 'check' });
      else out.push({ type: 'call', amount: Math.min(s.bet.toCall, me.chips) });
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
      if (!r.revealed && !me.shown && me.played && !(d?.pending && r.winner === p)) out.push({ type: 'show' });
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
  if (p !== 0 && p !== 1) return err('bad-player');
  if (s.phase === 'over') return err('game-over');
  const me = s.players[p];
  const opp = s.players[other(p)];

  switch (action.type) {
    case 'swap': {
      if (s.phase !== 'play') return err('wrong-phase');
      if (!s.cfg.features.swap) return err('disabled');
      if (me.played) return err('already-played');
      if (me.swapped) return err('already-swapped');
      if (me.chips < s.cfg.swapCost) return err('no-chips');
      const idx = me.hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) return err('no-such-card');
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
      if (opp.played) enterScout(s, ctx);
      break;
    }
    case 'scout': {
      if (s.phase !== 'scout') return err('wrong-phase');
      if (me.scoutDecided) return err('already-decided');
      if (me.chips < s.cfg.scoutCost) return err('no-chips');
      pay(s, p, s.cfg.scoutCost);
      me.scouted = true;
      me.scoutDecided = true;
      me.scoutSeen = scoutClass(opp.played, s.cfg);
      s.stats[p].scouts += 1;
      log(s, { t: 'scout', p, amount: s.cfg.scoutCost });
      if (opp.scoutDecided) enterBet(s, ctx);
      break;
    }
    case 'skipScout': {
      if (s.phase !== 'scout') return err('wrong-phase');
      if (me.scoutDecided) return err('already-decided');
      me.scoutDecided = true;
      if (opp.scoutDecided) enterBet(s, ctx);
      break;
    }
    case 'check': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      if (s.bet.toCall !== 0) return err('must-call');
      s.bet.checks += 1;
      log(s, { t: 'check', p });
      if (s.bet.checks >= 2) showdown(s, ctx);
      else { s.bet.toAct = other(p); setTimer(s, 'bet', ctx); }
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
      const called = pay(s, p, s.bet.toCall);
      pay(s, p, amt);
      s.bet.toCall = amt;
      s.bet.raises += 1;
      log(s, { t: 'raise', p, amount: amt, called, allin: action.amount === 'allin' || me.chips === 0 });
      s.bet.toAct = other(p);
      setTimer(s, 'bet', ctx);
      break;
    }
    case 'call': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      if (s.bet.toCall === 0) return err('nothing-to-call');
      const a = pay(s, p, s.bet.toCall);
      s.bet.toCall = 0;
      log(s, { t: 'call', p, amount: a });
      showdown(s, ctx);
      break;
    }
    case 'fold': {
      if (s.phase !== 'bet') return err('wrong-phase');
      if (s.bet.toAct !== p) return err('not-your-turn');
      log(s, { t: 'fold', p });
      enterResult(s, ctx, other(p), 'fold');
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
      if (opp.ready) endRound(s, ctx);
      break;
    }
    default:
      return err('unknown-action');
  }
  s.seq++;
  return { ok: true, state: s };
}

function showdown(s, ctx) {
  const [a, b] = [s.players[0].played, s.players[1].played];
  const d = compareDetail(a, b, s.cfg, s.trump);
  enterResult(s, ctx, d.cmp > 0 ? 0 : d.cmp < 0 ? 1 : null, 'showdown', d);
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
    const want = Math.min(Math.floor(stakeBefore * (m - 1)), s.cfg.don.maxWin);
    const won = transfer(s, other(p), p, Math.max(1, want));
    d.stake += won;
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
  if (attempt.outcome === 'lose' || d.attempts.length >= d.maxAttempts || s.players[other(p)].chips === 0) d.done = true;
  log(s, { t: 'don', p, guess, base, card, m, outcome: attempt.outcome, amount: Math.abs(attempt.delta) });
  setTimer(s, 'result', ctx);
}

function applyTimeout(s, ctx) {
  log(s, { t: 'timeout', phase: s.phase });
  switch (s.phase) {
    case 'play':
      for (const p of [0, 1]) {
        const me = s.players[p];
        if (!me.played && me.hand.length) {
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
      if (s.bet.toCall === 0) {
        s.bet.checks += 1;
        log(s, { t: 'check', p, auto: true });
        if (s.bet.checks >= 2) showdown(s, ctx);
        else { s.bet.toAct = other(p); setTimer(s, 'bet', ctx); }
      } else {
        log(s, { t: 'fold', p, auto: true });
        enterResult(s, ctx, other(p), 'fold');
      }
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
  return !!(s.result && (s.result.revealed || s.players[p].shown));
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
  const op = s.players[other(p)];
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
    cfg: {
      scoutCost: s.cfg.scoutCost, swapCost: s.cfg.swapCost, raiseSizes: s.cfg.raiseSizes, maxRaises: s.cfg.maxRaises,
      startChips: s.cfg.startChips, trumpBonus: s.cfg.trumpBonus, scoutHighFrom: s.cfg.scoutHighFrom,
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
      scouted: me.scouted,
      scoutDecided: me.scoutDecided,
      scoutSeen: me.scoutSeen,
      shown: me.shown,
      ready: me.ready,
    },
    opp: {
      inPot: s.contrib[other(p)],
      chips: op.chips,
      handCount: op.hand.length,
      hasPlayed: !!op.played,
      played: playedVisible(s, p, other(p)) ? op.played : null,
      swapped: op.swapped,
      scouted: op.scouted,
      scoutDecided: op.scoutDecided,
      shown: op.shown,
      ready: op.ready,
    },
    bet: s.bet ? { toAct: s.bet.toAct, raises: s.bet.raises, toCall: s.bet.toCall, checks: s.bet.checks } : null,
    result: r
      ? {
          winner: r.winner, reason: r.reason, won: r.won, penalty: r.penalty, revealed: r.revealed, carry: r.carry ?? 0,
          don: r.don, detail: r.revealed ? r.detail : null,
        }
      : null,
    // Записи журналу публічні за побудовою: карти з'являються лише в showdown/tie/show/don.
    log: s.log,
    timer,
    winner: s.winner,
    endReason: s.endReason,
    // Статистика (зокрема блефи) розкривається лише в кінці партії.
    stats: s.phase === 'over' ? s.stats : null,
    legal: legalActions(s, p),
  });
}
