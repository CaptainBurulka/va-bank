// Церемонія випадіння і повноекранний огляд предмета.
// Чим вища рідкість, тим довша і яскравіша церемонія (тривалості — config.js → SKINS.ceremony).
// Тап будь-де — одразу фінал. prefers-reduced-motion — без обертань і частинок, але з кольором рідкості.
import { SKINS } from '../../config.js';
import { RAR, rarIndex, reducedMotion } from './core.js';
import { renderItem, disposeItem, shareSnapshot, SETS } from './render.js';
import { setActive, bindDrag, enableTilt, tiltEnabled, recalibrate } from './tilt.js';
import { playAccent, ceremonySfx } from './sound.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Повноекранний огляд: крутиш пальцем або нахилом, бачиш назву, набір, рідкість і серійний номер. */
export function openViewer({ item, name, serial, onClose, extraButtons = [] }) {
  const set = SETS[item.set];
  const ov = document.createElement('div');
  ov.className = `skv cr-${item.rarity}`;
  ov.innerHTML = `<div class="skv-bg"></div><div class="skv-stage"></div>
    <div class="skv-info"><span class="skv-rar">${RAR[item.rarity].name}</span><b>${esc(name)}</b><span>${esc(set.name)}${serial ? ` · ${esc(serial)}` : ''}</span><small>${item.rarity === 'legendary' ? esc(set.legendaryNote) : `Матеріал: ${RAR[item.rarity].material}`}</small></div>
    <div class="skv-btns"><button class="skv-b" data-a="share">Поділитися</button><button class="skv-b" data-a="tilt">${tiltEnabled() ? 'Нахил увімкнено' : 'Ефекти нахилу'}</button>${extraButtons.map((b, i) => `<button class="skv-b" data-x="${i}">${esc(b.label)}</button>`).join('')}<button class="skv-b primary" data-a="close">Закрити</button></div>
    <div class="skv-hint">Веди пальцем по карті — світло рухається</div>`;
  const big = renderItem({ ...item, full: true, w: item.kind === 'felt' ? 'min(92vw, 520px)' : item.kind === 'chip' ? 'min(64vw, 280px)' : 'min(70vw, 330px)' });
  big.dataset.tiltStrength = '1.25';
  ov.querySelector('.skv-stage').append(big);
  document.body.append(ov);
  recalibrate();
  setActive(big);
  bindDrag(big, ov.querySelector('.skv-stage'));
  if (item.rarity === 'legendary') playAccent(set.accent, 'legendary');
  const close = () => { setActive(null); disposeItem(big); ov.remove(); onClose?.(); };
  ov.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x) { extraButtons[Number(b.dataset.x)].onClick?.(); return; }
    if (b.dataset.a === 'close') close();
    if (b.dataset.a === 'tilt') { const ok = await enableTilt(); b.textContent = ok ? 'Нахил увімкнено' : 'Нахил недоступний'; }
    if (b.dataset.a === 'share') { b.disabled = true; try { const r = await shareSnapshot(item, { name, serial }); b.textContent = r === 'shared' ? 'Надіслано ✓' : 'Знімок збережено ✓'; } catch { b.textContent = 'Не вдалося'; } setTimeout(() => { b.disabled = false; b.textContent = 'Поділитися'; }, 1800); }
  });
  return { close, el: ov };
}

/**
 * Церемонія випадіння.
 * @param {object} o { item: { set, kind, card?, rarity }, name, serial, dupe?: boolean, dupeText?, onClose }
 */
