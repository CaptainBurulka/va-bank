// Точка входу: екрани, режими гри, зв'язування хоста/мережі з UI.
import { GameHost, BotSeat } from '../net/host.js';
import { GameScreen } from './game.js';
import { cardEl } from './cardview.js';
import { unlockAudio, sfx, isMuted, setMuted, getVolume, setVolume } from './sound.js';
import { RULES_HTML, TUTORIAL } from './text.js';
import { tutorial, botLang } from './settings.js';
import { CONFIG, APP_VERSION, MODES, MODE_IDS, META } from '../config.js';
import { ALL_BOT_STYLES } from '../game/bot.js';
import { PERSONAS, PERSONA_BY_ID } from '../game/banter.js';
const BOT_STYLES = ['smart', 'greedy', ...ALL_BOT_STYLES.filter((k) => !['smart', 'greedy'].includes(k))];
import { buildDeck } from '../game/cards.js';
import { upgradeState } from '../game/engine.js';
import { createOnlineHost, joinOnline, ROOM_ALPHABET, loadGuestSave, clearGuestSave, loadHostSave, clearHostSave } from '../net/online.js';
import { initMeta, renderWallet, openCollection, openShop, openSlot, awardAfterGame, openRivals, askNick, titleIcon } from './meta-ui.js';
import { titleOf, pickMoment, scoreLine, isPid } from '../meta/rivals.js';
import { cardName } from './text.js';
import { loadProfile, saveProfile } from './profile-store.js';
import { applyOppLook, emojiSet, winFxOf } from './cosmetics.js';
import { enableTilt, disableTilt, tiltEnabled, tiltWanted } from './skins/tilt.js';
import { exportCode, importCode, publicLook, modeOfDay } from '../meta/profile.js';
import { JOKERS, JOKER_BY_ID } from '../game/jokers.js';
import { COSMETICS, DEFAULT_EQUIPPED, SKIN_SETS_META, SKIN_KINDS } from '../meta/catalog.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'create', 'join', 'rules', 'game', 'end', 'collection', 'shop', 'slot', 'rivals'];
const BOT_KEY = 'vabank-bot';

let session = null;
let current = 'menu';

// ───────── загальне ─────────
function show(name) {
  if (current === name && !$(`scr-${name}`).classList.contains('hidden')) return;
  current = name;
  for (const s of SCREENS) $(`scr-${s}`).classList.toggle('hidden', s !== name);
  if (name === 'menu') { renderWallet(); renderDayMode(); }
}

/** Перед партією: мій набір джокерів і косметика на столі. */
function prepareLooks(oppLook) {
  const p = loadProfile();
  game.setEmojiSet(emojiSet(p.equipped));
  const opp = oppLook || DEFAULT_EQUIPPED;
  applyOppLook(opp);
  game.setWinFx(winFxOf(publicLook(p)), winFxOf(opp));
  return p;
}

/** Гра втрьох: косметика кожного суперника — на його панель і слот. looks — за місцями. */
let lastLooksKey = '';
function prepareLooks3(looks, you) {
  const p = loadProfile();
  const key = JSON.stringify([looks, you]);
  if (key === lastLooksKey) return p;
  lastLooksKey = key;
  game.setEmojiSet(emojiSet(p.equipped));
  const n = looks.length;
  [(you + 1) % n, (you + 2) % n].forEach((q, i) => applyOppLook(looks[q] || DEFAULT_EQUIPPED, i ? 'opp2' : 'opp'));
  game.setWinFxSeats(looks.map((l, q) => winFxOf(q === you ? publicLook(p) : l || DEFAULT_EQUIPPED)));
  return p;
}

/** Бот: випадковий набір із 3 джокерів (зрідка — легендарний) і випадкова косметика. */
// Профілювання: ?perfskin=cyber — боти завжди в повному легендарному наборі (на гру не впливає)
const PERF_SKIN = new URLSearchParams(location.search).get('perfskin');
function botLoadout() {
  if (PERF_SKIN) {
    const look = { ...DEFAULT_EQUIPPED, rar: {} };
    for (const cat of SKIN_KINDS) { look[cat] = `${cat}_${PERF_SKIN}`; look.rar[cat] = 'legendary'; }
    look.frame = 'frame_cosmic';
    return { set: ['storm', 'boom', 'mirrorworld'], look };
  }
  const pool = JOKERS.filter((j) => j.rarity !== 'legendary' || Math.random() < 0.15).map((j) => j.id);
  const set = [];
  while (set.length < 3 && pool.length) set.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  // бот «вдягає» один тематичний набір (окремі предмети — з шансом) у випадковій рідкості
  const look = { ...DEFAULT_EQUIPPED, rar: {} };
  const theme = SKIN_SETS_META[Math.floor(Math.random() * SKIN_SETS_META.length)].id;
  const rar = () => { const x = Math.random(); return x < 0.5 ? 'common' : x < 0.8 ? 'rare' : x < 0.95 ? 'epic' : 'legendary'; };
  for (const cat of SKIN_KINDS) if (Math.random() < 0.7) { look[cat] = `${cat}_${theme}`; look.rar[cat] = rar(); }
  for (const cat of ['emoji', 'frame']) {
    const opts = COSMETICS.filter((c) => c.cat === cat && c.source !== 'ach' && c.source !== 'set');
    if (Math.random() < 0.6) look[cat] = opts[Math.floor(Math.random() * opts.length)].id;
  }
  return { set, look };
}

function toast(text, ms = 2600, kind = '') {
  const t = $('toast');
  t.textContent = text;
  t.className = `toast ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

/** Аркуш знизу. text — HTML; buttons: [{label, cls, onClick, keep}] */
function modal(text, buttons) {
  $('modal-text').innerHTML = text;
  const box = $('modal-btns');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${b.cls || 'secondary'}`;
    el.innerHTML = b.label;
    el.addEventListener('click', () => {
      sfx.tap();
      if (!b.keep) closeModal();
      b.onClick?.(el);
    });
    box.append(el);
  }
  $('modal').classList.remove('hidden');
}
const closeModal = () => $('modal').classList.add('hidden');
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

// Звук вмикається після першого тапу (обмеження iOS)
const unlock = () => unlockAudio();
document.addEventListener('touchend', unlock, { passive: true });
document.addEventListener('click', unlock);

// Заборона зуму жестами і подвійним тапом на iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scrollable, .log-list, .meta-body, #scr-end, #scr-menu, #scr-create, #scr-join, textarea')) e.preventDefault();
}, { passive: false });

const game = new GameScreen({
  onAction: (a) => session?.send(a),
  onReaction: (e) => session?.react(e),
  onMenu: () => openGameMenu(),
  onLog: (lines) => modal(`<h3>Журнал</h3><div class="log-list">${lines.map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`).join('') || '<div>Поки порожньо</div>'}</div>`, [{ label: 'Закрити' }]),
});

// ───────── вибір параметрів партії ─────────
const STYLE_INFO = {
  smart: { name: 'Розумний', sub: 'читає стіл, блефує' },
  greedy: { name: 'Жадібний', sub: 'завжди найсильніше' },
  cautious: { name: 'Обережний', sub: 'рідко блефує' },
  aggressive: { name: 'Агресивний', sub: 'тисне ставками' },
  bluffer: { name: 'Блефер', sub: 'легкий, хитрий' },
};

/** Сегментований перемикач. options: [{value, label, sub}] */
function segmented(container, options, value, onChange) {
  container.innerHTML = '';
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}`;
    b.classList.toggle('on', o.value === value);
    b.setAttribute('aria-pressed', String(o.value === value));
    b.addEventListener('click', () => {
      sfx.tap();
      for (const x of container.children) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }
      b.classList.add('on');
      b.setAttribute('aria-pressed', 'true');
      onChange(o.value);
    });
    container.append(b);
  }
}

