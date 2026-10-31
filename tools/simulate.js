// Симуляції бот проти бота. Запуск: node tools/simulate.js [кількість=3000] [раундів=12] [out.json]
// Використовує ту саму логіку, що й гра (game/engine.js) — без UI і мережі.
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide, BOT_STYLES } from '../game/bot.js';

export function seededRng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

export function runSimulation({ games = 3000, rounds = 12, seed = 1, configOverride = {} } = {}) {
  const res = { games, rounds, durations: [], early: 0, seatWins: [0, 0], draws: 0, firstWins: 0, decided: 0, bankrupt: 0,
    usage: {}, roundsTotal: 0, dipped: 0, comeback: 0, styleWins: {}, styleGames: {}, actions: [] };
  const bump = (k, n = 1) => (res.usage[k] = (res.usage[k] || 0) + n);
  for (let g = 0; g < games; g++) {
    const rng = seededRng(seed * 100003 + g * 7919 + 13);
    const ctx = { rng, now: 0 };
    const styles = [BOT_STYLES[g % 3], BOT_STYLES[Math.floor(g / 3) % 3]];
    let s = createGame({ timers: false, config: { maxRounds: rounds, logSize: 1e6, ...configOverride } }, ctx);
    const first = s.firstToAct;
    const dipped = [false, false];
    let lastRound = 1, steps = 0, actions = 0;
    while (s.phase !== 'over' && steps++ < 5000) {
      let acted = false;
      for (const p of [0, 1]) {
        const a = botDecide(viewFor(s, p, 0), rng, styles[p]);
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, ctx);
        if (!r.ok) throw new Error(`гра ${g}: ${JSON.stringify(a)} → ${r.error}`);
        s = r.state; acted = true; actions++;
        break;
      }
      if (!acted) throw new Error('ніхто не ходить');
      if (s.round !== lastRound || s.phase === 'over') {
        lastRound = s.round;
        for (const p of [0, 1]) if (s.players[p].chips < 25) dipped[p] = true;
      }
    }
    const played = s.round;
    res.durations.push(played);
    res.actions.push(actions);
    res.roundsTotal += played;
    if (played < 4) res.early++;
    if (s.endReason === 'bankrupt') res.bankrupt++;
    if (s.winner === 'draw') res.draws++;
    else {
      res.decided++;
      res.seatWins[s.winner]++;
      if (s.winner === first) res.firstWins++;
      res.styleWins[styles[s.winner]] = (res.styleWins[styles[s.winner]] || 0) + 1;
    }
    for (const p of [0, 1]) res.styleGames[styles[p]] = (res.styleGames[styles[p]] || 0) + 1;
    for (const p of [0, 1]) if (dipped[p]) { res.dipped++; if (s.winner === p) res.comeback++; }
    // Використання механік — з повного журналу партії
    for (const e of s.log) { bump(e.t); if (e.t === 'raise' && e.allin) bump('allin'); }
  }
  const R = res.roundsTotal;
  const u = res.usage;
  return {
    games, rounds,
    medianRounds: median(res.durations),
    medianActions: median(res.actions),
    endedBeforeRound4Pct: pct(res.early, games),
    bankruptPct: pct(res.bankrupt, games),
    drawPct: pct(res.draws, games),
    hostWinPct: pct(res.seatWins[0], res.decided),
    guestWinPct: pct(res.seatWins[1], res.decided),
    firstToActWinPct: pct(res.firstWins, res.decided),
    perRound: {
      scout: pct(u.scout || 0, R * 2), raise: pct(u.raise || 0, R), allin: pct(u.allin || 0, R),
      fold: pct(u.fold || 0, R), tie: pct(u.tie || 0, R), don: pct(u.don || 0, R), swap: pct(u.swap || 0, R * 2), show: pct(u.show || 0, R),
    },
    comebackPct: pct(res.comeback, res.dipped),
    dippedGames: res.dipped,
    styleWinPct: Object.fromEntries(Object.keys(res.styleGames).map((k) => [k, pct(res.styleWins[k] || 0, res.styleGames[k])])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 3000);
  const rounds = Number(process.argv[3] || 12);
  const out = runSimulation({ games, rounds });
  console.log(JSON.stringify(out, null, 2));
  if (process.argv[4]) (await import('node:fs')).writeFileSync(process.argv[4], JSON.stringify(out, null, 2) + '\n');
}
