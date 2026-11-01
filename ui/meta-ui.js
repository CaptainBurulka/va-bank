// Екрани клубу: гаманець, колекція, магазин, ігровий автомат, нагороди після партії.
import { JOKERS, JOKER_BY_ID, RARITY_NAME, RARITIES, JOKER_TYPES } from '../game/jokers.js';
import { COSMETICS, COSMETIC_BY_ID, COSMETIC_CATS, ACH_BY_ID, SETS, SKIN_BY_ID, SKIN_KINDS, SKIN_SET_BY_ID } from '../meta/catalog.js';
import {
  buy, exchange, priceOf, shardPriceOf, setJokers, equip, spin, spinOdds, awardGame, checkAchievements, REEL_SYMBOLS, SPECIAL_SYMBOL, setProgress, completeSets, recordJokers, jokerStatsCsv,
  publicLook, serialText, RANK,
} from '../meta/profile.js';
import { renderItem, disposeItem, playWinFx } from './skins/render.js';
import { openViewer, playCeremony } from './skins/ceremony.js';
import { bindPointer } from './skins/tilt.js';
import { playAccent } from './skins/sound.js';
import { META } from '../config.js';
import { loadProfile, saveProfile, needsInstallHint } from './profile-store.js';
import { applyMyLook, playWin } from './cosmetics.js';
import { cryptoRng } from '../net/host.js';
import { sfx, setAccent } from './sound.js';
import { reducedMotion } from './motion.js';
import { TITLES, TITLE_BY_ID, titlesOf, titleOf, cleanNick, addLife, recordGame } from '../meta/rivals.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let ui = null; // { show, modal, toast }

export const SYMBOL_GLYPH = { cherry: '🍒', bell: '🔔', seven: '7', star: '⭐', clover: '🍀', diamond: '💎', crown: '👑' };
const WIN_GLYPH = { chips: '🪙', confetti: '🎉', hearts: '❤️', fireworks: '🎆', goldrain: '🌟', kyiv: '🌰', sakura: '🌸', glitch: '👾', cossack: '🌻' };
const ERR = {
  'no-points': 'Не вистачає балів — зіграй ще кілька партій',
  'no-shards': 'Не вистачає уламків — вони з\'являються з дублікатів в автоматі',
  owned: 'Уже є в колекції',
  'not-for-sale': 'Цей предмет не продається',
};

export function initMeta(api) {
  ui = api;
  applyMyLook(publicLook(loadProfile()));
  renderWallet();
  $('install-hint').classList.toggle('hidden', !needsInstallHint());
  for (const [tabs, fn] of [['col-tabs', renderCollection], ['shop-tabs', renderShop]]) {
    $(tabs).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      sfx.tap();
      for (const x of $(tabs).children) x.classList.toggle('on', x === b);
      fn(b.dataset.tab);
    });
  }
}

function update(p) {
  // Повний тематичний набір → рамка (на випадок, якщо предмет прийшов не через grant, напр. з імпорту)
  const before = loadProfile();
  const q = { ...p, cosmetics: { ...p.cosmetics } };
  completeSets(q);
  p = q;
  for (const st of SETS) if (p.cosmetics[st.frame] && !before.cosmetics[st.frame]) setTimeout(() => ui?.toast(`${st.icon} Повний набір «${st.name}»! Рамка профілю — твоя`, 4200), 400);
  saveProfile(p);
  applyMyLook(publicLook(p));
  renderWallet();
  return p;
}

export function renderWallet() {
  const p = loadProfile();
  const html = `<span class="pts" title="Бали">★ ${p.points}</span><span class="shd" title="Уламки">◆ ${p.shards}</span>`;
  $('wallet').innerHTML = html;
  document.querySelectorAll('[data-wallet]').forEach((el) => { el.innerHTML = html; });
}

// ───────── превʼю предметів (процедурне) ─────────
function swatch(c) {
  const v = c.vars || {};
  switch (c.cat) {
    case 'deck': return `<div class="sw" style="background:${v['--card-face'] || 'var(--card-face)'};box-shadow:inset 0 0 0 2px ${v['--card-edge'] || 'var(--card-edge)'};display:grid;place-items:center;color:${v['--card-ink'] || '#1d1a14'};font:800 26px/1 var(--font-ui);position:relative">7${c.suits ? `<svg style="position:absolute;right:6px;bottom:6px;width:18px;height:18px;color:${v['--fire'] || 'var(--fire)'}"><use href="#i-${c.suits}-fire"/></svg>` : ''}</div>`;
    case 'sound': return `<div class="big">${{ bells: '🔔', koto: '🎋', synth: '🎹', bandura: '🪕' }[c.accent] || '🔈'}</div>`;
    case 'back': return `<div class="sw" style="background:repeating-linear-gradient(45deg,transparent 0 5px,${v['--back-line'] || 'rgba(226,183,90,.25)'} 5px 6px),linear-gradient(160deg,${v['--card-back-1'] || '#7a1f2b'},${v['--card-back-2'] || '#4a0f19'});box-shadow:inset 0 0 0 2px #e2b75a"></div>`;
    case 'felt': return `<div class="sw" style="background:radial-gradient(circle,${v['--felt-1'] || '#1f6b47'},${v['--felt-3'] || '#0c3a26'});box-shadow:inset 0 0 0 3px ${v['--brass'] || '#6b5426'}"></div>`;
    case 'chips': return `<svg class="sw" style="color:${v['--chip'] || '#e2b75a'};box-shadow:none"><use href="#i-chip"/></svg>`;
    case 'win': return `<div class="big">${WIN_GLYPH[c.fx] || '🎉'}</div>`;
    case 'emoji': return `<div class="big" style="font-size:24px">${c.set.slice(0, 3).join('')}</div>`;
    case 'frame': return `<div class="sw" style="border-radius:50%;background:#1b140a;box-shadow:inset 0 0 0 4px ${v['--frame'] || 'rgba(226,183,90,.28)'}"></div>`;
  }
  return '';
}
const jokerTile = (j, { locked, inSet, extra = '' } = {}) =>
  `<button class="tile r-${j.rarity} ${locked ? 'locked' : ''} ${inSet ? 'in-set' : ''}" data-joker="${j.id}"><div class="big">${j.icon}</div><span>${esc(j.name)}</span><span class="rr">${RARITY_NAME[j.rarity]}</span>${extra}</button>`;
