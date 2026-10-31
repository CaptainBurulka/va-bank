// Суперництво: нікнейм і постійний ID, рахунок особистих зустрічей, титули, «момент партії», швидкі фрази.
// Чиста логіка без DOM — тестується в node. Нічого не впливає на силу в грі.

import { RIVALS } from '../config.js';

const int = (x) => (Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
const sint = (x) => (Number.isFinite(x) ? Math.trunc(x) : 0);

/** Постійний ID гравця: «p» + 10 символів. Генерується один раз і живе в профілі (та в коді експорту). */
export function newPid(rng = Math.random) {
  let s = 'p';
  for (let i = 0; i < 10; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(rng() * 32)];
  return s;
}
export const isPid = (x) => typeof x === 'string' && /^p[a-z2-9]{10}$/.test(x);

/** Нікнейм: 1–16 видимих символів, без керівних і кутових дужок. */
export function cleanNick(x) {
  if (typeof x !== 'string') return '';
  return x.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// ───────── довічна статистика (для титулів) ─────────

export const LIFE_KEYS = ['games', 'wins', 'bluffs', 'folds', 'donWon', 'donLost', 'allinWins', 'scouts', 'jokers', 'biggestPot', 'rounds'];

export function emptyLife() { return Object.fromEntries(LIFE_KEYS.map((k) => [k, 0])); }

export function normalizeLife(x) {
  const out = emptyLife();
  if (x && typeof x === 'object') for (const k of LIFE_KEYS) out[k] = int(x[k]);
  return out;
}

/** Додати партію до довічної статистики. st — статистика гравця з кінця партії. */
export function addLife(life, st, { won, rounds }) {
  const l = normalizeLife(life);
  l.games += 1;
  if (won) l.wins += 1;
  l.bluffs += int(st.bluffs);
  l.folds += int(st.folds);
  l.donWon += int(st.donWon);
  l.donLost += int(st.donLost);
  l.allinWins += int(st.allinWins);
  l.scouts += int(st.scouts);
  l.jokers += Array.isArray(st.jokers) ? st.jokers.length : 0;
  l.biggestPot = Math.max(l.biggestPot, int(st.biggestPot));
  l.rounds += int(rounds);
  return l;
}

// ───────── титули (за довічною статистикою, з'являються біля ніку) ─────────

const T = RIVALS.titles;
/** Порядок = пріоритет: показується перший, що підходить. */
export const TITLES = [
  { id: 'shark', name: 'Акула', icon: '🦈', desc: `Виграти ${T.shark.wins}+ партій і щонайменше ${Math.round(T.shark.rate * 100)}% усіх`, check: (l) => l.wins >= T.shark.wins && l.wins / Math.max(1, l.games) >= T.shark.rate },
  { id: 'bluffking', name: 'Король блефу', icon: '🎭', desc: `${T.bluffking.total}+ вдалих блефів, у середньому ≥ ${T.bluffking.perGame} за партію`, check: (l) => l.bluffs >= T.bluffking.total && l.bluffs / Math.max(1, l.games) >= T.bluffking.perGame },
  { id: 'kamikaze', name: 'Самогубця', icon: '💣', desc: `Програти «подвій або нічого» ${T.kamikaze.lost}+ разів`, check: (l) => l.donLost >= T.kamikaze.lost },
  { id: 'lucky', name: 'Везунчик', icon: '🍀', desc: `Виграти «подвій або нічого» ${T.lucky.won}+ разів`, check: (l) => l.donWon >= T.lucky.won },
  { id: 'allin', name: 'Ва-банкір', icon: '💥', desc: `Виграти ${T.allin.wins}+ розкриттів після ва-банку`, check: (l) => l.allinWins >= T.allin.wins },
  { id: 'rock', name: 'Скеля', icon: '🪨', desc: `${T.rock.games}+ партій і не більше ${T.rock.foldsPerGame} пасу за партію`, check: (l) => l.games >= T.rock.games && l.folds / l.games <= T.rock.foldsPerGame },
  { id: 'spy', name: 'Нишпорка', icon: '🕵️', desc: `${T.spy.games}+ партій і ≥ ${T.spy.perGame} розвідки за партію`, check: (l) => l.games >= T.spy.games && l.scouts / l.games >= T.spy.perGame },
  { id: 'jester', name: 'Джокермен', icon: '🃏', desc: `Зіграти ${T.jester.jokers}+ джокерів`, check: (l) => l.jokers >= T.jester.jokers },
];
export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

/** Усі зароблені титули (за пріоритетом). */
export const titlesOf = (life) => TITLES.filter((t) => { try { return t.check(normalizeLife(life)); } catch { return false; } }).map((t) => t.id);
/** Головний титул: обраний гравцем (якщо зароблений) або перший за пріоритетом. */
export function titleOf(profile) {
  const all = titlesOf(profile?.life);
  if (profile?.title && all.includes(profile.title)) return profile.title;
  return all[0] || null;
}
export const cleanTitle = (x) => (typeof x === 'string' && TITLE_BY_ID[x] ? x : null);

// ───────── рахунок особистих зустрічей ─────────

export function emptyRival(name = '') {
  return { name, games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bigPot: 0, myBluffs: 0, theirBluffs: 0, myDonLost: 0, theirDonLost: 0, title: null, last: 0 };
}

export function normalizeRivals(x) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  for (const [pid, r] of Object.entries(x)) {
    if (!isPid(pid) || !r || typeof r !== 'object') continue;
    const e = emptyRival(cleanNick(r.name) || 'Суперник');
    for (const k of ['games', 'wins', 'losses', 'draws', 'bigPot', 'myBluffs', 'theirBluffs', 'myDonLost', 'theirDonLost', 'last']) e[k] = int(r[k]);
    e.streak = Math.max(-999, Math.min(999, sint(r.streak)));
    e.title = cleanTitle(r.title);
    out[pid] = e;
  }
  return trimRivals(out);
}

/** Не більше RIVALS.keep суперників: найдавніші відпадають. */
function trimRivals(rv) {
  const ids = Object.keys(rv);
  if (ids.length <= RIVALS.keep) return rv;
  ids.sort((a, b) => rv[b].last - rv[a].last);
  return Object.fromEntries(ids.slice(0, RIVALS.keep).map((id) => [id, rv[id]]));
}

/**
 * Записати партію проти живих суперників (онлайн). view — кінцевий view партії, meta.pids/names/titles — за місцями.
 * Утрьох результат проти кожного — за місцями (вище — перемога, однаково — нічия).
 */
export function recordGame(rivals, view, meta, now = Date.now()) {
  const rv = normalizeRivals(rivals);
  const me = view.you;
  const n = view.n || 2;
  const places = view.places || (view.winner === 'draw' ? [1, 1] : [0, 1].map((q) => (view.winner === q ? 1 : 2)));
  const touched = [];
  for (let q = 0; q < n; q++) {
    if (q === me) continue;
    const pid = meta?.pids?.[q];
    if (!isPid(pid) || pid === meta?.pids?.[me]) continue;
    const r = rv[pid] || emptyRival();
    r.name = cleanNick(meta?.names?.[q]) || r.name || 'Суперник';
    r.title = cleanTitle(meta?.titles?.[q]);
    r.games += 1;
    const d = places[q] - places[me]; // > 0 — я вище
    if (d > 0) { r.wins += 1; r.streak = r.streak > 0 ? r.streak + 1 : 1; }
    else if (d < 0) { r.losses += 1; r.streak = r.streak < 0 ? r.streak - 1 : -1; }
    else { r.draws += 1; r.streak = 0; }
    const st = view.stats || [];
    r.bigPot = Math.max(r.bigPot, int(st[me]?.biggestPot), int(st[q]?.biggestPot));
    r.myBluffs += int(st[me]?.bluffs);
    r.theirBluffs += int(st[q]?.bluffs);
    r.myDonLost += int(st[me]?.donLost);
    r.theirDonLost += int(st[q]?.donLost);
    r.last = now;
    rv[pid] = r;
    touched.push(pid);
  }
  return { rivals: trimRivals(rv), touched };
}

/** «Ти 14 : 11 Андрій» — рахунок зустрічей із суперником (або null, якщо ще не грали). */
export function scoreLine(rivals, pid) {
  const r = rivals?.[pid];
  if (!r || !r.games) return null;
  return { wins: r.wins, losses: r.losses, draws: r.draws, streak: r.streak, name: r.name, games: r.games };
}

// ───────── «момент партії» ─────────

/**
 * Найдраматичніший момент з кандидатів, які рушій збирає за партію (s.moments), плюс відіграш зі статистики.
 * Повертає { kind, p, r, amount, card, joker, from, score } або null.
 */
export function pickMoment(view) {
  const W = RIVALS.moment;
  const cands = [];
  for (const m of view.moments || []) {
    let score = 0;
    if (m.kind === 'pot') score = m.amount * W.pot;
    else if (m.kind === 'bluff') score = W.bluff + m.amount * W.pot + (m.power <= 2 ? W.bluffWeak : 0);
    else if (m.kind === 'legend') score = W.legend;
    else if (m.kind === 'don') score = W.don + m.amount * W.pot * 1.5;
    else if (m.kind === 'tie3') score = W.tie3 + m.amount * W.pot;
    cands.push({ ...m, score });
  }
  // відіграш: переможець партії посеред гри мав дуже мало фішок
  const st = view.stats || [];
  const start = view.cfg?.startChips || 100;
  const winners = view.places ? view.places.map((x, q) => (x === 1 ? q : -1)).filter((q) => q >= 0) : [view.winner].filter((x) => x !== 'draw' && x !== null && x !== undefined);
  for (const q of winners) {
    const low = st[q]?.minChips;
    if (Number.isFinite(low) && low <= start * W.comebackFrom) cands.push({ kind: 'comeback', p: q, from: low, score: W.comeback + (start * W.comebackFrom - low) });
  }
  if (!cands.length) return null;
  return cands.reduce((a, b) => (b.score > a.score ? b : a));
}

// ───────── швидкі фрази (додаток до емодзі) ─────────

export const PHRASES = Object.freeze(['Блефуєш?', 'Не віриш?', 'Ой-ой', 'Реванш!', 'Ще побачимо', 'Щастить же!', 'Ну ти даєш!', 'Сміливо 😏']);
export const isPhrase = (x) => PHRASES.includes(x);
