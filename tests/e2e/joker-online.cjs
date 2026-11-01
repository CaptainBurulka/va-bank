// E2E (регресія): гість грає джокера онлайн, коли канал «напівмертвий» — обрив ще не виявлено.
// Раніше хід мовчки губився: вибір скидався, а після тайм-ауту автохід грав без джокера («не можу зіграти джокера»).
// Запуск: npm run serve, потім node tests/e2e/joker-online.cjs [2|3]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const N = Number(process.argv[2]) === 3 ? 3 : 2;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(__dirname, 'mockpeer.js'), 'utf8') });
  await ctx.route('**/vendor/peerjs.min.js', (r) => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const pages = [];
  for (let i = 0; i < N; i++) pages.push(await ctx.newPage());
  const [A] = pages;
  const G = pages[N - 1];
  const errs = [];
  pages.forEach((p, i) => p.on('pageerror', (e) => errs.push(`${i}: ${e.message}`)));
  const friend = async (P, nick) => { await P.click('[data-go="friend"]'); await P.waitForSelector('#modal:not(.hidden)'); if (await P.isVisible('#nick-ask')) { await P.fill('#nick-ask', nick); await P.click('#modal-btns .btn.primary'); await P.waitForTimeout(150); } };
  for (const P of pages) {
    await P.goto('http://localhost:8080/');
    await P.evaluate(() => { localStorage.setItem('vabank-tutorial', 'done'); localStorage.setItem('vabank-profile', JSON.stringify({ v: 1, jokers: { storm: 1, boom: 1, trap: 1 }, set: ['storm', 'boom', 'trap'] })); });
    await P.reload();
    await P.waitForFunction(() => window.__vbBooted);
  }
  await A.waitForTimeout(500);
  await friend(A, 'Хост'); await A.click('#modal-btns .btn.primary');
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'));
  if (N === 3) { await A.click('#create-players button:nth-child(2)'); await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·')); }
  await A.click('#create-rounds button:last-child');
  const code = (await A.textContent('#room-code')).trim();
  for (const [i, P] of pages.slice(1).entries()) { await friend(P, `Г${i}`); await P.click('#modal-btns .btn.secondary'); await P.fill('#join-code', code); await P.click('#btn-join'); await P.waitForTimeout(400); }
  for (const P of pages) await P.waitForSelector('#scr-game:not(.hidden)');
  let result = null;
  const step = async (p) => {
    await p.click('.intro', { timeout: 200 }).catch(() => {});
    const btns = await p.$$('#actions button:not([disabled])');
    for (const want of ['Чек', 'Колл', 'Далі без розвідки', 'Далі', 'Забрати']) for (const b of btns) if ((await b.textContent()).includes(want)) { await b.click({ timeout: 1000 }).catch(() => {}); return; }
    const hint = await p.textContent('#actions').catch(() => '');
    if (!/торкайся карт|відкриту|закриті/i.test(hint)) return;
    const ids = await p.$$eval('#hand .card', (els) => els.map((e) => e.dataset.id));
    const jk = ids.find((x) => x.startsWith('J'));
    const plain = ids.filter((x) => !x.startsWith('J'));
    const need = /закриті/i.test(hint) ? 2 : /відкриту/i.test(hint) ? 1 : 3;
    if (p === G && jk && result === null) {
      // мережа гостя «падає» саме зараз; гість ще не знає про це і кладе джокера
      await G.evaluate(() => window.__mockNet(false));
      const pick = need === 1 ? [jk] : [jk, ...plain.slice(0, need - 1)];
      for (const id of pick) await p.click(`#hand .card[data-id="${id}"]`, { timeout: 1500 });
      await p.click('#actions .btn.primary', { timeout: 1500 });
      await p.waitForTimeout(3000);
      await G.evaluate(() => window.__mockNet(true));
      await p.waitForFunction((id) => !document.querySelector(`#hand .card[data-id="${id}"]`), jk, { timeout: 25000 }).catch(() => {});
      result = !(await p.$(`#hand .card[data-id="${jk}"]`));
      return;
    }
    for (const id of plain.slice(0, need)) await p.click(`#hand .card[data-id="${id}"]`, { timeout: 1500 }).catch(() => {});
    await p.click('#actions .btn.primary', { timeout: 1500 }).catch(() => {});
  };
  for (let k = 0; k < 120 && result === null; k++) { for (const P of pages) await step(P); await A.waitForTimeout(100); }
  console.log(result ? '✓' : '✗', `${N} гравці: джокер, зіграний гостем під час непоміченого обриву, дійшов до хоста`);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
  process.exit(result && !errs.length ? 0 : 1);
})();
