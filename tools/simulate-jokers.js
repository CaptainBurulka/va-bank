// Симуляції джокерів: для кожного — N партій, де гравець A має в наборі лише цього джокера,
// а гравець B — випадкового джокера з каталогу. Бот розігрує джокера, щойно отримає.
// Метрика «перемоги» раунду з джокером: хто виграв більше фішок у цьому раунді (нічия = ½).
// Запуск: node tools/simulate-jokers.js [ігор-на-джокера=400] [out.json]
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide, BOT_STYLES } from '../game/bot.js';
import { JOKERS, RARITIES } from '../game/jokers.js';
import { seededRng } from './simulate.js';

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : 0; };

function playGame(seed, sets, rounds = 12, jokersOn = true) {
  const rng = seededRng(seed);
  const ctx = { rng, now: 0 };
  const styles = [BOT_STYLES[seed % 3], BOT_STYLES[(seed >> 2) % 3]];
  let s = createGame({ timers: false, config: { maxRounds: rounds }, jokerSets: jokersOn ? sets : undefined }, ctx);
  const plays = [];
  let snap = s.players[0].chips - s.players[1].chips;
  let prevPhase = s.phase, recorded = false, played = [null, null], revealed = false;
  for (let steps = 0; s.phase !== 'over' && steps < 6000; steps++) {
    for (const p of [0, 1]) {
      // A розігрує джокера одразу, B — у половині випадків (реалістичніше, ніж завжди одночасно)
      const a = botDecide(viewFor(s, p, 0), rng, styles[p], { jokerPlay: p === 0 ? 1 : 0.5 });
      if (!a) continue;
      s = reduce(s, { ...a, player: p }, ctx).state;
      break;
    }
    if (s.phase === 'result' && !recorded) {
      recorded = true;
      played = [0, 1].map((p) => (s.players[p].played?.kind === 'joker' ? s.players[p].played.joker : null));
      revealed = s.result.reason !== 'fold';
    }
    // раунд закінчився: з «результату» перейшли до нової роздачі (зокрема переграного раунду) або кінця
    const ended = prevPhase === 'result' && s.phase !== 'result';
    prevPhase = s.phase;
    if (ended) {
      const now = s.players[0].chips - s.players[1].chips; // анте однакове для обох — скорочується
      const rel = now - snap;
      for (const p of [0]) if (played[p]) plays.push({ joker: played[p], p, revealed, score: (p === 0 ? rel : -rel) > 0 ? 1 : (p === 0 ? rel : -rel) < 0 ? 0 : 0.5 });
      snap = now; recorded = false; played = [null, null];
    }
  }
  return { s, plays };
}

export function simulateJokers(gamesPer = 400) {
  const per = {};
  const games = { on: [], off: [] };
  const gameWin = {};
  let seed = 1;
  for (const j of JOKERS) { per[j.id] = { n: 0, sum: 0 }; gameWin[j.id] = { n: 0, w: 0 }; }
  for (const j of JOKERS) {
    for (let g = 0; g < gamesPer; g++) {
      const other = JOKERS[(g * 7 + 3) % JOKERS.length].id;
      const { s, plays } = playGame(seed++, [[j.id], [other]]);
      games.on.push(s.round);
      for (const x of plays) { per[x.joker].n++; per[x.joker].sum += x.score; if (x.revealed) { per[x.joker].sn++; per[x.joker].ssum += x.score; } }
      if (s.stats[0].jokers.includes(j.id) && s.winner !== 'draw') { gameWin[j.id].n++; if (s.winner === 0) gameWin[j.id].w++; }
    }
  }
  for (let g = 0; g < 2000; g++) games.off.push(playGame(900000 + g, [[], []], 12, false).s.round);
  const rows = JOKERS.map((j) => ({
    id: j.id, name: j.name, rarity: j.rarity, plays: per[j.id].n, showdowns: per[j.id].sn,
    showdownWinPct: per[j.id].sn ? Math.round((1000 * per[j.id].ssum) / per[j.id].sn) / 10 : null,
    roundWinPct: per[j.id].n ? Math.round((1000 * per[j.id].sum) / per[j.id].n) / 10 : null,
    gameWinPct: gameWin[j.id].n ? Math.round((1000 * gameWin[j.id].w) / gameWin[j.id].n) / 10 : null,
  }));
  const rarity = Object.fromEntries(RARITIES.map((r) => {
    const xs = JOKERS.filter((j) => j.rarity === r);
    const n = xs.reduce((a, j) => a + per[j.id].sn, 0), sum = xs.reduce((a, j) => a + per[j.id].ssum, 0);
    return [r, Math.round((1000 * sum) / n) / 10];
  }));
  return { rows, rarity, medianRoundsWith: median(games.on), medianRoundsWithout: median(games.off) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = simulateJokers(Number(process.argv[2] || 400));
  for (const r of out.rows) console.log(`${r.rarity.padEnd(9)} ${r.name.padEnd(14)} розкриття ${String(r.showdownWinPct).padStart(5)}% (${r.showdowns})  раунд ${String(r.roundWinPct).padStart(5)}%  партія ${String(r.gameWinPct).padStart(5)}%`);
  console.log('рідкості:', out.rarity, 'медіана раундів з/без:', out.medianRoundsWith, out.medianRoundsWithout);
  if (process.argv[3]) (await import('node:fs')).writeFileSync(process.argv[3], JSON.stringify(out, null, 2) + '\n');
}
