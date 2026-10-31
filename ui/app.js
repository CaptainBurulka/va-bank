// Точка входу: екрани, режими гри, зв'язування хоста/мережі з UI.
import { GameHost, BotSeat } from '../net/host.js';
import { GameScreen } from './game.js';
import { unlockAudio, sfx, isMuted, setMuted, getVolume, setVolume } from './sound.js';
import { RULES_HTML } from './text.js';
import { hints } from './settings.js';
import { CONFIG, APP_VERSION } from '../config.js';
import { BOT_STYLES } from '../game/bot.js';
import { createOnlineHost, joinOnline, ROOM_ALPHABET, loadGuestSave, clearGuestSave, loadHostSave, clearHostSave } from '../net/online.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'create', 'join', 'rules', 'game', 'end'];
const BOT_KEY = 'vabank-bot';

let session = null;
let current = 'menu';

// ───────── загальне ─────────
function show(name) {
  current = name;
  for (const s of SCREENS) $(`scr-${s}`).classList.toggle('hidden', s !== name);
}

function toast(text, ms = 2200) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function modal(text, buttons) {
  $('modal-text').innerHTML = text;
  const box = $('modal-btns');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${b.cls || 'ghost'}`;
    el.textContent = b.label;
    el.addEventListener('click', () => {
      sfx.tap();
      if (!b.keep) $('modal').classList.add('hidden');
      b.onClick?.(el);
    });
    box.append(el);
  }
  $('modal').classList.remove('hidden');
}

// Звук вмикається після першого тапу (обмеження iOS)
const unlock = () => unlockAudio();
document.addEventListener('touchend', unlock, { passive: true });
document.addEventListener('click', unlock);

// Заборона зуму жестами і подвійним тапом на iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scrollable')) e.preventDefault();
}, { passive: false });

const game = new GameScreen({
  onAction: (a) => session?.send(a),
  onReaction: (e) => session?.react(e),
  onMenu: () => openGameMenu(),
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
    b.addEventListener('click', () => {
      sfx.tap();
      for (const x of container.children) x.classList.remove('on');
      b.classList.add('on');
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

function gameSetupModal({ withStyle, onStart }) {
  $('modal-text').innerHTML = `${withStyle ? '<div class="field-label">Суперник</div><div class="seg" id="m-style"></div>' : ''}<div class="field-label">Довжина партії (раундів)</div><div class="seg" id="m-rounds"></div>`;
  if (withStyle) segmented($('m-style'), BOT_STYLES.map((k) => ({ value: k, label: STYLE_INFO[k].name, sub: STYLE_INFO[k].sub })), prefStyle, (v) => (prefStyle = v));
  segmented($('m-rounds'), roundOptions(), prefRounds, (v) => (prefRounds = v));
  const box = $('modal-btns');
  box.innerHTML = '';
  const go = document.createElement('button');
  go.className = 'btn neon-pink big';
  go.textContent = 'Почати';
  go.addEventListener('click', () => { sfx.tap(); rememberPrefs(); $('modal').classList.add('hidden'); onStart({ maxRounds: prefRounds, style: prefStyle }); });
  const cancel = document.createElement('button');
  cancel.className = 'btn ghost';
  cancel.textContent = 'Скасувати';
  cancel.addEventListener('click', () => $('modal').classList.add('hidden'));
  box.append(go, cancel);
  $('modal').classList.remove('hidden');
}

// ───────── налаштування ─────────
function openSettings(back = null) {
  $('modal-text').innerHTML = `
    <b>Налаштування</b>
    <label class="row">Звук <input type="checkbox" id="set-sound" ${isMuted() ? '' : 'checked'}></label>
    <label class="row" style="flex-direction:column;align-items:stretch">Гучність <input type="range" id="set-vol" min="0" max="100" value="${Math.round(getVolume() * 100)}"></label>
    <label class="row">Підказки для новачка <input type="checkbox" id="set-hints" ${hints.enabled() ? 'checked' : ''}></label>
    <small class="muted">Версія ${APP_VERSION}</small>`;
  $('set-sound').addEventListener('change', (e) => { setMuted(!e.target.checked); sfx.tap(); });
  $('set-vol').addEventListener('input', (e) => setVolume(e.target.value / 100));
  $('set-vol').addEventListener('change', () => sfx.chip(3));
  $('set-hints').addEventListener('change', (e) => hints.setEnabled(e.target.checked));
  const box = $('modal-btns');
  box.innerHTML = '';
  const ok = document.createElement('button');
  ok.className = 'btn neon-cyan';
  ok.textContent = 'Готово';
  ok.addEventListener('click', () => { sfx.tap(); $('modal').classList.add('hidden'); back?.(); });
  box.append(ok);
  $('modal').classList.remove('hidden');
}

function openGameMenu() {
  modal('<b>Пауза</b>', [
    { label: 'Налаштування', onClick: () => openSettings(openGameMenu) },
    { label: 'Правила', onClick: () => { session?.hideGame?.(); showRules(true); } },
    { label: 'Вийти в меню', cls: 'danger', onClick: () => confirmLeave() },
    { label: 'Повернутися до гри', cls: 'neon-cyan' },
  ]);
}

function confirmLeave() {
  modal('Вийти з партії?' + (session?.mode === 'bot' ? '<br><small class="muted">Партію з ботом можна буде продовжити.</small>' : session?.mode?.startsWith('online') ? '<br><small class="muted">Кімнату буде закрито для обох.</small>' : ''), [
    // Онлайн-кімнату вихід через меню закриває для обох; збереження лишається лише для випадку, коли iOS вивантажила сторінку.
    { label: 'Вийти', cls: 'danger', onClick: () => leave(session?.mode !== 'bot') },
    { label: 'Скасувати' },
  ]);
}

function leave(clearSave = false) {
  session?.leave(clearSave);
  session = null;
  $('curtain').classList.add('hidden');
  game.setOffline(false);
  refreshResume();
  show('menu');
}

let rulesReturn = 'menu';
function showRules(fromGame = false) {
  rulesReturn = fromGame && session ? 'game' : 'menu';
  $('rules-body').innerHTML = RULES_HTML;
  show('rules');
}
document.querySelector('#scr-rules [data-go="menu"]').addEventListener('click', (e) => {
  e.stopImmediatePropagation();
  show(rulesReturn);
});

// ───────── доставка стану в UI ─────────
function deliverToUi(msg, opts = {}) {
  const { view } = msg;
  if (view.phase === 'over') {
    renderEnd(msg, opts.names || ['Ти', 'Суперник']);
    if (current !== 'end' && current !== 'rules') {
      setTimeout(() => { if (session && session.lastPhase === 'over') show('end'); }, view.result && current === 'game' ? 1800 : 0);
      if (current === 'game') game.update(msg, opts);
    }
    if (session) session.lastPhase = 'over';
    return;
  }
  if (session) {
    if (session.lastPhase === 'over') game.reset();
    session.lastPhase = view.phase;
  }
  if (current === 'end' || current === 'menu' || current === 'create' || current === 'join') show('game');
  game.update(msg, opts);
}

function renderEnd({ view, meta }, names) {
  hints.gameFinished();
  const me = view.you;
  const st = view.stats;
  const draw = view.winner === 'draw';
  const won = view.winner === me;
  const title = $('end-title');
  const hotseat = session?.mode === 'hotseat';
  title.textContent = draw ? 'Нічия' : hotseat ? `Перемога: ${names[view.winner === me ? 0 : 1]}` : won ? 'Перемога!' : 'Поразка';
  title.classList.toggle('lose', !won && !draw && !hotseat);
  const why = view.endReason === 'bankrupt' ? (hotseat ? 'Банкрутство' : won ? 'Суперник банкрут' : 'Фішки скінчилися') : `Після ${view.maxRounds} раундів`;
  $('end-sub').textContent = `${why} · ${view.me.chips} : ${view.opp.chips}`;
  const rows = [
    ['Фішки', view.me.chips, view.opp.chips],
    ['Виграно раундів', st[me].roundsWon, st[1 - me].roundsWon],
    ['Найбільший банк', st[me].biggestPot, st[1 - me].biggestPot],
    ['Вдалі блефи', st[me].bluffs, st[1 - me].bluffs],
    ['«Подвій» виграно', st[me].donWon, st[1 - me].donWon],
    ['«Подвій» програно', st[me].donLost, st[1 - me].donLost],
    ['Розвідок', st[me].scouts, st[1 - me].scouts],
  ];
  $('end-stats').innerHTML =
    `<tr><th></th><th>${names[0]}</th><th>${names[1]}</th></tr>` +
    rows.map(([k, a, b], i) => {
      const lowerBetter = i === 5;
      const best = a === b ? '' : (a > b) !== lowerBetter ? 'a' : 'b';
      return `<tr><td>${k}</td><td class="${best === 'a' ? 'best' : ''}">${a}</td><td class="${best === 'b' ? 'best' : ''}">${b}</td></tr>`;
    }).join('');
  const rs = meta.rematch;
  $('rematch-status').textContent = rs.me && !rs.opp ? 'Чекаємо, що відповість суперник…' : !rs.me && rs.opp ? `${names[1]} хоче реванш!` : ' ';
  $('btn-rematch').disabled = rs.me;
  if (current === 'end' && rs.opp && !rs.me) sfx.pop();
}

$('btn-rematch').addEventListener('click', () => { sfx.tap(); session?.rematch(); });
$('btn-end-menu').addEventListener('click', () => leave(true));

// ───────── режим проти бота ─────────
function startBot(resume = false, opts = {}) {
  const saved = resume && GameHost.load(BOT_KEY);
  const style = (saved && saved.style) || opts.style || 'aggressive';
  const host = new GameHost({ timers: true, persistKey: BOT_KEY, extra: { style }, gameConfig: { maxRounds: opts.maxRounds || CONFIG.maxRounds } });
  const names = ['Ти', `Бот · ${STYLE_INFO[style].name}`];
  const s = {
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
  session = s;
  game.reset();
  game.setNames(names[0], names[1]);
  $('opp-avatar').textContent = '🤖';
  $('btn-react').classList.remove('hidden');
  const bot = new BotSeat(host, 1, Math.random, style);
  host.attach(0, { deliver: (m) => deliverToUi(m, { names }), reaction: (e) => game.showReaction(e, false) });
  host.attach(1, bot);
  if (saved && saved.state?.phase !== 'over') host.restore(saved);
  else host.start();
  host.setHidden(document.hidden);
}

// ───────── режим «передай телефон» ─────────
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
  $('opp-avatar').textContent = '🎭';
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
      // Реванш у цьому режимі — одна кнопка для обох
      deliverToUi({ view: m.view, meta: { ...m.meta, rematch: { me: false, opp: false } } }, { names });
      return;
    }
    const actor = actorFor();
    if (actor === null || actor < 0) return;
    if (shown === null || actor !== shown) {
      if (pendingActor === actor) return;
      pendingActor = actor;
      $('curtain-text').textContent = `Передай телефон: ${names[actor]}`;
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
  s.hideGame = () => {};
  host.attach(0, { deliver: (m) => { msgs[0] = m; queueMicrotask(render); } });
  host.attach(1, { deliver: (m) => { msgs[1] = m; queueMicrotask(render); } });
  host.start();
}
$('curtain-btn').addEventListener('click', () => { sfx.tap(); session?.reveal?.(); });

// ───────── онлайн ─────────
async function startCreate(resumeSave = null) {
  show('create');
  $('room-code').textContent = resumeSave?.code || '····';
  $('create-status').textContent = 'Підключаюся до сервера…';
  const names = ['Ти', 'Суперник'];
  // Довжину партії хост обирає, поки чекає на суперника
  const gameConfig = { maxRounds: prefRounds };
  segmented($('create-rounds'), roundOptions(), prefRounds, (v) => { gameConfig.maxRounds = v; prefRounds = v; rememberPrefs(); });
  $('create-rounds').classList.toggle('hidden', !!resumeSave);
  document.querySelector('#scr-create .field-label').classList.toggle('hidden', !!resumeSave);
  game.reset();
  game.setNames(...names);
  $('opp-avatar').textContent = '🎭';
  $('btn-react').classList.remove('hidden');
  try {
    session = await createOnlineHost({
      resume: resumeSave,
      gameConfig,
      onCode: (code) => { $('room-code').textContent = code; $('create-status').textContent = 'Чекаємо на суперника… Передай йому код.'; },
      onStatus: (st) => {
        if (st.error) $('create-status').textContent = st.error;
        if (st.versionMismatch) { toast(st.versionMismatch, 6000); $('create-status').textContent = st.versionMismatch; }
        if (st.left) toast('Суперник вийшов з кімнати', 3500);
        game.setOffline(st.started && !st.oppConnected);
        if (st.started && !st.oppConnected && current === 'create') show('game');
      },
      onMessage: (m) => deliverToUi(m, { names }),
      onReaction: (e) => game.showReaction(e, false),
    });
  } catch (e) {
    $('create-status').textContent = 'Не вдалося створити кімнату: ' + e.message;
  }
}

async function startJoin(code, resumeSave = null) {
  $('join-status').textContent = 'Підключаюся…';
  const names = ['Ти', 'Суперник'];
  game.reset();
  game.setNames(...names);
  $('opp-avatar').textContent = '🎭';
  $('btn-react').classList.remove('hidden');
  try {
    session = await joinOnline({
      code,
      resume: resumeSave,
      onStatus: (st) => {
        if (st.error) { $('join-status').textContent = st.error; toast(st.error); }
        if (st.joined) $('join-status').textContent = 'Підключено!';
        game.setOffline(st.joined && !st.hostConnected, "Суперник не на зв'язку… перепідключення");
      },
      onMessage: (m) => deliverToUi(m, { names }),
      onReaction: (e) => game.showReaction(e, false),
      onFatal: (text) => { toast(text, 8000); leave(true); },
    });
  } catch (e) {
    $('join-status').textContent = e.message;
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
  if (code.length !== 4) { $('join-status').textContent = 'Код складається з 4 літер'; return; }
  joinInput.blur();
  startJoin(code);
});
joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

$('btn-share').addEventListener('click', async () => {
  const code = $('room-code').textContent;
  const url = `${location.origin}${location.pathname}#join=${code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Ва-банк', text: `Заходь у мою кімнату «Ва-банк»: код ${code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Посилання скопійовано'); }
  } catch {}
});

