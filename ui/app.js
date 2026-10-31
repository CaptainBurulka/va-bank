// Точка входу: екрани, режими гри, зв'язування хоста/мережі з UI.
import { GameHost, BotSeat } from '../net/host.js';
import { GameScreen } from './game.js';
import { unlockAudio, sfx, isMuted, setMuted } from './sound.js';
import { RULES_HTML } from './text.js';
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

function openGameMenu() {
  modal('<b>Пауза</b>', [
    { label: isMuted() ? '🔇 Звук вимкнено' : '🔊 Звук увімкнено', keep: true, onClick: (el) => { setMuted(!isMuted()); el.textContent = isMuted() ? '🔇 Звук вимкнено' : '🔊 Звук увімкнено'; } },
    { label: 'Правила', onClick: () => { session?.hideGame?.(); showRules(true); } },
    { label: 'Вийти в меню', cls: 'danger', onClick: () => confirmLeave() },
    { label: 'Повернутися до гри', cls: 'neon-cyan' },
  ]);
}

function confirmLeave() {
  modal('Вийти з партії?' + (session?.mode === 'bot' ? '<br><small class="muted">Партію з ботом можна буде продовжити.</small>' : ''), [
    { label: 'Вийти', cls: 'danger', onClick: () => leave() },
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
function startBot(resume = false) {
  const host = new GameHost({ timers: true, persistKey: BOT_KEY });
  const names = ['Ти', 'Бот'];
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
  const bot = new BotSeat(host, 1);
  host.attach(0, { deliver: (m) => deliverToUi(m, { names }), reaction: (e) => game.showReaction(e, false) });
  host.attach(1, bot);
  const saved = resume && GameHost.load(BOT_KEY);
  if (saved && saved.state?.phase !== 'over') host.restore(saved);
  else host.start();
  host.setHidden(document.hidden);
}

// ───────── режим «передай телефон» ─────────
function startHotseat() {
  const host = new GameHost({ timers: false });
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
  game.reset();
  game.setNames(...names);
  $('opp-avatar').textContent = '🎭';
  $('btn-react').classList.remove('hidden');
  try {
    session = await createOnlineHost({
      resume: resumeSave,
      onCode: (code) => { $('room-code').textContent = code; $('create-status').textContent = 'Чекаємо на суперника… Передай йому код.'; },
      onStatus: (st) => {
        if (st.error) $('create-status').textContent = st.error;
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
        const off = st.joined && !st.hostConnected;
        game.setOffline(off, st.reconnecting ? 'Перепідключення…' : "Суперник не на зв'язку…");
        if (!off && st.joined && st.oppConnected === false) game.setOffline(true);
      },
      onMessage: (m) => deliverToUi(m, { names }),
      onReaction: (e) => game.showReaction(e, false),
      onFatal: (text) => { toast(text, 4000); leave(true); },
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
  else if (go === 'bot') {
    if (GameHost.load(BOT_KEY)?.state?.phase && GameHost.load(BOT_KEY).state.phase !== 'over') {
      modal('Є незавершена партія з ботом.', [
        { label: 'Продовжити', cls: 'neon-cyan', onClick: () => startBot(true) },
        { label: 'Нова партія', onClick: () => { GameHost.clear(BOT_KEY); startBot(false); } },
      ]);
    } else startBot(false);
  } else if (go === 'hotseat') startHotseat();
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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
