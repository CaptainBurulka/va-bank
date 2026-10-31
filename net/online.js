// Онлайн через WebRTC (PeerJS). Публічний сервер PeerJS — лише для встановлення з'єднання,
// далі дані йдуть напряму між телефонами. Хост тримає всю логіку (GameHost).
import { GameHost, BotSeat, cryptoRng } from './host.js';
import {
  ROOM_ALPHABET, PROTOCOL_VERSION, msg, randomCode, randomToken, peerIdFor,
  parseGuestMessage, parseHostMessage, versionAdvice, compareVersions,
} from './protocol.js';
import { CONFIG, APP_VERSION } from '../config.js';
import { sanitizeSet } from '../game/jokers.js';
import { sanitizeLook } from '../meta/profile.js';

export { ROOM_ALPHABET };

const HOST_KEY = 'vabank-host';
const GUEST_KEY = 'vabank-guest';
const PING_MS = 2000;
const DEAD_MS = 7000;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export const loadHostSave = () => store.get(HOST_KEY);
export const clearHostSave = () => store.del(HOST_KEY);
export const loadGuestSave = () => store.get(GUEST_KEY);
export const clearGuestSave = () => store.del(GUEST_KEY);

function needPeer() {
  if (!window.Peer) throw new Error('Не вдалося завантажити PeerJS. Перевір інтернет.');
  return window.Peer;
}

// STUN — безкоштовні публічні; TURN (ретранслятор для «важких» мобільних мереж) — з config.js, якщо вказано.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
if (CONFIG.turn && CONFIG.turn.urls) ICE.push({ ...CONFIG.turn });
const PEER_OPTS = { debug: 0, config: { iceServers: ICE } };

const ERR_TEXT = {
  'room-full': 'У кімнаті вже немає вільних місць',
  version: 'Різні версії гри — онови сторінку на обох телефонах',
  'no-room': 'Кімнату не знайдено. Перевір код.',
};

// ───────────────────────── ХОСТ ─────────────────────────

const BOT_NAMES = ['Мирко 🤖', 'Ліза 🤖'];

/**
 * @param {object} o { resume, players: 2|3, profile, onCode, onStatus, onLobby, onMessage, onReaction }
 * Хост сидить на місці 0. Гості — на 1 (і 2 у грі втрьох). Вільне місце можна віддати ботові.
 */
