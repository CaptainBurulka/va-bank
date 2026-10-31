// Налаштування гравця (лише на цьому пристрої): підказки першої партії.
const KEY = 'vabank-hints';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { enabled: true, seen: [] }; } catch { return { enabled: true, seen: [] }; }
}
function save(h) {
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {}
}

export const hints = {
  enabled: () => load().enabled,
  setEnabled(v) { const h = load(); h.enabled = v; if (v) h.seen = []; save(h); },
  seen: (k) => load().seen.includes(k),
  markSeen(k) { const h = load(); if (!h.seen.includes(k)) h.seen.push(k); save(h); },
  /** Після першої завершеної партії підказки вимикаються самі. */
  gameFinished() { const h = load(); if (h.enabled && !h.done) { h.enabled = false; h.done = true; save(h); } },
};
