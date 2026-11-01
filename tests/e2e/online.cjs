// E2E: два «телефони» в одному браузері з імітацією PeerJS. Запуск: npm run serve, потім node tests/e2e/online.cjs
const { chromium, devices } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  await ctx.addInitScript({ content: fs.readFileSync(require('path').join(__dirname, 'mockpeer.js'),'utf8') });
  await ctx.route('**/vendor/peerjs.min.js', r => r.fulfill({ body: '/* mocked */', contentType: 'application/javascript' }));
  const A = await ctx.newPage(), B = await ctx.newPage();

  // «Грати з другом»: за потреби ввести нік (перед першою онлайн-грою гра питає)
  const friend = async (P, nick) => {
    await P.click('[data-go="friend"]');
    await P.waitForSelector('#modal:not(.hidden)');
    if (await P.isVisible('#nick-ask')) { await P.fill('#nick-ask', nick); await P.click('#modal-btns .btn.primary'); await P.waitForTimeout(150); }
  };
  const errs=[]; for (const [n,p] of [['A',A],['B',B]]) p.on('pageerror', e => errs.push(n+': '+e.message));
  await A.goto('http://localhost:8080/'); await B.goto('http://localhost:8080/');
  for (const P of [A, B]) await P.evaluate(() => localStorage.setItem('vabank-tutorial', 'done'));
  // профіль гостя: сапфірова сорочка і набір джокерів
  await B.evaluate(() => localStorage.setItem('vabank-profile', JSON.stringify({ v: 1, jokers: { storm: 1, boom: 1, coin: 1 }, cosmetics: { back_sapphire: true }, equipped: { back: 'back_sapphire' }, set: ['storm', 'boom', 'coin'] })));
  await B.reload(); await B.waitForTimeout(500);
  await friend(A, 'Хост'); await A.click('#modal-btns .btn.primary'); await A.waitForFunction(() => !document.getElementById('room-code').textContent.includes('·'), null, { timeout: 15000 });
  await A.click('#create-rounds button:last-child'); // 16 раундів — щоб партія не скінчилась посеред тесту
  const code = (await A.textContent('#room-code')).trim();
  console.log('code', code);
  await friend(B, 'Оля'); await B.click('#modal-btns .btn.secondary'); await B.fill('#join-code', code); await B.click('#btn-join');
  await B.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 }); await A.waitForTimeout(500);
  console.log('A screen game:', await A.isVisible('#scr-game'), 'B:', await B.isVisible('#scr-game'));
  console.log('A бачить нік:', await A.textContent('#opp-name'), '| B бачить нік:', await B.textContent('#opp-name'));
  console.log('інтро з рахунком:', await A.isVisible('.intro'), (await A.textContent('.intro').catch(() => '')).replace(/\s+/g, ' ').slice(0, 60));
  await A.click('.intro').catch(() => {}); await B.click('.intro').catch(() => {});
  // Перевірка: B не має карт A у DOM
  const aHand = await A.$$eval('#hand .card', els => els.map(e => e.dataset.id));
  const bHtml = await B.content();
  console.log('A hand', aHand, 'leak to B:', aHand.some(id => bHtml.includes(`data-id="${id}"`)));
  let guestJoker = null;
  const step = async (p) => {
    if (p === B && !guestJoker) guestJoker = await B.$eval('#hand', (h) => h.querySelector('.card.joker')?.dataset.id || null).catch(() => null);
    if (await p.isVisible('#scr-end')) return;
    const btns = await p.$$('#actions button:not([disabled])');
    for (const want of ['Чек','Колл','Далі без розвідки','Далі','Забрати']) for (const b of btns) if ((await b.textContent()).includes(want)) { await b.click().catch(()=>{}); return; }
    const cards = await p.$$('#hand .card'); const hint = await p.textContent('#actions');
    if (cards.length && hint.includes('спершу торкнись')) { await cards[0].click(); await p.click('#actions .btn.primary').catch(()=>{}); }
    // комбінації: вибрати 3 карти (не джокери) і покласти
    // покроково: «Покласти відкриту» — 1 карта, «Покласти 2 закриті» — 2 (у віялі тиснемо на видиму ліву смугу)
    if (cards.length && /відкриту|закриті|торкайся карт/i.test(hint)) { const need = /закриті/i.test(hint) ? 2 : /відкриту/i.test(hint) ? 1 : 3; const ids = await p.$$eval('#hand .card:not(.joker)', (els) => els.map((e) => e.dataset.id)); for (const id of ids.slice(0, need)) await p.click(`#hand .card[data-id="${id}"]`, { timeout: 1500, position: { x: 14, y: 40 } }).catch(()=>{}); await p.click('#actions .btn.primary', { timeout: 1500 }).catch(()=>{}); }
  };
  for (let i=0;i<30;i++){ await step(A); await step(B); await A.waitForTimeout(150); }
  console.log('round A', await A.textContent('#round-tag'), 'B', await B.textContent('#round-tag'));
  console.log('host sees guest back:', await A.$eval('#opp', (e) => getComputedStyle(e).getPropertyValue('--card-back-1').trim()));
  console.log('guest joker from own set:', guestJoker);
  await A.click('#btn-react'); await A.click('#react-panel button'); await B.waitForTimeout(300);
  console.log('B got emoji:', await B.$$eval('.float-emoji', e=>e.length));
  await A.screenshot({path: require('path').join(require('os').tmpdir(), 'onA.png')}); await B.screenshot({path: require('path').join(require('os').tmpdir(), 'onB.png')});
  // Обрив зв'язку
  await B.evaluate(() => window.__mockKill());
  await A.waitForTimeout(1500);
  console.log('A offline shown:', await A.textContent('#phase-title'));
  await A.screenshot({path: require('path').join(require('os').tmpdir(), 'onA-off.png')});
  await A.waitForTimeout(9000);
  console.log('after reconnect A:', await A.textContent('#phase-title'), '| B:', await B.textContent('#phase-title'));
  for (let i=0;i<8;i++){ await step(A); await step(B); await A.waitForTimeout(150); }
  console.log('round A', await A.textContent('#round-tag'), 'B', await B.textContent('#round-tag'));
  // Перезавантаження гостя (iOS вивантажила сторінку)
  await B.reload(); await B.waitForTimeout(500);
  // застосунок сам повертається в партію (автоповернення), кнопка — лише запасний шлях
  await B.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 }).catch(() => {});
  console.log('B back in game (auto):', await B.isVisible('#scr-game'), await B.textContent('#round-tag'));
  // Перезавантаження хоста
  await A.reload(); await A.waitForTimeout(500);
  await A.waitForSelector('#scr-game:not(.hidden)', { timeout: 15000 }).catch(() => {});
  await A.waitForTimeout(6000);
  console.log('A in game:', await A.isVisible('#scr-game'), await A.textContent('#round-tag'), 'A:', await A.textContent('#phase-title'), 'B:', await B.textContent('#phase-title'));
  for (let i=0;i<40;i++){ await step(A); await step(B); await A.waitForTimeout(150); } console.log('end A', await A.isVisible('#scr-end'), 'end B', await B.isVisible('#scr-end'));
  console.log('round A', await A.textContent('#round-tag'), 'B', await B.textContent('#round-tag'));
  await A.click('#btn-rematch'); await B.waitForTimeout(500);
  console.log('рахунок у профілі A:', await A.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vabank-profile')).rivals).map((r) => `${r.name} ${r.wins}:${r.losses}`)));
  console.log('момент партії:', (await A.textContent('#end-moment')).replace(/\s+/g, ' '));
  await A.screenshot({ path: require('path').join(require('os').tmpdir(), 'onA-end.png') });
  console.log('B rematch status:', await B.textContent('#rematch-status'));
  await B.click('#btn-rematch'); await A.waitForTimeout(800);
  console.log('after rematch A', await A.isVisible('#scr-game'), await A.textContent('#round-tag'), await A.textContent('#me-chips'), 'B', await B.isVisible('#scr-game'));
  console.log(errs.join('\n'));
  await browser.close();
})();