let prefMode = 'classic';
try { prefMode = MODES[localStorage.getItem('vabank-mode')] ? localStorage.getItem('vabank-mode') : 'classic'; } catch {}
/** Перемикач режимів: іконка, назва, позначка режиму дня. */
function modeOptions() {
  const day = modeOfDay();
  return MODE_IDS.map((m) => ({ value: m, label: `${MODES[m].icon} ${MODES[m].name}`, sub: m === day ? `режим дня +${META.points.modeOfDay}★` : '' }));
}
function renderDayMode() {
  const m = modeOfDay();
  const el = $('day-mode');
  if (el) el.innerHTML = `Режим дня: <b>${MODES[m].icon} ${MODES[m].name}</b> · +${META.points.modeOfDay} ★ за партію`;
}

let prefPlayers = 2;
try { prefPlayers = localStorage.getItem('vabank-players') || 2; } catch {}
prefPlayers = prefPlayers === '2b' ? '2b' : Number(prefPlayers) === 3 ? 3 : 2;
const PLAYER_OPTS = {
  bot: [{ value: 2, label: '1 бот', sub: 'дуель' }, { value: 3, label: '2 боти', sub: 'утрьох' }],
  hotseat: [{ value: 2, label: 'Двоє', sub: '' }, { value: 3, label: 'Троє', sub: '' }, { value: '2b', label: 'Двоє + бот', sub: 'утрьох' }],
};

const roundOptions = () => CONFIG.roundOptions.map((r) => ({ value: r, label: `${r}`, sub: r === 8 ? 'швидка' : r === 16 ? 'довга' : 'звичайна' }));
let prefRounds = CONFIG.maxRounds;
let prefStyle = 'vitok'; // персонаж бота (game/banter.js PERSONAS)
try { prefRounds = Number(localStorage.getItem('vabank-rounds')) || prefRounds; prefStyle = localStorage.getItem('vabank-style') || prefStyle; } catch {}
if (!PERSONA_BY_ID[prefStyle]) prefStyle = 'vitok';
// Швидкість: множник таймерів кожного кроку (CONFIG.timerSpeeds), «без таймера» — 0
let prefSpeed = 'normal';
try { prefSpeed = localStorage.getItem('vabank-speed') || prefSpeed; } catch {}
if (!(prefSpeed in CONFIG.timerSpeeds)) prefSpeed = 'normal';
const speedOptions = () => [
  { value: 'fast', label: 'Швидко', sub: `${Math.round(CONFIG.timers.open * CONFIG.timerSpeeds.fast)}+${Math.round(CONFIG.timers.closed * CONFIG.timerSpeeds.fast)} с` },
  { value: 'normal', label: 'Нормально', sub: `${CONFIG.timers.open}+${CONFIG.timers.closed} с` },
  { value: 'slow', label: 'Повільно', sub: `${Math.round(CONFIG.timers.open * CONFIG.timerSpeeds.slow)}+${Math.round(CONFIG.timers.closed * CONFIG.timerSpeeds.slow)} с` },
  { value: 'off', label: 'Без таймера' },
];
const speedScale = () => CONFIG.timerSpeeds[prefSpeed] ?? 1;
const rememberPrefs = () => { try { localStorage.setItem('vabank-speed', prefSpeed); localStorage.setItem('vabank-rounds', prefRounds); localStorage.setItem('vabank-style', prefStyle); localStorage.setItem('vabank-players', prefPlayers); localStorage.setItem('vabank-mode', prefMode); } catch {} };

function gameSetupModal({ withStyle, title, onStart, players = null }) {
  const opts = players ? PLAYER_OPTS[players] : null;
  let pl = opts?.some((o) => o.value === prefPlayers) ? prefPlayers : 2;
  modal(`<h3>${title}</h3>${opts ? '<div class="field"><div class="field-label">Гравців</div><div class="seg" id="m-players"></div></div>' : ''}<div class="field" style="margin-top:12px"><div class="field-label">Режим</div><div class="seg modes" id="m-mode"></div><p class="hint-text" id="m-mode-desc">${MODES[prefMode].desc}</p></div>${withStyle ? '<div class="field" style="margin-top:12px"><div class="field-label">Бот</div><div class="seg modes" id="m-style"></div><p class="hint-text" id="m-style-desc"></p></div>' : ''}<div class="field" style="margin-top:12px" id="m-rounds-field"><div class="field-label">Довжина партії, раундів</div><div class="seg" id="m-rounds"></div></div>${withStyle ? '<div class="field" style="margin-top:12px"><div class="field-label">Швидкість (час на хід)</div><div class="seg" id="m-speed"></div></div>' : ''}`, [
    { label: 'Почати', cls: 'primary', onClick: () => { prefPlayers = pl; rememberPrefs(); onStart({ maxRounds: prefRounds, style: prefStyle, players: pl, mode: prefMode }); } },
    { label: 'Скасувати', cls: 'tertiary' },
  ]);
  if (opts) segmented($('m-players'), opts, pl, (v) => (pl = v));
  const blitzRounds = () => $('m-rounds-field').classList.toggle('hidden', prefMode === 'blitz'); // у бліці завжди 8
  segmented($('m-mode'), modeOptions(), prefMode, (v) => { prefMode = v; $('m-mode-desc').textContent = MODES[v].desc; blitzRounds(); });
  blitzRounds();
  if (withStyle) {
    const desc = () => { const x = PERSONA_BY_ID[prefStyle]; $('m-style-desc').textContent = `${x.name}: ${x.blurb}`; };
    segmented($('m-style'), PERSONAS.map((x) => ({ value: x.id, label: `${x.avatar} ${x.name}`, sub: x.short })), prefStyle, (v) => { prefStyle = v; desc(); });
    desc();
  }
  segmented($('m-rounds'), roundOptions(), prefRounds, (v) => (prefRounds = v));
  if (withStyle) segmented($('m-speed'), speedOptions(), prefSpeed, (v) => { prefSpeed = v; rememberPrefs(); });
}

// ───────── налаштування ─────────
function openSettings(back = null) {
  modal(`<h3>Налаштування</h3>
    <label class="setting">Звук <input type="checkbox" class="switch" id="set-sound" ${isMuted() ? '' : 'checked'}></label>
    <label class="setting col">Гучність <input type="range" id="set-vol" min="0" max="100" value="${Math.round(getVolume() * 100)}" aria-label="Гучність"></label>
    <label class="setting">Мова ботів: 18+ <input type="checkbox" class="switch" id="set-botlang" ${botLang.clean() ? '' : 'checked'}></label>
    <p class="hint-text">Увімкнено — боти лаються, як друзі за картами. Вимкнено — ті самі підколки без матів.</p>
    <label class="setting">Ефекти нахилу <input type="checkbox" class="switch" id="set-tilt" ${tiltEnabled() ? 'checked' : ''}></label>
    <p class="hint-text" id="set-tilt-hint">Світло й блиск карт рухаються, коли нахиляєш телефон. Без нього — за пальцем.</p>
    <p>Версія ${APP_VERSION}</p>`, [
    { label: 'Пройти навчання ще раз', cls: 'secondary', onClick: () => startTutorial() },
    { label: 'Експорт прогресу', cls: 'secondary', onClick: () => openExport() },
    { label: 'Імпорт прогресу', cls: 'secondary', onClick: () => openImport() },
    { label: 'Готово', cls: 'primary', onClick: () => back?.() },
  ]);
  $('set-sound').addEventListener('change', (e) => { setMuted(!e.target.checked); sfx.tap(); });
  $('set-botlang').addEventListener('change', (e) => { botLang.set(!e.target.checked); sfx.tap(); });
  $('set-vol').addEventListener('input', (e) => setVolume(e.target.value / 100));
  $('set-vol').addEventListener('change', () => sfx.chip(3));
  // iOS просить дозвіл на датчики лише з тапу — тому вмикаємо саме тут
  $('set-tilt').addEventListener('change', async (e) => {
    if (!e.target.checked) { disableTilt(); return; }
    const ok = await enableTilt();
    if (!ok) { e.target.checked = false; $('set-tilt-hint').textContent = 'Нахил недоступний: браузер не дав доступу до датчиків руху.'; }
  });
}

