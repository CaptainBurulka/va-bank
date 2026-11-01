// Профіль FPS у матчі: 393×852, CPU ×4, гра з ботами, легендарні скіни в усіх.
// node tools/perf-match.cjs [набір=cyber] [мітка]   (потрібен npm run serve)
// Сцени: «рука» (спокій на виборі карт), «вибір» (тапи по картах), «розкриття» (анімації результату).
const { chromium, devices } = require('playwright');
const set = process.argv[2] || 'cyber';
const label = process.argv[3] || '';
(async () => {
  const b = await chromium.launch();
  const out = [];
  for (const players of [2, 3]) {
    const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route('**/peerjs*', (r) => r.abort());
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    await p.goto(`http://localhost:8080/?debug&perfskin=${set}`);
    await p.waitForFunction(() => window.__vbBooted);
    await p.evaluate((set) => {
      localStorage.setItem('vabank-tutorial', 'done');
      const prof = JSON.parse(localStorage.getItem('vabank-profile') || '{}');
      prof.v = prof.v || 1; prof.skins = prof.skins || {}; prof.equipped = prof.equipped || {};
      for (const cat of ['deck', 'back', 'felt', 'chips', 'win', 'sound']) { prof.skins[`${cat}_${set}`] = { r: 'legendary', n: 7 }; prof.equipped[cat] = `${cat}_${set}`; }
      localStorage.setItem('vabank-profile', JSON.stringify(prof));
    }, set);
    await p.reload(); await p.waitForFunction(() => window.__vbBooted); await p.waitForTimeout(400);
    await p.click('[data-go="bot"]');
    await p.waitForSelector('#modal:not(.hidden)');
    if (players === 3) await p.click('#m-players button:nth-child(2)');
    await p.click('#modal-btns .btn.primary');
    await p.waitForSelector('#scr-game:not(.hidden)');
    await p.click('.intro', { timeout: 1500 }).catch(() => {});
    await p.waitForTimeout(1200);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const measure = (ms) => p.evaluate((ms) => new Promise((res) => {
      const t = []; let last = performance.now(); const end = last + ms;
      const f = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(t); };
      requestAnimationFrame(f);
    }), ms);
    const stat = (t) => { t = t.slice(2); const s = [...t].sort((a, b) => a - b); const avg = t.reduce((a, b) => a + b, 0) / t.length; return { fps: +(1000 / avg).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), slow: +(100 * t.filter((x) => x > 17.5).length / t.length).toFixed(0) }; };
    const scene = async (name, ms, during) => {
      const m0 = await metrics();
      const run = during ? during() : null;
      const st = stat(await measure(ms));
      if (run) await run;
      const m1 = await metrics();
      const per = (k) => +((m1[k] - m0[k]) / (ms / 1000) * 1000).toFixed(0);
      const row = { players, scene: name, ...st, task: per('TaskDuration'), style: per('RecalcStyleDuration'), layout: per('LayoutDuration'), script: per('ScriptDuration') };
      out.push(row);
      console.log(`${label}${players}п ${name.padEnd(10)} ${String(st.fps).padStart(5)} fps · p95 ${String(st.p95).padStart(5)} мс · повільних ${String(st.slow).padStart(3)}% · task ${row.task} style ${row.style} layout ${row.layout} script ${row.script} мс/с`);
    };
    await scene('рука', 3000);
    const ids = await p.$$eval('#hand .card', (e) => e.map((x) => x.dataset.id));
    await scene('вибір', 3000, async () => { for (let i = 0; i < 8; i++) { await p.click(`#hand .card[data-id="${ids[i % ids.length]}"]`, { timeout: 800 }).catch(() => {}); await p.waitForTimeout(300); } });
    // кладемо карти і чекаємо розкриття
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const step = async () => {
      const btns = await p.$$('#actions button:not([disabled])');
      for (const want of ['Чек', 'Колл', 'Далі без розвідки']) for (const x of btns) if ((await x.textContent()).includes(want)) { await x.click().catch(() => {}); return true; }
      const hint = await p.textContent('#actions');
      if (/торкайся|Обери|відкриту|закриті/.test(hint)) {
        const hs = await p.$$eval('#hand .card:not(.joker)', (e) => e.map((x) => x.dataset.id));
        const sel = await p.$$eval('#hand .card.selected', (e) => e.length);
        for (const id of hs.slice(0, Math.max(0, 3 - sel))) await p.click(`#hand .card[data-id="${id}"]`).catch(() => {});
        await p.click('#actions .btn.primary').catch(() => {});
        return true;
      }
      return false;
    };
    for (let i = 0; i < 40; i++) { if ((await p.textContent('#phase-title')).match(/Банк|джекпот|Нічия|переміг|виграв/i)) break; await step(); await p.waitForTimeout(250); }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (process.env.LOAF) await p.evaluate(() => { window.__loaf = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ d: e.duration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, scripts: e.scripts.map((x) => `${x.invoker} ${Math.round(x.duration)}`).join(' | ') }); }).observe({ type: 'long-animation-frame', buffered: false }); });
    await scene('розкриття', 3000);
    if (process.env.LOAF) console.log((await p.evaluate(() => window.__loaf)).sort((a, b) => b.d - a.d).slice(0, 8).map((x) => `${Math.round(x.d)}мс render ${Math.round(x.render)} style ${Math.round(x.style)} :: ${x.scripts.slice(0, 160)}`).join('\n'));
    await ctx.close();
  }
  require('fs').writeFileSync(`${process.env.OUT || require('os').tmpdir()}/perf-match-${label || 'run'}.json`, JSON.stringify(out));
  await b.close();
})();
