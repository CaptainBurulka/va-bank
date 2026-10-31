// E2E: повна партія через інтерфейс. node tests/e2e/play.cjs bot | hotseat (потрібен npm run serve)
// Падає, якщо гра «застрягла» (той самий стан 15 кроків поспіль) або були помилки сторінки.
const { chromium, devices } = require('playwright');
const path = require('path');
const os = require('os');
(async () => {
  const mode = process.argv[2] || 'bot';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/peerjs*', (r) => r.abort());
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('vabank-tutorial', 'done'));
  await p.click(`[data-go="${mode}"]`);
  await p.waitForSelector('#modal:not(.hidden)');
  await p.click('#m-rounds button:first-child'); // 8 раундів
  await p.click('#modal-btns .btn.primary');
  const prefer = ['Чек', 'Колл', 'Далі без розвідки', 'Розвідка', 'Подвій або нічого', 'Показати карту', 'Далі', 'Забрати', 'Покласти'];
  let last = '', same = 0, ended = false;
  for (let i = 0; i < 1500; i++) {
    if (await p.isVisible('#scr-end')) { ended = true; break; }
    if (await p.isVisible('#curtain')) { await p.click('#curtain-btn'); await p.waitForTimeout(100); continue; }
    if (await p.isVisible('#don:not(.hidden)')) {
      const ch = await p.$$('#don-choices button:not([disabled])');
      if (ch.length) await ch[Math.floor(Math.random() * ch.length)].click(); else await p.click('#don').catch(() => {});
      await p.waitForTimeout(150); continue;
    }
    const st = `${await p.textContent('#round-tag')} | ${await p.textContent('#phase-title')} | ${(await p.textContent('#actions')).replace(/\s+/g, ' ').slice(0, 50)}`;
    if (st === last) { if (++same > 15 && !st.includes('суперник')) { console.log('ЗАСТРЯГЛО:', st); break; } } else { same = 0; last = st; }
    const btns = await p.$$('#actions button:not([disabled])');
    let done = false;
    for (const want of prefer) {
      if (['Розвідка', 'Подвій або нічого', 'Показати карту'].includes(want) && Math.random() < 0.6) continue;
      for (const b of btns) if ((await b.textContent()).includes(want)) { await b.click(); done = true; break; }
      if (done) break;
    }
    if (!done) { const c = await p.$$('#hand .card'); if (c.length && !(await p.$('#hand .card.selected'))) await c[Math.floor(Math.random() * c.length)].click(); }
    await p.waitForTimeout(mode === 'bot' ? 250 : 120);
  }
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(os.tmpdir(), `${mode}-end.png`) });
  console.log(mode, 'кінець партії:', ended, ended ? await p.textContent('#end-sub') : '');
  if (errors.length) console.log('ПОМИЛКИ:', errors.join('\n'));
  await browser.close();
  process.exit(ended && !errors.length ? 0 : 1);
})();
