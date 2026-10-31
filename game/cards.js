// Карти, колода та порівняння. Чиста логіка без DOM і мережі.

export const SUITS = ['water', 'fire', 'stone'];

// Хто кого б'є при рівних значеннях: Вода > Вогонь > Камінь > Вода
const SUIT_BEATS = { water: 'fire', fire: 'stone', stone: 'water' };

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

/** Сила карти для порівняння (без урахування Дзеркала). */
export function power(card, cfg) {
  if (card.kind === 'num') return card.value;
  if (card.kind === 'knife') return cfg.knifePower;
  if (card.kind === 'double') return cfg.doublePower;
  return null; // mirror
}

/**
 * Порівняння карт a і b.
 * @returns 1 — a перемагає, -1 — b перемагає, 0 — нічия.
 */
export function compareCards(a, b, cfg) {
  // Дзеркало копіює значення й масть суперника — завжди нічия.
  if (a.kind === 'mirror' || b.kind === 'mirror') return 0;
  // Ніж б'є будь-яку десятку.
  if (a.kind === 'knife' && b.kind === 'num' && b.value === cfg.knifeBeats) return 1;
  if (b.kind === 'knife' && a.kind === 'num' && a.value === cfg.knifeBeats) return -1;
  const pa = power(a, cfg);
  const pb = power(b, cfg);
  if (pa !== pb) return pa > pb ? 1 : -1;
  if (a.kind === 'num' && b.kind === 'num') {
    if (SUIT_BEATS[a.suit] === b.suit) return 1;
    if (SUIT_BEATS[b.suit] === a.suit) return -1;
  }
  return 0;
}

/** Числове значення карти для «подвій або нічого». Дзеркало = значення карти суперника. */
export function cardValue(card, oppCard, cfg) {
  if (card.kind === 'mirror') return oppCard && oppCard.kind !== 'mirror' ? cardValue(oppCard, null, cfg) : 0;
  return power(card, cfg);
}