function openExport() {
  const code = exportCode(loadProfile());
  modal(`<h3>Код прогресу</h3><p>Збережи цей код (наприклад, у нотатках). Ним можна перенести прогрес на інший пристрій або з вкладки Safari в установлену гру.</p><textarea class="code-box" readonly rows="5">${code}</textarea>`, [
    { label: 'Скопіювати', cls: 'primary', keep: true, onClick: async (el) => { try { await navigator.clipboard.writeText(code); el.textContent = 'Скопійовано ✓'; } catch { el.textContent = 'Виділи текст і скопіюй вручну'; } } },
    { label: 'Готово', cls: 'tertiary' },
  ]);
}

function openImport() {
  modal('<h3>Імпорт прогресу</h3><p>Встав код. Поточний прогрес на цьому пристрої буде замінено.</p><textarea class="code-box" id="import-code" rows="5" placeholder="VB1.…"></textarea><p id="import-err" class="wait-line error"></p>', [
    { label: 'Імпортувати', cls: 'primary', keep: true, onClick: () => {
      const r = importCode($('import-code').value);
      if (!r.ok) { $('import-err').textContent = r.error === 'checksum' ? 'Код пошкоджено (не збігається контрольна сума)' : 'Це не схоже на код прогресу'; return; }
      saveProfile(r.profile);
      closeModal();
      initMeta({ show, modal, toast });
      toast(`Прогрес імпортовано: ★ ${r.profile.points}, джокерів ${Object.keys(r.profile.jokers).length}`);
    } },
    { label: 'Скасувати', cls: 'tertiary' },
  ]);
}

function openGameMenu() {
  modal('<h3>Пауза</h3>', [
    { label: 'Повернутися до гри', cls: 'primary' },
    { label: 'Журнал ходів', onClick: () => game.onLog(game.logLines(40)) },
    { label: 'Правила', onClick: () => showRules(true) },
    { label: 'Налаштування', onClick: () => openSettings(openGameMenu) },
    { label: 'Вийти в меню', cls: 'tertiary danger', onClick: () => confirmLeave() },
  ]);
}

function confirmLeave() {
  const note = session?.mode === 'bot' ? '<p>Партію з ботом можна буде продовжити.</p>'
    : session?.mode?.startsWith('online') ? '<p>Кімнату буде закрито для обох.</p>' : '';
  modal(`<h3>Вийти з партії?</h3>${note}`, [
    { label: 'Залишитися', cls: 'primary' },
    // Онлайн-кімната закривається для обох; збереження лишається лише для випадку, коли iOS вивантажила сторінку.
    { label: 'Вийти', cls: 'tertiary danger', onClick: () => leave(session?.mode !== 'bot') },
  ]);
}

function leave(clearSave = false) {
  session?.leave(clearSave);
  session = null;
  $('curtain').classList.add('hidden');
  game.setOffline(false);
  game.reset();
  refreshResume();
  show('menu');
}

let rulesReturn = 'menu';
function showRules(fromGame = false) {
  rulesReturn = fromGame && session ? 'game' : 'menu';
  const body = $('rules-body');
  body.innerHTML = RULES_HTML;
  const deck = buildDeck();
  for (const ph of body.querySelectorAll('[data-card]')) {
    const c = deck.find((x) => x.id === ph.dataset.card);
    const el = cardEl(c, { trump: ph.dataset.trump, showBoost: !!ph.dataset.trump, small: true });
    ph.replaceWith(el);
  }
  show('rules');
  $('scr-rules').scrollTop = 0;
}
$('rules-back').addEventListener('click', () => { sfx.tap(); show(rulesReturn); });

// ───────── доставка стану в UI ─────────
function deliverToUi(msg, opts = {}) {
  const { view } = msg;
  if (view.phase === 'over') {
    renderEnd(msg, opts.names || ['Ти', 'Суперник']);
    if (current !== 'end' && current !== 'rules') {
      if (current === 'game') game.update(msg, opts);
      setTimeout(() => { if (session && session.lastPhase === 'over') { show('end'); sfx.fanfare(); } }, current === 'game' ? 2200 : 0);
    }
    if (session) session.lastPhase = 'over';
    return;
  }
  if (session) {
    if (session.lastPhase === 'over') { game.reset(); session.awarded = false; session.introShown = false; $('end-rewards').classList.add('hidden'); $('end-moment').classList.add('hidden'); }
    session.lastPhase = view.phase;
  }
  if (['end', 'menu', 'create', 'join'].includes(current)) show('game');
  applySeatMeta(msg, opts);
  applyOnlineNames(msg);
  game.update(msg, opts);
  maybeIntro(msg);
}

const isOnline = () => !!session?.mode?.startsWith('online');

/** Онлайн удвох: нік і титул суперника з meta хоста. */
function applyOnlineNames({ view, meta }) {
  if (!isOnline() || (view.n || 2) > 2 || !meta?.names) return;
  const q = 1 - view.you;
  const nm = meta.names[q] || 'Суперник';
  const label = `${titleIcon(meta.titles?.[q]) ? `${titleIcon(meta.titles[q])} ` : ''}${nm}`;
  const mine = titleIcon(titleOf(loadProfile()));
  const meLabel = mine ? `${mine} Ти` : 'Ти';
  if (game.names[1] !== label || game.names[0] !== meLabel) game.setNames(meLabel, label);
}

/** Перед першим ходом онлайн-партії — великий рахунок зустрічей із кожним живим суперником. */
function maybeIntro({ view, meta }) {
  if (!isOnline() || session.introShown || view.round !== 1 || view.phase !== 'play' || !meta?.pids) return;
  session.introShown = true;
  const prof = loadProfile();
  const rows = [];
  for (let q = 0; q < (view.n || 2); q++) {
    if (q === view.you || !isPid(meta.pids[q]) || meta.pids[q] === prof.pid) continue;
    const sl = scoreLine(prof.rivals, meta.pids[q]);
    const name = meta.names?.[q] || 'Суперник';
    const line = !sl ? 'Перша зустріч!' : sl.streak >= 2 ? `У тебе серія: ${sl.streak} перемоги поспіль` : sl.streak <= -2 ? `${name} виграє ${-sl.streak} поспіль — час відігратися` : `Зіграно партій: ${sl.games}`;
    rows.push({ me: sl?.wins || 0, them: sl?.losses || 0, name, line });
  }
  game.showIntro(rows);
}

