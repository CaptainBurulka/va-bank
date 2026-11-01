// E2E: повна партія через інтерфейс. node tests/e2e/play.cjs bot | hotseat [2|3|2b] (потрібен npm run serve)
// Падає, якщо гра «застрягла» (той самий стан 15 кроків поспіль) або були помилки сторінки.
const { chromium, devices } = require('playwright');
const path = require('path');
const os = require('os');
(async () => {
  const mode = process.argv[2] || 'bot';
  const players = process.argv[3] || '2';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/peerjs*', (r) => r.abort());
  await p.goto('http://localhost:8080/?debug'); await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('vabank-tutorial', 'done'));
  await p.click(`[data-go="${mode}"]`);
  await p.waitForSelector('#modal:not(.hidden)');
  await p.click('#m-rounds button:first-child'); // 8 раундів
  if (players !== '2') await p.click(`#m-players button:nth-child(${players === '2b' ? 3 : 2})`);
  await p.click('#modal-btns .btn.primary');
  const prefer = ['Чек', 'Колл', 'Далі без розвідки', 'Розвідка', 'Подвій або нічого', 'Показати карту', 'Далі', 'Забрати', 'Покласти', 'Зіграти джокера'];
  let last = '', same = 0, ended = false;
  for (let i = 0; i < 1500; i++) {
    if (await p.isVisible('#scr-end')) { ended = true; break; }
    if (await p.isVisible('#curtain')) { await p.click('#curtain-btn'); await p.waitForTimeout(100); continue; }
    if (await p.isVisible('#don:not(.hidden)')) {
      const ch = await p.$$('#don-choices button:not([disabled])');
      if (ch.length) await ch[Math.floor(Math.random() * ch.length)].click({ timeout: 2000 }).catch(() => {}); else await p.click('#don').catch(() => {});
      await p.waitForTimeout(150); continue;
    }
    const st = `${await p.textContent('#round-tag')} | ${await p.textContent('#phase-title')} | ${(await p.textContent('#actions')).replace(/\s+/g, ' ').slice(0, 50)}`;
    if (st === last) { if (++same > (/суперник|вибув|Хід:|Чекаємо|Обирають|Вирішують/.test(st) ? 120 : 15)) { console.log('ЗАСТРЯГЛО:', st); console.log('поверх кнопки:', await p.evaluate(() => { const b = document.querySelector('#actions button'); if (!b) return 'нема кнопки'; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e ? `${e.tagName}.${e.className}#${e.id} ← ${e.parentElement?.className}` : 'нічого'; }), await p.evaluate(() => { const g = window.__vb?.game; return g ? JSON.stringify({ legal: g.view.legal.map((a) => a.type), pending: g.pending, conceal: g.conceal, you: g.view.you, toAct: g.view.bet?.toAct, curtain: !document.getElementById('curtain')?.classList.contains('hidden') }) : 'no debug'; })); break; } } else { same = 0; last = st; }
    const btns = await p.$$('#actions button:not([disabled])');
    let done = false;
    for (const want of prefer) {
      if (['Розвідка', 'Подвій або нічого', 'Показати карту'].includes(want) && Math.random() < 0.6) continue;
      for (const b of btns) if (((await b.textContent().catch(() => '')) || '').includes(want)) { await b.click({ timeout: 2000 }).catch(() => {}); done = true; break; }
      if (done) break;
    }
    if (!done) {
      // комбінації — вибрати 3 карти (іноді змінити відкриту 👁), класика — 1
      const acts = await p.textContent('#actions').catch(() => '');
      const need = !(await p.$('#scr-game.combo')) ? 1 : /закриті/i.test(acts) ? 2 : /відкриту/i.test(acts) ? 1 : 3;
      const c = await p.$$('#hand .card:not(.selected)');
      if (c.length && (await p.$$('#hand .card.selected')).length < need) await c[Math.floor(Math.random() * c.length)].click({ timeout: 2000, position: { x: 14, y: 40 } }).catch(() => {});
      else if (need === 3 && Math.random() < 0.3) { const e = await p.$$('#hand .eye-tog'); if (e.length) await e[Math.floor(Math.random() * e.length)].click({ timeout: 2000 }).catch(() => {}); }
    }
    await p.waitForTimeout(mode === 'bot' ? 250 : 120);
  }
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(os.tmpdir(), `${mode}${players}-end.png`) });
  console.log(mode, players, 'кінець партії:', ended, ended ? await p.textContent('#end-sub') : '');
  if (errors.length) console.log('ПОМИЛКИ:', errors.join('\n'));
  await browser.close();
  process.exit(ended && !errors.length ? 0 : 1);
})();
