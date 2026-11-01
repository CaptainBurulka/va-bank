// Метрики партії ботами: тривалість, кінці до 4-го раунду, банкрутства, перемоги за місцем, джокери, частота комбінацій.
// Запуск: node tools/simulate-metrics.js [партій=300] [core=combo|single] [гравців=2] [стиль=smart] [джокери=1|0]
// Стилі ботів однакові на всіх місцях; джокери — випадкові набори по 3 з усього каталогу.
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide } from '../game/bot.js';
import { JOKER_IDS } from '../game/jokers.js';
import { COMBO_ORDER, COMBO_NAME } from '../game/combos.js';
import { seededRng } from './simulate.js';

export function metrics({ games = 300, core = 'combo', players = 2, style = 'smart', jokers = true, seed = 11, rounds = 12 } = {}) {
  const out = { games, rounds: 0, early: 0, bankrupt: 0, roundList: [], seatWins: Array(players).fill(0), draws: 0, combos: {}, showdowns: 0, folds: 0, jk: { played: 0, won: 0 }, chipsOk: true };
  for (let g = 0; g < games; g++) {
    const rng = seededRng(seed * 100003 + g * 7919 + 5);
    const ctx = { rng, now: 0 };
    const pick = () => { const pool = JOKER_IDS.slice(); return Array.from({ length: 3 }, () => pool.splice(Math.floor(rng() * pool.length), 1)[0]); };
    let s = createGame({ timers: false, players, core, firstToAct: 0, jokerSets: jokers ? Array.from({ length: players }, pick) : undefined, config: { maxRounds: rounds, logSize: 1e9 } }, ctx);
    const total = s.players.reduce((a, p) => a + p.chips, 0) + s.pot;
    let steps = 0, seen = 0;
    while (s.phase !== 'over' && steps++ < 30000) {
      let acted = false;
      for (let p = 0; p < players && !acted; p++) {
        const a = botDecide(viewFor(s, p, 0), rng, style);
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, ctx);
        if (!r.ok) throw new Error(`гра ${g}: ${JSON.stringify(a)} → ${r.error}`);
        s = r.state; acted = true;
      }
      if (!acted) throw new Error('ніхто не ходить: ' + s.phase);
      // журнал обрізається — рахуємо нові записи розкриттів одразу
      for (; seen < s.log.length; seen++) {
        const e = s.log[seen];
        if (e.t === 'showdown' || (e.t === 'tie' && e.detail?.combos)) {
          out.showdowns++;
          for (const c of Object.values(e.detail?.combos || {})) out.combos[c.id] = (out.combos[c.id] || 0) + 1;
        }
        if (e.t === 'foldwin') out.folds++;
      }
      if (s.log.length > 300) { s = { ...s, log: s.log.slice(-50) }; seen = s.log.length; }
      if (s.players.reduce((a, p) => a + p.chips, 0) + s.pot !== total) out.chipsOk = false;
    }
    out.rounds += s.round;
    out.roundList.push(s.round);
    if (s.round < 4) out.early++; // закінчилась до 4-го раунду
    if (s.round < rounds) out.bankrupt++;
    const firsts = s.places.map((pl, q) => (pl === 1 ? q : -1)).filter((q) => q >= 0);
    if (firsts.length > 1) out.draws++; else out.seatWins[firsts[0]]++;
    for (const st of s.stats) for (const j of st.jokerLog || []) { out.jk.played++; if (j.won) out.jk.won++; }
  }
  const pct = (x, n) => Math.round((1000 * x) / Math.max(1, n)) / 10;
  const allCombos = Object.values(out.combos).reduce((a, b) => a + b, 0);
  return {
    games, core, players, style, jokers,
    avgRounds: Math.round((10 * out.rounds) / games) / 10,
    medianRounds: out.roundList.sort((a, b) => a - b)[Math.floor(games / 2)],
    earlyPct: pct(out.early, games),
    bankruptPct: pct(out.bankrupt, games),
    seatPct: out.seatWins.map((w) => pct(w, games - out.draws)),
    drawPct: pct(out.draws, games),
    foldPct: pct(out.folds, out.folds + out.showdowns),
    jokerWinPct: pct(out.jk.won, out.jk.played), jokerPlays: out.jk.played,
    combos: Object.fromEntries(COMBO_ORDER.slice().reverse().map((id) => [COMBO_NAME[id], pct(out.combos[id] || 0, allCombos)])),
    chipsOk: out.chipsOk,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [games = 300, core = 'combo', players = 2, style = 'smart', jk = '1'] = process.argv.slice(2);
  const t = Date.now();
  console.log(JSON.stringify({ ...metrics({ games: +games, core, players: +players, style, jokers: jk === '1' && core !== 'single' }), sec: Math.round((Date.now() - t) / 1000) }));
}