/** Анімована картка «Момент партії» на фінальному екрані. */
function renderMoment(view, names) {
  const box = $('end-moment');
  const m = pickMoment(view);
  if (!m) { box.classList.add('hidden'); return; }
  const who = (q) => (q === view.you ? 'Ти' : names[q] || `Гравець ${q + 1}`);
  const R = m.r ? ` · раунд ${m.r}` : '';
  const T = {
    pot: ['💰', 'Найбільший банк', `${who(m.p)}: +${m.amount}`, `${m.reason === 'fold' ? 'без розкриття' : 'на розкритті'}${R}`],
    bluff: ['🎭', 'Блеф партії', `${who(m.p)}: блеф із картою «${m.card ? cardName(m.card) : '?'}»`, `суперники спасували · +${m.amount}${R}`],
    legend: ['👑', 'Легендарний джокер', `${who(m.p)}: «${JOKER_BY_ID[m.joker]?.name || m.joker}»`, `увесь стіл це бачив${R}`],
    don: ['🎲', 'Подвій або нічого', `${who(m.p)}: +${m.amount} на «подвій»`, `вгадано ${m.wins} раз(и) поспіль${R}`],
    tie3: ['🤝', 'Нічия на трьох', `Ніхто не побив обох — банк ${m.amount} у джекпот`, R.slice(3)],
    comeback: ['🔥', 'Відіграш', `${who(m.p)}: з ${m.from} фішок — до перемоги`, 'ніколи не здавайся'],
  }[m.kind];
  if (!T) { box.classList.add('hidden'); return; }
  box.innerHTML = `<span class="ic">${T[0]}</span><span class="eyebrow">Момент партії · ${T[1]}</span><b>${T[2].replace(/</g, '&lt;')}</b><span>${T[3]}</span>`;
  box.classList.remove('hidden');
  // перезапуск анімації при повторному показі
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
}

/** Утрьох: імена й косметика за місцями (з meta хоста або з opts.seatNames). */
function applySeatMeta({ view, meta }, opts = {}) {
  if ((view.n || 2) < 3) return;
  const names = opts.seatNames || (meta?.names || []).map((x, q) => (q === view.you ? 'Ти' : `${titleIcon(meta.titles?.[q]) ? `${titleIcon(meta.titles[q])} ` : ''}${x || `Гравець ${q + 1}`}`));
  game.setSeatNames(names, names[view.you] || 'Ти');
  if (meta?.looks && !opts.noLooks) prepareLooks3(meta.looks, view.you);
}

function renderEnd({ view, meta }, names) {
  if ((view.n || 2) > 2) return renderEnd3({ view, meta }, names);
  if (isOnline() && meta?.names) names = [game.names[0], game.names[1]];
  // Бали й досягнення — один раз за партію (навчання не рахується)
  if (session && !session.awarded && session.mode !== 'tutorial') {
    session.awarded = true;
    const mode = session.mode === 'bot' ? 'bot' : session.mode === 'hotseat' ? 'hotseat' : 'online';
    const box = $('end-rewards');
    box.innerHTML = awardAfterGame(view, mode, meta);
    box.classList.toggle('hidden', !box.innerHTML);
  }
  const me = view.you;
  renderMoment(view, me === 0 ? [names[0], names[1]] : [names[1], names[0]]);
  const st = view.stats;
  const draw = view.winner === 'draw';
  const won = view.winner === me;
  const hotseat = session?.mode === 'hotseat';
  const title = $('end-title');
  title.textContent = draw ? 'Нічия' : hotseat ? `Перемога: ${names[won ? 0 : 1]}` : won ? 'Перемога' : 'Поразка';
  title.className = `end-title ${draw ? 'draw' : !won && !hotseat ? 'lose' : ''}`;
  $('end-crown').classList.toggle('hidden', !(won || hotseat) || draw);
  $('end-score').innerHTML = `${view.me.chips}<span class="sep">:</span>${view.opp.chips}`;
  $('end-sub').textContent = view.endReason === 'bankrupt'
    ? (hotseat ? 'Хтось лишився без фішок' : won ? 'Суперник лишився без фішок' : 'Фішки скінчилися')
    : `Після ${view.maxRounds} раундів`;
  const rows = [
    ['Виграно раундів', st[me].roundsWon, st[1 - me].roundsWon],
    ['Найбільший банк', st[me].biggestPot, st[1 - me].biggestPot],
    ['Вдалі блефи', st[me].bluffs, st[1 - me].bluffs],
    ['«Подвій»: виграно', st[me].donWon, st[1 - me].donWon],
    ['«Подвій»: програно', st[me].donLost, st[1 - me].donLost],
    ['Розвідок', st[me].scouts, st[1 - me].scouts],
  ];
  $('end-stats').innerHTML =
    `<tr><th></th><th>${names[0]}</th><th>${names[1]}</th></tr>` +
    rows.map(([k, a, b], i) => {
      const lowerBetter = i === 4;
      const best = a === b ? '' : (a > b) !== lowerBetter ? 'a' : 'b';
      return `<tr><td>${k}</td><td class="${best === 'a' ? 'best' : ''}">${a}</td><td class="${best === 'b' ? 'best' : ''}">${b}</td></tr>`;
    }).join('');
  const rs = meta.rematch;
  const line = $('rematch-status');
  line.innerHTML = rs.me && !rs.opp ? '<span class="dots"><i></i><i></i><i></i></span> Чекаємо на відповідь суперника' : !rs.me && rs.opp ? `${names[1]} хоче реванш!` : '&nbsp;';
  line.className = `wait-line ${!rs.me && rs.opp ? 'ok' : ''}`;
  $('btn-rematch').disabled = rs.me;
  if (current === 'end' && rs.opp && !rs.me) sfx.pop();
}

/** Кінець партії втрьох: місця, рахунок і статистика трьох. */
function renderEnd3({ view, meta }, namesIn) {
  if (session && !session.awarded && session.mode !== 'tutorial') {
    session.awarded = true;
    const mode = session.mode === 'bot' ? 'bot' : session.mode === 'hotseat' ? 'hotseat' : 'online';
    const box = $('end-rewards');
    box.innerHTML = awardAfterGame(view, mode, meta);
    box.classList.toggle('hidden', !box.innerHTML);
  }
  const me = view.you;
  const n = view.n;
  const names = Array.isArray(namesIn) && namesIn.length === n ? namesIn : (meta?.names || []).map((x, q) => (q === me ? 'Ти' : x || `Гравець ${q + 1}`));
  const order = [me, (me + 1) % n, (me + 2) % n];
  renderMoment(view, names);
  const st = view.stats;
  const place = view.places?.[me];
  const hotseat = session?.mode === 'hotseat';
  const firsts = view.places ? view.places.map((x, q) => (x === 1 ? q : -1)).filter((q) => q >= 0) : [];
  const title = $('end-title');
  title.textContent = view.winner === 'draw' ? 'Нічия за перше місце' : hotseat ? `Перемога: ${names[view.winner]}` : place === 1 ? 'Перемога' : `${place}-ге місце`;
  title.className = `end-title ${view.winner === 'draw' ? 'draw' : !hotseat && place !== 1 ? 'lose' : ''}`;
  $('end-crown').classList.toggle('hidden', !(place === 1 || hotseat) || view.winner === 'draw');
  $('end-score').innerHTML = order.map((q) => `${view.players[q].chips}`).join('<span class="sep">:</span>');
  $('end-sub').textContent = `${firsts.length > 1 ? 'Ділять перше місце' : 'Місця'}: ${[...order].sort((a, b) => view.places[a] - view.places[b]).map((q) => `${view.places[q]}. ${names[q]}`).join(' · ')}`;
  const rows = [
    ['Місце', (q) => view.places[q], true],
    ['Виграно раундів', (q) => st[q].roundsWon],
    ['Найбільший банк', (q) => st[q].biggestPot],
    ['Вдалі блефи', (q) => st[q].bluffs],
    ['«Подвій»: виграно', (q) => st[q].donWon],
    ['Вибув у раунді', (q) => st[q].outRound ?? '—', true],
  ];
  $('end-stats').innerHTML = `<tr><th></th>${order.map((q) => `<th>${names[q]}</th>`).join('')}</tr>` +
    rows.map(([k, f, low]) => {
      const vals = order.map(f);
      const nums = vals.filter((x) => typeof x === 'number');
      const best = nums.length ? (low ? Math.min(...nums) : Math.max(...nums)) : null;
      const uniq = nums.filter((x) => x === best).length === 1;
      return `<tr><td>${k}</td>${vals.map((x) => `<td class="${uniq && x === best ? 'best' : ''}">${x}</td>`).join('')}</tr>`;
    }).join('');
  const rs = meta.rematch;
  const ready = (rs.all || []).filter(Boolean).length;
  const line = $('rematch-status');
  line.innerHTML = ready && !rs.me ? `Реванш: готові ${ready} з ${n}` : rs.me ? `<span class="dots"><i></i><i></i><i></i></span> Реванш: готові ${ready} з ${n}` : '&nbsp;';
  line.className = `wait-line ${!rs.me && rs.opp ? 'ok' : ''}`;
  $('btn-rematch').disabled = rs.me;
  if (current === 'end' && rs.opp && !rs.me) sfx.pop();
}

