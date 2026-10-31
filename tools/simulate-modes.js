// Симуляції режимів-модифікаторів для 2 і 3 гравців (боти з джокерами).
// Запуск: node tools/simulate-modes.js [партій на режим=1500] [out.json]
import { MODES, MODE_IDS } from '../config.js';
import { runSimulation } from './simulate.js';
import { runSim3 } from './simulate3.js';

export function simulateModes(games = 1500) {
  const rows = [];
  for (const mode of MODE_IDS) {
    const two = runSimulation({ games, rounds: 12, mode, jokers: true, seed: 5 });
    const three = runSim3({ games: Math.round(games * 0.7), rounds: 12, mode, jokers: true, seed: 5 });
    rows.push({
      mode, name: MODES[mode].name,
      two: { firstToActWinPct: two.firstToActWinPct, medianRounds: two.medianRounds, bankruptPct: two.bankruptPct, endedBeforeRound4Pct: two.endedBeforeRound4Pct, drawPct: two.drawPct },
      three: { seatWinPct: three.seatWinPct, medianRounds: three.medianRounds, bustGamesPct: three.bustGamesPct, medianFirstOutFrac: three.medianFirstOutFrac, medianFirstOutRound: three.medianFirstOutRound },
    });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = simulateModes(Number(process.argv[2] || 1500));
  for (const r of rows) {
    console.log(`${r.name.padEnd(14)} | удвох: перший хід ${r.two.firstToActWinPct}%, медіана ${r.two.medianRounds} р., банкрутство ${r.two.bankruptPct}%, до 4-го раунду ${r.two.endedBeforeRound4Pct}%`
      + ` | утрьох: місця ${r.three.seatWinPct.join('/')}, медіана ${r.three.medianRounds} р., перший вибуває ${r.three.medianFirstOutRound} р. (${Math.round(r.three.medianFirstOutFrac * 100)}%)`);
  }
  if (process.argv[3]) (await import('node:fs')).writeFileSync(process.argv[3], JSON.stringify(rows, null, 2) + '\n');
}
