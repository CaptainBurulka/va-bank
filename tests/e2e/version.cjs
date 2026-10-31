// E2E: різні версії гри у хоста і гостя — обидва мають побачити, кому оновитися.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], serviceWorkers: 'block' });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(__dirname, 'mockpeer.js'), 'utf8') });
  await ctx.route('**/vendor/peerjs.min.js', (r) => r.fulfill({ body: '/* mocked */', contentType: 'application/javascript' }));
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  // Гість має «нову» версію 9.9.9
  await B.route('**/config.js', async (r) => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '9.9.9'") });
  });
  await A.goto('http://localhost:8080/'); await B.goto('http://localhost:8080/');
  await A.click('[data-go="create"]');
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'));
  const code = (await A.textContent('#room-code')).trim();
  await B.click('[data-go="join"]'); await B.fill('#join-code', code); await B.click('#btn-join');
  await B.waitForTimeout(1500);
  console.log('HOST:', await A.textContent('#create-status'));
  console.log('GUEST:', await B.textContent('#join-status'));
  await browser.close();
})();
