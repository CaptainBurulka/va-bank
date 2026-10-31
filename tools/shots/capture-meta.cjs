// Скриншоти прогресії: меню, колекція, магазин, автомат, джокери в грі, нагороди (393×852).
// Запуск: npm run serve, потім node tools/shots/capture-meta.cjs <тека>
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(__dirname, 'out-meta');
const URL = 'http://localhost:8080/?debug';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], serviceWorkers: 'block' });
  await ctx.route('**/vendor/peerjs.min.js', (r) => r.fulfill({ body: '/* no peer */', contentType: 'application/javascript' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('✓', name); };

  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('vabank-tutorial', 'done');
    // заможний профіль для скриншотів
    localStorage.setItem('vabank-profile', JSON.stringify({ v: 1, points: 1240, shards: 180, jokers: { roulette: 1, thief: 1, insurance: 1, storm: 1, boom: 1, duel: 1, shadow: 1 }, cosmetics: { felt_wine: true, back_starry: true, win_fireworks: true, frame_fire: true }, equipped: { felt: 'felt_wine', back: 'back_starry', frame: 'frame_fire', win: 'win_fireworks' }, set: ['storm', 'boom', 'duel'], pity: { epic: 11, legendary: 37 } }));
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.__vb);
  await shot('50-menu-club', 800);
  await page.click('[data-go="collection"]');
  await shot('51-collection-jokers');
  await page.click('#col-body [data-joker="duel"]');
  await shot('52-joker-sheet', 400);
  await page.evaluate(() => document.getElementById('modal').classList.add('hidden'));
  await page.click('#col-tabs [data-tab="cosmetics"]');
  await shot('53-collection-cosmetics');
  await page.evaluate(() => window.__vb.openShop('jokers'));
  await shot('54-shop-jokers');
  await page.click('#shop-tabs [data-tab="shards"]');
  await shot('55-shop-shards');
  await page.evaluate(() => window.__vb.openSlot());
  await shot('56-slot');
  await page.click('#btn-spin');
  await shot('57-slot-spinning', 900);
  await shot('58-slot-prize', 2600);

  // Джокер у руці і розкриття
  const scene = async (deck, j0, j1, c1) => {
    await page.evaluate(async ({ deck, j0, j1, c1 }) => {
      document.getElementById('modal').classList.add('hidden');
      const { createGame, reduce, viewFor } = await import('/game/engine.js');
      const { buildDeck } = await import('/game/cards.js');
      const all = buildDeck();
      const d = [...deck.map((id) => all.find((c) => c.id === id)), ...all.filter((c) => !deck.includes(c.id))];
      const ctx = { rng: () => 0.3, now: Date.now() };
      let s = createGame({ deck: d, firstToAct: 0, trumps: ['fire'], jokerSets: [[j0], j1 ? [j1] : ['thief']], jokerRound: 1 }, ctx);
      const vb = window.__vb;
      vb.game.reset(); vb.game.setNames('Ти', 'Суперник');
      vb.prepareLooks({ back: 'back_sapphire', felt: 'felt_green', frame: 'frame_silver', chips: 'chips_ruby', deck: 'deck_classic', win: 'win_confetti', emoji: 'emoji_classic' });
      window.__s = s;
      const send = () => vb.deliverToUi({ view: viewFor(window.__s, 0, Date.now()), meta: { oppConnected: true, paused: false, rematch: { me: false, opp: false } } }, { names: ['Ти', 'Суперник'] });
      vb.show('game'); send();
      window.__send = send; window.__ctx = ctx; window.__reduce = reduce;
    }, { deck, j0, j1, c1 });
  };
  const step = async (actions) => page.evaluate(async (actions) => {
    for (const a of actions) { const r = window.__reduce(window.__s, a, window.__ctx); if (!r.ok) throw new Error(JSON.stringify(a) + r.error); window.__s = r.state; window.__send(); await new Promise((res) => setTimeout(res, 80)); }
  }, actions);
  const H = ['f7', 'w3', 's2', 's9', 'w7', 'f3', 's5', 's8'];
  await scene([...H, 'w10', 'f2'], 'storm', null);
  await page.click('#hand .card[data-id="J0-storm"]');
  await shot('60-joker-in-hand', 500);
  await step([{ type: 'play', player: 0, cardId: 'J0-storm' }, { type: 'play', player: 1, cardId: 'w7' }, { type: 'skipScout', player: 0 }, { type: 'skipScout', player: 1 }, { type: 'check', player: 0 }, { type: 'check', player: 1 }]);
  await shot('61-joker-reveal-rare', 1200);
  await shot('62-joker-verdict', 3200);
  await scene([...H, 'w10', 'w9', 'w8', 'f1', 'f2', 's1'], 'duel', 'boom');
  await step([{ type: 'play', player: 0, cardId: 'J0-duel' }, { type: 'play', player: 1, cardId: 'J1-boom' }, { type: 'skipScout', player: 0 }, { type: 'skipScout', player: 1 }, { type: 'check', player: 0 }, { type: 'check', player: 1 }]);
  await shot('63-joker-two-jokers', 1300);
  await scene([...H, 'w10', 'w9', 'w8', 'f1', 'f2', 's1'], 'duel', null);
  await step([{ type: 'play', player: 0, cardId: 'J0-duel' }, { type: 'play', player: 1, cardId: 'w7' }, { type: 'skipScout', player: 0 }, { type: 'skipScout', player: 1 }, { type: 'check', player: 0 }, { type: 'check', player: 1 }]);
  await shot('64-joker-legendary', 1500);

  // Нагороди в кінці партії
  await page.evaluate(async () => {
    const { createGame, reduce, viewFor } = await import('/game/engine.js');
    const ctx = { rng: Math.random, now: 0 };
    let s = createGame({ timers: false, config: { maxRounds: 8 } }, ctx);
    while (s.phase !== 'over') {
      for (const p of [0, 1]) {
        const L = viewFor(s, p, 0).legal;
        if (!L.length) continue;
        const a = L.find((x) => x.type === 'check') || L.find((x) => x.type === 'call') || L.find((x) => x.type === 'ready') || L.find((x) => x.type === 'skipScout') || L.find((x) => x.type === 'play');
        s = reduce(s, { ...a, player: p }, ctx).state; break;
      }
    }
    s.winner = 0; s.stats[0].bluffOne = 1;
    const view = viewFor(s, 0, 0);
    window.__vb.renderEnd({ view, meta: { rematch: { me: false, opp: false } } }, ['Ти', 'Суперник']);
    const box = document.getElementById('end-rewards');
    box.innerHTML = window.__vb.awardAfterGame(view, 'online');
    box.classList.remove('hidden');
    window.__vb.show('end');
  });
  await shot('65-end-rewards', 600);
  await page.evaluate(() => window.__vb.openSettings());
  await shot('66-settings', 400);
  console.log(errors.length ? 'ПОМИЛКИ:\n' + errors.join('\n') : 'без помилок');
  await browser.close();
})();
