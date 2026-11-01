// Комбінації з 3 карт. Чиста логіка без DOM і мережі.
//
// Порядок — за реальною частотою в нашій колоді (33 карти, 3 масті × 1–10 + Ніж, Дзеркало, Подвоєння)
// з урахуванням вибору 3 з 6 (tools/simulate-combos.js): чим рідше трапляється — тим сильніше.
//   Стріт у масть ~8% рук · Трійка ~14% · Стріт ~45% · Масть ~70% · Пара ~77% · Старша карта — решта.
//
// Нічия між однаковими комбінаціями: спершу значення самої комбінації (трійка, пара, верх стріту),
// далі старші карти. Козир: не змінює комбінацію, але в нічиї козирна карта рахується на 1 старшою.
// Повністю рівні комбінації — банк у джекпот (рішення рушія).
//
// Спецкарти колоди:
//   Дзеркало — копіює значення (не масть) твоєї найстаршої іншої зіграної карти;
//   Подвоєння — значення 5 без масті (ефект: суперники доплачують ще один банк, якщо ти виграв);
//   Ніж — без значення; найстарша карта найсильнішої комбінації суперника не рахується.

export const COMBO_ORDER = ['high', 'pair', 'flush', 'straight', 'trio', 'sflush']; // індекс = ранг
export const COMBO_RANK = Object.fromEntries(COMBO_ORDER.map((id, i) => [id, i]));
export const COMBO_NAME = {
  sflush: 'Стріт у масть', trio: 'Трійка', straight: 'Стріт', flush: 'Масть', pair: 'Пара', high: 'Старша карта',
};
/** Короткий опис для шпаргалки (приклад — числа й масті умовні). */
export const COMBO_HINT = {
  sflush: '3 карти поспіль однієї масті',
  trio: '3 карти одного значення',
  straight: '3 карти поспіль',
  flush: '3 карти однієї масті',
  pair: '2 карти одного значення',
  high: 'нічого з переліченого — рахується старша карта',
};
const SUIT_NAME = { water: 'Вода', fire: 'Вогонь', stone: 'Камінь' };

/**
 * Значення й масть карти для комбінації. joker — функція (card) → { v, s } | null для джокерів.
 * Повертає «слот»: { v: число|null (null — порожнє місце), s: масть|null, card }.
 */
export function slotOf(card, joker = null) {
  if (!card) return { v: null, s: null, card: null };
  if (card.kind === 'num') return { v: card.value, s: card.suit, card };
  if (card.kind === 'double') return { v: 5, s: null, card };
  if (card.kind === 'knife') return { v: null, s: null, card };
  if (card.kind === 'mirror') return { v: null, s: null, card, mirror: true }; // значення — після інших
  if (card.kind === 'joker') {
    const j = joker ? joker(card) : null;
    return j ? { v: j.v ?? null, s: j.s ?? null, card, mirror: !!j.mirror, wild: !!j.wild, wildMax: j.wildMax } : { v: card.power ?? 5, s: null, card };
  }
  return { v: null, s: null, card };
}

/** Слоти для набору карт: Дзеркало копіює значення найстаршої іншої карти набору. */
export function slotsOf(cards, joker = null) {
  const slots = cards.map((c) => (c && c.v !== undefined && c.card !== undefined ? { ...c } : slotOf(c, joker)));
  for (const sl of slots) if (sl.mirror) {
    const others = slots.filter((x) => x !== sl && !x.mirror && x.v != null).map((x) => x.v);
    sl.v = others.length ? Math.max(...others) : null;
    sl.s = null;
  }
  return slots;
}

/**
 * Оцінка комбінації. slots — до 3 слотів (порожні — v=null). trump — масть-козир або null.
 * @returns {{ id, rank, key: number[], label, main: number[], values: number[] }}
 */
export function evaluate(slots, trump = null) {
  // Дикун: перебираємо значення й масть, що дають найсильнішу комбінацію
  const wi = slots.findIndex((x) => x && x.wild);
  if (wi >= 0) {
    let best = null;
    for (let v = 1; v <= (slots[wi].wildMax || 10); v++) for (const s of ['water', 'fire', 'stone']) {
      const c = evaluate(slots.map((x, i) => (i === wi ? { ...x, v, s, wild: false } : x)), trump);
      if (!best || compareCombos(c, best) > 0) best = c;
    }
    return best;
  }
  const vs = slots.filter((x) => x && x.v != null);
  const boosted = vs.map((x) => x.v + (trump && x.s === trump ? 1 : 0)).sort((a, b) => b - a);
  while (boosted.length < 3) boosted.push(0);
  const vals = vs.map((x) => x.v).sort((a, b) => a - b);
  let id = 'high', main = [];
  if (vs.length === 3) {
    const suited = vs[0].s && vs.every((x) => x.s === vs[0].s);
    const straight = vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;
    if (straight && suited) { id = 'sflush'; main = [vals[2]]; }
    else if (vals[0] === vals[2]) { id = 'trio'; main = [vals[0]]; }
    else if (straight) { id = 'straight'; main = [vals[2]]; }
    else if (suited) { id = 'flush'; main = []; }
  }
  if (id === 'high') {
    const pairV = vals.find((v, i) => vals.indexOf(v) !== i);
    if (pairV !== undefined) { id = 'pair'; main = [pairV]; }
  }
  const rank = COMBO_RANK[id];
  const top = vals.length ? vals[vals.length - 1] : 0;
  const label = id === 'sflush' ? `Стріт у масть ${vals[0]}–${vals[2]}`
    : id === 'trio' ? `Трійка ${main[0]}`
      : id === 'straight' ? `Стріт ${vals[0]}–${vals[2]}`
        : id === 'flush' ? `Масть ${SUIT_NAME[vs[0].s] ? `(${SUIT_NAME[vs[0].s].toLowerCase()})` : ''}`.trim()
          : id === 'pair' ? `Пара ${main[0]}`
            : vs.length ? `Старша ${top}` : 'Порожньо';
  return { id, rank, key: [rank, ...main, ...boosted], label, main, values: vals };
}