const cosTile = (c, { locked, equipped } = {}) =>
  `<button class="tile r-${c.rarity} ${locked ? 'locked' : ''} ${equipped ? 'equipped' : ''}" data-cos="${c.id}">${swatch(c)}<span>${esc(c.name)}</span><span class="rr">${RARITY_NAME[c.rarity]}</span></button>`;

const sourceText = (c) => ({ start: 'є з початку', shop: 'магазин або автомат', slot: 'лише автомат', set: 'зібрати весь набір', ach: `досягнення «${Object.values(ACH_BY_ID).find((a) => a.reward.cosmetic === c.id)?.name || ''}»` }[c.source]);

// ───────── колекція ─────────
export function openCollection(tab = 'jokers') {
  ui.show('collection');
  for (const x of $('col-tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
  renderCollection(tab);
}

function renderCollection(tab) {
  const p = loadProfile();
  const body = $('col-body');
  if (tab === 'stats') return renderJokerStats(p, body);
  if (tab === 'jokers') {
    const owned = JOKERS.filter((j) => p.jokers[j.id]).length;
    const slots = [0, 1, 2].map((i) => {
      const j = JOKER_BY_ID[p.set[i]];
      return j ? `<div class="set-slot full r-${j.rarity}"><span class="big">${j.icon}</span>${esc(j.name)}</div>` : '<div class="set-slot">порожньо</div>';
    }).join('');
    let html = `<div class="sec-title"><span>Набір на партію (до 3)</span></div><div class="set-bar">${slots}</div>
      <p class="hint-text" style="margin-top:8px">Один випадковий джокер із набору прийде тобі в руку в одному з раундів 3–7.</p>
      <div class="sec-title"><span>Джокери</span><span>${owned} / ${JOKERS.length}</span></div>`;
    for (const r of RARITIES) {
      html += `<div class="sec-title"><span>${RARITY_NAME[r]}</span></div><div class="grid-tiles">${JOKERS.filter((j) => j.rarity === r).map((j) => jokerTile(j, { locked: !p.jokers[j.id], inSet: p.set.includes(j.id) })).join('')}</div>`;
    }
    body.innerHTML = html;
    body.onclick = (e) => { const t = e.target.closest('[data-joker]'); if (t) jokerSheet(t.dataset.joker); };
  } else renderSkinCollection(p, body);
}

// ───────── предмети наборів: превʼю, колекція, огляд ─────────
const KIND_UA = { deck: 'Колода', back: 'Сорочка', felt: 'Сукно', chips: 'Фішки', win: 'Перемога', sound: 'Звук' };
const KIND_RENDER = { deck: 'card', back: 'back', felt: 'felt', chips: 'chip', win: 'felt', sound: 'chip' };
const KIND_SHAPE = { deck: 'card', back: 'card', felt: 'wide', chips: 'round', win: 'wide', sound: 'round' };
const PREVIEW_CARD = { kind: 'num', value: 7, suit: 'fire' };
const KIND_OVERLAY = { win: '▶', sound: '♪' };

/** Предмет набору → параметри для renderItem. */
export function skinItem(id, rarity) {
  const it = SKIN_BY_ID[id];
  const kind = KIND_RENDER[it.cat];
  return { set: it.set, kind, card: kind === 'card' ? PREVIEW_CARD : undefined, rarity };
}
const pvSize = (cat, small) => (KIND_SHAPE[cat] === 'wide' ? (small ? '56px' : '100px') : small ? '34px' : '62px');
let mountedPv = [];
/** Домалювати превʼю предметів у плейсхолдери [data-pv="id:рідкість"]. */
function mountPreviews(root) {
  mountedPv = mountedPv.filter((el) => { if (el.isConnected && !root.contains(el)) return true; disposeItem(el); return false; });
  for (const ph of root.querySelectorAll('[data-pv]')) {
    const [id, r] = ph.dataset.pv.split(':');
    const el = renderItem({ ...skinItem(id, r), w: ph.dataset.w || pvSize(SKIN_BY_ID[id].cat), live: false });
    ph.append(el);
    mountedPv.push(el);
  }
}

function skinTile(p, id) {
  const it = SKIN_BY_ID[id];
  const own = p.skins[id];
  const ov = KIND_OVERLAY[it.cat] ? `<i class="ov">${KIND_OVERLAY[it.cat]}</i>` : '';
  if (!own) return `<button class="skt locked" data-skin="${id}"><div class="sil ${KIND_SHAPE[it.cat]}">?</div><span class="nm">${KIND_UA[it.cat]}</span><span class="rr">не відкрито</span></button>`;
  return `<button class="skt r-${own.r} ${p.equipped[it.cat] === id ? 'equipped' : ''}" data-skin="${id}" style="--rc:var(--r-${own.r})"><div class="pv" data-pv="${id}:${own.r}"></div>${ov}<span class="nm">${KIND_UA[it.cat]}</span><span class="rr">${RARITY_NAME[own.r]}</span></button>`;
}

function renderSkinCollection(p, body) {
  let html = '<p class="hint-text">Торкнись — вдягнути. Утримуй — огляд із нахилом і серійним номером. Повний набір (6 предметів будь-якої рідкості) — рамка профілю.</p>';
  html += `<div class="sec-title"><span>Класика</span></div><div class="grid-tiles">${SKIN_KINDS.map((cat) => { const c = COSMETICS.find((x) => x.cat === cat && x.source === 'start'); return cosTile(c, { equipped: p.equipped[cat] === c.id }); }).join('')}</div>`;
  for (const st of setProgress(p)) {
    html += `<div class="skset"><div class="sec-title"><span>${st.icon} ${esc(st.name)}</span><span>${st.done ? '✓ рамка · ' : ''}${st.have} / ${st.total}</span></div>
      <span class="meter"><i style="width:${Math.round((st.have / st.total) * 100)}%"></i></span><div class="sk-grid">${st.items.map((id) => skinTile(p, id)).join('')}</div></div>`;
  }
  for (const cat of ['emoji', 'frame']) {
    const items = COSMETICS.filter((c) => c.cat === cat);
    html += `<div class="sec-title"><span>${COSMETIC_CATS[cat]}</span><span>${items.filter((c) => p.cosmetics[c.id]).length} / ${items.length}</span></div><div class="grid-tiles">${items.map((c) => cosTile(c, { locked: !p.cosmetics[c.id], equipped: p.equipped[cat] === c.id })).join('')}</div>`;
  }
  body.innerHTML = html;
  mountPreviews(body);
  for (const b of body.querySelectorAll('.skt:not(.locked)')) b._hold = bindPointer(b.querySelector('.sk-item'), { onHold: () => openSkinViewer(b.dataset.skin) });
  body.onclick = (e) => {
    const t = e.target.closest('[data-skin]');
    if (t) {
      if (t._hold?.wasHeld()) return;
      const it = SKIN_BY_ID[t.dataset.skin];
      const q = loadProfile();
      const own = q.skins[it.id];
      if (!own) {
        ui.modal(`<h3>${esc(it.name)}</h3><p>Ще не відкрито.</p><p>Як отримати: автомат — у будь-якій рідкості (дублікат вищої рідкості покращує предмет); магазин — звичайна, рідкісна чи епічна. Легендарна — лише з автомата.</p>`, [{ label: 'До магазину', cls: 'primary', onClick: () => openShop('cosmetics', it.set) }, { label: 'Зрозуміло', cls: 'tertiary' }]);
        return;
      }
      sfx.tap();
      update(equip(q, it.cat, it.id));
      if (it.cat === 'sound') playAccent(SKIN_SET_BY_ID[it.set].accent, own.r);
      if (it.cat === 'win') playWinFx($('scr-collection'), it.set, own.r);
      ui.toast(`Вдягнуто: ${it.name}`);
      renderCollection('cosmetics');
      return;
    }
    const c = COSMETIC_BY_ID[e.target.closest('[data-cos]')?.dataset.cos];
    if (!c) return;
    const q = loadProfile();
    if (q.cosmetics[c.id]) { sfx.tap(); update(equip(q, c.cat, c.id)); renderCollection('cosmetics'); }
    else ui.modal(`<h3>${esc(c.name)}</h3><p>${RARITY_NAME[c.rarity]} · ${COSMETIC_CATS[c.cat]}</p><p>Як отримати: ${sourceText(c)}.</p>`, [{ label: 'Зрозуміло', cls: 'primary' }]);
  };
}

/** Повноекранний огляд свого предмета набору: нахил, серійний номер, «Поділитися», «Вдягнути». */
export function openSkinViewer(id) {
  const p = loadProfile();
  const it = SKIN_BY_ID[id];
  const own = p.skins[id];
  if (!own) return;
  const extra = [{ label: p.equipped[it.cat] === id ? 'Вдягнуто ✓' : 'Вдягнути', onClick: () => { update(equip(loadProfile(), it.cat, id)); ui.toast(`Вдягнуто: ${it.name}`); if ($('scr-collection') && !$('scr-collection').classList.contains('hidden')) renderCollection('cosmetics'); } }];
  if (it.cat === 'win') extra.push({ label: 'Програти', onClick: () => playWinFx(document.querySelector('.skv'), it.set, own.r) });
  if (it.cat === 'sound') extra.push({ label: 'Послухати', onClick: () => playAccent(SKIN_SET_BY_ID[it.set].accent, own.r) });
  openViewer({ item: skinItem(id, own.r), name: it.name, serial: serialText(own.n), extraButtons: extra });
}

function jokerSheet(id) {
  const j = JOKER_BY_ID[id];
  const p = loadProfile();
  const own = !!p.jokers[id];
  const inSet = p.set.includes(id);
  const btns = [];
  if (own && inSet) btns.push({ label: 'Прибрати з набору', cls: 'secondary', onClick: () => { update(setJokers(p, p.set.filter((x) => x !== id))); renderCollection('jokers'); } });
  else if (own) btns.push({ label: p.set.length >= 3 ? 'Набір повний (3)' : 'Додати до набору', cls: 'primary', onClick: () => { if (p.set.length < 3) { update(setJokers(p, [...p.set, id])); renderCollection('jokers'); } } });
  else if (priceOf('joker', id) != null) btns.push({ label: `Купити за ★ ${priceOf('joker', id)}`, cls: 'primary', onClick: () => tryBuy('joker', id, () => renderCollection('jokers')) });
  btns.push({ label: 'Закрити', cls: 'tertiary' });
  ui.modal(`<h3>${j.icon} ${esc(j.name)}</h3><p>${RARITY_NAME[j.rarity]} джокер · ${JOKER_TYPES[j.type]}${own ? '' : ' · ще не відкрито'}</p><p style="color:var(--ink)">${esc(j.desc)}</p>${j.rarity === 'legendary' && !own ? '<p>Легендарних можна вибити лише з автомата.</p>' : ''}`, btns);
}

// ───────── магазин ─────────
let shopSet = 'kyiv';
export function openShop(tab = 'jokers', set = null) {
  if (set) shopSet = set;
  ui.show('shop');
  for (const x of $('shop-tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
  renderShop(tab);
}

function shopRow(kind, item, price, currency) {
  const p = loadProfile();
  const owned = kind === 'joker' ? p.jokers[item.id] : p.cosmetics[item.id];
  const have = currency === 'points' ? p.points : p.shards;
  const sym = currency === 'points' ? '★' : '◆';
  const icon = kind === 'joker' ? `<span class="big">${item.icon}</span>` : swatch(item);
  const desc = kind === 'joker' ? item.desc : `${COSMETIC_CATS[item.cat]} · ${RARITY_NAME[item.rarity]}`;
  const btn = owned
    ? '<button class="btn secondary" disabled>Є</button>'
    : `<button class="btn ${have >= price ? 'primary' : 'secondary'}" data-buy="${kind}:${item.id}:${currency}" ${have >= price ? '' : 'disabled'}>${sym} ${price}</button>`;
  return `<div class="shop-row r-${item.rarity}" style="--rc:var(--r-${item.rarity})">${icon}<div class="info"><b>${esc(item.name)}</b><span>${esc(desc)}</span></div>${btn}</div>`;
}

/** Рядок предмета набору: купити наступну рідкість (звичайна → рідкісна → епічна). */
function skinShopRow(id, currency) {
  const p = loadProfile();
  const it = SKIN_BY_ID[id];
  const own = p.skins[id];
  const next = RARITIES[own ? RANK[own.r] + 1 : 0];
  const price = next ? (currency === 'points' ? priceOf('skin', id, next) : shardPriceOf('skin', id, next)) : null;
  const have = currency === 'points' ? p.points : p.shards;
  const sym = currency === 'points' ? '★' : '◆';
  const r = next && price != null ? next : own?.r || 'common';
  const btn = price == null
    ? `<button class="btn secondary" disabled>${own?.r === 'legendary' ? 'Максимум' : 'Автомат'}</button>`
    : `<button class="btn ${have >= price ? 'primary' : 'secondary'}" data-buy="skin:${id}:${currency}:${next}" ${have >= price ? '' : 'disabled'}>${sym} ${price}</button>`;
  const what = own ? (price == null ? `є: ${RARITY_NAME[own.r]}${own.r === 'epic' ? ' · легендарна — лише автомат' : ''}` : `покращити: ${RARITY_NAME[own.r]} → ${RARITY_NAME[next]}`) : RARITY_NAME[next];
  return `<div class="shop-row r-${r}" style="--rc:var(--r-${r})"><div class="pv-s" data-pv="${id}:${r}" data-w="${pvSize(it.cat, true)}"></div><div class="info"><b>${esc(KIND_UA[it.cat])}</b><span>${esc(what)}</span></div>${btn}</div>`;
}

function shopSetPicker() {
  return `<div class="set-pick">${SETS.map((st) => `<button data-shopset="${st.id}" class="${st.id === shopSet ? 'on' : ''}">${st.icon} ${esc(st.name)}</button>`).join('')}</div>`;
}

function renderShop(tab) {
  const body = $('shop-body');
  let html = '';
  if (tab === 'jokers') {
    html += '<p class="hint-text">Легендарних джокерів купити не можна — лише автомат.</p>';
    for (const r of ['common', 'rare', 'epic']) {
      html += `<div class="sec-title"><span>${RARITY_NAME[r]} · ★ ${META.prices.joker[r]}</span></div>`;
      html += JOKERS.filter((j) => j.rarity === r).map((j) => shopRow('joker', j, priceOf('joker', j.id), 'points')).join('');
    }
  } else if (tab === 'cosmetics') {
    html += `<p class="hint-text">Предмет набору купується в потрібній рідкості або покращується до вищої. Легендарні — лише з автомата (спін — ★ ${META.spin.cost}).</p>${shopSetPicker()}`;
    html += SETS.find((x) => x.id === shopSet).items.map((id) => skinShopRow(id, 'points')).join('');
    const extra = COSMETICS.filter((c) => priceOf('cosmetic', c.id) != null);
    if (extra.length) html += '<div class="sec-title"><span>Емодзі й рамки</span></div>' + extra.map((c) => shopRow('cosmetic', c, priceOf('cosmetic', c.id), 'points')).join('');
  } else {
    html += `<p class="hint-text">Уламки ◆ — з дублікатів в автоматі. Обмінюються на будь-що, крім легендарних джокерів і легендарних предметів наборів.</p>${shopSetPicker()}`;
    html += SETS.find((x) => x.id === shopSet).items.map((id) => skinShopRow(id, 'shards')).join('');
    html += '<div class="sec-title"><span>Джокери</span></div>' + JOKERS.filter((j) => shardPriceOf('joker', j.id) != null).map((j) => shopRow('joker', j, shardPriceOf('joker', j.id), 'shards')).join('');
    html += '<div class="sec-title"><span>Емодзі й рамки</span></div>' + COSMETICS.filter((c) => shardPriceOf('cosmetic', c.id) != null).map((c) => shopRow('cosmetic', c, shardPriceOf('cosmetic', c.id), 'shards')).join('');
  }
  body.innerHTML = html;
  mountPreviews(body);
  body.onclick = (e) => {
    const sp = e.target.closest('[data-shopset]');
    if (sp) { sfx.tap(); shopSet = sp.dataset.shopset; renderShop(tab); return; }
    const b = e.target.closest('[data-buy]');
    if (!b || b.disabled) return;
    const [kind, id, currency, rarity] = b.dataset.buy.split(':');
    tryBuy(kind, id, () => renderShop(tab), currency, rarity);
  };
}

function tryBuy(kind, id, after, currency = 'points', rarity = null) {
  const item = kind === 'joker' ? JOKER_BY_ID[id] : kind === 'skin' ? SKIN_BY_ID[id] : COSMETIC_BY_ID[id];
  const price = currency === 'points' ? priceOf(kind, id, rarity) : shardPriceOf(kind, id, rarity);
  const sym = currency === 'points' ? '★' : '◆';
  const title = kind === 'skin' ? `${item.name} · ${RARITY_NAME[rarity]}` : item.name;
  ui.modal(`<h3>${esc(title)}</h3><p>${currency === 'points' ? 'Купити' : 'Обміняти'} за ${sym} ${price}?</p>`, [
    { label: currency === 'points' ? 'Купити' : 'Обміняти', cls: 'primary', onClick: () => {
      const r = (currency === 'points' ? buy : exchange)(loadProfile(), kind, id, rarity);
      if (!r.ok) { ui.toast(ERR[r.error] || 'Не вдалося', 2600, 'error'); return; }
      let p = r.profile;
      const ach = checkAchievements(p, null);
      p = update(ach.profile);
      sfx.jackpot(kind === 'skin' ? rarity : item.rarity);
      ui.toast(`${title} — у колекції!${r.serial ? ` ${serialText(r.serial)}` : ''}${ach.unlocked.length ? ` Досягнення: ${ach.unlocked.map((a) => ACH_BY_ID[a].name).join(', ')}` : ''}`);
      after();
    } },
    { label: 'Скасувати', cls: 'tertiary' },
  ]);
}

// ───────── ігровий автомат ─────────
export function openSlot() {
  ui.show('slot');
  const odds = spinOdds();
  const body = $('slot-body');
  body.innerHTML = `
    <div class="slot-machine" id="machine">
      <div class="lights">${Array.from({ length: 14 }, (_, i) => `<i style="${i < 7 ? `top:0;left:${8 + i * 13.5}%` : `bottom:0;left:${8 + (i - 7) * 13.5}%`};animation-delay:${(i % 4) * 0.15}s"></i>`).join('')}</div>
      <div class="marquee">Ва-банк 777</div>
      <div class="reels">${[0, 1, 2].map((i) => `<div class="reel" id="reel${i}"><div class="strip"><div class="sym seven">${SYMBOL_GLYPH.seven}</div></div></div>`).join('')}</div>
      <div class="slot-ctl"><button class="btn primary" id="btn-spin">Крутити · ★ ${META.spin.cost}</button><button class="lever" id="lever" aria-label="Ручка">ТЯГНИ</button></div>
    </div>
    <div class="sec-title"><span>Шанси</span></div>
    <div class="odds">${RARITIES.map((r) => `<div style="--rc:var(--r-${r})"><b>${(odds[r] * 100).toFixed(0)}%</b>${RARITY_NAME[r]}</div>`).join('')}</div>
    <p class="hint-text" style="margin-top:8px">Три різні — звичайне · дві однакові — рідкісне · три однакові — епічне · три 👑 — легендарне. Дублікат → уламки ◆.</p>
    <div class="pity" id="pity"></div>`;
  renderPity();
  for (const id of ['btn-spin', 'lever']) $(id).addEventListener('click', doSpin);
}

function renderPity() {
  const p = loadProfile();
  const e = META.spin.pityEpic - p.pity.epic;
  const l = META.spin.pityLegendary - p.pity.legendary;
  $('pity').innerHTML = `
    <div class="row" style="--rc:var(--r-epic)"><span>Гарантоване епічне або краще</span><b>через ${e}</b><div class="bar"><i style="width:${(100 * p.pity.epic) / META.spin.pityEpic}%"></i></div></div>
    <div class="row" style="--rc:var(--r-legendary)"><span>Гарантоване легендарне</span><b>через ${l}</b><div class="bar"><i style="width:${(100 * p.pity.legendary) / META.spin.pityLegendary}%"></i></div></div>`;
  $('btn-spin').disabled = p.points < META.spin.cost;
  if (p.points < META.spin.cost) $('btn-spin').innerHTML = `Потрібно ★ ${META.spin.cost}<small>грай партії — отримуєш бали</small>`;
}

let spinning = false;
function doSpin() {
  if (spinning) return;
  const r = spin(loadProfile(), cryptoRng);
  if (!r.ok) { ui.toast(ERR[r.error], 2600, 'error'); return; }
  spinning = true;
  sfx.tap();
  const machine = $('machine');
  machine.classList.add('spinning');
  const fast = reducedMotion();
  const syms = [...REEL_SYMBOLS, SPECIAL_SYMBOL];
  const tick = setInterval(() => sfx.reelTick(), 70);
  // передчуття: коли зупиняється другий барабан, вогні машини підказують рідкість кольором;
  // для епічної і легендарної — пауза «майже» перед останнім барабаном
  const rank = RANK[r.result.rarity];
  machine.classList.remove('hint-common', 'hint-rare', 'hint-epic', 'hint-legendary', 'near');
  if (!fast) setTimeout(() => { machine.classList.add(`hint-${r.result.rarity}`); if (rank >= 2) { machine.classList.add('near'); sfx.drumroll?.(); } }, 1100 + 550);
  const stops = r.result.reels.map((target, i) => {
    const reel = $(`reel${i}`);
    reel.classList.remove('win');
    const strip = reel.querySelector('.strip');
    const n = 18 + i * 7;
    const list = Array.from({ length: n }, () => syms[Math.floor(Math.random() * syms.length)]);
    list.push(target);
    strip.innerHTML = list.map((s) => `<div class="sym ${s}">${SYMBOL_GLYPH[s]}</div>`).join('');
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    void strip.offsetHeight;
    const dur = fast ? 150 : 1100 + i * 550 + (i === 2 && rank >= 2 ? 1100 : 0); // поступова зупинка барабанів (+ пауза «майже»)
    strip.style.transition = `transform ${dur}ms cubic-bezier(.15,.85,.25,1.04)`;
    strip.style.transform = `translateY(-${(list.length - 1) * reel.clientHeight}px)`;
    return new Promise((res) => setTimeout(() => { sfx.reelStop(i); res(); }, dur));
  });
  Promise.all(stops).then(() => {
    clearInterval(tick);
    machine.classList.remove('spinning');
    const counts = {};
    r.result.reels.forEach((s) => (counts[s] = (counts[s] || 0) + 1));
    r.result.reels.forEach((s, i) => { if (counts[s] > 1) $(`reel${i}`).classList.add('win'); });
    let p = r.profile;
    const ach = checkAchievements(p, null);
    p = update(ach.profile);
    machine.classList.remove('near');
    if (r.result.kind === 'skin') { skinPrize(r.result, ach.unlocked); return; }
    sfx.jackpot(r.result.rarity);
    if (['epic', 'legendary'].includes(r.result.rarity)) playWin(document.getElementById('scr-slot'), r.result.rarity === 'legendary' ? 'goldrain' : 'confetti', fast);
    setTimeout(() => { showPrize(r.result, ach.unlocked); spinning = false; renderPity(); }, fast ? 0 : 450);
  });
}

/** Предмет набору з автомата: церемонія за рідкістю, потім — вдягнути / ще раз. */
function skinPrize(res, ach) {
  const it = SKIN_BY_ID[res.id];
  const own = loadProfile().skins[res.id];
  const note = res.duplicate ? `Уже є (${RARITY_NAME[own.r]}) → +${res.shards} уламків ◆` : res.upgraded ? `Покращено: ${RARITY_NAME[res.from]} → ${RARITY_NAME[res.rarity]}` : '';
  playCeremony({
    item: skinItem(res.id, res.rarity), name: it.name, serial: res.duplicate ? '' : serialText(res.serial),
    dupe: res.duplicate, dupeText: note, note,
    onClose: () => {
      spinning = false;
      renderPity();
      const extra = [res.pityHit ? `<p>Спрацювала гарантія ${res.pityHit === 'legendary' ? 'легендарного' : 'епічного'}!</p>` : '', ach.length ? `<p>Досягнення: ${ach.map((a) => esc(ACH_BY_ID[a].name)).join(', ')}</p>` : '', res.completed?.length ? `<p>Повний набір — рамка профілю твоя!</p>` : ''].join('');
      const btns = [{ label: 'Ще раз', cls: 'primary', onClick: () => setTimeout(doSpin, 50) }];
      if (!res.duplicate && loadProfile().equipped[it.cat] !== res.id) btns.push({ label: 'Вдягнути', cls: 'secondary', onClick: () => { update(equip(loadProfile(), it.cat, res.id)); ui.toast(`Вдягнуто: ${it.name}`); } });
      btns.push({ label: 'Закрити', cls: 'tertiary' });
      if (extra || btns.length > 2) ui.modal(`<div class="prize"><h3>${esc(it.name)}</h3><p>${RARITY_NAME[own.r]}${own.n ? ` · ${serialText(own.n)}` : ''}</p>${extra}</div>`, btns);
    },
  });
}

function showPrize(res, ach) {
  const item = res.kind === 'joker' ? JOKER_BY_ID[res.id] : COSMETIC_BY_ID[res.id];
  const tile = res.kind === 'joker' ? jokerTile(item) : cosTile(item);
  const kindText = res.kind === 'joker' ? `${RARITY_NAME[item.rarity]} джокер` : `${COSMETIC_CATS[item.cat]} · ${RARITY_NAME[item.rarity]}`;
  const pity = res.pityHit ? `<p>Спрацювала гарантія ${res.pityHit === 'legendary' ? 'легендарного' : 'епічного'}!</p>` : '';
  const dup = res.duplicate ? `<p>Уже є в колекції → <b style="color:#b9e4ff">+${res.shards} уламків ◆</b></p>` : '<p><b style="color:var(--win)">Новий предмет!</b></p>';
  const desc = res.kind === 'joker' ? `<p style="color:var(--ink)">${esc(item.desc)}</p>` : '';
  const achText = ach.length ? `<p>Досягнення: ${ach.map((a) => esc(ACH_BY_ID[a].name)).join(', ')}</p>` : '';
  ui.modal(`<div class="prize">${tile}<h3>${esc(item.name)}</h3><p>${kindText}</p>${desc}${dup}${pity}${achText}</div>`, [
    { label: 'Ще раз', cls: 'primary', onClick: () => setTimeout(doSpin, 50) },
    { label: res.kind === 'joker' ? 'До колекції' : 'Вдягнути в колекції', cls: 'secondary', onClick: () => openCollection(res.kind === 'joker' ? 'jokers' : 'cosmetics') },
    { label: 'Закрити', cls: 'tertiary' },
  ]);
}

// ───────── нагороди після партії ─────────
/**
 * @param view — view у фазі over
 * @param mode — 'online' | 'bot' | 'hotseat'
 * @returns HTML для екрана кінця
 */
export function awardAfterGame(view, mode, meta = null) {
  const me = view.you;
  const summary = {
    won: view.winner === me, draw: view.winner === 'draw', mode, endReason: view.endReason,
    me: view.stats[me], players: view.n || 2, place: view.places?.[me] ?? null, gameMode: view.cfg?.mode || 'classic',
  };
  const r = awardGame(loadProfile(), summary);
  let prof = r.profile;
  // Довічна статистика для титулів (на одному телефоні — ні: там грають різні люди)
  const titleBefore = titleOf(prof);
  if (mode !== 'hotseat') prof = { ...prof, life: addLife(prof.life, view.stats[me], { won: summary.won, rounds: view.round }) };
  // Статистика джокерів реальних партій (на одному телефоні — ні)
  if (mode !== 'hotseat') prof = { ...prof, jokerStats: recordJokers(prof.jokerStats, view.me.jokerSet, view.stats[me].jokerLog) };
  // Рахунок особистих зустрічей — лише з живими суперниками онлайн
  let rivalLines = [];
  if (mode === 'online' && meta?.pids) {
    const rec = recordGame(prof.rivals, view, meta);
    prof = { ...prof, rivals: rec.rivals };
    rivalLines = rec.touched.map((pid) => {
      const x = rec.rivals[pid];
      return `<div><span>Рахунок зустрічей · ${esc(x.name)}</span><b>${x.wins} : ${x.losses}${x.draws ? ` (нічиїх ${x.draws})` : ''}</b></div>`;
    });
  }
  update(prof);
  const lines = r.gained.map((g) => `<div><span>${esc(g.label)}</span><b>+${g.amount} ★</b></div>`);
  const titleAfter = titleOf(prof);
  if (titleAfter && titleAfter !== titleBefore) lines.push(`<div class="ach"><span>${TITLE_BY_ID[titleAfter].icon} Новий титул: ${esc(TITLE_BY_ID[titleAfter].name)}</span><b></b></div>`);
  lines.push(...rivalLines);
  for (const a of r.achievements) {
    const A = ACH_BY_ID[a];
    const rew = A.reward.points ? `+${A.reward.points} ★` : `🎁 ${esc(COSMETIC_BY_ID[A.reward.cosmetic].name)}`;
    lines.push(`<div class="ach"><span>🏆 ${esc(A.name)}</span><b>${rew}</b></div>`);
  }
  if (mode !== 'online') lines.push(`<div><span>${mode === 'bot' ? 'Проти бота' : 'На одному телефоні'} — бали ×${META.points.mult[mode]}</span><span></span></div>`);
  return lines.join('');
}

// ───────── суперники ─────────

/** Іконка титулу для показу біля ніку. */
export const titleIcon = (id) => (id && TITLE_BY_ID[id] ? TITLE_BY_ID[id].icon : '');

export function openRivals() {
  renderRivals();
  ui.show('rivals');
  $('rivals-body').scrollTop = 0;
}

function renderRivals() {
  const p = loadProfile();
  const earned = titlesOf(p.life);
  const main = titleOf(p);
  const l = p.life;
  const rv = Object.entries(p.rivals).sort((a, b) => b[1].last - a[1].last);
  const streak = (n) => (n > 0 ? `<span class="streak w">${n} ${n === 1 ? 'перемога' : n < 5 ? 'перемоги' : 'перемог'} поспіль</span>` : n < 0 ? `<span class="streak l">${-n} ${-n === 1 ? 'поразка' : -n < 5 ? 'поразки' : 'поразок'} поспіль</span>` : '<span>серії немає</span>');
  $('rivals-body').innerHTML = `
    <div class="me-card">
      <div class="nick"><input id="nick-input" maxlength="16" placeholder="Твій нік" value="${esc(p.nick)}" autocomplete="off" enterkeyhint="done" aria-label="Нікнейм"><span class="pid" title="Постійний ID — за ним гра впізнає тебе в друзів">ID ${esc(p.pid.slice(1, 5).toUpperCase())}</span></div>
      <div class="hint-text">Нік бачать друзі за столом. ID постійний — за ним рахунок зустрічей не плутається, навіть якщо змінити нік.</div>
      <div class="titles" id="title-list">${TITLES.map((t) => `<button class="title-chip ${t.id === main ? 'on' : ''} ${earned.includes(t.id) ? '' : 'locked'}" data-title="${t.id}" title="${esc(t.desc)}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>
      <div class="hint-text">Титули з'являються біля ніку. Торкнись заробленого, щоб показувати саме його. Сірі — ще попереду: ${esc(TITLES.find((t) => !earned.includes(t.id))?.desc || 'усі зароблено!')}.</div>
      <div class="hint-text">Усього: партій <b>${l.games}</b> · перемог <b>${l.wins}</b> · блефів <b>${l.bluffs}</b> · найбільший банк <b>${l.biggestPot}</b></div>
    </div>
    <h3 class="sec-title">Рахунок зустрічей</h3>
    ${rv.length ? rv.map(([, r]) => `
      <div class="rival">
        <div class="nm">${r.title ? `<span class="title-tag">${titleIcon(r.title)}</span>` : ''}${esc(r.name)}</div>
        <div class="score">${r.wins}<span class="sep">:</span>${r.losses}</div>
        <div class="sub">${streak(r.streak)}${r.draws ? ` · нічиїх ${r.draws}` : ''} · партій ${r.games}</div>
        <div class="facts"><span>Найбільший банк <b>${r.bigPot}</b></span><span>Блефи <b>${r.myBluffs} : ${r.theirBluffs}</b></span><span>Програні «подвій» <b>${r.myDonLost} : ${r.theirDonLost}</b></span></div>
      </div>`).join('') : '<p class="hint-text">Зіграй із другом онлайн — тут з\'явиться ваш рахунок, серії й найбільший банк.</p>'}`;
  const inp = $('nick-input');
  const save = () => { const q = loadProfile(); const v = cleanNick(inp.value); if (v !== q.nick) { update({ ...q, nick: v }); ui.toast(v ? `Нік: ${v}` : 'Нік прибрано'); } inp.value = v; };
  inp.addEventListener('change', save);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  $('title-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-title]');
    if (!b) return;
    sfx.tap();
    const id = b.dataset.title;
    if (!titlesOf(loadProfile().life).includes(id)) { ui.toast(TITLE_BY_ID[id].desc); return; }
    update({ ...loadProfile(), title: id });
    renderRivals();
  });
}

/** Попросити нік перед першою онлайн-грою. */
export function askNick(next) {
  const p = loadProfile();
  if (p.nick) return next();
  ui.modal('<h3>Як тебе звати?</h3><p>Нік побачать друзі за столом, а гра рахуватиме ваші зустрічі.</p><input id="nick-ask" class="code-box" style="height:48px;font-size:18px" maxlength="16" placeholder="Нік" autocomplete="off">', [
    { label: 'Готово', cls: 'primary', onClick: () => { const v = cleanNick($('nick-ask').value); if (v) update({ ...loadProfile(), nick: v }); next(); } },
    { label: 'Пізніше', cls: 'tertiary', onClick: () => next() },
  ]);
  setTimeout(() => $('nick-ask')?.focus(), 250);
}

// ───────── статистика джокерів (локально, з реальних партій) ─────────
function renderJokerStats(p, body) {
  const st = p.jokerStats || {};
  const rows = JOKERS.filter((j) => st[j.id]).sort((a, b) => st[b.id].played - st[a.id].played || st[b.id].picked - st[a.id].picked);
  const pc = (a, n) => (n ? `${Math.round((100 * a) / n)}%` : '—');
  body.innerHTML = `
    <p class="hint-text">Лише твої партії на цьому телефоні (з ботом і онлайн). «Змінив» — розкриття закінчилось інакше, ніж якби джокер був звичайною картою своєї сили.</p>
    ${rows.length ? `<table class="stats jstats"><tr><th>Джокер</th><th>У наборі</th><th>Зіграно</th><th>Перемог</th><th>Змінив</th></tr>${rows.map((j) => {
      const r = st[j.id];
      return `<tr><td>${j.icon} ${esc(j.name)}</td><td>${r.picked}</td><td>${r.played}</td><td>${pc(r.wins, r.played)}</td><td>${pc(r.changed, r.played)}</td></tr>`;
    }).join('')}</table>` : '<p class="hint-text">Ще порожньо — зіграй партію з джокерами в наборі.</p>'}
    <button class="btn secondary" id="jstats-export" style="width:100%;margin-top:12px" ${rows.length ? '' : 'disabled'}>Експорт статистики (CSV)</button>`;
  body.onclick = null;
  $('jstats-export').onclick = async () => {
    sfx.tap();
    const csv = jokerStatsCsv(loadProfile().jokerStats);
    const file = typeof File === 'function' ? new File([csv], 'vabank-jokers.csv', { type: 'text/csv' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Статистика джокерів' }); return; }
      await navigator.clipboard.writeText(csv);
      ui.toast('Скопійовано: таблиця CSV у буфері обміну');
    } catch {
      ui.modal(`<h3>Статистика джокерів</h3><textarea class="code-box" readonly rows="8">${esc(csv)}</textarea>`, [{ label: 'Готово', cls: 'primary' }]);
    }
  };
}
