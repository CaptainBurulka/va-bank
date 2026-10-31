// E2E: гра через інтерфейс. node tests/e2e/play.cjs bot | hotseat (потрібен npm run serve)
const { chromium, devices } = require('playwright');
(async () => {
  const mode = process.argv[2] || 'bot';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  await page.route('**/peerjs*', r => r.abort());
  await page.goto('http://localhost:8080/');
  await page.click(`[data-go="${mode}"]`);
  await page.waitForTimeout(600);
  const prio = ['Розвідка', 'Чек', 'Колл', 'Більше', 'Показати карту', 'Далі', 'Забрати', 'Без розвідки'];
  let shot = 0, rounds = new Set();
  for (let i = 0; i < 600; i++) {
    if (await page.isVisible('#scr-end')) break;
    if (await page.isVisible('#curtain')) {
      if (shot < 2 && mode === 'hotseat') await page.screenshot({ path: require('path').join(require('os').tmpdir(), `${mode}-curtain.png`) });
      await page.click('#curtain-btn'); await page.waitForTimeout(200); continue;
    }
    const btns = await page.$$('#actions button:not([disabled])');
    let clicked = false;
    for (const p of prio) {
      for (const b of btns) {
        const t = await b.textContent();
        if (t.includes(p) && (p !== 'Розвідка' || Math.random() < 0.3)) { await b.click().catch(()=>{}); clicked = true; break; }
      }
      if (clicked) break;
    }
    if (!clicked) {
      const cards = await page.$$('#hand .card');
      const hint = await page.textContent('#actions');
      if (cards.length && hint.includes('Торкнись')) { await cards[cards.length-1].click(); await page.waitForTimeout(100); if (shot<9) await page.screenshot({ path: require('path').join(require('os').tmpdir(), `${mode}-sel.png`) }); await cards[cards.length-1].click(); }
    }
    await page.waitForTimeout(300);
    const r = await page.textContent('#round-tag');
    const ph = await page.textContent('#turn-text');
    if (!rounds.has(r+ph.slice(0,6)) && shot < 14) { rounds.add(r+ph.slice(0,6)); await page.screenshot({ path: require('path').join(require('os').tmpdir(), `${mode}-${String(++shot).padStart(2,'0')}.png`) }); }
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: require('path').join(require('os').tmpdir(), `${mode}-end.png`) });
  console.log('end visible', await page.isVisible('#scr-end'), await page.textContent('#end-sub'));
  console.log(errors.join('\n'));
  await browser.close();
})();