// ───────── меню ─────────
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  sfx.tap();
  if (go === 'menu') { if (current === 'create') leave(true); else show('menu'); }
  else if (go === 'rules') showRules();
  else if (go === 'settings') openSettings();
  else if (go === 'bot') {
    const fresh = () => gameSetupModal({ withStyle: true, onStart: (o) => { GameHost.clear(BOT_KEY); startBot(false, o); } });
    if (GameHost.load(BOT_KEY)?.state?.phase && GameHost.load(BOT_KEY).state.phase !== 'over') {
      modal('Є незавершена партія з ботом.', [
        { label: 'Продовжити', cls: 'neon-cyan', onClick: () => startBot(true) },
        { label: 'Нова партія', onClick: () => setTimeout(fresh, 0) },
      ]);
    } else fresh();
  } else if (go === 'hotseat') gameSetupModal({ withStyle: false, onStart: (o) => startHotseat(o) });
  else if (go === 'create') { clearHostSave(); clearGuestSave(); startCreate(); }
  else if (go === 'join') { show('join'); setTimeout(() => joinInput.focus(), 300); }
});

function refreshResume() {
  const btn = $('btn-resume');
  const h = loadHostSave();
  const g = loadGuestSave();
  const b = GameHost.load(BOT_KEY);
  if (h && h.state?.phase !== 'over') { btn.textContent = `Продовжити кімнату ${h.code}`; btn.onclick = () => startCreate(h); }
  else if (g) { btn.textContent = `Повернутися в кімнату ${g.code}`; btn.onclick = () => { show('join'); joinInput.value = g.code; startJoin(g.code, g); }; }
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

// Посилання-запрошення #join=ABCD
function boot() {
  refreshResume();
  const m = location.hash.match(/join=([A-Z]{4})/i);
  if (m) {
    history.replaceState(null, '', location.pathname);
    show('join');
    joinInput.value = m[1].toUpperCase();
  } else show('menu');
}
boot();

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
        // Не перезавантажуємо посеред онлайн-партії хоста без попередження: стан збережено, гість перепідключиться.
        $('btn-update').disabled = true;
        worker.postMessage({ type: 'skipWaiting' });
      };
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    // Перевіряти оновлення, коли застосунок повертається на екран
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}
