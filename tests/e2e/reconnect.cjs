// E2E: перепідключення онлайн. Запуск: npm run serve, потім
//   node tests/e2e/reconnect.cjs 2            — усі сценарії для двох
//   node tests/e2e/reconnect.cjs 3 quick      — без 3-хвилинного згортання
// Сценарії: згортання (сторінку заморожено, мережа сторінки «спить») на 10 с / 60 с / 3 хв,
// втрата мережі (JS працює) — у госта і в хоста. Після кожного: усі знову на зв'язку, гра йде далі.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const N = Number(process.argv[2]) === 3 ? 3 : 2;
const QUICK = process.argv.includes('quick');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], serviceWorkers: 'block' });
  await ctx.addInitScript({ content: fs.readFileSync(path.join(__dirname, 'mockpeer.js'), 'utf8') });
  await ctx.route('**/vendor/peerjs.min.js', (r) => r.fulfill({ body: '/* mocked */', contentType: 'application/javascript' }));
  const pages = [];
  for (let i = 0; i < N; i++) pages.push(await ctx.newPage());
  const [A] = pages;
  const guests = pages.slice(1);
  const errs = [];
  pages.forEach((p, i) => p.on('pageerror', (e) => errs.push(`${'ABC'[i]}: ${e.message}`)));
  const fails = [];
  const check = (ok, label) => { console.log(ok ? '✓' : '✗', label); if (!ok) fails.push(label); };
  const friend = async (P, nick) => {
    await P.click('[data-go="friend"]');
    await P.waitForSelector('#modal:not(.hidden)');
    if (await P.isVisible('#nick-ask')) { await P.fill('#nick-ask', nick); await P.click('#modal-btns .btn.primary'); await P.waitForTimeout(150); }
  };
  for (const P of pages) { await P.goto('http://localhost:8080/'); await P.evaluate(() => localStorage.setItem('vabank-tutorial', 'done')); await P.waitForFunction(() => window.__vbBooted); }
  await A.waitForTimeout(600);
  await friend(A, 'Хост'); await A.click('#modal-btns .btn.primary');
  await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  if (N === 3) {
    await A.click('#create-players button:nth-child(2)');
    await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  }
  await A.click('#create-rounds button:last-child');
  const code = (await A.textContent('#room-code')).trim();
  for (const [i, P] of guests.entries()) { await friend(P, `Гість${i + 1}`); await P.click('#modal-btns .btn.secondary'); await P.fill('#join-code', code); await P.click('#btn-join'); await P.waitForTimeout(400); }
  for (const P of pages) await P.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 });
  for (const P of pages) await P.click('.intro', { timeout: 1500 }).catch(() => {});

  const step = async (p) => {
    if (await p.isVisible('#scr-end')) return;
    await p.click('.intro', { timeout: 300 }).catch(() => {});
    if (await p.isVisible('#modal:not(.hidden)')) await p.click('#modal-btns .btn', { timeout: 500 }).catch(() => {});
    const btns = await p.$$('#actions button:not([disabled])');
    for (const want of ['Чек', 'Колл', 'Далі без розвідки', 'Далі', 'Забрати']) for (const b of btns) if ((await b.textContent().catch(() => '')).includes(want)) { await b.click({ timeout: 1500 }).catch(() => {}); return; }
    const hint = await p.textContent('#actions').catch(() => '');
    const ids = await p.$$eval('#hand .card:not(.joker)', (els) => els.map((e) => e.dataset.id)).catch(() => []);
    if (ids.length && /торкайся карт|відкриту|закриті/i.test(hint)) {
      const need = /закриті/i.test(hint) ? 2 : /відкриту/i.test(hint) ? 1 : 3;
      for (const id of ids.slice(0, need)) await p.click(`#hand .card[data-id="${id}"]`, { timeout: 1500 }).catch(() => {});
      await p.click('#actions .btn.primary', { timeout: 1500 }).catch(() => {});
    } else if (ids.length && hint.includes('спершу торкнись')) { await p.click(`#hand .card[data-id="${ids[0]}"]`).catch(() => {}); await p.click('#actions .btn.primary', { timeout: 1500 }).catch(() => {}); }
  };
  const play = async (k) => { for (let i = 0; i < k; i++) { for (const P of pages) await step(P); await A.waitForTimeout(120); } };
  const roundOf = async (P) => (await P.textContent('#round-tag').catch(() => '')).trim();
  const offlineText = async (P) => {
    const t = (await P.textContent('#phase-title').catch(() => '')) + ' ' + (await P.textContent('.opps').catch(() => '')) + ' ' + (await P.textContent('#opp').catch(() => ''));
    return /не на зв|офлайн|згорнув|пауза, чекаємо/i.test(t) ? t.replace(/\s+/g, ' ').slice(0, 80) : '';
  };
  const allOnline = async () => { for (const P of pages) if (await offlineText(P)) return false; return true; };

  const cdp = new Map();
  const freeze = async (P, on) => {
    if (!cdp.has(P)) cdp.set(P, await ctx.newCDPSession(P));
    await cdp.get(P).send('Page.setWebLifecycleState', { state: on ? 'frozen' : 'active' });
  };
  const downFor = async (P, kind, sec) => {
    if (kind === 'hide') {
      await P.evaluate(() => { window.__mockHide(true); window.__mockNet(false); });
      await freeze(P, true);
      await A.waitForTimeout(sec * 1000);
      await freeze(P, false);
      await P.evaluate(() => { window.__mockNet(true); window.__mockHide(false); });
    } else {
      await P.evaluate(() => window.__mockNet(false));
      await A.waitForTimeout(sec * 1000);
      await P.evaluate(() => window.__mockNet(true));
    }
  };

  await play(6);
  check(await allOnline(), 'старт: усі на зв\'язку');
  // Перезапуск застосунку гостем посеред партії: автоповернення без кнопок
  const G = guests[0];
  await G.reload();
  await G.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 }).catch(() => {});
  check(await G.isVisible('#scr-game'), `${N} гравці: гість перезапустив гру → автоматично повернувся в партію`);
  await play(4);

  const scenarios = [];
  for (const who of ['guest', 'host']) {
    for (const sec of QUICK ? [10, 60] : [10, 60, 180]) scenarios.push({ who, kind: 'hide', sec });
    scenarios.push({ who, kind: 'net', sec: 20 });
  }
  for (const sc of scenarios) {
    const label = `${N} гравці: ${sc.who === 'host' ? 'хост' : 'гість'} ${sc.kind === 'hide' ? 'згорнув гру' : 'втратив мережу'} на ${sc.sec} с`;
    if (ONLY && !ONLY.includes(`${sc.who}-${sc.kind}-${sc.sec}`)) continue;
    const P = sc.who === 'host' ? A : guests[guests.length - 1];
    const before = await roundOf(A);
    await downFor(P, sc.kind, sc.sec);
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < 30000) { if (await allOnline()) { ok = true; break; } await A.waitForTimeout(300); }
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    if (!ok) for (const [i, Q] of pages.entries()) console.log('   ', 'ABC'[i], await offlineText(Q));
    check(ok, `${label} → знову разом за ${took} с`);
    await play(6);
    const after = await roundOf(A);
    const same = (await Promise.all(pages.map(roundOf))).every((r) => r === after);
    const over = (await Promise.all(pages.map((P) => P.isVisible('#scr-end')))).every(Boolean);
    check(same && (after !== before || over), `${label} → гра йде далі (${before} → ${after}${over ? ', партія завершилась' : ''}), у всіх однаковий раунд`);
  }
  console.log(errs.length ? errs.join('\n') : 'без помилок JS');
  console.log(fails.length ? `ПРОВАЛЕНО: ${fails.length}` : 'УСЕ ГАРАЗД');
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
