// Профіль у localStorage (зі схемою і міграціями) + підказка встановити гру.
import { migrate, normalize } from '../meta/profile.js';

const KEY = 'vabank-profile';
let cache = null;
const listeners = new Set();

export function loadProfile() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch {}
  cache = migrate(raw);
  return cache;
}

export function saveProfile(p) {
  cache = normalize(p);
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  for (const fn of listeners) fn(cache);
  return cache;
}

export function onProfile(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** На iOS у вкладки Safari і в гри з початкового екрана різні сховища. */
export function needsInstallHint() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !standalone;
}
