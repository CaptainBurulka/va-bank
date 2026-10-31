// Рендер іконок і splash-екранів зі справжніми шрифтами гри. Запуск: npm run serve, потім node tools/brand/render.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'icons');
const BASE = 'http://localhost:8080/tools/brand/brand.html';
(async () => {
  const b = await chromium.launch();
  const shot = async (q, w, h, scale, file) => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
    await p.goto(`${BASE}?${q}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.locator('#stage > div').screenshot({ path: path.join(OUT, file) });
    await p.close(); console.log('✓', file);
  };
  await shot('kind=icon', 1024, 1024, 512 / 1024, 'icon-512.png');
  await shot('kind=icon', 1024, 1024, 192 / 1024, 'icon-192.png');
  await shot('kind=icon', 1024, 1024, 180 / 1024, 'apple-touch-icon.png');
  await shot('kind=mask', 1024, 1024, 512 / 1024, 'icon-maskable-512.png');
  for (const [w, h] of [[1179, 2556], [1290, 2796], [1170, 2532]]) await shot(`kind=splash&w=${w}&h=${h}`, w, h, 1, `splash-${w}x${h}.png`);
  await b.close();
})();