export function playCeremony(o) {
  const { item } = o;
  const rar = item.rarity;
  const r = rarIndex(rar);
  const set = SETS[item.set];
  const reduced = reducedMotion();
  const legendary = rar === 'legendary';
  const total = legendary && o.dupe ? SKINS.ceremony.legendaryDupe : SKINS.ceremony[rar];
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, reduced ? Math.min(ms, 300) : ms));

  const ov = document.createElement('div');
  ov.className = `skc cr-${rar}${o.dupe ? ' dupe' : ''}`;
  ov.style.setProperty('--cer', `${total}ms`);
  ov.innerHTML = `<div class="skc-dark"></div><div class="skc-rays"></div><div class="skc-light"></div><div class="skc-flash"></div><div class="skc-burst"></div>
    <div class="skc-stage"><div class="skc-flip"><div class="skc-front"></div><div class="skc-back"></div></div></div>
    <div class="skc-title"><span class="skc-rar">${legendary ? 'ЛЕГЕНДАРНА' : RAR[rar].name}</span><b>${esc(o.name)}</b><span class="skc-sub">${esc(set.name)}${o.serial ? ` · ${esc(o.serial)}` : ''}</span>${o.dupe || o.note ? `<span class="skc-dupe">${esc(o.dupeText || o.note || 'Дублікат — перетворено на уламки')}</span>` : ''}</div>
    <div class="skc-skip">торкнись, щоб пропустити</div>`;
  // запечатана сорочка і сам предмет
  const sealed = renderItem({ set: item.set, kind: 'back', rarity: 'common', w: 'min(56vw, 250px)', live: false });
  const prize = renderItem({ ...item, full: true, w: item.kind === 'felt' ? 'min(86vw, 420px)' : 'min(56vw, 250px)' });
  ov.querySelector('.skc-back').append(sealed);
  ov.querySelector('.skc-front').append(prize);
  document.body.append(ov);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    ov.classList.add('s-light', 's-color', 's-reveal', 's-final');
    ov.classList.remove('s-hush');
    if (legendary && !o.dupe) {
      // після легендарної — одразу огляд із нахилом і «Поділитися»
      setTimeout(() => { disposeItem(prize); disposeItem(sealed); ov.remove(); openViewer({ item, name: o.name, serial: o.serial, onClose: o.onClose }); }, reduced ? 200 : 1100);
    } else {
      setActive(prize);
      ov.addEventListener('click', () => { setActive(null); disposeItem(prize); disposeItem(sealed); ov.remove(); o.onClose?.(); }, { once: true });
    }
  };
  ov.addEventListener('click', () => { if (!done) finish(); });

  // ── хронометраж: передчуття → (пауза «майже») → розкриття ──
  const T = (k) => Math.round(total * k);
  ov.classList.add('s-light');
  ceremonySfx.hum(rar);
  if (r === 0) {
    at(T(.35), () => ov.classList.add('s-reveal'));
    at(T(.6), () => { ov.classList.add('s-color'); });
    at(total, finish);
  } else if (r === 1) {
    at(T(.4), () => ov.classList.add('s-color'));
    at(T(.55), () => { ov.classList.add('s-flash', 's-reveal'); ceremonySfx.ding(); });
    at(T(.75), () => playAccent(set.accent, rar));
    at(total, finish);
  } else if (r === 2) {
    at(T(.18), () => ov.classList.add('s-dim'));
    at(T(.32), () => ov.classList.add('s-color-mid')); // світло синіє — натяк
    at(T(.45), () => { ov.classList.add('s-hush'); ceremonySfx.heart(); }); // «майже»
    at(T(.6), () => { ov.classList.remove('s-hush'); ov.classList.add('s-color', 's-rays', 's-reveal'); ceremonySfx.whoosh(); });
    at(T(.72), () => playAccent(set.accent, rar));
    at(total, finish);
  } else if (o.dupe) {
    at(T(.15), () => ov.classList.add('s-dim', 's-color-mid'));
    at(T(.35), () => { ov.classList.add('s-color', 's-boom', 's-rays', 's-reveal', 's-spin'); ceremonySfx.boom(); burst(ov, Math.round(SKINS.particles.legendary * .6)); });
    at(T(.5), () => playAccent(set.accent, rar));
    at(T(.62), () => ov.classList.add('s-title'));
    at(total, finish);
  } else {
    at(T(.1), () => ov.classList.add('s-dim'));
    at(T(.2), () => ov.classList.add('s-color-mid'));
    at(T(.3), () => ov.classList.add('s-color-epic'));
    at(T(.38), () => { ov.classList.add('s-hush', 's-black'); ceremonySfx.heart(); }); // темрява і тиша
    at(T(.5), () => { ov.classList.remove('s-hush'); ov.classList.add('s-color', 's-boom', 's-rays', 's-reveal', 's-spin'); ceremonySfx.boom(); burst(ov, SKINS.particles.legendary); });
    at(T(.56), () => playAccent(set.accent, rar));
    at(T(.7), () => ov.classList.add('s-title'));
    at(total, finish);
  }
  return { skip: finish, el: ov };
}

/** Вибух золотих частинок (кількість обмежена). */
function burst(ov, n) {
  if (reducedMotion()) return;
  const box = ov.querySelector('.skc-burst');
  let html = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * .3, d = 120 + Math.random() * 180;
    html += `<i style="--tx:${Math.round(Math.cos(a) * d)}px;--ty:${Math.round(Math.sin(a) * d)}px;animation-delay:${(Math.random() * .2).toFixed(2)}s"></i>`;
  }
  box.innerHTML = html;
}