$('btn-rematch').addEventListener('click', () => { sfx.tap(); session?.rematch(); });
$('btn-end-menu').addEventListener('click', () => { sfx.tap(); leave(true); });

// ───────── проти бота ─────────
/** Персонажі для ботів: перший — обраний (або збережений), решта — випадкові інші. */
function pickPersonas(count, first = null) {
  const out = [];
  if (first && PERSONA_BY_ID[first]) out.push(PERSONA_BY_ID[first]);
  const rest = PERSONAS.filter((x) => !out.includes(x));
  while (out.length < count && rest.length) out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
  return out;
}

function startBot(resume = false, opts = {}) {
  const saved = resume && GameHost.load(BOT_KEY);
  const style = (saved && saved.style) || opts.style || 'vitok';
  const players = (saved?.state?.players?.length || opts.players) === 3 ? 3 : 2;
  const prof = loadProfile();
  // Збереження старої версії тримало одного бота як об'єкт
  const savedLoad = saved?.botLoadout ? [].concat(saved.botLoadout) : null;
  const loads = savedLoad && savedLoad.length === players - 1 ? savedLoad : Array.from({ length: players - 1 }, () => botLoadout());
  const host = new GameHost({ timers: true, persistKey: BOT_KEY, extra: { style, botLoadout: players === 2 ? loads[0] : loads }, gameConfig: { maxRounds: opts.maxRounds || CONFIG.maxRounds, timerScale: speedScale() }, gameOpts: { players, mode: (saved?.state?.cfg?.mode) || opts.mode || 'classic', jokerSets: [prof.set, ...loads.map((l) => l.set)] } });
  // персонажі: збережені, або обраний + випадкові (старі збереження зі стилем замість персонажа — випадкові)
  const pers = saved?.personas?.length === players - 1 ? saved.personas.map((id) => PERSONA_BY_ID[id] || PERSONAS[0]) : pickPersonas(players - 1, style);
  host.extra = { ...host.extra, personas: pers.map((x) => x.id) };
  const names = ['Ти', ...pers.map((x) => x.name)];
  const bots = pers.map((x, i) => new BotSeat(host, i + 1, Math.random, x.style, x.id));
  host.names = names.slice();
  host.avatars = [null, ...pers.map((x) => x.avatar)];
  host.looks = [null, ...loads.map((l) => l.look)];
  session = {
    mode: 'bot',
    host,
    send: (a) => host.dispatch(0, a),
    react: (e) => host.relayReaction(0, e),
    rematch: () => host.dispatch(0, { type: 'rematch' }),
    leave: (clear) => {
      for (const b of bots) b.stop();
      host.stop();
      if (clear || host.state?.phase === 'over') GameHost.clear(BOT_KEY);
    },
  };
  game.reset();
  game.setNames(names[0], names[1]);
  lastLooksKey = '';
  if (players === 2) prepareLooks(loads[0].look);
  $('btn-react').classList.remove('hidden');
  host.attach(0, { deliver: (m) => deliverToUi(m, { names }), reaction: (e, from) => game.showReaction(e, false, from), say: (key, from) => game.showBotLine(from, key) });
  bots.forEach((b, i) => host.attach(i + 1, b));
  if (saved && saved.state?.phase !== 'over') {
    if (!host.restore(saved)) {
      // збереження старої версії, яке не вдалося прочитати: не висимо в меню, а починаємо нову партію
      GameHost.clear(BOT_KEY);
      toast('Збережену партію не вдалося відкрити — починаємо нову', 4000);
      host.start();
    }
  } else host.start();
  host.setHidden(document.hidden);
}

// ───────── навчання: одна роздача проти сценарного бота ─────────
function startTutorial() {
  session?.leave?.(false);
  closeModal();
  const all = buildDeck();
  // Учень: три сімки (Трійка) + дрібниця; Учитель кладе Стріт 4–6 з відкритою 6.
  const ids = ['f7', 'w7', 's7', 'w2', 's3', 'f9', 'w4', 'f5', 's6', 'w9', 'f2', 'knife'];
  const deck = [...ids.map((id) => all.find((c) => c.id === id)), ...all.filter((c) => !ids.includes(c.id))];
  const host = new GameHost({ timers: false, gameOpts: { deck, trumps: ['fire'], firstToAct: 1 } });
  const names = ['Ти', 'Учитель'];
  let t1 = null;
  // Сценарний суперник: кладе Стріт 4–6 (відкрита 6), піднімає на 5, на все інше погоджується.
  const coachBot = {
    deliver: ({ view }) => {
      clearTimeout(t1);
      if (view.round > 1 || !view.legal.length) return;
      let a = null;
      if (view.phase === 'play' && view.legal.some((x) => x.type === 'playOpen')) a = { type: 'playOpen', cardId: 's6' };
      else if (view.phase === 'play' && view.legal.some((x) => x.type === 'playClosed')) a = { type: 'playClosed', cards: ['w4', 'f5'] };
      else if (view.phase === 'scout') a = { type: 'skipScout' };
      else if (view.phase === 'bet') a = view.bet.toCall ? { type: 'call' } : view.bet.raises === 0 ? { type: 'raise', amount: 5 } : { type: 'check' };
      else if (view.phase === 'result') a = view.legal.find((x) => x.type === 'ready');
      if (a) t1 = setTimeout(() => host.dispatch(1, a), view.phase === 'result' ? 600 : 900);
    },
  };
  const finish = () => {
    tutorial.markDone();
    host.stop();
    session = null;
    game.reset();
    modal('<h3>Готово!</h3><p>Ти знаєш основи: комбінації з 3 карт, відкрита карта, торги, розкриття і «Подвій або нічого». Шпаргалка — кнопка «Комбінації» на столі, правила — в меню.</p>', [
      { label: 'Грати з ботом', cls: 'primary', onClick: () => askBot() },
      { label: 'Грати з другом', onClick: () => openFriend() },
      { label: 'У меню', cls: 'tertiary', onClick: () => show('menu') },
    ]);
  };
  const trio = ['f7', 'w7', 's7'];
  const coachFor = (v) => {
    const L = v.legal;
    // покроково: спершу одна відкрита сімка, потім — бачачи відкриту суперника — дві інші сімки закритими
    if (v.phase === 'play' && L.some((a) => a.type === 'playOpen')) return { ...TUTORIAL.pick, spot: 'cards:f7' };
    if (v.phase === 'play' && L.some((a) => a.type === 'playClosed')) {
      const rest = trio.filter((id) => v.me.hand.some((c) => c.id === id));
      return { ...TUTORIAL.open, spot: `cards:${rest.join(',')}` };
    }
    if (v.phase === 'scout' && L.length) return { ...TUTORIAL.scout, spot: 'btn:skipScout' };
    if (v.phase === 'bet' && L.length) return { ...TUTORIAL.bet, spot: L.some((a) => a.type === 'call') ? 'btn:call' : 'btn:check' };
    if (v.phase === 'result' && v.result.don?.pending && v.result.winner === v.you) return { ...TUTORIAL.don };
    if (v.phase === 'result' && L.some((a) => a.type === 'donStart')) return { ...TUTORIAL.result, spot: 'btn:donStart' };
    return null;
  };
  // підказка міняється, щойно вибрано три сімки (без нового стану з рушія)
  game.onPick = () => { const v = game.view; if (v && session?.mode === 'tutorial') { game.coach = coachFor(v); game.renderCoach(); } };
  session = {
    mode: 'tutorial',
    host,
    send: (a) => host.dispatch(0, a),
    react: () => {},
    rematch: () => {},
    leave: () => { clearTimeout(t1); host.stop(); game.onPick = null; },
  };
  game.reset();
  game.setNames(names[0], names[1]);
  prepareLooks(null);
  $('btn-react').classList.add('hidden');
  host.attach(0, {
    deliver: (m) => {
      if (m.view.round > 1 || m.view.phase === 'over') { finish(); return; }
      deliverToUi(m, { names, coach: coachFor(m.view), onCoachSkip: () => { tutorial.markDone(); leave(); } });
    },
  });
  host.attach(1, coachBot);
  host.start();
}

