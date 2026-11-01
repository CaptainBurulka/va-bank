// Профіль продуктивності галереї скінів: 393×852, CPU ×4. Для кожного набору × рідкості:
// спокій (3 с) і «палець веде по карті» (3 с). Виводить fps, p95 кадру, частку кадрів > 16.7 мс і метрики головного потоку.
const { chromium, devices } = require('playwright');
const sets = (process.argv[2] || 'kyiv,samurai,cyber,cossack,deco,abyss,pixel,space').split(',');
const rars = (process.argv[3] || 'common,rare,epic,legendary').split(',');
const label = process.argv[4] || '';
(async () => {
  const b = await chromium.launch({ args: ['--disable-gpu-vsync=false'] });
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const measure = async (ms) => p.evaluate((ms) => new Promise((res) => {
    const t = []; let last = performance.now(); const end = last + ms;
    const f = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(t); };
    requestAnimationFrame(f);
  }), ms);
  const stat = (t) => { t = t.slice(2); const s = [...t].sort((a, b) => a - b); const avg = t.reduce((a, b) => a + b, 0) / t.length; return { fps: +(1000 / avg).toFixed(1), p95: +s[Math.floor(s.length * .95)].toFixed(1), slow: +(100 * t.filter((x) => x > 17.5).length / t.length).toFixed(0) }; };
  const rows = [];
  for (const set of sets) for (const r of rars) {
    await p.goto(`${process.env.BASE || 'http://localhost:8080'}/skins/?set=${set}&r=${r}`); await p.waitForTimeout(1500);
    // до верху сторінки: порівняння рідкостей + колода на екрані
    await p.evaluate(() => document.getElementById('deck').scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(500);
    let m0 = await metrics();
    const idle = stat(await measure(3000));
    let m1 = await metrics();
    const sec = (k) => +((m1[k] - m0[k]) / 3 * 1000).toFixed(0); // мс на секунду
    const idleM = { task: sec('TaskDuration'), style: sec('RecalcStyleDuration'), layout: sec('LayoutDuration'), script: sec('ScriptDuration') };
    // палець: тримаємо і ведемо по першій карті колоди
    const el = await p.$('#deck .sk-item'); const bb = await el.boundingBox();
    await p.mouse.move(bb.x + bb.width * .3, bb.y + bb.height * .3); await p.mouse.down();
    m0 = await metrics();
    const mv = (async () => { for (let i = 0; i < 90; i++) { const k = i / 90; await p.mouse.move(bb.x + bb.width * (.2 + .6 * Math.abs(Math.sin(k * 6))), bb.y + bb.height * (.2 + .6 * k)); await p.waitForTimeout(30); } })();
    const drag = stat(await measure(3000));
    await mv; m1 = await metrics(); await p.mouse.up();
    const dragM = { task: sec('TaskDuration'), style: sec('RecalcStyleDuration'), layout: sec('LayoutDuration') };
    rows.push({ set, r, idle, idleM, drag, dragM });
    console.log(`${label}${set.padEnd(8)} ${r.padEnd(9)} спокій ${String(idle.fps).padStart(5)} fps p95 ${String(idle.p95).padStart(5)} мс повільних ${String(idle.slow).padStart(3)}% | task ${idleM.task} style ${idleM.style} мс/с || палець ${String(drag.fps).padStart(5)} fps p95 ${String(drag.p95).padStart(5)} повільних ${String(drag.slow).padStart(3)}% task ${dragM.task} style ${dragM.style}`);
  }
  require('fs').writeFileSync(`${process.env.OUT || '/tmp'}/perf-${label || 'run'}.json`, JSON.stringify(rows));
  await b.close();
})();
