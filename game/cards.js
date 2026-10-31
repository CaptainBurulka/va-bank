// Карти, колода та порівняння. Чиста логіка без DOM і мережі.

export const SUITS = ['water', 'fire', 'stone'];

// Хто кого б'є при рівній силі: Вода > Вогонь > Камінь > Вода
export const SUIT_BEATS = { water: 'fire', fire: 'stone', stone: 'water' };

export function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let value = 1; value <= 10; value++) {
      deck.push({ id: `${suit[0]}${value}`, kind: 'num', suit, value });
    }
  }
  deck.push({ id: 'knife', kind: 'knife' });
  deck.push({ id: 'mirror', kind: 'mirror' });
  deck.push({ id: 'double', kind: 'double' });
  return deck;
}

/** Fisher–Yates; rng() повертає число [0, 1). */
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Номінальна сила (без козиря). Дзеркало номіналу не має — null. */
export function basePower(card, cfg) {
  if (card.kind === 'num') return card.value;
  if (card.kind === 'knife') return cfg.knifePower;
  if (card.kind === 'double') return cfg.doublePower;
  return null;
}

/** Сила з урахуванням козиря. Козир діє лише на числові карти. */
export function power(card, cfg, trump = null) {
  const p = basePower(card, cfg);
  if (card.kind === 'num' && trump && card.suit === trump) return p + cfg.trumpBonus;
  return p;
}

/** Що показує розвідка: «висока» чи «низька». Дзеркало прикидається високою. */
export function scoutClass(card, cfg) {
  if (card.kind === 'mirror') return 'high';
  return basePower(card, cfg) >= cfg.scoutHighFrom ? 'high' : 'low';
}

/**
 * Порівняння з поясненням.
 * reason: 'knife-mirror' | 'mirror' | 'knife10' | 'power' | 'suit' | 'tie'
 * cmp: 1 — перемагає a, -1 — b, 0 — нічия.
 */
export function compareDetail(a, b, cfg, trump = null) {
  const out = (cmp, reason, extra = {}) => ({ cmp, reason, ...extra });
  // Ніж — єдиний, хто б'є Дзеркало
  if (a.kind === 'knife' && b.kind === 'mirror') return out(1, 'knife-mirror');
  if (b.kind === 'knife' && a.kind === 'mirror') return out(-1, 'knife-mirror');
  // Дзеркало копіює силу суперника й виграє нічию
  if (a.kind === 'mirror') return out(1, 'mirror', { copied: power(b, cfg, trump) });
  if (b.kind === 'mirror') return out(-1, 'mirror', { copied: power(a, cfg, trump) });
  // Ніж б'є будь-яку десятку (за номіналом, навіть козирну)
  if (a.kind === 'knife' && b.kind === 'num' && b.value === cfg.knifeBeats) return out(1, 'knife10');
  if (b.kind === 'knife' && a.kind === 'num' && a.value === cfg.knifeBeats) return out(-1, 'knife10');
  const pa = power(a, cfg, trump);
  const pb = power(b, cfg, trump);
  const trumped = !!trump && ((a.kind === 'num' && a.suit === trump) || (b.kind === 'num' && b.suit === trump));
  if (pa !== pb) return out(pa > pb ? 1 : -1, 'power', { pa, pb, trumped });
  if (a.kind === 'num' && b.kind === 'num') {
    if (SUIT_BEATS[a.suit] === b.suit) return out(1, 'suit', { pa, pb, trumped });
    if (SUIT_BEATS[b.suit] === a.suit) return out(-1, 'suit', { pa, pb, trumped });
  }
  return out(0, 'tie', { pa, pb, trumped });
}

export function compareCards(a, b, cfg, trump = null) {
  return compareDetail(a, b, cfg, trump).cmp;
}

/**
 * Шанси й множники «подвій або нічого» від реального залишку колоди.
 * Рахуються лише числові карти (спецкарти при відкритті пропускаються).
 * Множник = справедливий × (1 − houseEdge), округлений униз до 0.1.
 */
export function donOdds(base, deck, cfg) {
  const nums = deck.filter((c) => c.kind === 'num');
  const n = nums.length;
  const hi = nums.filter((c) => c.value > base).length;
  const lo = nums.filter((c) => c.value < base).length;
  const eq = n - hi - lo;
  const mult = (win, lose) => {
    if (!win) return 0;
    const fair = 1 + lose / win;
    return Math.floor(fair * (1 - cfg.don.houseEdge) * 10 + 1e-9) / 10;
  };
  const p = (k) => (n ? Math.round((k / n) * 100) / 100 : 0);
  return {
    n,
    higher: { p: p(hi), m: mult(hi, lo), count: hi },
    lower: { p: p(lo), m: mult(lo, hi), count: lo },
    equal: { p: p(eq), count: eq },
  };
}
