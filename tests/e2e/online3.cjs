// E2E: гра втрьох онлайн — три «телефони» з імітацією PeerJS (хост + 2 гості), потім «двоє + бот».
// Запуск: npm run serve, потім node tests/e2e/online3.cjs
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(__dirname, 'mockpeer.js'), 'utf8') });
  await ctx.route('**/vendor/peerjs.min.js', (r) => r.fulfill({ body: '/* mocked */', contentType: 'application/javascript' }));
  const A = await ctx.newPage(), B = await ctx.newPage(), C = await ctx.newPage();

  // «Грати з другом»: за потреби ввести нік (перед першою онлайн-грою гра питає)
  const friend = async (P, nick) => {
    await P.click('[data-go="friend"]');
    await P.waitForSelector('#modal:not(.hidden)');
    if (await P.isVisible('#nick-ask')) { await P.fill('#nick-ask', nick); await P.click('#modal-btns .btn.primary'); await P.waitForTimeout(150); }
  };
  const errs = [];
  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) p.on('pageerror', (e) => errs.push(`${n}: ${e.message}`));
  for (const P of [A, B, C]) { await P.goto('http://localhost:8080/'); await P.evaluate(() => localStorage.setItem('vabank-tutorial', 'done')); }
  const fails = [];
  const check = (ok, label) => { console.log(ok ? '✓' : '✗', label); if (!ok) fails.push(label); };

  await friend(A, 'Хост'); await A.click('#modal-btns .btn.primary');
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  await A.click('#create-players button:nth-child(2)'); // троє
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  await A.click('#create-rounds button:last-child');
  const code = (await A.textContent('#room-code')).trim();
  check(await A.isVisible('#seat-list'), 'лобі показує місця');
  const join = async (P) => { await friend(P, 'Гість' + Math.floor(Math.random() * 90 + 10)); await P.click('#modal-btns .btn.secondary'); await P.fill('#join-code', code); await P.click('#btn-join'); };
  await join(B);
  await B.waitForTimeout(800);
  check(!(await A.isVisible('#scr-game')), 'з одним гостем гра ще не почалась');
  console.log('лобі:', (await A.textContent('#seat-list')).replace(/\s+/g, ' '));
  await join(C);
  await C.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 });
  await A.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 });
  check(await A.evaluate(() => document.getElementById('scr-game').classList.contains('three')), 'стіл утрьох');
  const names = await C.$$eval('.opps .who b', (e) => e.map((x) => x.textContent));
  console.log('C бачить суперників:', names);
  // приватність: карти A не потрапляють до B і C
  const aHand = await A.$$eval('#hand .card', (els) => els.map((e) => e.dataset.id));
  for (const [n, P] of [['B', B], ['C', C]]) { const html = await P.content(); check(!aHand.some((id) => html.includes(`data-id="${id}"`)), `карти хоста не видно в ${n}`); }

  const step = async (p) => {
    if (await p.isVisible('#scr-end')) return;
    const btns = await p.$$('#actions button:not([disabled])');
    for (const want of ['Чек', 'Колл', 'Далі без розвідки', 'Далі', 'Забрати']) for (const b of btns) if ((await b.textContent().catch(() => '')).includes(want)) { await b.click({ timeout: 1500 }).catch(() => {}); return; }
    const cards = await p.$$('#hand .card'); const hint = await p.textContent('#actions');
    if (cards.length && hint.includes('спершу торкнись')) { await cards[0].click().catch(() => {}); await p.click('#actions .btn.primary', { timeout: 1500 }).catch(() => {}); }
    if (cards.length && hint.includes('торкайся карт')) { const ids = await p.$$eval('#hand .card:not(.joker)', (els) => els.map((e) => e.dataset.id)); for (const id of ids.slice(0, 3)) await p.click(`#hand .card[data-id="${id}"]`, { timeout: 1500 }).catch(() => {}); await p.click('#actions .btn.primary', { timeout: 1500 }).catch(() => {}); }
  };
  const play = async (n) => { for (let i = 0; i < n; i++) { for (const P of [A, B, C]) await step(P); await A.waitForTimeout(120); } };
  await play(30);
  const tags = await Promise.all([A, B, C].map((P) => P.textContent('#round-tag')));
  console.log('раунди:', tags);
  check(tags[0] === tags[1] && tags[1] === tags[2] && !tags[0].includes('Раунд 1/'), 'усі три бачать той самий раунд і гра йде');
  await A.click('#btn-react'); await A.click('#react-panel button'); await B.waitForTimeout(400);
  check((await B.$$eval('.float-emoji', (e) => e.length)) > 0 && (await C.$$eval('.float-emoji', (e) => e.length)) > 0, 'реакцію бачать обидва гості');
  await A.screenshot({ path: path.join(os.tmpdir(), 'on3A.png') });
  await C.screenshot({ path: path.join(os.tmpdir(), 'on3C.png') });

  // обрив гостя C → пауза в усіх
  await C.evaluate(() => window.__mockKill());
  await A.waitForTimeout(1500);
  const offA = await A.textContent('#phase-title');
  console.log('A після обриву C:', offA);
  check(/не на зв'язку/.test(offA), 'хост бачить, що гість не на зв\'язку');
  check(await B.evaluate(() => !!document.querySelector('#opps .ava.offline')), 'інший гість бачить офлайн-значок');
  await A.waitForTimeout(9000);
  await play(8);
  const after = await Promise.all([A, B, C].map((P) => P.textContent('#round-tag')));
  console.log('після перепідключення:', after);
  check(after[0] === after[2], 'C повернувся в ту саму партію');
  // перезавантаження гостя B
  await B.reload(); await B.waitForTimeout(600);
  await B.click('#btn-resume'); await B.waitForTimeout(1800);
  check(await B.isVisible('#scr-game') && (await B.textContent('#round-tag')) === (await A.textContent('#round-tag')), 'B відновився після перезавантаження');
  // четвертий не зайде
  const D = await ctx.newPage(); await D.goto('http://localhost:8080/'); await D.evaluate(() => localStorage.setItem('vabank-tutorial', 'done'));
  await join(D); await D.waitForTimeout(2500);
  console.log('D:', (await D.textContent('#join-status')).trim());
  check(/немає вільних місць/.test(await D.textContent('#join-status')), 'четвертий гравець отримує «немає місць»');

  // ── двоє + бот ──
  for (const P of [A, B, C, D]) await P.goto('http://localhost:8080/');
  await friend(A, 'Хост'); await A.click('#modal-btns .btn.primary');
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  await A.click('#create-players button:nth-child(2)');
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  const code2 = (await A.textContent('#room-code')).trim();
  await friend(B, 'Оля'); await B.click('#modal-btns .btn.secondary'); await B.fill('#join-code', code2); await B.click('#btn-join');
  await B.waitForTimeout(1000);
  await A.click('#btn-add-bot');
  await A.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 });
  await B.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 });
  const nb = await B.$$eval('.opps .who b', (e) => e.map((x) => x.textContent));
  console.log('двоє + бот, B бачить:', nb);
  check(nb.some((x) => x.includes('🤖')), 'бот сидить за столом');
  for (let i = 0; i < 60; i++) { await step(A); await step(B); await A.waitForTimeout(200); }
  console.log('A:', await A.textContent('#phase-title'), '|', await A.textContent('#phase-sub'), '| B:', await B.textContent('#phase-title'));
  check(!(await A.textContent('#round-tag')).includes('Раунд 1/'), 'гра з ботом іде');
  await B.screenshot({ path: path.join(os.tmpdir(), 'on3bot.png') });

  if (errs.length) console.log('ПОМИЛКИ:\n' + errs.join('\n'));
  console.log(fails.length || errs.length ? `НЕ ПРОЙДЕНО: ${fails.length}` : 'усе пройдено');
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
