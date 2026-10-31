import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide } from '../game/bot.js';
import { seededRng } from './helpers.js';

test('бот проти бота: 200 партій без помилок, фішки зберігаються', () => {
  for (let g = 0; g < 200; g++) {
    const rng = seededRng(1000 + g);
    const ctx = { rng, now: 0 };
    let s = createGame({ timers: false }, ctx);
    let steps = 0;
    while (s.phase !== 'over') {
      assert.ok(++steps < 2000, 'партія зациклилась');
      let acted = false;
      for (const p of [0, 1]) {
        const a = botDecide(viewFor(s, p, 0), rng);
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, ctx);
        assert.ok(r.ok, `гра ${g}: ${JSON.stringify(a)} → ${r.error}`);
        s = r.state;
        acted = true;
        break;
      }
      assert.ok(acted, 'ніхто не може ходити');
      const sum = s.players[0].chips + s.players[1].chips + s.pot;
      assert.equal(sum, 200);
      for (const pl of s.players) assert.ok(pl.chips >= 0);
    }
    assert.ok(['bankrupt', 'rounds'].includes(s.endReason));
  }
});
