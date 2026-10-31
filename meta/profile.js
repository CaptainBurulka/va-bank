// Профіль гравця і вся прогресія: бали, досягнення, магазин, уламки, автомат, експорт/імпорт.
// Чиста логіка без DOM — тестується в node. Збереження в localStorage — у ui/ (тут лише дані).
// Жодних реальних грошей: бали й уламки — віртуальні, заробляються лише грою.

import { META } from '../config.js';
import { JOKERS, JOKER_BY_ID, RARITIES, sanitizeSet } from '../game/jokers.js';
import { COSMETICS, COSMETIC_BY_ID, COSMETIC_CATS, DEFAULT_EQUIPPED, ACHIEVEMENTS, ACH_BY_ID } from './catalog.js';
import { newPid, isPid, cleanNick, normalizeLife, normalizeRivals, cleanTitle, emptyLife } from './rivals.js';

export const SCHEMA = META.schema;
const int = (x) => (Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);

export function defaultProfile() {
  return {
    v: SCHEMA,
    points: 0,
    shards: 0,
    jokers: Object.fromEntries(META.startJokers.map((id) => [id, 1])),
    cosmetics: Object.fromEntries(COSMETICS.filter((c) => c.source === 'start').map((c) => [c.id, true])),
    equipped: { ...DEFAULT_EQUIPPED },
    set: [...META.startJokers],
    pity: { epic: 0, legendary: 0 },
    spins: 0,
    achievements: {},
    playedRarities: [],
    daily: { day: '', won: false },
    games: 0,
    wins: 0,
    flags: { legendarySpin: false },
    // суперництво (схема 2)
    nick: '',
    pid: newPid(),
    title: null,
    life: emptyLife(),
    rivals: {},
  };
}

/**
 * Міграції схеми. raw — будь-що з localStorage (може бути зламаним).
 * v0 — профіль без поля v (рання бета): мав лише points і jokers-масив.
 */
export function migrate(raw) {
  let p = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  if (p.v === undefined) {
    // v0 → v1
    if (Array.isArray(p.jokers)) p.jokers = Object.fromEntries(p.jokers.filter((x) => typeof x === 'string').map((id) => [id, 1]));
    p.v = 1;
  }
  if (p.v === 1) {
    // v1 → v2: нікнейм, постійний ID, суперники і довічна статистика (з уже зіграних партій — лише кількість і перемоги)
    p.life = { ...emptyLife(), games: p.games || 0, wins: p.wins || 0 };
    p.rivals = {};
    p.v = 2;
  }
  // майбутні міграції: if (p.v === 2) { …; p.v = 3; }
  return normalize(p);
}

/** Перевірка і лікування даних: зламаний профіль не повинен ламати гру. */
export function normalize(p) {
  const d = defaultProfile();
  const out = { ...d };
  if (!p || typeof p !== 'object') return d;
  out.points = int(p.points);
  out.shards = int(p.shards);
  out.spins = int(p.spins);
  out.games = int(p.games);
  out.wins = Math.min(int(p.wins), out.games);
  out.jokers = { ...d.jokers };
  if (p.jokers && typeof p.jokers === 'object') {
    for (const [id, n] of Object.entries(p.jokers)) if (JOKER_BY_ID[id] && int(n) > 0) out.jokers[id] = Math.min(int(n), 99);
  }
  out.cosmetics = { ...d.cosmetics };
  if (p.cosmetics && typeof p.cosmetics === 'object') for (const id of Object.keys(p.cosmetics)) if (COSMETIC_BY_ID[id] && p.cosmetics[id]) out.cosmetics[id] = true;
  out.equipped = { ...d.equipped };
  if (p.equipped && typeof p.equipped === 'object') {
    for (const cat of Object.keys(COSMETIC_CATS)) {
      const id = p.equipped[cat];
      if (COSMETIC_BY_ID[id]?.cat === cat && out.cosmetics[id]) out.equipped[cat] = id;
    }
  }
  out.set = sanitizeSet(p.set ?? d.set).filter((id) => out.jokers[id]);
  out.pity = { epic: int(p.pity?.epic), legendary: int(p.pity?.legendary) };
  out.achievements = {};
  if (p.achievements && typeof p.achievements === 'object') for (const id of Object.keys(p.achievements)) if (ACH_BY_ID[id]) out.achievements[id] = int(p.achievements[id]) || 1;
  out.playedRarities = Array.isArray(p.playedRarities) ? RARITIES.filter((r) => p.playedRarities.includes(r)) : [];
  out.daily = { day: typeof p.daily?.day === 'string' ? p.daily.day.slice(0, 10) : '', won: !!p.daily?.won };
  out.flags = { legendarySpin: !!p.flags?.legendarySpin };
  out.nick = cleanNick(p.nick);
  out.pid = isPid(p.pid) ? p.pid : d.pid;
  out.title = cleanTitle(p.title);
  out.life = normalizeLife(p.life);
  out.rivals = normalizeRivals(p.rivals);
  out.v = SCHEMA;
  return out;
}