/** 1 — сильніша a, -1 — b, 0 — повністю рівні. */
export function compareCombos(a, b) {
  const n = Math.max(a.key.length, b.key.length);
  for (let i = 0; i < n; i++) {
    const x = a.key[i] ?? 0, y = b.key[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

const ACC = { sflush: 'Стріт у масть', trio: 'Трійку', straight: 'Стріт', flush: 'Масть', pair: 'Пару', high: 'Старшу карту' };
/** Пояснення результату для гравця: «Стріт б'є Пару» / «Пара 9 — вище, ніж Пара 7» / «…вирішили старші карти». */
export function explain(win, lose) {
  if (win.rank !== lose.rank) return `${COMBO_NAME[win.id]} б'є ${ACC[lose.id]}`;
  if (win.main[0] !== undefined && win.main[0] !== lose.main[0]) return `${win.label} — вище, ніж ${lose.label}`;
  const nominal = (c) => c.values.slice().reverse().join();
  return `Обидві — ${COMBO_NAME[win.id].toLowerCase()}: вирішили старші карти${nominal(win) === nominal(lose) ? ' (козир +1)' : ''}`;
}

/** Усі набори по k з масиву (індекси). */
export function subsets(n, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

/**
 * Найсильніший набір із k карт руки (для бота й підказки).
 * joker — функція оцінки джокера (див. slotOf); filter(idx[]) → false, щоб пропустити набір.
 */
export function bestSet(hand, trump = null, { k = 3, joker = null, filter = null } = {}) {
  let best = null;
  for (const idx of subsets(hand.length, Math.min(k, hand.length))) {
    if (filter && !filter(idx)) continue;
    const combo = evaluate(slotsOf(idx.map((i) => hand[i]), joker), trump);
    if (!best || compareCombos(combo, best.combo) > 0) best = { idx, combo };
  }
  return best;
}

/** Ніж: прибирає найстаршу за значенням карту з набору слотів (вона не рахується). */
export function knifeCut(slots, trump = null) {
  let iMax = -1, best = -1;
  slots.forEach((x, i) => {
    if (x.v == null) return;
    const b = x.v + (trump && x.s === trump ? 1 : 0);
    if (b > best) { best = b; iMax = i; }
  });
  if (iMax < 0) return { slots, cut: null };
  const out = slots.map((x, i) => (i === iMax ? { v: null, s: null, card: x.card, cut: true } : x));
  return { slots: out, cut: slots[iMax].card };
}

// ───────── сила комбінації як шкала 0..1 (для інтерфейсу й ботів) ─────────
// Частка випадкових «найкращих 3 з 6» суперника, які ця комбінація б'є (рахується один раз, кешується).
let table = null;
export function strengthTable(sample = 4000, rngSeed = 7) {
  if (table) return table;
  let x = rngSeed >>> 0 || 1;
  const rng = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const deck = [];
  for (const s of ['water', 'fire', 'stone']) for (let v = 1; v <= 10; v++) deck.push({ id: `${s[0]}${v}`, kind: 'num', suit: s, value: v });
  deck.push({ id: 'knife', kind: 'knife' }, { id: 'mirror', kind: 'mirror' }, { id: 'double', kind: 'double' });
  const keys = [];
  for (let i = 0; i < sample; i++) {
    const h = [];
    const pool = deck.slice();
    for (let k = 0; k < 6; k++) h.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    keys.push(bestSet(h).combo);
  }
  keys.sort(compareCombos);
  table = keys;
  return table;
}
/** Сила комбінації 0..1: яку частку типових найкращих комбінацій суперника вона б'є. */
export function strengthOf(combo) {
  const t = strengthTable();
  let lo = 0, hi = t.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (compareCombos(t[m], combo) < 0) lo = m + 1; else hi = m; }
  let eq = lo;
  while (eq < t.length && compareCombos(t[eq], combo) === 0) eq++;
  return (lo + (eq - lo) / 2) / t.length;
}