/** Перша партія: запропонувати навчання. */
function maybeTutorial(next) {
  if (tutorial.done()) return next();
  modal('<h3>Перша гра?</h3><p>Коротке навчання — одна роздача проти бота з підказками, близько хвилини.</p>', [
    { label: 'Пройти навчання', cls: 'primary', onClick: () => startTutorial() },
    { label: 'Пропустити', cls: 'tertiary', onClick: () => { tutorial.markDone(); next(); } },
  ]);
}

function askBot() {
  const fresh = () => gameSetupModal({ withStyle: true, players: 'bot', title: 'Гра проти бота', onStart: (o) => { GameHost.clear(BOT_KEY); startBot(false, o); } });
  const sv = GameHost.load(BOT_KEY);
  if (sv?.state && !upgradeState(sv.state)) GameHost.clear(BOT_KEY);
  if (GameHost.load(BOT_KEY)?.state?.phase && GameHost.load(BOT_KEY).state.phase !== 'over') {
    modal('<h3>Є незавершена партія</h3><p>Продовжити її чи почати нову?</p>', [
      { label: 'Продовжити', cls: 'primary', onClick: () => startBot(true) },
      { label: 'Нова партія', onClick: () => setTimeout(fresh, 0) },
    ]);
  } else fresh();
}

// ───────── на одному телефоні ─────────
function startHotseat(opts = {}) {
  const prof = prepareLooks(null);
  const withBot = opts.players === '2b';
  const players = opts.players === 3 || withBot ? 3 : 2;
  const hsBot = pickPersonas(1)[0];
  const host = new GameHost({ timers: false, gameConfig: { maxRounds: opts.maxRounds || CONFIG.maxRounds }, gameOpts: { players, mode: opts.mode || 'classic', jokerSets: Array(players).fill(prof.set) } });
  const names = players === 2 ? ['Гравець 1', 'Гравець 2'] : withBot ? ['Гравець 1', 'Гравець 2', hsBot.name] : ['Гравець 1', 'Гравець 2', 'Гравець 3'];
  const humans = Array.from({ length: players }, (_, q) => q).filter((q) => !(withBot && q === 2));
  const bot = withBot ? new BotSeat(host, 2, Math.random, hsBot.style, hsBot.id) : null;
  if (withBot) host.avatars[2] = hsBot.avatar;
  if (bot) bot.reaction = () => {};
  host.names = names.slice();
  const msgs = Array(players).fill(null);
  let shown = null;
  let pendingActor = null;
  const s = {
    mode: 'hotseat',
    host,
    send: (a) => host.dispatch(shown, a),
    react: () => {},
    rematch: () => { for (const q of humans) host.dispatch(q, { type: 'rematch' }); },
    leave: () => { bot?.stop(); host.stop(); },
  };
  session = s;
  game.reset();
  lastLooksKey = '';
  $('btn-react').classList.add('hidden');

  // Хто з людей зараз має ходити (за потреби — передати телефон)
  const actorFor = () => {
    const v = msgs[humans[0]].view;
    const vs = msgs.map((m) => m?.view);
    const live = humans.filter((q) => !vs[q].me.out);
    switch (v.phase) {
      // покроково: на кроці «відкрита» черга тих, хто ще не поклав відкриту; далі — закриті
      case 'play': return live.find((q) => vs[q].legal.some((x) => ['play', 'playSet', 'playOpen', 'playClosed'].includes(x.type))) ?? null;
      case 'scout': return live.find((q) => !vs[q].me.scoutDecided) ?? null;
      case 'bet': return humans.includes(v.bet.toAct) ? v.bet.toAct : null;
      case 'result': {
        const w = v.result.winner;
        if (w !== null && live.includes(w) && !vs[w].me.ready) return w;
        for (const o of live) {
          if (vs[o].me.ready) continue;
          if (vs[o].legal.some((a) => a.type === 'show')) return o;
          setTimeout(() => host.dispatch(o, { type: 'ready' }), 0);
        }
        return null;
      }
    }
    return null;
  };

  const render = () => {
    if (msgs.some((m, q) => humans.includes(q) && !m)) return;
    const v = msgs[humans[0]].view;
    if (v.phase === 'over') {
      $('curtain').classList.add('hidden');
      const m = msgs[humans[0]];
      deliverToUi({ view: m.view, meta: { ...m.meta, rematch: { me: false, opp: false, all: [] } } }, { names: players === 2 ? names : names.map((x, q) => (q === m.view.you ? x : x)) });
      return;
    }
    const actor = actorFor();
    if (actor === null || actor < 0) {
      // Хід бота або всі готові: показуємо поточному гравцеві, що відбувається
      if (shown !== null && players > 2 && pendingActor === null) deliverToUi(msgs[shown], { names: [names[shown], ''], seatNames: names, conceal: v.phase === 'result' });
      return;
    }
    if (shown === null || actor !== shown) {
      if (pendingActor === actor) return;
      pendingActor = actor;
      $('curtain-text').textContent = `Хід: ${names[actor]}`;
      $('curtain').classList.remove('hidden');
      if (current !== 'game') show('game');
      return;
    }
    if (players === 2) deliverToUi(msgs[shown], { names: [names[shown], names[1 - shown]], conceal: v.phase === 'result' });
    else deliverToUi(msgs[shown], { names: [names[shown], ''], seatNames: names, conceal: v.phase === 'result' });
  };
  s.reveal = () => {
    if (pendingActor === null) return;
    shown = pendingActor;
    pendingActor = null;
    $('curtain').classList.add('hidden');
    game.reset();
    game.setNames(names[shown], players === 2 ? names[1 - shown] : '');
    render();
  };
  for (let q = 0; q < players; q++) {
    if (bot && q === 2) { host.attach(2, bot); continue; }
    host.attach(q, { deliver: (m) => { msgs[q] = m; queueMicrotask(render); }, say: (key, from) => { if (q === humans[0]) game.showBotLine(from, key); } });
  }
  host.start();
}
$('curtain-btn').addEventListener('click', () => { sfx.tap(); session?.reveal?.(); });

