// Галерея скінів: усі предмети наборів у кожній рідкості, порівняння рідкостей, огляд із нахилом,
// демо церемонії випадіння. Публікується разом із грою: <сайт>/skins/
import { renderItem, disposeItem, playWinFx, SETS } from '../ui/skins/render.js';
import { RARITY_ORDER, RAR, hash } from '../ui/skins/core.js';
import { bindPointer, setActive, enableTilt, disableTilt, tiltWanted, tiltEnabled } from '../ui/skins/tilt.js';
import { openViewer, playCeremony } from '../ui/skins/ceremony.js';
import { playAccent } from '../ui/skins/sound.js';
import { unlockAudio } from '../ui/sound.js';

const $ = (id) => document.getElementById(id);
const SUIT_NAME = { water: 'Води', fire: 'Вогню', stone: 'Каменю' };
const SPECIAL = { knife: 'Ніж', mirror: 'Дзеркало', double: 'Подвоєння' };
const UPCOMING = ['Козацький', 'Ар-деко казино', 'Безодня', 'Піксель', 'Космос'];
const params = new URLSearchParams(location.search);
let setId = SETS[params.get('set')] ? params.get('set') : 'kyiv';
let rarity = RARITY_ORDER.includes(params.get('r')) ? params.get('r') : 'legendary';
const mounted = [];

const cardName = (c) => (c.kind === 'num' ? `${c.value} ${SUIT_NAME[c.suit]}` : SPECIAL[c.kind]);
const serialOf = (key) => `№ ${String(hash(key) % 9999 + 1).padStart(4, '0')}`;
const DECK = [{ kind: 'num', value: 7, suit: 'fire' }, { kind: 'num', value: 10, suit: 'water' }, { kind: 'num', value: 3, suit: 'stone' },
  { kind: 'num', value: 1, suit: 'water' }, { kind: 'num', value: 5, suit: 'fire' }, { kind: 'num', value: 9, suit: 'stone' },
  { kind: 'knife' }, { kind: 'mirror' }, { kind: 'double' }];

document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

/** Предмет із підтримкою світла від пальця і огляду по утриманню. */
function item(o, name, w) {
  const el = renderItem({ ...o, w });
  mounted.push(el);
  bindPointer(el, { onHold: () => openViewer({ item: o, name, serial: serialOf(`${o.set}${o.kind}${name}${o.rarity}`) }) });
  return el;
}

function header() {
  $('sets').innerHTML = Object.values(SETS).map((s) => `<button data-set="${s.id}" class="${s.id === setId ? 'on' : ''}">${s.icon} ${s.name}</button>`).join('')
    + UPCOMING.map((n) => `<button disabled title="Наступний крок">${n}</button>`).join('');
  $('rar-bar').innerHTML = RARITY_ORDER.map((r) => `<button data-r="${r}" role="radio" aria-checked="${r === rarity}" class="${r === rarity ? 'on' : ''}"><i></i>${RAR[r].name}</button>`).join('');
  $('lead').textContent = `${SETS[setId].blurb} ${rarity === 'legendary' ? SETS[setId].legendaryNote : `Матеріал: ${RAR[rarity].material}.`}`;
}

