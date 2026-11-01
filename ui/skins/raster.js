// Продуктивність скінів: статичні шари арту (папір, туш, мармур, золоті візерунки, SVG-фільтри) малюються
// ОДИН раз у bitmap (PNG через canvas) і кешуються; анімовані елементи виносяться в окремий легкий SVG поруч.
// Причина: будь-яка зміна всередині inline-SVG (анімація, перемальовка шару під фольгою) змушує браузер
// заново виконати всі фільтри цього SVG (feTurbulence, feDisplacementMap, blur) — на iPhone це десятки мс на кадр.

const LIVE_SEL = '[class]:not([class=""]), animate, animateMotion, animateTransform, set';
const DEFS_TAGS = new Set(['defs', 'linearGradient', 'radialGradient', 'filter', 'clipPath', 'pattern', 'mask', 'symbol']);
/** Класи, що анімують лише opacity: такий вузол виноситься в окремий div, і анімується div (композитор, без перемальовки). */
export const OPACITY_ONLY = new Set(['kbig', 'kneon', 'dkglow', 'abglow', 'cstw', 'pxblink', 'pxstar', 'cyglitch', 'smbig', 'dkfan', 'cygrid']);

const parser = typeof DOMParser === 'function' ? new DOMParser() : null;
const ser = typeof XMLSerializer === 'function' ? new XMLSerializer() : null;
const isLive = (n) => n.matches?.(LIVE_SEL);
const isDefs = (n) => DEFS_TAGS.has(n.localName) || !!n.closest?.('defs, filter, linearGradient, radialGradient, clipPath, pattern, mask, symbol');

/**
 * Розділити SVG на статичну частину і живу (вузли з класами анімацій / SMIL).
 * @returns {{ stat, live, hoist, below }} hoist — клас для div живої частини (лише opacity); below — живий шар під статичним
 */
export function splitLive(svgStr) {
  if (!parser || !/\bclass="[^"]+"|<animate|<set\b/.test(svgStr)) return { stat: svgStr, live: null, hoist: null };
  const doc = parser.parseFromString(svgStr, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg') return { stat: svgStr, live: null, hoist: null };
  // найвищі живі вузли (для SMIL — батьківський елемент, який рухається)
  const tops = [];
  for (const n of root.querySelectorAll(LIVE_SEL)) {
    const node = /^(animate|animateMotion|animateTransform|set)$/.test(n.localName) ? n.parentElement : n;
    if (!node || node === root || isDefs(node)) continue;
    if (tops.some((t) => t.contains(node))) continue;
    for (let i = tops.length - 1; i >= 0; i--) if (node.contains(tops[i])) tops.splice(i, 1);
    tops.push(node);
  }
  if (!tops.length) return { stat: svgStr, live: null, hoist: null };
  // порядок малювання: якщо всі живі вузли стоять раніше за будь-який статичний — живий шар іде ПІД статичним
  const drawables = [...root.querySelectorAll('*')].filter((n) => !isDefs(n) && !tops.some((t) => t === n || t.contains(n) || n.contains(t)) && n.parentElement && !isDefs(n.parentElement));
  const below = drawables.length > 0 && tops.every((t) => drawables.every((d) => t.compareDocumentPosition(d) & 4 /* d після t */));
  // жива копія: лишаємо defs, живі вузли, їхніх нащадків і предків (предки несуть transform)
  const liveRoot = root.cloneNode(true);
  const mark = (r) => { const all = [...r.querySelectorAll('*')]; return all; };
  const origAll = mark(root);
  const liveAll = mark(liveRoot);
  const keep = new Set();
  origAll.forEach((n, i) => {
    if (isDefs(n) || tops.some((t) => t === n || t.contains(n) || n.contains(t))) keep.add(i);
  });
  for (let i = liveAll.length - 1; i >= 0; i--) if (!keep.has(i)) liveAll[i].remove();
  for (const t of tops) t.remove();
  // один живий вузол, що анімує лише opacity — анімуємо обгортку-div
  let hoist = null;
  if (tops.length === 1) {
    const cls = tops[0].getAttribute('class')?.trim();
    if (cls && OPACITY_ONLY.has(cls) && !tops[0].querySelector('[class]:not([class=""])')) {
      hoist = cls;
      liveRoot.querySelectorAll(`.${cls}`).forEach((n) => n.removeAttribute('class'));
    }
  }
  return { stat: ser.serializeToString(root), live: ser.serializeToString(liveRoot), hoist, below };
}

/** Чи можна малювати SVG як картинку: без тексту (у SVG-картинці не працюють веб-шрифти) і без посилань назовні. */
export function rasterizable(svgStr) {
  if (/<text\b|<image\b|<foreignObject/.test(svgStr)) return false;
  for (const m of svgStr.matchAll(/url\(#([^)]+)\)/g)) if (!svgStr.includes(`id="${m[1]}"`)) return false;
  return true;
}

// ───────── кеш bitmap-ів: ключ — хеш SVG + розмір у пікселях ─────────
const cache = new Map(); // key → Promise<string|null> (blob URL)
const MAX = 260;
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + s.length.toString(36); };

/** SVG → PNG blob URL потрібного розміру (null, якщо браузер не зміг — тоді лишається inline SVG). */
export function rasterize(svgStr, w, h) {
  const key = `${fnv(svgStr)}:${w}x${h}`;
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
  const job = (async () => {
    try {
      const sized = svgStr.replace(/^<svg\b/, `<svg width="${w}" height="${h}"`);
      const src = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(src);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      return blob ? URL.createObjectURL(blob) : null;
    } catch { return null; }
  })();
  cache.set(key, job);
  if (cache.size > MAX) { const [k, v] = cache.entries().next().value; cache.delete(k); v.then((u) => u && setTimeout(() => URL.revokeObjectURL(u), 5000)); }
  return job;
}

/**
 * Замінити inline SVG статичних шарів предмета на кешовані bitmap-и (коли предмет уже має розмір).
 * scale — запас різкості (огляд і церемонія трохи збільшують карту).
 */
export async function upgradeItem(el, scale = 1) {
  if (el._rastered || !el.isConnected) return;
  const layers = el.querySelectorAll('.sk-art [data-r]');
  if (!layers.length) { el._rastered = true; return; }
  const dpr = Math.min(3, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) * scale);
  const jobs = [];
  for (const div of layers) {
    const r = div.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) { // ще не викладено — спробуємо пізніше
      if ((el._tries = (el._tries || 0) + 1) < 8) setTimeout(() => upgradeItem(el, scale), 250);
      return;
    }
    let w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    const k = Math.min(1, 1800 / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    const svg = div.querySelector(':scope > svg');
    if (!svg) continue;
    const str = div._svg;
    if (!str) continue;
    jobs.push(rasterize(str, w, h).then((url) => {
      if (!url || !div.isConnected) return;
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.src = url;
      img.className = 'sk-bmp';
      img.decode().then(() => { if (svg.isConnected) svg.replaceWith(img); }, () => {});
    }));
  }
  el._rastered = true;
  await Promise.all(jobs);
}