// ───────── онлайн ─────────
function setLine(id, text, kind = 'wait') {
  const el = $(id);
  el.className = `wait-line ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  el.innerHTML = `${kind === 'wait' ? '<span class="dots"><i></i><i></i><i></i></span>' : ''}<span>${text}</span>`;
}

async function startCreate(resumeSave = null) {
  show('create');
  $('room-code').textContent = resumeSave?.code || '····';
  setLine('create-status', 'Відкриваю кімнату…');
  $('btn-share').disabled = true;
  const names = ['Ти', 'Суперник'];
  const gameConfig = { maxRounds: prefRounds, timerScale: speedScale() };
  let players = resumeSave?.players === 3 ? 3 : prefPlayers === 3 ? 3 : 2;
  segmented($('create-rounds'), roundOptions(), prefRounds, (v) => { gameConfig.maxRounds = v; prefRounds = v; rememberPrefs(); });
  // хост обирає швидкість, доки партія не почалась
  segmented($('create-speed'), speedOptions(), prefSpeed, (v) => { prefSpeed = v; rememberPrefs(); gameConfig.timerScale = speedScale(); if (session?.host && !session.host.state) session.host.gameConfig = { ...session.host.gameConfig, timerScale: gameConfig.timerScale }; });
  $('create-speed-field').classList.toggle('hidden', !!resumeSave);
  $('create-rounds-field').classList.toggle('hidden', !!resumeSave);
  $('create-players-field').classList.toggle('hidden', !!resumeSave);
  $('create-mode-field').classList.toggle('hidden', !!resumeSave);
  let mode = prefMode;
  segmented($('create-mode'), modeOptions(), mode, (v) => {
    mode = v; prefMode = v; rememberPrefs();
    $('create-mode-desc').textContent = MODES[v].desc;
    // режим можна змінити, доки партія не почалась
    if (session?.host && !session.host.state) session.host.gameOpts = { ...session.host.gameOpts, mode: v };
  });
  $('create-mode-desc').textContent = MODES[mode].desc;
  game.reset();
  game.setNames(...names);
  lastLooksKey = '';
  $('btn-react').classList.remove('hidden');
  let opening = null;
  const open = async () => {
    try {
      session?.leave?.(true);
      session = null;
      $('room-code').textContent = resumeSave?.code || '····';
      $('btn-share').disabled = true;
      setLine('create-status', 'Відкриваю кімнату…');
      renderSeatList([], players);
      const prof = prepareLooks(null);
      opening = createOnlineHost({
        resume: resumeSave,
        players,
        mode,
        gameConfig,
        profile: { set: prof.set, look: publicLook(prof), name: prof.nick || null, pid: prof.pid, title: titleOf(prof) },
        botSet: () => botLoadout().set,
        botLook: () => botLoadout().look,
        onOppLook: (look) => { if (players === 2) prepareLooks(look); },
        onLobby: (seats) => renderSeatList(seats, players),
        onCode: (code) => { $('room-code').textContent = code; $('btn-share').disabled = false; setLine('create-status', players === 3 ? 'Чекаємо на друзів' : 'Чекаємо на друга'); },
        onStatus: (st) => {
          if (st.error) setLine('create-status', st.error, 'error');
          if (st.versionMismatch) { toast(st.versionMismatch, 7000, 'error'); setLine('create-status', st.versionMismatch, 'error'); }
          if (st.left) toast(players === 3 ? 'Гість вийшов з кімнати' : 'Суперник вийшов з кімнати', 3500);
          const h = session?.host;
          if (st.proxy) toast(`${h?.names?.[st.proxy] || 'Гравець'} довго не повертається — поки за нього грає бот`, 4500);
          const off = st.connected ? st.connected.map((c, q) => (!c ? q : -1)).filter((q) => q > 0) : [];
          const away = h ? h.away.map((a, q) => (a ? q : -1)).filter((q) => q > 0) : [];
          const who = (q) => (players === 3 ? h?.names?.[q] || 'Гість' : 'Суперник');
          const text = off.length ? `${who(off[0])} не на зв'язку — пауза` : away.length ? `${who(away[0])} згорнув гру — пауза` : '';
          game.setOffline(st.started && !!text, text);
          if (st.started && !st.oppConnected && current === 'create') show('game');
        },
        onMessage: (m) => deliverToUi(m, { names }),
        onReaction: (e, from) => game.showReaction(e, false, from),
        onSay: (key, from) => game.showBotLine(from, key),
      });
      session = await opening;
    } catch (e) {
      setLine('create-status', `Не вдалося відкрити кімнату: ${e.message}`, 'error');
    }
  };
  segmented($('create-players'), [{ value: 2, label: 'Двоє' }, { value: 3, label: 'Троє', sub: 'можна з ботом' }], players, (v) => { players = v; prefPlayers = v; rememberPrefs(); open(); });
  await open();
}

/** Лобі: хто за столом і кнопка «посадити бота». */
function renderSeatList(seats, players) {
  const list = $('seat-list');
  const show3 = players === 3;
  list.classList.toggle('hidden', !show3);
  const free = seats.some((x) => x.kind === 'free');
  $('btn-add-bot').classList.toggle('hidden', !show3 || !free || !!session?.host?.state);
  if (!show3) return;
  list.innerHTML = seats.map((x) => {
    const st = x.kind === 'host' ? 'ти' : x.kind === 'bot' ? 'бот готовий' : x.kind === 'free' ? 'вільне місце' : x.connected ? 'на місці' : "не на зв'язку";
    const ok = x.kind === 'host' || x.kind === 'bot' || (x.kind === 'guest' && x.connected);
    const nm = x.kind === 'free' ? `Місце ${x.seat + 1}` : x.kind === 'host' ? 'Ти' : x.name || `Гість ${x.seat}`;
    const sl = x.kind === 'guest' && x.pid ? scoreLine(loadProfile().rivals, x.pid) : null;
    return `<li class="${ok ? 'ok' : ''}"><span>${x.kind === 'bot' ? '🤖' : x.kind === 'free' ? '◌' : '👤'}</span><b>${nm.replace(/</g, '&lt;')}${sl ? ` <span class="st">ти ${sl.wins} : ${sl.losses}</span>` : x.kind === 'guest' ? ' <span class="st">перша зустріч</span>' : ''}</b><span class="st">${st}</span></li>`;
  }).join('');
}
$('btn-add-bot').addEventListener('click', () => { sfx.tap(); session?.addBot?.(); });

