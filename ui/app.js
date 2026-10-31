// Точка входу: екрани, режими гри, зв'язування хоста/мережі з UI.
import { GameHost, BotSeat } from '../net/host.js';
import { GameScreen } from './game.js';
import { cardEl } from './cardview.js';
import { unlockAudio, sfx, isMuted, setMuted, getVolume, setVolume } from './sound.js';
import { RULES_HTML, TUTORIAL } from './text.js';
import { tutorial } from './settings.js';
import { CONFIG, APP_VERSION } from '../config.js';
import { BOT_STYLES } from '../game/bot.js';
import { buildDeck } from '../game/cards.js';
import { createOnlineHost, joinOnline, ROOM_ALPHABET, loadGuestSave, clearGuestSave, loadHostSave, clearHostSave } from '../net/online.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'create', 'join', 'rules', 'game', 'end'];
const BOT_KEY = 'vabank-bot';

let session = null;
let current = 'menu';

// ───────── загальне ─────────
function show(name) {
  if (current === name && !$(`scr-${name}`).classList.contains('hidden')) return;
  current = name;
  for (const s of SCREENS) $(`scr-${s}`).classList.toggle('hidden', s !== name);
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
  if (!e.target.closest('.scrollable, .log-list')) e.preventDefault();
}, { passive: false });