const clone = (p) => JSON.parse(JSON.stringify(p));

// ───────── володіння, уламки ─────────

/** Додати предмет. Дублікат автоматично стає уламками. */
export function grant(p, kind, id) {
  const q = clone(p);
  const item = kind === 'joker' ? JOKER_BY_ID[id] : COSMETIC_BY_ID[id];
  if (!item) return { profile: p, duplicate: false, shards: 0 };
  const owned = kind === 'joker' ? !!q.jokers[id] : !!q.cosmetics[id];
  if (owned) {
    const sh = META.shards.dupe[item.rarity];
    q.shards += sh;
    return { profile: q, duplicate: true, shards: sh };
  }
  if (kind === 'joker') q.jokers[id] = 1;
  else q.cosmetics[id] = true;
  return { profile: q, duplicate: false, shards: 0 };
}

// ───────── магазин ─────────

export function priceOf(kind, id) {
  if (kind === 'joker') {
    const j = JOKER_BY_ID[id];
    if (!j || j.rarity === 'legendary') return null; // легендарні — лише з автомата
    return META.prices.joker[j.rarity];
  }
  const c = COSMETIC_BY_ID[id];
  if (!c || c.source !== 'shop') return null; // стартова, автоматна чи за досягнення — не продається
  return META.prices.cosmetic[c.rarity];
}

export function shardPriceOf(kind, id) {
  const item = kind === 'joker' ? JOKER_BY_ID[id] : COSMETIC_BY_ID[id];
  if (!item) return null;
  if (kind === 'joker' && item.rarity === 'legendary') return null;
  if (kind === 'cosmetic' && (item.source === 'ach' || item.source === 'start')) return null;
  return META.shards.exchange[item.rarity];
}

function purchase(p, kind, id, currency, price) {
  if (price == null) return { ok: false, profile: p, error: 'not-for-sale' };
  const owned = kind === 'joker' ? !!p.jokers[id] : !!p.cosmetics[id];
  if (owned) return { ok: false, profile: p, error: 'owned' };
  if (p[currency] < price) return { ok: false, profile: p, error: currency === 'points' ? 'no-points' : 'no-shards' };
  const q = clone(p);
  q[currency] -= price;
  return { ok: true, profile: grant(q, kind, id).profile };
}

export const buy = (p, kind, id) => purchase(p, kind, id, 'points', priceOf(kind, id));
export const exchange = (p, kind, id) => purchase(p, kind, id, 'shards', shardPriceOf(kind, id));

// ───────── набір і косметика ─────────

export function setJokers(p, ids) {
  const q = clone(p);
  q.set = sanitizeSet(ids).filter((id) => q.jokers[id]);
  return q;
}

export function equip(p, cat, id) {
  if (COSMETIC_BY_ID[id]?.cat !== cat || !p.cosmetics[id]) return p;
  const q = clone(p);
  q.equipped[cat] = id;
  return q;
}

// ───────── автомат ─────────

export const REEL_SYMBOLS = ['cherry', 'bell', 'seven', 'star', 'clover', 'diamond'];
export const SPECIAL_SYMBOL = 'crown';

function rarityPool(rarity) {
  const jokers = JOKERS.filter((j) => j.rarity === rarity).map((j) => ({ kind: 'joker', id: j.id }));
  const cos = COSMETICS.filter((c) => c.rarity === rarity && (c.source === 'shop' || c.source === 'slot')).map((c) => ({ kind: 'cosmetic', id: c.id }));
  return { jokers, cos };
}

function reelsFor(rarity, rng) {
  const N = REEL_SYMBOLS.length;
  const i = Math.floor(rng() * N);
  const a = REEL_SYMBOLS[i];
  if (rarity === 'legendary') return [SPECIAL_SYMBOL, SPECIAL_SYMBOL, SPECIAL_SYMBOL];
  if (rarity === 'epic') return [a, a, a];
  // різні символи без циклів «поки не випаде інший»
  const j = (i + 1 + Math.floor(rng() * (N - 1))) % N;
  const b = REEL_SYMBOLS[j];
  if (rarity === 'rare') {
    const k = Math.floor(rng() * 3);
    return k === 0 ? [b, a, a] : k === 1 ? [a, b, a] : [a, a, b];
  }
  let k = (j + 1) % N;
  if (k === i) k = (k + 1) % N;
  return [a, b, REEL_SYMBOLS[k]];
}

/** Шанси показуються біля автомата. */
export const spinOdds = () => ({ ...META.spin.odds });

/**
 * Один спін. Списує бали, враховує гарантії, видає предмет (дублікат → уламки).
 * @returns {{ ok, profile, result?: { reels, rarity, kind, id, duplicate, shards, pityHit } , error? }}
 */
