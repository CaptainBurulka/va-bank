// Частота комбінацій: у скількох руках із 6 карт можна скласти кожну комбінацію (вибір 3 з 6).
// За нею визначено порядок у game/combos.js: рідша — сильніша. Запуск: node tools/simulate-combos.js
import { buildDeck, shuffle } from '../game/cards.js';
let x = 12345; const rng = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
const types = ['trio', 'sflush', 'straight', 'flush', 'pair'];
const has = Object.fromEntries(types.map((t) => [t, 0]));
const val = (cards, c) => c.kind === 'num' ? c.value : c.kind === 'double' ? 5 : c.kind === 'mirror' ? Math.max(0, ...cards.filter((d) => d !== c && d.kind === 'num').map((d) => d.value)) || null : null;
const suit = (c) => c.kind === 'num' ? c.suit : null;
function kinds(tri) {
  const v = tri.map((c) => val(tri, c)), s = tri.map(suit);
  const out = new Set();
  if (v.every((a) => a != null)) {
    const so = [...v].sort((a, b) => a - b);
    const flush = s[0] && s.every((q) => q === s[0]);
    const str = so[1] === so[0] + 1 && so[2] === so[1] + 1;
    if (so[0] === so[2]) out.add('trio');
    if (str && flush) out.add('sflush');
    if (str) out.add('straight');
    if (flush) out.add('flush');
  } else if (s[0] && s.every((q) => q === s[0])) out.add('flush');
  const vv = v.filter((a) => a != null);
  if (new Set(vv).size < vv.length) out.add('pair');
  return out;
}
const N = +(process.argv[2] || 200000);
for (let i = 0; i < N; i++) {
  const h = shuffle(buildDeck(), rng).slice(0, 6);
  const found = new Set();
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) for (const k of kinds([h[a], h[b], h[c]])) found.add(k);
  for (const k of found) has[k]++;
}
for (const t of types) console.log(t.padEnd(9), (100 * has[t] / N).toFixed(2) + '%');
