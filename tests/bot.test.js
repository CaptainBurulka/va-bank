import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide, BOT_STYLES } from '../game/bot.js';
import { CONFIG } from '../config.js';
import { seededRng } from './helpers.js';

test('бот проти бота: усі стилі й довжини, без помилок; фішки (з джекпотом) не з\'являються і не зникають', () => {
  let games = 0, donSeen = 0, jackpotSeen = 0, swapSeen = 0;
  for (const maxRounds of CONFIG.roundOptions) {
    for (const a of BOT_STYLES) for (const b of BOT_STYLES) {
      for (let g = 0; g < 12; g++) {
        const rng = seededRng(1000 + g * 31 + maxRounds);
        const ctx = { rng, now: 0 };
        let s = createGame({ timers: false, config: { maxRounds } }, ctx);
        const styles = [a, b];
        let steps = 0;
        while (s.phase !== 'over') {
          assert.ok(++steps < 5000, 'партія зациклилась');
          let acted = false;
          for (const p of [0, 1]) {
            const act = botDecide(viewFor(s, p, 0), rng, styles[p]);
            if (!act) continue;
            const r = reduce(s, { ...act, player: p }, ctx);
            assert.ok(r.ok, `${a}/${b}: ${JSON.stringify(act)} → ${r.error}`);
            s = r.state;
            acted = true;
            break;
          }
          assert.ok(acted, 'ніхто не може ходити');
          assert.equal(s.players[0].chips + s.players[1].chips + s.pot, 2 * CONFIG.startChips);
          assert.ok(s.jackpot <= s.pot, 'джекпот — частина банку');
          for (const pl of s.players) assert.ok(pl.chips >= 0);
          if (s.jackpot > 0) jackpotSeen++;
          if (s.result?.don?.attempts.length) donSeen++;
          if (s.players.some((pl) => pl.swapped)) swapSeen++;
        }
        assert.ok(s.round <= maxRounds);
        games++;
      }
    }
  }
  assert.ok(donSeen > 0 && jackpotSeen > 0 && swapSeen > 0, 'механіки реально використовувались');
  assert.equal(games, 3 * 9 * 12);
});
