// Контраст кутового індексу карт: кожен набір × рідкість × масть, у розмірі руки й столу (393×852, DPR 3).
// Знімає зону індексу, міряє контраст «значення / масть» до плашки за пікселями і ПАДАЄ, якщо < 4.5:1.
// Запуск: python3 -m http.server 8080 (з кореня) і node tests/e2e/contrast.cjs [каталог для скриншотів]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || null;
const MIN = 4.5;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080/tests/e2e/contrast.html');
  await p.waitForFunction(() => window.ready);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    for (const s of await p.$$('section')) await s.screenshot({ path: `${OUT}/idx-${(await s.$eval('h2', (h) => h.textContent)).replace(/\s+/g, '_')}.png` });
  }
  const cards = await p.$$('.card[data-key]');
  let fail = 0, n = 0, worst = { c: 99 };
  for (const card of cards) {
    const key = await card.getAttribute('data-key');
    const idx = await card.$('.sk-idx');
    if (!idx) { console.log(`FAIL ${key}: немає кутового індексу`); fail++; continue; }
    const box = await idx.boundingBox();
    const dpr = 3;
    const rel = await idx.evaluate((el) => {
      const r0 = el.getBoundingClientRect();
      const o = {};
      for (const [k, sel] of [['значення', '.v'], ['масть', '.s']]) {
        const e = el.querySelector(sel); if (!e) continue;
        const r = e.getBoundingClientRect();
        o[k] = { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height };
      }
      return o;
    });
    const regions = Object.fromEntries(Object.entries(rel).map(([k, r]) => [k, { x: Math.round(r.x * dpr), y: Math.round(r.y * dpr), w: Math.round(r.w * dpr), h: Math.round(r.h * dpr) }]));
    const shot = await p.screenshot({ clip: box });
    const res = await p.evaluate(([d, rg]) => window.analyze(d, rg), [`data:image/png;base64,${shot.toString('base64')}`, regions]);
    for (const [k, v] of Object.entries(res)) {
      n++;
      if (v.contrast < worst.c) worst = { c: v.contrast, key, k };
      if (v.contrast < MIN) { fail++; console.log(`FAIL ${key} ${k}: ${v.contrast}:1 (fg ${v.fg} на ${v.bg})`); }
    }
    // індекс не перекритий ефектами: найвищий елемент у центрі значення — сама плашка
    const covered = await idx.evaluate((el) => {
      el.style.pointerEvents = 'auto';
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * .3);
      el.style.pointerEvents = '';
      return !(t && (el === t || el.contains(t)));
    });
    if (covered) { fail++; console.log(`FAIL ${key}: індекс перекрито іншим шаром`); }
  }
  console.log(`Перевірено ${n} пар «знак / плашка» на ${cards.length} картах. Найнижчий контраст: ${worst.c}:1 (${worst.key} ${worst.k}). Помилок: ${fail}.`);
  if (errs.length) console.log('Помилки сторінки:', errs.join('\n'));
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();
