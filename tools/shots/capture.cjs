// Скриншоти всіх екранів і фаз у вьюпорті iPhone 15 Pro (393×852).
// Запуск: npm run serve, потім node tools/shots/capture.cjs <тека-виводу>
// Стани будуються детерміновано через справжній engine (складена колода) і ?debug-хук.
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(__dirname, 'out');
const URL = process.env.URL || 'http://localhost:8080/?debug';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], serviceWorkers: 'block' });
  await ctx.route('**/vendor/peerjs.min.js', (r) => r.fulfill({ body: '/* no peer */', contentType: 'application/javascript' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name, wait = 900) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('✓', name);
  };
  const fresh = async (hints = false) => {
    await page.goto(URL);
    await page.evaluate((h) => {
      localStorage.clear();
      localStorage.setItem('vabank-hints', JSON.stringify({ enabled: h, seen: [] }));
    }, hints);
    await page.goto(URL);
    await page.waitForFunction(() => window.__vb);
  };

  // Стан гри з колоди і послідовності дій; показ з точки зору гравця 0.
  const scene = async (setup, { meta = {}, extra = null } = {}) => {
    await page.evaluate(async ({ setup, meta, extra }) => {
      const { createGame, reduce, viewFor } = await import('/game/engine.js');
      const { buildDeck } = await import('/game/cards.js');
      const all = buildDeck();
      const top = setup.deck.map((id) => all.find((c) => c.id === id));
      const deck = [...top, ...all.filter((c) => !setup.deck.includes(c.id))];
      const ctx = { rng: () => 0.42, now: Date.now() };
      let s = createGame({ deck, firstToAct: setup.first ?? 0, trumps: setup.trumps || ['fire'], config: setup.config || {} }, ctx);
      const vb = window.__vb;
      vb.game.reset();
      vb.game.setNames('Ти', 'Суперник');
      const send = () => vb.deliverToUi({ view: viewFor(s, 0, Date.now()), meta: { oppConnected: true, paused: false, rematch: { me: false, opp: false }, ...meta } }, { names: ['Ти', 'Суперник'] });
      vb.show('game');
      send();
      for (const a of setup.actions || []) {
        const r = reduce(s, a, ctx);
        if (!r.ok) throw new Error(JSON.stringify(a) + ' ' + r.error);
        s = r.state;
        if (setup.stepwise) { send(); await new Promise((res) => setTimeout(res, 60)); }
      }
      send();
      if (extra === 'select') document.querySelector('#hand .card:nth-child(2)').click();
    }, { setup, meta, extra });
  };

  const H = ['f7', 'w3', 's2', 'w9', 'w7', 'f3', 's5', 's8'];
  const P = (p, cardId) => ({ type: 'play', player: p, cardId });
  const A = (type, p, x = {}) => ({ type, player: p, ...x });

  await fresh();
  await shot('01-menu', 300);
  await page.evaluate(() => window.__vb.gameSetupModal({ withStyle: true, onStart: () => {} }));
  await shot('02-bot-setup', 300);
  await page.evaluate(() => { document.getElementById('modal').classList.add('hidden'); window.__vb.openSettings(); });
  await shot('03-settings', 300);
  await page.evaluate(() => { document.getElementById('modal').classList.add('hidden'); window.__vb.show('create'); document.getElementById('room-code').textContent = 'KXRT'; document.getElementById('create-status').textContent = 'Чекаємо на суперника… Передай йому код.'; });
  await shot('04-lobby-create', 300);
  await page.evaluate(() => { window.__vb.show('join'); document.getElementById('join-code').value = 'KXR'; });
  await shot('05-join', 300);
  await page.evaluate(() => window.__vb.showRules());
  await shot('06-rules', 300);

  await scene({ deck: H });
  await shot('10-play-choose');
  await scene({ deck: H }, { extra: 'select' });
  await shot('11-play-selected', 400);
  await scene({ deck: H, actions: [P(0, 'w9')] });
  await shot('12-play-waiting');
  await scene({ deck: H, actions: [P(0, 'w9'), P(1, 's8')] });
  await shot('13-scout');
  await scene({ deck: H, actions: [P(0, 'w9'), P(1, 's8'), A('scout', 0), A('skipScout', 1)] });
  await shot('14-bet-my-turn');
  await scene({ deck: H, first: 1, actions: [P(0, 'w9'), P(1, 's8'), A('skipScout', 0), A('scout', 1), A('raise', 1, { amount: 10 })] });
  await shot('15-bet-facing-raise');
  await scene({ deck: H, first: 1, actions: [P(0, 'w9'), P(1, 's8'), A('skipScout', 0), A('skipScout', 1)] });
  await shot('16-bet-opp-turn');
  await scene({ deck: H, stepwise: true, actions: [P(0, 'w9'), P(1, 's8'), A('skipScout', 0), A('skipScout', 1), A('raise', 0, { amount: 5 }), A('call', 1)] });
  await shot('17-showdown-win-banner', 1100);
  await shot('18-result-don-offer', 2000);
  await scene({ deck: [...H, 'w5'], actions: [P(0, 'w9'), P(1, 's8'), A('skipScout', 0), A('skipScout', 1), A('raise', 0, { amount: 5 }), A('call', 1), A('donStart', 0)] });
  await shot('19-don-pending', 1000);
  await scene({ deck: [...H, 'w5', 'w2'], stepwise: true, actions: [P(0, 'w9'), P(1, 's8'), A('skipScout', 0), A('skipScout', 1), A('raise', 0, { amount: 5 }), A('call', 1), A('donStart', 0), A('don', 0, { guess: 'higher' })] });
  await shot('20-don-lost', 1400);
  await scene({ deck: H, first: 1, stepwise: true, actions: [P(0, 's2'), P(1, 's8'), A('skipScout', 0), A('skipScout', 1), A('check', 1), A('raise', 0, { amount: 10 }), A('fold', 1)] });
  await shot('21-opp-folded', 1500);
  await scene({ deck: ['double', 'w3', 's2', 'w9', 'f5', 'f3', 's6', 's8'], stepwise: true, actions: [P(0, 'double'), P(1, 'f5'), A('skipScout', 0), A('skipScout', 1), A('check', 0), A('check', 1)] });
  await shot('22-tie', 1500);
  await scene({ deck: H, first: 1, actions: [P(0, 'w9'), P(1, 's8'), A('skipScout', 0), A('skipScout', 1)] }, { meta: { oppConnected: false, paused: true } });
  await page.evaluate(() => window.__vb.game.setOffline(true));
  await shot('23-opp-offline');
  await page.evaluate(() => window.__vb.game.setOffline(false));

  // Кінець партії
  await page.evaluate(async () => {
    const { createGame, reduce, viewFor } = await import('/game/engine.js');
    const ctx = { rng: Math.random, now: 0 };
    let s = createGame({ timers: false, config: { maxRounds: 8 } }, ctx);
    while (s.phase !== 'over') {
      for (const p of [0, 1]) {
        const L = viewFor(s, p, 0).legal;
        if (!L.length) continue;
        const a = L.find((x) => x.type === 'check') || L.find((x) => x.type === 'call') || L.find((x) => x.type === 'ready') || L.find((x) => x.type === 'skipScout') || L.find((x) => x.type === 'play');
        s = reduce(s, { ...a, player: p }, ctx).state;
        break;
      }
    }
    window.__vb.renderEnd({ view: viewFor(s, 0, 0), meta: { rematch: { me: false, opp: true } } }, ['Ти', 'Суперник']);
    window.__vb.show('end');
  });
  await shot('30-end', 400);

  // Шторка «передай телефон», підказка, банер оновлення
  await page.evaluate(() => { window.__vb.show('game'); document.getElementById('curtain-text').textContent = 'Передай телефон: Гравець 2'; document.getElementById('curtain').classList.remove('hidden'); });
  await shot('31-hotseat-curtain', 300);
  await page.evaluate(() => document.getElementById('curtain').classList.add('hidden'));
  await fresh(true);
  await scene({ deck: H });
  await shot('32-first-game-tip');
  await page.evaluate(() => { window.__vb.show('menu'); document.getElementById('update-bar').classList.remove('hidden'); });
  await shot('33-update-banner', 300);

  console.log(errors.length ? 'ПОМИЛКИ:\n' + errors.join('\n') : 'без помилок');
  await browser.close();
})();
