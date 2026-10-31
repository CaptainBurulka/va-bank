// Збереження партій від версії 3.0.1 (стан v2, лише для двох) мають відкриватися в новій версії.
// Саме незавершена партія старої версії ламала «Продовжити» після оновлення до 4.0.0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upgradeState, viewFor, reduce, legalActions, STATE_VERSION } from '../game/engine.js';
import { botDecide } from '../game/bot.js';
import { GameHost } from '../net/host.js';
import { seededRng } from './helpers.js';

const SAVES = JSON.parse(readFileSync(new URL('./fixtures/saves-3.0.1.json', import.meta.url), 'utf8'));
const total = (s) => s.players.reduce((a, p) => a + p.chips, 0) + s.pot;

for (const [name, raw] of Object.entries(SAVES)) {
  test(`міграція збереження 3.0.1: ${name} (${raw.phase}) — відкривається і догравається до кінця`, () => {
    assert.equal(raw.v, 2);
    const s0 = upgradeState(raw);
    assert.ok(s0, 'стан мігрує');
    assert.equal(s0.v, STATE_VERSION);
    for (const p of [0, 1]) viewFor(s0, p, 0); // показ не падає
    if (s0.phase !== 'over') assert.ok(legalActions(s0, 0).length + legalActions(s0, 1).length > 0, 'хтось може ходити');
    const rng = seededRng(5);
    const c = { rng, now: 2e12 };
    let s = s0;
    const start = total(s);
    for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
      let acted = false;
      for (const p of [0, 1]) {
        const a = botDecide(viewFor(s, p, c.now), rng, 'aggressive');
        if (!a) continue;
        const r = reduce(s, { ...a, player: p }, c);
        assert.ok(r.ok, `${name}: ${JSON.stringify(a)} → ${r.error}`);
        s = r.state; acted = true;
        break;
      }
      assert.ok(acted, `${name}: ніхто не може ходити (${s.phase})`);
      assert.equal(total(s), start, 'фішки зберігаються');
    }
    assert.equal(s.phase, 'over');
  });
}

test('міграція: незрозуміле збереження повертає null (його відкидаємо, а не висимо)', () => {
  assert.equal(upgradeState(null), null);
  assert.equal(upgradeState({ v: 1, players: [] }), null);
  assert.equal(upgradeState({ v: 99, players: [{}, {}] }), null);
  const cur = upgradeState(SAVES.betRaised);
  assert.equal(upgradeState(cur), cur, 'поточна версія не змінюється');
});

test('GameHost.restore: стара партія відновлюється, зламана — ні', () => {
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const h = new GameHost({ timers: true });
  assert.equal(h.restore({ state: SAVES.betRaised, rematch: [false, false], savedAt: Date.now() }), true);
  assert.equal(h.state.phase, 'bet');
  const broken = new GameHost({ timers: true });
  assert.equal(broken.restore({ state: { v: 2, players: [{}, {}], phase: 'bet', bet: {} } }), false);
  h.stop();
});
