// Тривалості анімацій беруться з CSS-токенів (ui/tokens.css), щоб усе налаштовувалось в одному місці.
// prefers-reduced-motion перевизначає токени, тож JS теж автоматично стає «тихим».
const cache = new Map();

/** Тривалість у мс із CSS-змінної, напр. ms('--t-flip'). */
export function ms(name) {
  if (cache.has(name)) return cache.get(name);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const v = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : parseFloat(raw) || 0;
  cache.set(name, v);
  return v;
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => cache.clear());
