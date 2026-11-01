// Профіль гравця і вся прогресія: бали, досягнення, магазин, уламки, автомат, експорт/імпорт.
// Чиста логіка без DOM — тестується в node. Збереження в localStorage — у ui/ (тут лише дані).
// Жодних реальних грошей: бали й уламки — віртуальні, заробляються лише грою.

import { META, MODE_IDS } from '../config.js';
import { JOKERS, JOKER_BY_ID, RARITIES, sanitizeSet } from '../game/jokers.js';
import { COSMETICS, COSMETIC_BY_ID, COSMETIC_CATS, DEFAULT_EQUIPPED, ACHIEVEMENTS, ACH_BY_ID, SETS, SKIN_ITEMS, SKIN_BY_ID, SKIN_KINDS, LEGACY_SKINS } from './catalog.js';
import { newPid, isPid, cleanNick, normalizeLife, normalizeRivals, cleanTitle, emptyLife } from './rivals.js';

export const SCHEMA = META.schema;
const int = (x) => (Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
/** Ранг рідкості: звичайна 0 … легендарна 3. */
export const RANK = Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3 });
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
/** Серійний номер екземпляра 1…9999 (детермінований із зерна, якщо немає генератора). */
const serialFrom = (seed) => (fnv(String(seed)) % 9999) + 1;
export const serialText = (n) => `№ ${String(n).padStart(4, '0')}`;
/** Чи є предмет (косметика або предмет набору будь-якої рідкості). */
export const owns = (p, id) => !!(p.cosmetics?.[id] || p.skins?.[id]);
/** Рідкість предмета для показу: екземпляр набору або рідкість каталогу. */
export const rarityOf = (p, id) => p.skins?.[id]?.r || COSMETIC_BY_ID[id]?.rarity || 'common';

export function defaultProfile() {
  return {
    v: SCHEMA,
    points: 0,
    shards: 0,
    jokers: Object.fromEntries(META.startJokers.map((id) => [id, 1])),
    cosmetics: Object.fromEntries(COSMETICS.filter((c) => c.source === 'start').map((c) => [c.id, true])),
    equipped: { ...DEFAULT_EQUIPPED },
    skins: {}, // предмети наборів: { id: { r: рідкість, n: серійний номер } } (схема 3)
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
    jokerStats: {}, // локальна статистика реальних партій: { id: { picked, played, wins, changed } }
  };
}

/** Записати джокерів партії: хто був у наборі, зіграний, з ким виграно, чи змінив результат. */
export function recordJokers(stats, set, log) {
  const out = normalizeJokerStats(stats);
  const row = (id) => (out[id] ||= { picked: 0, played: 0, wins: 0, changed: 0 });
  for (const id of set || []) if (JOKER_BY_ID[id]) row(id).picked += 1;
  for (const e of log || []) {
    if (!JOKER_BY_ID[e?.id]) continue;
    const r = row(e.id);
    r.played += 1;
    if (e.won) r.wins += 1;
    if (e.changed) r.changed += 1;
  }
  return out;
}

export function normalizeJokerStats(x) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  for (const [id, r] of Object.entries(x)) {
    if (!JOKER_BY_ID[id] || !r || typeof r !== 'object') continue;
    const played = int(r.played);
    out[id] = { picked: int(r.picked), played, wins: Math.min(int(r.wins), played), changed: Math.min(int(r.changed), played) };
  }
  return out;
}

