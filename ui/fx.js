// Анімації: лічильники, що накручуються, рух фішок, емодзі.
const counters = new WeakMap();

/** Плавно «накручує» число в елементі. */
export function animateNumber(el, to, dur = 650) {
  const from = counters.get(el)?.value ?? (Number(el.textContent) || 0);
  const prev = counters.get(el);
  if (prev) cancelAnimationFrame(prev.raf);
  if (from === to) { el.textContent = to; counters.set(el, { value: to }); return; }
  const start = performance.now();
  const rec = { value: from, raf: 0 };
  counters.set(el, rec);
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    rec.value = Math.round(from + (to - from) * e);
    el.textContent = rec.value;
    if (k < 1) rec.raf = requestAnimationFrame(step);
    else rec.value = to;
  };
  rec.raf = requestAnimationFrame(step);
}

export function setNumber(el, v) {
  const prev = counters.get(el);
  if (prev) cancelAnimationFrame(prev.raf);
  counters.set(el, { value: v });
  el.textContent = v;
}

function center(el, layer) {
  const r = el.getBoundingClientRect();
  const l = layer.getBoundingClientRect();
  return { x: r.left + r.width / 2 - l.left, y: r.top + r.height / 2 - l.top };
}

/** Політ фішок від елемента до елемента. */
export function flyChips(layer, fromEl, toEl, count = 4) {
  if (!fromEl || !toEl) return;
  const a = center(fromEl, layer);
  const b = center(toEl, layer);
  const n = Math.max(1, Math.min(8, count));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'chip-token';
    const jx = (Math.random() - 0.5) * 24;
    const jy = (Math.random() - 0.5) * 24;
    c.style.transform = `translate(${a.x - 11 + jx}px, ${a.y - 11 + jy}px)`;
    layer.append(c);
    setTimeout(() => {
      c.style.transform = `translate(${b.x - 11 + jx / 2}px, ${b.y - 11 + jy / 2}px)`;
    }, 20 + i * 60);
    setTimeout(() => { c.style.opacity = '0'; }, 720 + i * 60);
    setTimeout(() => c.remove(), 1100 + i * 60);
  }
}

export function floatEmoji(layer, emoji, fromTop) {
  const el = document.createElement('div');
  el.className = 'float-emoji';
  el.textContent = emoji;
  const w = layer.clientWidth;
  el.style.left = `${w * (0.25 + Math.random() * 0.5) - 27}px`;
  el.style.top = fromTop ? '28%' : '72%';
  layer.append(el);
  setTimeout(() => el.remove(), 2300);
}

export function floatText(layer, anchor, text, color) {
  const p = center(anchor, layer);
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${p.x - 30}px`;
  el.style.top = `${p.y - 14}px`;
  layer.append(el);
  setTimeout(() => el.remove(), 1900);
}