export async function createOnlineHost(o) {
  const Peer = needPeer();
  const saved = o.resume;
  const n = (saved?.players || o.players) === 3 ? 3 : 2;
  let code = saved?.code || randomCode(cryptoRng);
  // Гості за місцями: токен, з'єднання, останній сигнал
  const slots = Array.from({ length: n }, (_, q) => ({ token: saved?.tokens?.[q] || (q === 1 ? saved?.guestToken : null) || null, conn: null, lastSeen: 0 }));
  const botSeats = Array.from({ length: n }, (_, q) => !!saved?.bots?.[q]);
  let peer = null;
  let closed = false;
  let retryT = null;
  let freshTries = 0;

  const me = o.profile || { set: [], look: null, name: null };
  const extra = () => ({ code, players: n, guestToken: slots[1]?.token || null, tokens: slots.map((x) => x.token), bots: botSeats.slice() });
  const host = new GameHost({ timers: true, persistKey: HOST_KEY, extra: extra(), gameConfig: o.gameConfig || {}, gameOpts: { players: n, jokerSets: Array.from({ length: n }, (_, q) => (q === 0 ? sanitizeSet(me.set) : [])) } });
  host.names[0] = me.name || 'Господар';
  host.looks[0] = me.look || null;
  host.pids[0] = me.pid || null;
  host.titles[0] = me.title || null;
  const guestsOk = () => slots.every((x, q) => q === 0 || botSeats[q] || host.connected[q]);
  const status = (more = {}) => {
    o.onStatus({ started: !!host.state, oppConnected: guestsOk(), connected: host.connected.slice(), code, ...more });
    o.onLobby?.(slots.map((x, q) => ({ seat: q, kind: q === 0 ? 'host' : botSeats[q] ? 'bot' : x.token ? 'guest' : 'free', connected: host.connected[q], name: host.names[q], pid: host.pids[q] })));
  };

  // Місця гостей
  const remoteSeat = (q) => ({
    deliver: (m) => send(q, msg('state', { msg: m })),
    reaction: (emoji, from) => send(q, msg('react', { emoji, from })),
    error: (c) => send(q, msg('error', { code: c })),
  });
  host.seats[0] = { deliver: o.onMessage, reaction: (e, from) => o.onReaction(e, from) };
  host.connected[0] = true;
  for (let q = 1; q < n; q++) {
    if (botSeats[q]) { seatBot(q); continue; }
    host.seats[q] = remoteSeat(q);
    host.connected[q] = false;
  }
  host.hidden = document.hidden;

  if (saved?.state) host.restore(saved);

  function seatBot(q) {
    botSeats[q] = true;
    const bot = new BotSeat(host, q, Math.random, ['aggressive', 'cautious', 'bluffer'][q % 3]);
    host.seats[q] = bot;
    host.bots[q] = true;
    host.connected[q] = true;
    host.names[q] = BOT_NAMES[q - 1];
  }

  function send(q, m) {
    const c = slots[q]?.conn;
    if (c && c.open) { try { c.send(m); } catch {} }
  }

  function dropGuest(q) {
    const c = slots[q].conn;
    if (c) { try { c.close(); } catch {} }
    slots[q].conn = null;
    host.setConnected(q, false);
    status();
  }

  function maybeStart() {
    if (host.state) return;
    if (!slots.every((x, q) => q === 0 || botSeats[q] || (x.token && host.connected[q]))) return;
    host.extra = extra();
    host.start();
  }

  function onConnection(c) {
    c.on('open', () => {
      let seatOf = null;
      c.on('data', (raw) => {
        const p = parseGuestMessage(raw);
        if (!p.ok) {
          if (p.error === 'version') {
            try { c.send(msg('error', { code: 'version', app: APP_VERSION, protocol: PROTOCOL_VERSION })); } catch {}
            status({ versionMismatch: versionAdvice(APP_VERSION, p.app) });
          }
          return;
        }
        const m = p.m;
        if (seatOf === null) {
          if (m.type !== 'hello') return;
          // Однаковий протокол, але різні версії застосунку — теж просимо оновитися (правила могли змінитися)
          if (m.app && compareVersions(m.app, APP_VERSION) !== 0) {
            try { c.send(msg('error', { code: 'version', app: APP_VERSION, protocol: PROTOCOL_VERSION })); } catch {}
            status({ versionMismatch: versionAdvice(APP_VERSION, m.app) });
            setTimeout(() => c.close(), 500);
            return;
          }
          // Повернення за токеном — на своє місце; новий гість — на вільне (поки партія не почалась)
          let q = m.token ? slots.findIndex((x, k) => k > 0 && x.token === m.token) : -1;
          if (q < 0 && !host.state) q = slots.findIndex((x, k) => k > 0 && !botSeats[k] && !x.token);
          if (q < 0) {
            try { c.send(msg('error', { code: 'room-full' })); } catch {}
            setTimeout(() => c.close(), 300);
            return;
          }
          seatOf = q;
          const slot = slots[q];
          if (slot.conn && slot.conn !== c) { try { slot.conn.close(); } catch {} }
          slot.conn = c;
          slot.lastSeen = Date.now();
          if (!slot.token) slot.token = randomToken(cryptoRng);
          host.extra = extra();
          host.names[q] = m.name || `Гість ${q}`;
          host.looks[q] = sanitizeLook(m.look);
          host.pids[q] = m.pid || null;
          host.titles[q] = m.title || null;
          c.send(msg('welcome', { token: slot.token, seat: q, players: n, app: APP_VERSION, look: me.look }));
          // Набір джокерів гостя фіксується на хості на початку партії; косметика — лише для показу
          o.onOppLook?.(host.looks[q], q);
          if (!host.state) {
            const sets = host.gameOpts.jokerSets.slice();
            sets[q] = sanitizeSet(m.set);
            host.gameOpts = { ...host.gameOpts, jokerSets: sets };
          }
          host.setConnected(q, true);
          maybeStart();
          host.broadcast();
          status();
          return;
        }
        if (c !== slots[seatOf].conn) return;
        slots[seatOf].lastSeen = Date.now();
        switch (m.type) {
          case 'action': host.dispatch(seatOf, m.action); break;
          case 'react': host.relayReaction(seatOf, m.emoji); break;
          case 'ping': send(seatOf, msg('pong')); break;
          case 'bye': dropGuest(seatOf); status({ left: true, leftSeat: seatOf }); break;
        }
      });
      c.on('close', () => { if (seatOf !== null && c === slots[seatOf].conn) dropGuest(seatOf); });
      c.on('error', () => { if (seatOf !== null && c === slots[seatOf].conn) dropGuest(seatOf); });
    });
  }

  function openPeer() {
    if (closed) return;
    clearTimeout(retryT);
    try { peer?.destroy(); } catch {}
    peer = new Peer(peerIdFor(code), PEER_OPTS);
    peer.on('open', () => { freshTries = 0; o.onCode(code); status(); });
    peer.on('connection', onConnection);
    peer.on('disconnected', () => {
      // Втрачено зв'язок із сервером сигналізації — WebRTC-канали можуть ще жити.
      if (!closed) retryT = setTimeout(() => { try { peer.reconnect(); } catch { openPeer(); } }, 1000);
    });
    peer.on('error', (e) => {
      if (closed) return;
      if (e.type === 'unavailable-id') {
        if (!host.state && !saved && freshTries++ < 5) {
          code = randomCode(cryptoRng);
          host.extra = extra();
          return openPeer();
        }
        // Сервер ще тримає старе з'єднання з цим кодом — пробуємо ще.
        status({ error: 'Відновлюю кімнату…' });
        retryT = setTimeout(openPeer, 3000);
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        status({ error: 'Немає зв\'язку із сервером, повторюю…' });
        retryT = setTimeout(openPeer, 2500);
      }
    });
  }

  // Серцебиття: якщо гість мовчить — вважаємо його відключеним і ставимо паузу.
  const hb = setInterval(() => {
    for (let q = 1; q < n; q++) {
      const c = slots[q].conn;
      if (c && c.open) {
        send(q, msg('ping'));
        if (Date.now() - slots[q].lastSeen > DEAD_MS) dropGuest(q);
      }
    }
  }, PING_MS);

  openPeer();
  status();

  return {
    mode: 'online-host',
    players: n,
    host,
    send: (a) => host.dispatch(0, a),
    react: (e) => host.relayReaction(0, e),
    rematch: () => host.dispatch(0, { type: 'rematch' }),
    /** Посадити бота на вільне місце (лише до початку партії втрьох). */
    addBot() {
      if (host.state) return false;
      const q = slots.findIndex((x, k) => k > 0 && !botSeats[k] && !x.token);
      if (q < 0) return false;
      seatBot(q);
      const sets = host.gameOpts.jokerSets.slice();
      sets[q] = o.botSet?.() || [];
      host.gameOpts = { ...host.gameOpts, jokerSets: sets };
      host.looks[q] = o.botLook?.() || null;
      host.extra = extra();
      maybeStart();
      status();
      return true;
    },
    onVisibility(hidden) {
      if (hidden || closed) return;
      // Після повернення в Safari: перевіряємо сервер і канали.
      if (!peer || peer.destroyed) openPeer();
      else if (peer.disconnected) { try { peer.reconnect(); } catch { openPeer(); } }
      for (let q = 1; q < n; q++) if (slots[q].conn && !slots[q].conn.open) dropGuest(q);
    },
    leave(clear) {
      closed = true;
      clearInterval(hb);
      clearTimeout(retryT);
      for (let q = 1; q < n; q++) send(q, msg('bye'));
      host.stop();
      setTimeout(() => { try { peer?.destroy(); } catch {} }, 200);
      if (clear || host.state?.phase === 'over') clearHostSave();
    },
  };
}

