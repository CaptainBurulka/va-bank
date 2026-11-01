// Показ комбінацій: жива назва під час вибору, «Може бути: …» за відкритою картою суперника, шпаргалка.
// Лише інтерфейс: рахує за тими самими функціями, що й рушій (game/combos.js), нічого не змінює в грі.
import { evaluate, slotsOf, slotOf, strengthOf, COMBO_NAME, COMBO_HINT, COMBO_ORDER } from '../game/combos.js';
import { jokerSlot } from '../game/jokers.js';
import { buildDeck } from '../game/cards.js';

const DECK = buildDeck();

/** Комбінація набору карт (джокери — за їхнім значенням за замовчуванням; hand — підказка для Двійника). */
export function comboOf(cards, trump = null, hand = null) {
  const jf = (c) => jokerSlot(c, hand ? { hand } : null);
  return evaluate(slotsOf(cards.filter(Boolean).map((c) => slotOf(c, jf))), trump);
}

/** Жива оцінка вибору: { combo, strength 0..1 } або null, якщо карт ще немає. */
export function liveCombo(cards, trump, hand) {
  if (!cards.length) return null;
  const combo = comboOf(cards, trump, hand);
  return { combo, strength: cards.length === 3 ? strengthOf(combo) : null };
}

/** Найкраща комбінація, яку можна скласти з картою card і рукою (для кроку «відкрита»). */
export function bestWith(card, hand, trump) {
  const rest = hand.filter((c) => c !== card);
  let best = null;
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
    const combo = comboOf([card, rest[i], rest[j]], trump, hand);
    if (!best || combo.rank > best.rank || (combo.rank === best.rank && strengthOf(combo) > strengthOf(best))) best = combo;
  }
  return best;
}

/** Найслабша з карт за значенням (відкрита за замовчуванням). */
export function weakestId(cards, hand = null) {
  const jf = (c) => jokerSlot(c, hand ? { hand } : null);
  const val = (c) => { const sl = slotOf(c, jf); return sl.mirror ? 11 : sl.v ?? -1; };
  return cards.slice().sort((a, b) => val(a) - val(b))[0]?.id ?? null;
}

const cache = new Map();
/**
 * Які комбінації ще можливі для набору з відкритою картою open.
 * seen — id карт, яких точно немає серед закритих (моя рука, мої карти, інші відкриті).
 * scout — 'high' | 'low' | null (розвідка до цього гравця): чи є серед закритих висока від highFrom.
 * Повертає назви від найсильнішої: ['Трійка 7', 'Стріт у масть', …].
 */
export function possibleCombos(open, seen, trump, scout = null, highFrom = 8) {
  if (!open) return [];
  const key = `${open.id}|${[...seen].sort().join(',')}|${trump}|${scout}`;
  if (cache.has(key)) return cache.get(key);
  const pool = DECK.filter((c) => c.id !== open.id && !seen.has(c.id));
  const isHigh = (c) => c.kind === 'mirror' || (c.kind === 'num' && c.value >= highFrom);
  const best = {};
  const ov = slotOf(open, jokerSlot).v;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const a = pool[i], b = pool[j];
    if (scout === 'high' && !isHigh(a) && !isHigh(b)) continue;
    if (scout === 'low' && (isHigh(a) || isHigh(b))) continue;
    const c = comboOf([open, a, b], trump);
    const prev = best[c.id];
    // для пари й трійки — підпис зі значенням відкритої карти, якщо так можна
    const nice = (x) => (x.main[0] === ov ? 2 : 0) + (x.main[0] ?? 0) / 100;
    if (!prev || nice(c) > nice(prev)) best[c.id] = c;
  }
  const out = COMBO_ORDER.slice().reverse().filter((id) => best[id] && id !== 'high').map((id) => (['pair', 'trio'].includes(id) && best[id].main[0] === ov ? best[id].label : COMBO_NAME[id]));
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

/** Шпаргалка «Комбінації»: від найсильнішої, з прикладом. */
const EXAMPLE = { sflush: ['f4', 'f5', 'f6'], trio: ['w7', 'f7', 's7'], straight: ['w4', 'f5', 's6'], flush: ['s2', 's6', 's9'], pair: ['w9', 'f9', 's3'], high: ['w10', 'f6', 's2'] };
export function cheatSheetHTML() {
  const C = (id) => `<span data-card="${id}"></span>`;
  const rows = COMBO_ORDER.slice().reverse().map((id, i) => `<div class="cs-row"><span class="cs-n">${i + 1}</span><div class="cs-t"><b>${COMBO_NAME[id]}</b><span>${COMBO_HINT[id]}</span></div><div class="mini-cards">${EXAMPLE[id].map(C).join('')}</div></div>`).join('');
  return `<h3>Комбінації</h3><p class="hint-text">Від найсильнішої. Рідше трапляється — сильніша.</p><div class="cheat">${rows}</div>
<ul class="cs-notes">
<li><b>Рівні комбінації</b> — вирішує значення комбінації, далі старші карти. Повністю рівні — банк у джекпот.</li>
<li><b>Козир</b> не змінює комбінацію, але в нічиї козирна карта на 1 старша.</li>
<li><b>Дзеркало</b> — копія значення твоєї найстаршої іншої карти (без масті). <b>Подвоєння</b> — значення 5. <b>Ніж</b> — найстарша карта найсильнішої комбінації суперника не рахується.</li>
<li><b>Відкрита карта</b> (👁) видна всім до торгів, дві закриті — лише при розкритті.</li>
</ul>`;
}
