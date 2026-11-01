// Метрика глибини: «Розумний» проти «Жадібного». Ціль у комбінаціях — ≥ 60% перемог Розумного.
// Запуск: node tools/simulate-depth.js [партій=600] [core=combo|single|both] [гравців=2]
// Розумний і Жадібний міняються місцями через партію; без джокерів (чиста основа гри).
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide } from '../game/bot.js';
import { seededRng } from './simulate.js';

export function depth({ games = 600, core = 'combo', players = 2, seed = 3, config = {}, smart = 'smart', greedy = 'greedy', jokers = null, rounds = 12 } = {}) {
  let smartWins = 0, greedyWins = 0, draws = 0, roundsTotal = 0;
  for (let g = 0; g < games; g++) {
    const rng = seededRng(seed * 100003 + g * 7919 + 17);
    const ctx = { rng, now: 0 };
    // утрьох: один Розумний проти двох Жадібних (місце Розумного ходить по колу)
    const smartSeat = g % players;
    const styles = Array.from({ length: players }, (_, p) => (p === smartSeat ? smart : greedy));
    let s = createGame({ timers: false, players, core, jokerSets: jokers ? jokers(g) : undefined, config: { maxRounds: rounds, logSize: 50, ...config } }, ctx);
    let steps = 0;
    while (s.phase !== 'over' && steps++ < 20000) {
      let acted = false;
      for (let p = 0; p < players && !acted; p++) {
        const a = botDecide(viewFor(s, p, 0), rng, styles[p]);
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, ctx);
        if (!r.ok) throw new Error(`гра ${g}: ${JSON.stringify(a)} → ${r.error}`);
        s = r.state; acted = true;
      }
      if (!acted) throw new Error('ніхто не ходить: ' + s.phase);
    }
    roundsTotal += s.round;
    const firsts = s.places.map((pl, q) => (pl === 1 ? q : -1)).filter((q) => q >= 0);
    if (firsts.length > 1) draws++;
    else if (firsts[0] === smartSeat) smartWins++;
    else greedyWins++;
  }
  const decided = smartWins + greedyWins;
  return { games, smartWins, greedyWins, draws, smartPct: Math.round((1000 * smartWins) / Math.max(1, decided)) / 10, avgRounds: Math.round((10 * roundsTotal) / games) / 10 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = +(process.argv[2] || 600);
  const which = process.argv[3] || 'both';
  const players = +(process.argv[4] || 2);
  for (const core of which === 'both' ? ['combo', 'single'] : [which]) {
    const t = Date.now();
    const r = depth({ games, core, players });
    console.log(`${core === 'combo' ? 'Комбінації (3 карти)' : 'Класика (1 карта)'}, ${players} гравці: Розумний ${r.smartPct}% перемог (${r.smartWins}:${r.greedyWins}, нічиїх ${r.draws}), раундів у середньому ${r.avgRounds} · ${Math.round((Date.now() - t) / 1000)} с`);
  }
}
