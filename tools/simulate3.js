// Симуляції гри на трьох (бот × 3). Запуск: node tools/simulate3.js [партій=3000] [раундів=12] [out.json]
// Метрики: частка перемог за місцем (місце 1 ходить першим у 1-му раунді), медіанна тривалість,
// медіанний раунд першого вибуття (як частка довжини партії), перемоги джокерів утрьох.
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide, BOT_STYLES } from '../game/bot.js';
import { JOKERS, RARITIES } from '../game/jokers.js';
import { seededRng } from './simulate.js';

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/** Одна партія на трьох. sets — набори джокерів; jokerPlay — імовірність зіграти джокером для кожного місця. */
export function playGame3({ seed, rounds = 12, configOverride = {}, sets, jokerPlay, onRound, mode = 'classic' }) {
  const rng = seededRng(seed);
  const ctx = { rng, now: 0 };
  const styles = [0, 1, 2].map(() => BOT_STYLES[Math.floor(rng() * 3)]);
  let s = createGame({ players: 3, timers: false, firstToAct: 0, mode, jokerSets: sets, config: { maxRounds: rounds, logSize: 1e6, ...configOverride } }, ctx);
  let prevPhase = s.phase;
  for (let steps = 0; s.phase !== 'over' && steps < 12000; steps++) {
    let acted = false;
    for (const p of [0, 1, 2]) {
      const v = viewFor(s, p, 0);
      const a = botDecide(v, rng, styles[p], jokerPlay ? { jokerPlay: jokerPlay[p] } : null);
      if (!a) continue;
      const r = reduce(s, { ...a, player: p }, ctx);
      if (!r.ok) throw new Error(`гра ${seed}: ${JSON.stringify(a)} → ${r.error}`);
      const before = s;
      s = r.state; acted = true;
      if (onRound && before.phase !== 'result' && s.phase === 'result') onRound('result', s);
      if (onRound && prevPhase === 'result' && s.phase !== 'result') onRound('end', s, before);
      prevPhase = s.phase;
      break;
    }
    if (!acted) throw new Error('ніхто не ходить');
  }
  return s;
}

export function runSim3({ games = 3000, rounds = 12, seed = 1, configOverride = {}, jokers = false, mode = 'classic' } = {}) {
  const res = { games, rounds, seatWins: [0, 0, 0], draws: 0, durations: [], firstOut: [], firstOutFrac: [], bustGames: 0, pots: [] };
  const ids = JOKERS.map((j) => j.id);
  for (let g = 0; g < games; g++) {
    const sets = jokers ? [0, 1, 2].map((p) => [0, 1, 2].map((k) => ids[(g * 3 + p * 11 + k * 7) % ids.length])) : undefined;
    const s = playGame3({ seed: seed * 100003 + g * 7919 + 13, rounds, configOverride, sets, mode });
    res.durations.push(s.round);
    if (s.winner === 'draw') res.draws++; else res.seatWins[s.winner]++;
    const outs = s.stats.map((x) => x.outRound).filter((x) => x != null);
    if (outs.length) { res.bustGames++; res.firstOut.push(Math.min(...outs)); res.firstOutFrac.push(Math.min(...outs) / s.cfg.maxRounds); }
  }
  return {
    games, rounds,
    seatWinPct: res.seatWins.map((w) => pct(w, games)),
    drawPct: pct(res.draws, games),
    medianRounds: median(res.durations),
    bustGamesPct: pct(res.bustGames, games),
    medianFirstOutRound: median(res.firstOut),
    medianFirstOutFrac: Math.round(median(res.firstOutFrac) * 100) / 100,
  };
}

/**
 * Джокери втрьох: місце 0 має набір з одного джокера і завжди його грає, інші — випадкові джокери (грають у половині випадків).
 * Оцінка розкриття — як у грі вдвох: 1, якщо власник джокера закінчив раунд краще за суперників у середньому, 0.5 — нарівні, 0 — гірше.
 * База для порівняння — ті самі партії, де місце 0 у раунді джокерів грає звичайною картою.
 */
function jokerRun(jid, gamesPer, configOverride) {
  let n = 0, sum = 0, gw = 0;
  for (let g = 0; g < gamesPer; g++) {
    const pick = (k) => JOKERS[(g * 7 + k * 13) % JOKERS.length].id;
    let snap = null, mine = false;
    const s = playGame3({
      seed: 9000 + g * 31, rounds: 12, configOverride, sets: [jid ? [jid] : [], [pick(1)], [pick(2)]], jokerPlay: [1, 0.5, 0.5],
      onRound: (ev, st, before) => {
        if (ev === 'result') {
          const p0 = st.players[0];
          mine = !p0.folded && !p0.out && st.result.reason !== 'fold' && (jid ? p0.played?.kind === 'joker' : st.round === st.jokerRound && p0.played?.kind !== 'joker');
        } else if (ev === 'end') {
          const now = before.players.map((x) => x.chips);
          if (mine && snap) {
            const d = now.map((c, q) => c - snap[q]);
            const rel = d[0] - (d[1] + d[2]) / 2;
            n++; sum += rel > 0 ? 1 : rel < 0 ? 0 : 0.5;
          }
          mine = false; snap = now;
        }
      },
    });
    if (s.winner === 0) gw++;
  }
  return { showdowns: n, showdownWinPct: pct(sum, n), gameWinPct: pct(gw, gamesPer) };
}

export function simulateJokers3(gamesPer = 200, configOverride = {}) {
  const base = jokerRun(null, gamesPer * 4, configOverride);
  const rows = [];
  for (const j of JOKERS) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(j.id)) continue;
    const r = jokerRun(j.id, gamesPer, configOverride);
    rows.push({ id: j.id, name: j.name, rarity: j.rarity, ...r, vsBase: Math.round((r.showdownWinPct - base.showdownWinPct) * 10) / 10 });
  }
  const rarity = Object.fromEntries(RARITIES.map((r) => {
    const xs = rows.filter((x) => x.rarity === r && x.showdowns);
    return [r, xs.length ? Math.round((xs.reduce((a, x) => a + x.showdownWinPct, 0) / xs.length) * 10) / 10 : null];
  }));
  return { base, rows, rarity };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 3000), rounds = Number(process.argv[3] || 12);
  const out = { base: runSim3({ games, rounds }), withJokers: runSim3({ games: Math.round(games / 2), rounds, jokers: true }) };
  console.log(JSON.stringify(out, null, 2));
  if (process.argv[4] !== 'nojokers') {
    out.jokers = simulateJokers3(Number(process.env.PER || 150));
    console.log('база (звичайна карта в раунді джокерів):', out.jokers.base);
    for (const r of out.jokers.rows) console.log(`${r.rarity.padEnd(9)} ${r.name.padEnd(14)} розкриття ${String(r.showdownWinPct).padStart(5)}% (${r.showdowns})  від бази ${String(r.vsBase).padStart(5)}  партія ${String(r.gameWinPct).padStart(5)}%`);
    console.log('рідкості:', out.jokers.rarity);
  }
  if (process.argv[5]) (await import('node:fs')).writeFileSync(process.argv[5], JSON.stringify(out, null, 2) + '\n');
}