async function startJoin(code, resumeSave = null) {
  show('join');
  joinInput.value = code;
  setLine('join-status', `Приєднуюся до кімнати ${code}…`);
  const names = ['Ти', 'Суперник'];
  game.reset();
  game.setNames(...names);
  $('btn-react').classList.remove('hidden');
  try {
    const prof = prepareLooks(null);
    session = await joinOnline({
      code,
      resume: resumeSave,
      profile: { set: prof.set, look: publicLook(prof), name: prof.nick || null, pid: prof.pid, title: titleOf(prof) },
      onOppLook: (look) => prepareLooks(look),
      onStatus: (st) => {
        if (st.error) { setLine('join-status', st.error, 'error'); if (current === 'game') toast(st.error, 3000, 'error'); }
        if (st.joined) setLine('join-status', 'Підключено!', 'ok');
        game.setOffline(st.joined && !st.hostConnected, game.view && game.view.n > 2 ? "Господар не на зв'язку — пауза, чекаємо" : "Суперник не на зв'язку — пауза, чекаємо");
      },
      onMessage: (m) => deliverToUi(m, { names }),
      onReaction: (e, from) => game.showReaction(e, false, from),
      onSay: (key, from) => game.showBotLine(from, key),
      onFatal: (text) => { leave(true); toast(text, 8000, 'error'); },
      onReject: (code) => { if (!['already-played', 'wrong-phase', 'not-your-turn'].includes(code)) toast('Хід не прийнято — обери ще раз', 2500, 'error'); },
    });
  } catch (e) {
    setLine('join-status', e.message, 'error');
    if (current === 'game') leave();
  }
}

const joinInput = $('join-code');
joinInput.addEventListener('input', () => {
  const allowed = new Set(ROOM_ALPHABET);
  joinInput.value = [...joinInput.value.toUpperCase()].filter((c) => allowed.has(c)).join('').slice(0, 4);
  $('join-status').innerHTML = '&nbsp;';
});
$('btn-join').addEventListener('click', () => {
  sfx.tap();
  const code = joinInput.value.trim().toUpperCase();
  if (code.length !== 4) { setLine('join-status', 'Код — це 4 літери, наприклад KXRT', 'error'); return; }
  joinInput.blur();
  startJoin(code);
});
joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

$('btn-share').addEventListener('click', async () => {
  const code = $('room-code').textContent;
  const url = `${location.origin}${location.pathname}?room=${code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Ва-банк', text: `Заходь у мою кімнату «Ва-банк» (код ${code})`, url });
    else { await navigator.clipboard.writeText(url); toast('Посилання скопійовано'); }
  } catch {}
});

function openFriend() {
  maybeTutorial(() => askNick(() => modal('<h3>Грати з другом</h3><p>Кожен — на своєму телефоні.</p>', [
    { label: 'Створити кімнату', cls: 'primary', onClick: () => { clearHostSave(); clearGuestSave(); startCreate(); } },
    { label: 'Приєднатися за кодом', onClick: () => { show('join'); setTimeout(() => joinInput.focus(), 300); } },
    { label: 'Скасувати', cls: 'tertiary' },
  ])));
}

// ───────── меню ─────────
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  sfx.tap();
  if (go === 'menu') { if (current === 'create' || current === 'join') leave(true); else show('menu'); }
  else if (go === 'rules') showRules();
  else if (go === 'settings') openSettings();
  else if (go === 'tutorial') startTutorial();
  else if (go === 'collection') openCollection();
  else if (go === 'rivals') openRivals();
  else if (go === 'daymode') { prefMode = modeOfDay(); rememberPrefs(); toast(`${MODES[prefMode].icon} ${MODES[prefMode].name}: ${MODES[prefMode].desc}. Обрано для наступної партії`, 3200); }
  else if (go === 'shop') openShop();
  else if (go === 'slot') openSlot();
  else if (go === 'friend') openFriend();
  else if (go === 'bot') maybeTutorial(askBot);
  else if (go === 'hotseat') maybeTutorial(() => gameSetupModal({ withStyle: false, players: 'hotseat', title: 'На одному телефоні', onStart: (o) => startHotseat(o) }));
});

function refreshResume() {
  const btn = $('btn-resume');
  // збереження, які не прочитати (зламані), не пропонуємо — і прибираємо
  const ok = (sv) => sv && sv.state && upgradeState(sv.state);
  let h = loadHostSave();
  if (h?.state && !ok(h)) { clearHostSave(); h = null; }
  const g = loadGuestSave();
  let b = GameHost.load(BOT_KEY);
  if (b?.state && !ok(b)) { GameHost.clear(BOT_KEY); b = null; }
  if (h && h.state?.phase !== 'over') { btn.textContent = `↩ Повернутися в партію (${h.code})`; btn.onclick = () => startCreate(h); }
  else if (g && g.phase !== 'over') { btn.textContent = `↩ Повернутися в партію (${g.code})`; btn.onclick = () => startJoin(g.code, g); }
  else if (b && b.state?.phase !== 'over') { btn.textContent = 'Продовжити партію з ботом'; btn.onclick = () => startBot(true); }
  else { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
}

// Пауза таймерів, коли застосунок згорнуто (хост і бот)
document.addEventListener('visibilitychange', () => {
  session?.host?.setHidden?.(document.hidden);
  session?.onVisibility?.(document.hidden);
});
window.addEventListener('pageshow', () => session?.onVisibility?.(false));
// Мережа повернулась (LTE ↔ Wi-Fi) — не чекаємо серцебиття
window.addEventListener('online', () => session?.onVisibility?.(false));

/** Застосунок перезапустився посеред онлайн-партії (iOS вивантажила сторінку) — повертаємось автоматично. */
function autoResume() {
  const fresh = (t) => t && Date.now() - t < CONFIG.net.resumeWindowSec * 1000;
  const h = loadHostSave();
  if (h?.state && h.state.phase !== 'over' && fresh(h.savedAt) && upgradeState(h.state)) { startCreate(h); return true; }
  const g = loadGuestSave();
  if (g?.code && g.phase !== 'over' && fresh(g.at)) { startJoin(g.code, g); return true; }
  return false;
}

// Запрошення ?room=ABCD (і старе #join=ABCD) — одразу приєднуємось
function boot() {
  initMeta({ show, modal, toast });
  // «Ефекти нахилу», якщо гравець їх увімкнув раніше: на Android — одразу, на iOS — з першого тапу (дозвіл уже дано)
  if (tiltWanted() && typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') enableTilt();
    else document.addEventListener('click', () => { if (!tiltEnabled()) enableTilt(); }, { once: true });
  }
  renderDayMode();
  refreshResume();
  const q = new URLSearchParams(location.search).get('room') || (location.hash.match(/join=([A-Z]{4})/i) || [])[1];
  const code = q && q.toUpperCase();
  const valid = code && code.length === 4 && [...code].every((c) => ROOM_ALPHABET.includes(c));
  if (q) history.replaceState(null, '', location.pathname + (location.search.includes('debug') ? '?debug' : ''));
  if (valid) startJoin(code);
  else if (!autoResume()) show('menu');
  window.__vbBooted = true; // гра стартувала (див. страховку в index.html)
  const sp = $('splash');
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 400); }, 350);
}
boot();

// Налагодження/скриншоти: ?debug відкриває доступ до рендера (на гру не впливає)
if (new URLSearchParams(location.search).has('debug')) {
  window.__vb = { game, deliverToUi, renderEnd, openRivals, renderMoment, show, openSettings, gameSetupModal, showRules, toast, modal, startTutorial, openFriend, setLine, openCollection, openShop, openSlot, prepareLooks, saveProfile, loadProfile, initMeta, awardAfterGame };
}

$('app-version').textContent = `версія ${APP_VERSION}`;

// ───────── оновлення: новий service worker → банер «Оновити» ─────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => {
      if (!worker || !navigator.serviceWorker.controller) return; // перше встановлення — без банера
      $('update-bar').classList.remove('hidden');
      $('btn-update').onclick = () => {
        $('btn-update').disabled = true;
        worker.postMessage({ type: 'skipWaiting' });
      };
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}
