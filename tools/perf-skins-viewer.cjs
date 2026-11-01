// Огляд легендарної на весь екран: повний ефект + палець тягне карту (CPU ×4, 393×852).
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8080';
const sets = (process.argv[2] || 'kyiv,samurai,cyber,cossack,deco,abyss,pixel,space').split(',');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const measure = (ms) => p.evaluate((ms) => new Promise((res) => { const t = []; let last = performance.now(); const end = last + ms; const f = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }), ms);
  const stat = (t) => { t = t.slice(2); const s = [...t].sort((a, b) => a - b); const avg = t.reduce((a, b) => a + b, 0) / t.length; return `${(1000 / avg).toFixed(1)} fps, p95 ${s[Math.floor(s.length * .95)].toFixed(1)} мс, повільних ${Math.round(100 * t.filter((x) => x > 17.5).length / t.length)}%`; };
  for (const set of sets) {
    await p.goto(`${BASE}/skins/?set=${set}&r=legendary`); await p.waitForTimeout(1200);
    const el = await p.$('#deck .sk-item'); const bb = await el.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    await p.waitForTimeout(1500);
    const idle = stat(await measure(2500));
    const st = await (await p.$('.skv-stage')).boundingBox();
    await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2); await p.mouse.down();
    const mv = (async () => { for (let i = 0; i < 80; i++) { await p.mouse.move(st.x + st.width * (.5 + .35 * Math.sin(i / 6)), st.y + st.height * (.5 + .3 * Math.cos(i / 9))); await p.waitForTimeout(30); } })();
    const drag = stat(await measure(2500)); await mv; await p.mouse.up();
    console.log(`${set.padEnd(8)} огляд: спокій ${idle} | палець ${drag}`);
  }
  await b.close();
})();
