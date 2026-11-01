// Світло й нахил карт. Один активний елемент отримує повний ефект: 3D-нахил, паралакс шарів,
// рух фольги й відблиску. Джерело — нахил телефона (DeviceOrientation, на iOS з дозволом по тапу)
// або положення пальця при утриманні/перетягуванні. Решта карт — полегшений режим без JS.
import { SKINS } from '../../config.js';
import { reducedMotion } from './core.js';

const KEY = 'vabank-tilt';
let active = null;          // елемент .sk-item, що отримує ефект
let target = { x: 0.5, y: 0.5 };
let cur = { x: 0.5, y: 0.5 };
let raf = 0;
let orientationOn = false;
let pointerDown = false;

export const tiltWanted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const tiltEnabled = () => orientationOn;

function apply(el, x, y, strength = 1) {
  const max = SKINS.tiltMaxDeg * strength;
  el.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
  el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
  el.style.setProperty('--hyp', Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2).toFixed(3));
  // числові −1…1 — для «торця» карти (видно з протилежного боку від нахилу)
  el.style.setProperty('--nx', ((x - 0.5) * 2 * strength).toFixed(3));
  el.style.setProperty('--ny', ((y - 0.5) * 2 * strength).toFixed(3));
}

function loop() {
  raf = 0;
  if (!active) return;
  // плавне наближення (пружина без перерегулювання)
  cur.x += (target.x - cur.x) * 0.18;
  cur.y += (target.y - cur.y) * 0.18;
  apply(active, cur.x, cur.y, active.dataset.tiltStrength ? Number(active.dataset.tiltStrength) : 1);
  if (Math.abs(target.x - cur.x) > 0.001 || Math.abs(target.y - cur.y) > 0.001 || pointerDown || orientationOn) raf = requestAnimationFrame(loop);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

/** Зробити елемент активним (повний ефект). Попередній повертається в полегшений режим. */
export function setActive(el) {
  if (active === el) return;
  if (active) { active.classList.remove('sk-active'); resetVars(active); }
  active = el;
  if (el) { el.classList.add('sk-active'); cur = { x: 0.5, y: 0.5 }; target = { x: 0.5, y: 0.5 }; kick(); }
}

function resetVars(el) { for (const k of ['--px', '--py', '--rx', '--ry', '--hyp', '--nx', '--ny']) el.style.removeProperty(k); }

/** Палець: тримаєш карту і ведеш — світло йде за пальцем. Відпустив — карта плавно вирівнюється. */
export function bindPointer(el, { onHold, holdMs = 380 } = {}) {
  let t = null, sx = 0, sy = 0, held = false;
  const pos = (e) => {
    const r = el.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  el.addEventListener('pointerdown', (e) => {
    pointerDown = true; held = false; sx = e.clientX; sy = e.clientY;
    setActive(el);
    if (!reducedMotion()) { target = pos(e); kick(); }
    clearTimeout(t);
    if (onHold) t = setTimeout(() => { held = true; onHold(el); }, holdMs);
  });
  el.addEventListener('pointermove', (e) => {
    if (!pointerDown || active !== el) return;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) clearTimeout(t);
    if (!reducedMotion()) { target = pos(e); kick(); }
  });
  const up = () => {
    if (!pointerDown) return;
    pointerDown = false; clearTimeout(t);
    if (!orientationOn) { target = { x: 0.5, y: 0.5 }; kick(); }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return { wasHeld: () => held };
}

/** Перетягування в огляді: карта крутиться пальцем у межах ±tiltMax (і далі — сильніше для «поворотів»). */
export function bindDrag(el, stage) {
  let sx = 0, sy = 0, base = { x: 0.5, y: 0.5 };
  stage.addEventListener('pointerdown', (e) => { pointerDown = true; sx = e.clientX; sy = e.clientY; base = { ...target }; setActive(el); stage.setPointerCapture?.(e.pointerId); });
  stage.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    const k = 1 / Math.max(160, el.getBoundingClientRect().width);
    target = { x: Math.min(1, Math.max(0, base.x + (e.clientX - sx) * k)), y: Math.min(1, Math.max(0, base.y + (e.clientY - sy) * k)) };
    kick();
  });
  const up = () => { pointerDown = false; if (!orientationOn) { target = { x: 0.5, y: 0.5 }; kick(); } };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
}

// ───────── нахил телефона ─────────
let base0 = null;
function onOrient(e) {
  if (!active || pointerDown || e.gamma == null) return;
  // калібрування: перше положення — «рівно»
  if (!base0) base0 = { b: e.beta, g: e.gamma };
  const dx = Math.max(-25, Math.min(25, e.gamma - base0.g)) / 50;
  const dy = Math.max(-25, Math.min(25, e.beta - base0.b)) / 50;
  target = { x: 0.5 + dx, y: 0.5 + dy };
  kick();
}

/**
 * Увімкнути ефекти нахилу. На iOS викликати лише з обробника тапу (requestPermission).
 * Повертає true/false — чи вдалося.
 */
export async function enableTilt() {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') return false;
    }
  } catch { return false; }
  window.addEventListener('deviceorientation', onOrient);
  orientationOn = true; base0 = null;
  try { localStorage.setItem(KEY, '1'); } catch {}
  kick();
  return true;
}

export function disableTilt() {
  window.removeEventListener('deviceorientation', onOrient);
  orientationOn = false;
  try { localStorage.setItem(KEY, '0'); } catch {}
  target = { x: 0.5, y: 0.5 }; kick();
}

/** Перекалібрувати «рівне» положення (напр. при відкритті огляду). */
export const recalibrate = () => { base0 = null; };
