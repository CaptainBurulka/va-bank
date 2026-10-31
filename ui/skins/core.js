// Спільне для скінів: детермінований «рандом» (щоб арт однієї карти завжди був однаковим),
// унікальні id для SVG-градієнтів, реєстр наборів, токени рідкостей.
import { SKINS } from '../../config.js';

export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
export const RAR = SKINS.rarities;
export const rarIndex = (r) => RARITY_ORDER.indexOf(r);
export const atLeast = (r, min) => rarIndex(r) >= rarIndex(min);

/** Хеш рядка → 32-біт число (FNV-1a). */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Генератор [0, 1) із зерном — один і той самий арт для тієї самої карти. */
export function rng(seed) {
  let x = (typeof seed === 'string' ? hash(seed) : seed) >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

let uidN = 0;
/** Унікальний префікс id для SVG у межах сторінки. */
export const uid = (p = 'sk') => `${p}${(++uidN).toString(36)}`;

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Реєстр наборів: { id: { name, ... рендерери } } */
export const SETS = {};
export function registerSet(def) { SETS[def.id] = def; return def; }

/** Округлення для компактного SVG. */
export const f = (n) => Math.round(n * 10) / 10;