function render() {
  for (const el of mounted.splice(0)) disposeItem(el);
  setActive(null);
  header();
  const set = SETS[setId];
  const main = $('main');
  main.innerHTML = `
    <h2>Порівняння рідкостей <small>та сама карта</small></h2><div class="cmp" id="cmp"></div>
    <h2>Колода <small>${RAR[rarity].name.toLowerCase()}</small></h2><div class="grid" id="deck"></div>
    <h2>Сорочка · фішка · звук</h2><div class="items" id="items"></div>
    <h2>Сукно</h2><div id="felt" style="display:grid;place-items:center"></div>
    <h2>Анімація перемоги</h2><div class="stage" id="win-stage"></div><div class="btns" style="margin-top:10px"><button id="win-btn" data-r="${rarity}"><i></i>Програти перемогу</button></div>
    <h2>Церемонія випадіння</h2><div class="btns" id="cer"></div>`;
  for (const r of RARITY_ORDER) {
    const cell = document.createElement('div');
    cell.className = 'cell'; cell.dataset.r = r;
    cell.append(item({ set: setId, kind: 'card', card: DECK[0], rarity: r }, `${cardName(DECK[0])} · ${set.name}`, 'min(21vw, 200px)'));
    cell.insertAdjacentHTML('beforeend', `<span>${RAR[r].name}</span>`);
    $('cmp').append(cell);
  }
  for (const c of DECK) $('deck').append(item({ set: setId, kind: 'card', card: c, rarity }, `${cardName(c)} · ${set.name}`, 'min(28vw, 150px)'));
  const backWrap = document.createElement('div');
  backWrap.append(item({ set: setId, kind: 'back', rarity }, `Сорочка «${set.name}»`, 'min(38vw, 170px)'));
  backWrap.insertAdjacentHTML('beforeend', '<div class="cap">Сорочка</div>');
  const chipWrap = document.createElement('div');
  chipWrap.append(item({ set: setId, kind: 'chip', rarity }, `Фішки «${set.name}»`, 'min(30vw, 130px)'));
  chipWrap.insertAdjacentHTML('beforeend', '<div class="cap">Фішка</div>');
  const sound = document.createElement('div');
  sound.className = 'full btns';
  sound.innerHTML = `<button data-r="${rarity}" id="snd"><i></i>Звуковий акцент: ${set.accentName || set.accent} (${RAR[rarity].name.toLowerCase()})</button>`;
  $('items').append(backWrap, chipWrap, sound);
  $('felt').append(item({ set: setId, kind: 'felt', rarity }, `Сукно «${set.name}»`, 'min(92vw, 640px)'));
  const stage = $('win-stage');
  const mini = renderItem({ set: setId, kind: 'felt', rarity, w: '100%', live: false });
  mini.style.position = 'absolute'; mini.style.inset = '0'; mini.style.width = '100%';
  stage.append(mini); mounted.push(mini);
  $('win-btn').onclick = () => { playWinFx(stage, setId, rarity); playAccent(set.accent, rarity); };
  $('snd').onclick = () => playAccent(set.accent, rarity);
  $('cer').innerHTML = RARITY_ORDER.map((r) => `<button data-r="${r}" data-cer="${r}"><i></i>${RAR[r].name}</button>`).join('') + '<button data-r="legendary" data-cer="dupe"><i></i>Легендарний дублікат</button>';
  $('cer').onclick = (e) => {
    const b = e.target.closest('[data-cer]');
    if (!b) return;
    const dupe = b.dataset.cer === 'dupe';
    const r = dupe ? 'legendary' : b.dataset.cer;
    const card = { kind: 'num', value: 10, suit: 'fire' };
    playCeremony({ item: { set: setId, kind: 'card', card, rarity: r }, name: `Колода «${set.name}»`, serial: serialOf(`${setId}${r}${Date.now()}`), dupe, dupeText: 'Дублікат — +300 уламків' });
  };
}

$('sets').addEventListener('click', (e) => { const b = e.target.closest('[data-set]'); if (!b) return; setId = b.dataset.set; history.replaceState(null, '', `?set=${setId}&r=${rarity}`); render(); });
$('rar-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  rarity = b.dataset.r; history.replaceState(null, '', `?set=${setId}&r=${rarity}`); render();
  if (rarity === 'legendary') playAccent(SETS[setId].accent, 'legendary'); // легендарна — власний звук при появі
});
const tb = $('tilt-btn');
const syncTilt = () => { tb.classList.toggle('on', tiltEnabled()); tb.textContent = tiltEnabled() ? 'Нахил увімкнено' : 'Ефекти нахилу'; };
tb.addEventListener('click', async () => { if (tiltEnabled()) disableTilt(); else if (!(await enableTilt())) tb.textContent = 'Нахил недоступний'; else syncTilt(); if (tiltEnabled()) syncTilt(); });
// на Android дозвіл не потрібен — вмикаємо, якщо гравець раніше погодився
if (tiltWanted() && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') enableTilt().then(syncTilt);
render();