const game = new GameScreen({
  onAction: (a) => session?.send(a),
  onReaction: (e) => session?.react(e),
  onMenu: () => openGameMenu(),
  onLog: (lines) => modal(`<h3>Журнал</h3><div class="log-list">${lines.map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`).join('') || '<div>Поки порожньо</div>'}</div>`, [{ label: 'Закрити' }]),
});

// ───────── вибір параметрів партії ─────────
const STYLE_INFO = {
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

const roundOptions = () => CONFIG.roundOptions.map((r) => ({ value: r, label: `${r}`, sub: r === 8 ? 'швидка' : r === 16 ? 'довга' : 'звичайна' }));
let prefRounds = CONFIG.maxRounds;
let prefStyle = 'aggressive';
try { prefRounds = Number(localStorage.getItem('vabank-rounds')) || prefRounds; prefStyle = localStorage.getItem('vabank-style') || prefStyle; } catch {}
const rememberPrefs = () => { try { localStorage.setItem('vabank-rounds', prefRounds); localStorage.setItem('vabank-style', prefStyle); } catch {} };

function gameSetupModal({ withStyle, title, onStart }) {
  modal(`<h3>${title}</h3>${withStyle ? '<div class="field"><div class="field-label">Суперник</div><div class="seg" id="m-style"></div></div>' : ''}<div class="field" style="margin-top:12px"><div class="field-label">Довжина партії, раундів</div><div class="seg" id="m-rounds"></div></div>`, [
    { label: 'Почати', cls: 'primary', onClick: () => { rememberPrefs(); onStart({ maxRounds: prefRounds, style: prefStyle }); } },
    { label: 'Скасувати', cls: 'tertiary' },
  ]);
  if (withStyle) segmented($('m-style'), BOT_STYLES.map((k) => ({ value: k, label: STYLE_INFO[k].name, sub: STYLE_INFO[k].sub })), prefStyle, (v) => (prefStyle = v));
  segmented($('m-rounds'), roundOptions(), prefRounds, (v) => (prefRounds = v));
}

// ───────── налаштування ─────────
function openSettings(back = null) {
  modal(`<h3>Налаштування</h3>
    <label class="setting">Звук <input type="checkbox" class="switch" id="set-sound" ${isMuted() ? '' : 'checked'}></label>
    <label class="setting col">Гучність <input type="range" id="set-vol" min="0" max="100" value="${Math.round(getVolume() * 100)}" aria-label="Гучність"></label>
    <p>Версія ${APP_VERSION}</p>`, [
    { label: 'Пройти навчання ще раз', cls: 'secondary', onClick: () => startTutorial() },
    { label: 'Готово', cls: 'primary', onClick: () => back?.() },
  ]);
  $('set-sound').addEventListener('change', (e) => { setMuted(!e.target.checked); sfx.tap(); });
  $('set-vol').addEventListener('input', (e) => setVolume(e.target.value / 100));
  $('set-vol').addEventListener('change', () => sfx.chip(3));
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
    if (session.lastPhase === 'over') game.reset();
    session.lastPhase = view.phase;
  }
  if (['end', 'menu', 'create', 'join'].includes(current)) show('game');
  game.update(msg, opts);
}

function renderEnd({ view, meta }, names) {
  const me = view.you;
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

$('btn-rematch').addEventListener('click', () => { sfx.tap(); session?.rematch(); });
$('btn-end-menu').addEventListener('click', () => { sfx.tap(); leave(true); });

// ───────── проти бота ─────────
function startBot(resume = false, opts = {}) {
  const saved = resume && GameHost.load(BOT_KEY);
  const style = (saved && saved.style) || opts.style || 'aggressive';
  const host = new GameHost({ timers: true, persistKey: BOT_KEY, extra: { style }, gameConfig: { maxRounds: opts.maxRounds || CONFIG.maxRounds } });
  const names = ['Ти', `Бот · ${STYLE_INFO[style].name}`];
  const bot = new BotSeat(host, 1, Math.random, style);
  session = {
    mode: 'bot',
    host,
    send: (a) => host.dispatch(0, a),
    react: (e) => host.relayReaction(0, e),
    rematch: () => host.dispatch(0, { type: 'rematch' }),
    leave: (clear) => {
      bot.stop();
      host.stop();
      if (clear || host.state?.phase === 'over') GameHost.clear(BOT_KEY);
    },
  };
  game.reset();
  game.setNames(names[0], names[1]);
  $('btn-react').classList.remove('hidden');
  host.attach(0, { deliver: (m) => deliverToUi(m, { names }), reaction: (e) => game.showReaction(e, false) });
  host.attach(1, bot);
  if (saved && saved.state?.phase !== 'over') host.restore(saved);
  else host.start();
  host.setHidden(document.hidden);
}

// ───────── навчання: одна роздача проти сценарного бота ─────────
function startTutorial() {
  session?.leave?.(false);
  closeModal();
  const all = buildDeck();
  const ids = ['f7', 'w3', 's2', 'w9', 's8', 'f3', 'w5', 'knife', 'w4', 's10'];
  const deck = [...ids.map((id) => all.find((c) => c.id === id)), ...all.filter((c) => !ids.includes(c.id))];
  const host = new GameHost({ timers: false, gameOpts: { deck, trumps: ['fire'], firstToAct: 1 } });
  const names = ['Ти', 'Учитель'];
  let t1 = null;
  // Сценарний суперник: кладе 8 Каменю, піднімає на 5, на все інше погоджується.
  const coachBot = {
    deliver: ({ view }) => {
      clearTimeout(t1);
      if (view.round > 1 || !view.legal.length) return;
      let a = null;
      if (view.phase === 'play') a = { type: 'play', cardId: 's8' };
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
    modal('<h3>Готово!</h3><p>Ти знаєш основи: козир, торги, розкриття і «Подвій або нічого». Правила — в меню, якщо щось забудеш.</p>', [
      { label: 'Грати з ботом', cls: 'primary', onClick: () => askBot() },
      { label: 'Грати з другом', onClick: () => openFriend() },
      { label: 'У меню', cls: 'tertiary', onClick: () => show('menu') },
    ]);
  };
  const coachFor = (v) => {
    const L = v.legal;
    if (v.phase === 'play' && L.length) return { ...TUTORIAL.play, spot: v.me.hand.some((c) => c.id === 'f7') ? 'card:f7' : null };
    if (v.phase === 'scout' && L.length) return { ...TUTORIAL.scout, spot: 'btn:skipScout' };
    if (v.phase === 'bet' && L.length) return { ...TUTORIAL.bet, spot: L.some((a) => a.type === 'call') ? 'btn:call' : 'btn:check' };
    if (v.phase === 'result' && v.result.don?.pending && v.result.winner === v.you) return { ...TUTORIAL.don };
    if (v.phase === 'result' && L.some((a) => a.type === 'donStart')) return { ...TUTORIAL.result, spot: 'btn:donStart' };
    return null;
  };
  session = {
    mode: 'tutorial',
    host,
    send: (a) => host.dispatch(0, a),
    react: () => {},
    rematch: () => {},
    leave: () => { clearTimeout(t1); host.stop(); },
  };
  game.reset();
  game.setNames(names[0], names[1]);
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
  const fresh = () => gameSetupModal({ withStyle: true, title: 'Гра проти бота', onStart: (o) => { GameHost.clear(BOT_KEY); startBot(false, o); } });
  if (GameHost.load(BOT_KEY)?.state?.phase && GameHost.load(BOT_KEY).state.phase !== 'over') {
    modal('<h3>Є незавершена партія</h3><p>Продовжити її чи почати нову?</p>', [
      { label: 'Продовжити', cls: 'primary', onClick: () => startBot(true) },
      { label: 'Нова партія', onClick: () => setTimeout(fresh, 0) },
    ]);
  } else fresh();
}

// ───────── на одному телефоні ─────────
function startHotseat(opts = {}) {
  const host = new GameHost({ timers: false, gameConfig: { maxRounds: opts.maxRounds || CONFIG.maxRounds } });
  const names = ['Гравець 1', 'Гравець 2'];
  const msgs = [null, null];
  let shown = null;
  let pendingActor = null;
  const s = {
    mode: 'hotseat',
    host,
    send: (a) => host.dispatch(shown, a),
    react: () => {},
    rematch: () => { host.dispatch(0, { type: 'rematch' }); host.dispatch(1, { type: 'rematch' }); },
    leave: () => host.stop(),
  };
  session = s;
  game.reset();
  $('btn-react').classList.add('hidden');

  const actorFor = () => {
    const v = msgs[0].view;
    const vs = [msgs[0].view, msgs[1].view];
    switch (v.phase) {
      case 'play': return vs.findIndex((x) => !x.me.played);
      case 'scout': return vs.findIndex((x) => !x.me.scoutDecided);
      case 'bet': return v.bet.toAct;
      case 'result': {
        const primary = v.result.winner ?? 0;
        if (!vs[primary].me.ready) return primary;
        const o = 1 - primary;
        if (vs[o].me.ready) return null;
        if (vs[o].legal.some((a) => a.type === 'show')) return o;
        setTimeout(() => host.dispatch(o, { type: 'ready' }), 0);
        return null;
      }
    }
    return null;
  };

  const render = () => {
    if (!msgs[0] || !msgs[1]) return;
    const v = msgs[0].view;
    if (v.phase === 'over') {
      $('curtain').classList.add('hidden');
      const m = msgs[0];
      deliverToUi({ view: m.view, meta: { ...m.meta, rematch: { me: false, opp: false } } }, { names });
      return;
    }
    const actor = actorFor();
    if (actor === null || actor < 0) return;
    if (shown === null || actor !== shown) {
      if (pendingActor === actor) return;
      pendingActor = actor;
      $('curtain-text').textContent = `Хід: ${names[actor]}`;
      $('curtain').classList.remove('hidden');
      if (current !== 'game') show('game');
      return;
    }
    deliverToUi(msgs[shown], { names: [names[shown], names[1 - shown]], conceal: v.phase === 'result' });
  };
  s.reveal = () => {
    if (pendingActor === null) return;
    shown = pendingActor;
    pendingActor = null;
    $('curtain').classList.add('hidden');
    game.reset();
    game.setNames(names[shown], names[1 - shown]);
    render();
  };
  host.attach(0, { deliver: (m) => { msgs[0] = m; queueMicrotask(render); } });
  host.attach(1, { deliver: (m) => { msgs[1] = m; queueMicrotask(render); } });
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
  const gameConfig = { maxRounds: prefRounds };
  segmented($('create-rounds'), roundOptions(), prefRounds, (v) => { gameConfig.maxRounds = v; prefRounds = v; rememberPrefs(); });
  document.querySelector('#scr-create .field').classList.toggle('hidden', !!resumeSave);
  game.reset();
  game.setNames(...names);
  $('btn-react').classList.remove('hidden');
  try {
    session = await createOnlineHost({
      resume: resumeSave,
      gameConfig,
      onCode: (code) => { $('room-code').textContent = code; $('btn-share').disabled = false; setLine('create-status', 'Чекаємо на друга'); },
      onStatus: (st) => {
        if (st.error) setLine('create-status', st.error, 'error');
        if (st.versionMismatch) { toast(st.versionMismatch, 7000, 'error'); setLine('create-status', st.versionMismatch, 'error'); }
        if (st.left) toast('Суперник вийшов з кімнати', 3500);
        game.setOffline(st.started && !st.oppConnected);
        if (st.started && !st.oppConnected && current === 'create') show('game');
      },
      onMessage: (m) => deliverToUi(m, { names }),
      onReaction: (e) => game.showReaction(e, false),
    });
  } catch (e) {
    setLine('create-status', `Не вдалося відкрити кімнату: ${e.message}`, 'error');
  }
}

async function startJoin(code, resumeSave = null) {
  show('join');
  joinInput.value = code;
  setLine('join-status', `Приєднуюся до кімнати ${code}…`);
  const names = ['Ти', 'Суперник'];
  game.reset();
  game.setNames(...names);
  $('btn-react').classList.remove('hidden');
  try {
    session = await joinOnline({
      code,
      resume: resumeSave,
      onStatus: (st) => {
        if (st.error) { setLine('join-status', st.error, 'error'); if (current === 'game') toast(st.error, 3000, 'error'); }
        if (st.joined) setLine('join-status', 'Підключено!', 'ok');
        game.setOffline(st.joined && !st.hostConnected, "Суперник не на зв'язку");
      },
      onMessage: (m) => deliverToUi(m, { names }),
      onReaction: (e) => game.showReaction(e, false),
      onFatal: (text) => { leave(true); toast(text, 8000, 'error'); },
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
  maybeTutorial(() => modal('<h3>Грати з другом</h3><p>Кожен — на своєму телефоні.</p>', [
    { label: 'Створити кімнату', cls: 'primary', onClick: () => { clearHostSave(); clearGuestSave(); startCreate(); } },
    { label: 'Приєднатися за кодом', onClick: () => { show('join'); setTimeout(() => joinInput.focus(), 300); } },
    { label: 'Скасувати', cls: 'tertiary' },
  ]));
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
  else if (go === 'friend') openFriend();
  else if (go === 'bot') maybeTutorial(askBot);
  else if (go === 'hotseat') maybeTutorial(() => gameSetupModal({ withStyle: false, title: 'На одному телефоні', onStart: (o) => startHotseat(o) }));
});

function refreshResume() {
  const btn = $('btn-resume');
  const h = loadHostSave();
  const g = loadGuestSave();
  const b = GameHost.load(BOT_KEY);
  if (h && h.state?.phase !== 'over') { btn.textContent = `Продовжити кімнату ${h.code}`; btn.onclick = () => startCreate(h); }
  else if (g) { btn.textContent = `Повернутися в кімнату ${g.code}`; btn.onclick = () => startJoin(g.code, g); }
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

// Запрошення ?room=ABCD (і старе #join=ABCD) — одразу приєднуємось
function boot() {
  refreshResume();
  const q = new URLSearchParams(location.search).get('room') || (location.hash.match(/join=([A-Z]{4})/i) || [])[1];
  const code = q && q.toUpperCase();
  const valid = code && code.length === 4 && [...code].every((c) => ROOM_ALPHABET.includes(c));
  if (q) history.replaceState(null, '', location.pathname + (location.search.includes('debug') ? '?debug' : ''));
  if (valid) startJoin(code);
  else show('menu');
  const sp = $('splash');
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 400); }, 350);
}
boot();

// Налагодження/скриншоти: ?debug відкриває доступ до рендера (на гру не впливає)
if (new URLSearchParams(location.search).has('debug')) {
  window.__vb = { game, deliverToUi, renderEnd, show, openSettings, gameSetupModal, showRules, toast, modal, startTutorial, openFriend, setLine };
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