/** CSV для експорту статистики джокерів. */
export function jokerStatsCsv(stats) {
  const rows = [['id', 'name', 'rarity', 'picked', 'played', 'wins', 'win_pct', 'changed', 'changed_pct']];
  for (const j of JOKERS) {
    const r = stats[j.id];
    if (!r) continue;
    const pc = (a) => (r.played ? Math.round((100 * a) / r.played) : '');
    rows.push([j.id, j.name, j.rarity, r.picked, r.played, r.wins, pc(r.wins), r.changed, pc(r.changed)]);
  }
  return rows.map((x) => x.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
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
  if (p.v === 2) {
    // v2 → v3: стара косметика → предмети тематичних наборів із рідкістю і серійним номером
    p = legacyToSkins(p);
    p.v = 3;
  }
  // майбутні міграції: if (p.v === 3) { …; p.v = 4; }
  return normalize(p);
}

/**
 * Перенести старі предмети (LEGACY_SKINS) у набори. Нічого не зникає: якщо два старі предмети
 * лягають в один новий, лишається вища рідкість, а за нижчу нараховуються уламки як за дублікат.
 */
export function legacyToSkins(p) {
  const cos = { ...(p.cosmetics && typeof p.cosmetics === 'object' ? p.cosmetics : {}) };
  const skins = { ...(p.skins && typeof p.skins === 'object' ? p.skins : {}) };
  let shards = int(p.shards);
  const moved = [];
  for (const [old, [id, r]] of Object.entries(LEGACY_SKINS)) {
    if (!cos[old]) continue;
    delete cos[old];
    const cur = skins[id];
    if (!cur) skins[id] = { r, n: serialFrom(`${p.pid || ''}:${id}`) };
    else if (RANK[r] > RANK[cur.r]) { shards += META.shards.dupe[cur.r]; skins[id] = { r, n: cur.n }; }
    else shards += META.shards.dupe[r];
    moved.push(old);
  }
  const equipped = { ...(p.equipped && typeof p.equipped === 'object' ? p.equipped : {}) };
  for (const [cat, id] of Object.entries(equipped)) if (LEGACY_SKINS[id]) equipped[cat] = LEGACY_SKINS[id][0];
  return { ...p, cosmetics: cos, skins, shards, equipped, migratedCosmetics: moved };
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
  out.skins = {};
  if (p.skins && typeof p.skins === 'object') {
    for (const [id, x] of Object.entries(p.skins)) if (SKIN_BY_ID[id] && x && RANK[x.r] !== undefined) out.skins[id] = { r: x.r, n: Math.min(9999, Math.max(1, int(x.n) || 1)) };
  }
  out.equipped = { ...d.equipped };
  if (p.equipped && typeof p.equipped === 'object') {
    for (const cat of Object.keys(COSMETIC_CATS)) {
      const id = p.equipped[cat];
      if ((COSMETIC_BY_ID[id]?.cat === cat && out.cosmetics[id]) || (SKIN_BY_ID[id]?.cat === cat && out.skins[id])) out.equipped[cat] = id;
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
  out.jokerStats = normalizeJokerStats(p.jokerStats);
  out.v = SCHEMA;
  return out;
}

const clone = (p) => JSON.parse(JSON.stringify(p));

// ───────── володіння, уламки ─────────

/**
 * Додати предмет. Дублікат автоматично стає уламками.
 * kind 'skin': предмет набору конкретної рідкості (opts.rarity, opts.serial). Вища рідкість за наявну —
 * покращення (новий серійний номер), така сама чи нижча — дублікат → уламки за рідкістю, що випала.
 */
export function grant(p, kind, id, opts = {}) {
  const q = clone(p);
  if (kind === 'skin') {
    const r = opts.rarity;
    if (!SKIN_BY_ID[id] || RANK[r] === undefined) return { profile: p, duplicate: false, shards: 0 };
    const cur = q.skins[id];
    if (cur && RANK[cur.r] >= RANK[r]) {
      const sh = META.shards.dupe[r];
      q.shards += sh;
      return { profile: q, duplicate: true, shards: sh, rarity: cur.r, serial: cur.n };
    }
    const serial = opts.serial || serialFrom(`${q.pid}:${id}:${r}:${q.spins}:${q.points}:${q.shards}`);
    q.skins[id] = { r, n: serial };
    const completed = completeSets(q);
    return { profile: q, duplicate: false, upgraded: !!cur, from: cur?.r || null, shards: 0, serial, rarity: r, completed };
  }
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
  const completed = kind === 'cosmetic' ? completeSets(q) : [];
  return { profile: q, duplicate: false, shards: 0, completed };
}

/** Повний тематичний набір → рамка профілю (додається один раз). Мутує q, повертає id завершених наборів. */
export function completeSets(q) {
  const done = [];
  for (const st of SETS) {
    if (q.cosmetics[st.frame]) continue;
    if (st.items.every((id) => q.skins?.[id])) { q.cosmetics[st.frame] = true; done.push(st.id); }
  }
  return done;
}

/** Прогрес наборів: [{ id, name, icon, have, total, frame, done }] */
export function setProgress(p) {
  return SETS.map((st) => ({ ...st, have: st.items.filter((id) => p.skins?.[id]).length, total: st.items.length, done: !!p.cosmetics[st.frame] }));
}

// ───────── магазин ─────────

/** Ціна в балах. Предмет набору купується в конкретній рідкості (вищій за наявну); легендарні — лише автомат. */
export function priceOf(kind, id, rarity) {
  if (kind === 'joker') {
    const j = JOKER_BY_ID[id];
    if (!j || j.rarity === 'legendary') return null; // легендарні — лише з автомата
    return META.prices.joker[j.rarity];
  }
  if (kind === 'skin') {
    if (!SKIN_BY_ID[id] || RANK[rarity] === undefined || rarity === 'legendary') return null;
    return META.prices.cosmetic[rarity];
  }
  const c = COSMETIC_BY_ID[id];
  if (!c || c.source !== 'shop') return null; // стартова, автоматна чи за досягнення — не продається
  return META.prices.cosmetic[c.rarity];
}

export function shardPriceOf(kind, id, rarity) {
  if (kind === 'skin') return SKIN_BY_ID[id] && RANK[rarity] !== undefined && rarity !== 'legendary' ? META.shards.exchange[rarity] : null;
  const item = kind === 'joker' ? JOKER_BY_ID[id] : COSMETIC_BY_ID[id];
  if (!item) return null;
  if (kind === 'joker' && item.rarity === 'legendary') return null;
  if (kind === 'cosmetic' && (item.source === 'ach' || item.source === 'start' || item.source === 'set')) return null;
  return META.shards.exchange[item.rarity];
}

function purchase(p, kind, id, currency, price, rarity) {
  if (price == null) return { ok: false, profile: p, error: 'not-for-sale' };
  const owned = kind === 'joker' ? !!p.jokers[id] : kind === 'skin' ? p.skins[id] && RANK[p.skins[id].r] >= RANK[rarity] : !!p.cosmetics[id];
  if (owned) return { ok: false, profile: p, error: 'owned' };
  if (p[currency] < price) return { ok: false, profile: p, error: currency === 'points' ? 'no-points' : 'no-shards' };
  const q = clone(p);
  q[currency] -= price;
  const g = grant(q, kind, id, { rarity });
  return { ok: true, profile: g.profile, serial: g.serial };
}

export const buy = (p, kind, id, rarity) => purchase(p, kind, id, 'points', priceOf(kind, id, rarity), rarity);
export const exchange = (p, kind, id, rarity) => purchase(p, kind, id, 'shards', shardPriceOf(kind, id, rarity), rarity);

// ───────── набір і косметика ─────────

export function setJokers(p, ids) {
  const q = clone(p);
  q.set = sanitizeSet(ids).filter((id) => q.jokers[id]);
  return q;
}

export function equip(p, cat, id) {
  const ok = (COSMETIC_BY_ID[id]?.cat === cat && p.cosmetics[id]) || (SKIN_BY_ID[id]?.cat === cat && p.skins[id]);
  if (!ok) return p;
  const q = clone(p);
  q.equipped[cat] = id;
  return q;
}

// ───────── автомат ─────────

export const REEL_SYMBOLS = ['cherry', 'bell', 'seven', 'star', 'clover', 'diamond'];
export const SPECIAL_SYMBOL = 'crown';

function rarityPool(rarity) {
  const jokers = JOKERS.filter((j) => j.rarity === rarity).map((j) => ({ kind: 'joker', id: j.id }));
  const cos = [
    ...COSMETICS.filter((c) => c.rarity === rarity && (c.source === 'shop' || c.source === 'slot')).map((c) => ({ kind: 'cosmetic', id: c.id })),
    ...SKIN_ITEMS.map((x) => ({ kind: 'skin', id: x.id })), // предмет набору випадає саме в цій рідкості
  ];
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
  const g = grant(q, item.kind, item.id, { rarity, serial: 1 + Math.floor(rng() * 9999) });
  q = g.profile;
  return { ok: true, profile: q, result: { reels: reelsFor(rarity, rng), rarity, kind: item.kind, id: item.id, duplicate: g.duplicate, shards: g.shards, pityHit, upgraded: !!g.upgraded, from: g.from || null, serial: g.serial || null, completed: g.completed || [] } };
}

// ───────── бали за партію і досягнення ─────────

const dayKey = (d) => d.toISOString().slice(0, 10);

/**
 * Підсумок партії → бали і досягнення.
 * summary: { won, draw, mode: 'online'|'bot'|'hotseat', endReason, me: stats, jokersPlayed: [ids] }
 */
/** Режим дня: щодня інший (крім класики), однаковий для всіх гравців у той самий день. */
export function modeOfDay(now = new Date()) {
  const special = MODE_IDS.filter((m) => m !== 'classic');
  const days = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  return special[days % special.length];
}

export function awardGame(p, summary, now = new Date()) {
  let q = clone(p);
  const mult = META.points.mult[summary.mode] ?? 0;
  const gained = [];
  const add = (label, n) => { const v = Math.round(n); if (v > 0) { gained.push({ label, amount: v }); q.points += v; } };
  add('За участь', META.points.play * mult);
  if (summary.players === 3 && summary.place) add(`Бонус за ${summary.place}-ге місце`, (META.points.place3[summary.place - 1] || 0) * mult);
  else if (summary.won) add('Бонус за перемогу', META.points.win * mult);
  if (summary.gameMode && summary.gameMode === modeOfDay(now)) add('Режим дня', META.points.modeOfDay * mult);
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
    if (a.reward.skin) q = grant(q, 'skin', a.reward.skin, { rarity: a.reward.rarity }).profile;
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

/** Дані профілю для суперника (онлайн): лише вибрана косметика і рідкість вдягнутих предметів наборів. */
export function publicLook(p) {
  const rar = {};
  for (const cat of SKIN_KINDS) if (SKIN_BY_ID[p.equipped[cat]]) rar[cat] = p.skins?.[p.equipped[cat]]?.r || 'common';
  return { ...p.equipped, rar };
}

/**
 * Перевірка чужої «зовнішності» (може бути зламаною): лише відомі id потрібної категорії.
 * Старі клієнти надсилають id старої косметики — вони перекладаються в предмети наборів.
 */
export function sanitizeLook(look) {
  const out = { ...DEFAULT_EQUIPPED, rar: {} };
  if (!look || typeof look !== 'object') return out;
  for (const cat of Object.keys(COSMETIC_CATS)) {
    let id = look[cat];
    let legacyR = null;
    if (LEGACY_SKINS[id]) [id, legacyR] = LEGACY_SKINS[id];
    if (COSMETIC_BY_ID[id]?.cat === cat) out[cat] = id;
    else if (SKIN_BY_ID[id]?.cat === cat) {
      out[cat] = id;
      const r = look.rar?.[cat];
      out.rar[cat] = RANK[r] !== undefined ? r : legacyR || 'common';
    }
  }
  return out;
}
