// Скриншоти матчу 393×852: 2 і 3 гравці — вибір карт, торги, розкриття.
// Запуск: npm run serve, потім node tools/shots/game.cjs <тека> [мітка]
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || path.join(__dirname, 'out-game');
const TAG = process.argv[3] || '';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const players of [2, 3]) {
    const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: Number(process.env.H || 852) }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/peerjs*', (r) => r.abort());
    await p.goto('http://localhost:8080/?debug');
    await p.waitForFunction(() => window.__vbBooted);
    await p.evaluate(() => localStorage.setItem('vabank-tutorial', 'done'));
    await p.click('[data-go="bot"]');
    await p.waitForSelector('#modal:not(.hidden)');
    if (players === 3) await p.click('#m-players button:nth-child(2)');
    await p.click('#modal-btns .btn.primary');
    await p.waitForSelector('#scr-game:not(.hidden)');
    await p.click('.intro', { timeout: 1500 }).catch(() => {});
    await p.waitForTimeout(900);
    const shot = async (name) => { await p.screenshot({ path: path.join(OUT, `${TAG}${players}p-${name}.png`) }); console.log('✓', `${players}p-${name}`); };
    const shots = new Set();
    for (let i = 0; i < 300 && shots.size < 5; i++) {
      if (await p.isVisible('#scr-end')) break;
      const title = (await p.textContent('#phase-title').catch(() => '')) || '';
      const acts = (await p.textContent('#actions').catch(() => '')) || '';
      const ids = await p.$$eval('#hand .card:not(.joker)', (e) => e.map((x) => x.dataset.id)).catch(() => []);
      const sel = await p.$$eval('#hand .card.selected', (e) => e.length).catch(() => 0);
      if (/торкайся|Обери|відкриту|закриті/i.test(acts + title) && ids.length) {
        if (!shots.has('choose')) { await p.click(`#hand .card[data-id="${ids[0]}"]`); await p.waitForTimeout(400); await shot('choose'); shots.add('choose'); }
        const need = /закриті/i.test(acts + title) ? 2 : /відкриту/i.test(acts + title) ? 1 : 3;
        const now = await p.$$eval('#hand .card.selected', (e) => e.length).catch(() => 0);
        for (const id of ids.slice(0, 6)) { if ((await p.$$eval('#hand .card.selected', (e) => e.length)) >= need) break; const on = await p.$eval(`#hand .card[data-id="${id}"]`, (e) => e.classList.contains('selected')).catch(() => true); if (!on) await p.click(`#hand .card[data-id="${id}"]`).catch(() => {}); }
        if (!shots.has('ready')) { await p.waitForTimeout(300); await shot('ready'); shots.add('ready'); }
        await p.click('#actions .btn.primary').catch(() => {});
        await p.waitForTimeout(500);
        continue;
      }
      const btns = await p.$$('#actions button:not([disabled])');
      let did = false;
      for (const want of ['Чек', 'Колл', 'Далі без розвідки', 'Далі', 'Забрати']) {
        for (const x of btns) {
          const t = (await x.textContent().catch(() => '')) || '';
          if (!t.includes(want)) continue;
          if ((want === 'Чек' || want === 'Колл') && !shots.has('bet')) { await shot('bet'); shots.add('bet'); }
          if ((want === 'Далі' || want === 'Забрати') && !shots.has('reveal')) { await p.waitForTimeout(1600); await shot('reveal'); shots.add('reveal'); await p.waitForTimeout(1600); await shot('reveal2'); shots.add('reveal2'); }
          await x.click().catch(() => {}); did = true; break;
        }
        if (did) break;
      }
      await p.waitForTimeout(did ? 300 : 400);
    }
    if (errs.length) console.log('помилки:', errs);
    await ctx.close();
  }
  await b.close();
})();