// ───────────────────────── ГІСТЬ ─────────────────────────

/**
 * @param {object} o { code, resume, onStatus, onMessage, onReaction, onFatal }
 */
export function joinOnline(o) {
  const Peer = needPeer();
  const code = o.code;
  let token = o.resume?.code === code ? o.resume.token : loadGuestSave()?.code === code ? loadGuestSave().token : null;
  let peer = null;
  let conn = null;
  let joined = false;
  let closed = false;
  let lastSeen = 0;
  let retryT = null;
  let attempt = 0;
  let hostConnected = false;
  let oppConnected = true;

  const status = (extra = {}) => o.onStatus({ joined, hostConnected, oppConnected, ...extra });

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (text) => {
      if (!settled) { settled = true; reject(new Error(text)); cleanup(); }
      else { status({ error: text }); }
    };

    function send(m) {
      if (conn && conn.open) { try { conn.send(m); } catch {} }
    }

    function scheduleReconnect() {
      if (closed) return;
      clearTimeout(retryT);
      hostConnected = false;
      status({ reconnecting: true });
      const delay = Math.min(8000, 1000 * 2 ** Math.min(attempt++, 3));
      retryT = setTimeout(connect, delay);
    }

    function connect() {
      if (closed) return;
      if (!peer || peer.destroyed) return openPeer();
      if (peer.disconnected) {
        try { peer.reconnect(); } catch { return openPeer(); }
        retryT = setTimeout(connect, 1500);
        return;
      }
      if (!peer.open) { retryT = setTimeout(connect, 800); return; }
      try { conn?.close(); } catch {}
      const c = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
      conn = c;
      const openTimer = setTimeout(() => { if (c === conn && !c.open) { try { c.close(); } catch {} if (joined) scheduleReconnect(); else fail(ERR_TEXT['no-room']); } }, 12000);
      c.on('open', () => {
        clearTimeout(openTimer);
        lastSeen = Date.now();
        c.send(msg('hello', { token, app: APP_VERSION, set: o.profile?.set || [], look: o.profile?.look || null, name: o.profile?.name || null, pid: o.profile?.pid || null, title: o.profile?.title || null }));
      });
      c.on('data', (raw) => {
        if (c !== conn) return;
        const p = parseHostMessage(raw);
        if (!p.ok) { if (p.error === 'version') { closed = true; o.onFatal?.(versionAdvice(APP_VERSION, p.app)); } return; }
        const m = p.m;
        lastSeen = Date.now();
        switch (m.type) {
          case 'welcome':
            token = m.token;
            o.onOppLook?.(sanitizeLook(m.look));
            store.set(GUEST_KEY, { code, token });
            joined = true;
            hostConnected = true;
            attempt = 0;
            status();
            if (!settled) { settled = true; resolve(api); }
            break;
          case 'state':
            hostConnected = true;
            oppConnected = true;
            o.onMessage(m.msg);
            status();
            break;
          case 'react': o.onReaction(m.emoji, m.from); break;
          case 'ping': send(msg('pong')); break;
          case 'error':
            if (m.code === 'room-full' || m.code === 'version') {
              const text = m.code === 'version' ? versionAdvice(APP_VERSION, m.app) : ERR_TEXT[m.code];
              closed = true;
              clearGuestSave();
              if (!settled) fail(text);
              else o.onFatal?.(text);
              cleanup();
            }
            break;
          case 'bye':
            closed = true;
            clearGuestSave();
            o.onFatal?.('Господар кімнати вийшов');
            cleanup();
            break;
        }
      });
      c.on('close', () => { if (c === conn && joined && !closed) scheduleReconnect(); });
      c.on('error', () => { if (c === conn && joined && !closed) scheduleReconnect(); });
    }

    function openPeer() {
      if (closed) return;
      try { peer?.destroy(); } catch {}
      peer = new Peer(PEER_OPTS);
      peer.on('open', () => connect());
      peer.on('disconnected', () => { if (!closed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1000); });
      peer.on('error', (e) => {
        if (closed) return;
        if (e.type === 'peer-unavailable') {
          // Хост зараз не на зв'язку (заблокований екран) — чекаємо й пробуємо знову.
          if (joined) scheduleReconnect();
          else fail(ERR_TEXT['no-room']);
          return;
        }
        if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(e.type)) {
          if (joined) scheduleReconnect();
          else fail('Немає зв\'язку із сервером. Перевір інтернет.');
        }
      });
    }

    function cleanup() {
      closed = true;
      clearInterval(hb);
      clearTimeout(retryT);
      setTimeout(() => { try { peer?.destroy(); } catch {} }, 200);
    }

    const hb = setInterval(() => {
      if (!joined || closed) return;
      if (conn && conn.open) send(msg('ping'));
      if (hostConnected && Date.now() - lastSeen > DEAD_MS) {
        hostConnected = false;
        try { conn?.close(); } catch {}
        scheduleReconnect();
      }
    }, PING_MS);

    const api = {
      mode: 'online-guest',
      send: (a) => send(msg('action', { action: a })),
      react: (e) => send(msg('react', { emoji: e })),
      rematch: () => send(msg('action', { action: { type: 'rematch' } })),
      onVisibility(hidden) {
        if (hidden || closed || !joined) return;
        if (!conn || !conn.open || !peer || peer.disconnected || peer.destroyed) { attempt = 0; scheduleReconnect(); }
        else send(msg('ping'));
      },
      leave(clear) {
        send(msg('bye'));
        cleanup();
        if (clear) clearGuestSave();
      },
    };

    openPeer();
  });
}