export function spin(p, rng) {
  if (p.points < META.spin.cost) return { ok: false, profile: p, error: 'no-points' };
  let q = clone(p);
  q.points -= META.spin.cost;
  q.spins += 1;
  q.pity.epic += 1;
  q.pity.legendary += 1;
  let rarity;
  let pityHit = null;
  if (q.pity.legendary >= META.spin.pityLegendary) { rarity = 'legendary'; pityHit = 'legendary'; }
  else if (q.pity.epic >= META.spin.pityEpic) {
    // гарантоване епічне або краще (легендарне — за своєю пропорцією)
    const o = META.spin.odds;
    rarity = rng() < o.legendary / (o.legendary + o.epic) ? 'legendary' : 'epic';
    pityHit = 'epic';
  } else {
    const x = rng();
    let acc = 0;
    rarity = 'common';
    for (const r of RARITIES) { acc += META.spin.odds[r]; if (x < acc) { rarity = r; break; } }
  }
  if (rarity === 'epic' || rarity === 'legendary') q.pity.epic = 0;
  if (rarity === 'legendary') { q.pity.legendary = 0; q.flags.legendarySpin = true; }
  const pool = rarityPool(rarity);
  const useJoker = pool.jokers.length && (!pool.cos.length || rng() < META.spin.jokerShare);
  const list = useJoker ? pool.jokers : pool.cos;
  const item = list[Math.floor(rng() * list.length)];
  const g = grant(q, item.kind, item.id);
  q = g.profile;
  return { ok: true, profile: q, result: { reels: reelsFor(rarity, rng), rarity, kind: item.kind, id: item.id, duplicate: g.duplicate, shards: g.shards, pityHit } };
}

// ───────── бали за партію і досягнення ─────────

const dayKey = (d) => d.toISOString().slice(0, 10);

/**
 * Підсумок партії → бали і досягнення.
 * summary: { won, draw, mode: 'online'|'bot'|'hotseat', endReason, me: stats, jokersPlayed: [ids] }
 */
export function awardGame(p, summary, now = new Date()) {
  let q = clone(p);
  const mult = META.points.mult[summary.mode] ?? 0;
  const gained = [];
  const add = (label, n) => { const v = Math.round(n); if (v > 0) { gained.push({ label, amount: v }); q.points += v; } };
  add('За участь', META.points.play * mult);
  if (summary.players === 3 && summary.place) add(`Бонус за ${summary.place}-ге місце`, (META.points.place3[summary.place - 1] || 0) * mult);
  else if (summary.won) add('Бонус за перемогу', META.points.win * mult);
  const today = dayKey(now);
  if (q.daily.day !== today) q.daily = { day: today, won: false };
  if (summary.won && !q.daily.won && mult > 0) { q.daily.won = true; add('Перша перемога дня', META.points.firstWinOfDay); }
  q.games += 1;
  if (summary.won) q.wins += 1;
  for (const id of summary.me.jokers || []) {
    const r = JOKER_BY_ID[id]?.rarity;
    if (r && !q.playedRarities.includes(r)) q.playedRarities.push(r);
  }
  const ach = checkAchievements(q, summary);
  q = ach.profile;
  return { profile: q, gained, achievements: ach.unlocked };
}

/** Перевірити досягнення (summary = null — лише «загальні», наприклад після спіну). */
export function checkAchievements(p, summary) {
  let q = clone(p);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (q.achievements[a.id]) continue;
    if (!summary && !a.any) continue;
    let ok = false;
    try { ok = !!a.check(summary || { me: {} }, q); } catch { ok = false; }
    if (!ok) continue;
    q.achievements[a.id] = 1;
    if (a.reward.points) q.points += a.reward.points;
    if (a.reward.cosmetic) q = grant(q, 'cosmetic', a.reward.cosmetic).profile;
    unlocked.push(a.id);
  }
  return { profile: q, unlocked };
}

// ───────── експорт / імпорт ─────────

/** FNV-1a 32-bit — контрольна сума коду. */
export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const toB64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
const fromB64 = (s) => (typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'));

export function exportCode(p) {
  const body = toB64(JSON.stringify(normalize(p)));
  return `VB${SCHEMA}.${body}.${checksum(body)}`;
}

export function importCode(code) {
  try {
    const m = String(code).trim().replace(/\s+/g, '').match(/^VB(\d+)\.([A-Za-z0-9+/=]+)\.([0-9a-f]{8})$/);
    if (!m) return { ok: false, error: 'format' };
    if (checksum(m[2]) !== m[3]) return { ok: false, error: 'checksum' };
    return { ok: true, profile: migrate(JSON.parse(fromB64(m[2]))) };
  } catch {
    return { ok: false, error: 'format' };
  }
}

/** Дані профілю для суперника (онлайн): лише вибрана косметика. */
export function publicLook(p) {
  return { ...p.equipped };
}

/** Перевірка чужої «зовнішності» (може бути зламаною): лише відомі id потрібної категорії. */
export function sanitizeLook(look) {
  const out = { ...DEFAULT_EQUIPPED };
  if (look && typeof look === 'object') for (const cat of Object.keys(COSMETIC_CATS)) if (COSMETIC_BY_ID[look[cat]]?.cat === cat) out[cat] = look[cat];
  return out;
}
