// Онлайн через WebRTC (PeerJS). Публічний сервер PeerJS — лише для встановлення з'єднання,
// далі дані йдуть напряму між телефонами. Хост тримає всю логіку (GameHost).
import { GameHost, cryptoRng } from './host.js';
import {
  ROOM_ALPHABET, PROTOCOL_VERSION, msg, randomCode, randomToken, peerIdFor,
  parseGuestMessage, parseHostMessage, versionAdvice, compareVersions,
} from './protocol.js';
import { CONFIG, APP_VERSION } from '../config.js';

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
  'room-full': 'У кімнаті вже грають двоє',
  version: 'Різні версії гри — онови сторінку на обох телефонах',
  'no-room': 'Кімнату не знайдено. Перевір код.',
};

// ───────────────────────── ХОСТ ─────────────────────────

/**
 * @param {object} o { resume, onCode, onStatus, onMessage, onReaction }
 */
export async function createOnlineHost(o) {
  const Peer = needPeer();
  const saved = o.resume;
  let code = saved?.code || randomCode(cryptoRng);
  let guestToken = saved?.guestToken || null;
  let peer = null;
  let conn = null;
  let lastSeen = 0;
  let closed = false;
  let retryT = null;
  let freshTries = 0;

  const host = new GameHost({ timers: true, persistKey: HOST_KEY, extra: { code, guestToken }, gameConfig: o.gameConfig || {} });
  const status = () => o.onStatus({ started: !!host.state, oppConnected: host.connected[1], code });

  // Місце гостя
  const remoteSeat = {
    deliver: (m) => send(msg('state', { msg: m })),
    reaction: (emoji) => send(msg('react', { emoji })),
    error: (code) => send(msg('error', { code })),
  };
  host.seats[0] = { deliver: o.onMessage, reaction: o.onReaction };
  host.connected[0] = true;
  host.seats[1] = remoteSeat;
  host.connected[1] = false;
  host.hidden = document.hidden;

  if (saved?.state) host.restore(saved);

  function send(m) {
    if (conn && conn.open) {
      try { conn.send(m); } catch {}
    }
  }

  function dropGuest() {
    if (conn) { try { conn.close(); } catch {} }
    conn = null;
    host.setConnected(1, false);
    status();
  }

  function onConnection(c) {
    c.on('open', () => {
      let greeted = false;
      c.on('data', (raw) => {
        const p = parseGuestMessage(raw);
        if (!p.ok) {
          if (p.error === 'version') {
            try { c.send(msg('error', { code: 'version', app: APP_VERSION, protocol: PROTOCOL_VERSION })); } catch {}
            o.onStatus({ started: !!host.state, oppConnected: host.connected[1], code, versionMismatch: versionAdvice(APP_VERSION, p.app) });
          }
          return;
        }
        const m = p.m;
        if (!greeted) {
          if (m.type !== 'hello') return;
          // Однаковий протокол, але різні версії застосунку — теж просимо оновитися (правила могли змінитися)
          if (m.app && compareVersions(m.app, APP_VERSION) !== 0) {
            try { c.send(msg('error', { code: 'version', app: APP_VERSION, protocol: PROTOCOL_VERSION })); } catch {}
            o.onStatus({ started: !!host.state, oppConnected: host.connected[1], code, versionMismatch: versionAdvice(APP_VERSION, m.app) });
            setTimeout(() => c.close(), 500);
            return;
          }
          if (host.state && guestToken && m.token !== guestToken) {
            try { c.send(msg('error', { code: 'room-full' })); } catch {}
            setTimeout(() => c.close(), 300);
            return;
          }
          greeted = true;
          if (conn && conn !== c) { try { conn.close(); } catch {} }
          conn = c;
          lastSeen = Date.now();
          if (!guestToken) {
            guestToken = randomToken(cryptoRng);
            host.extra = { code, guestToken };
          }
          c.send(msg('welcome', { token: guestToken, seat: 1, app: APP_VERSION }));
          if (!host.state) host.start();
          host.setConnected(1, true);
          host.sendTo(1);
          status();
          return;
        }
        if (c !== conn) return;
        lastSeen = Date.now();
        switch (m.type) {
          case 'action': host.dispatch(1, m.action); break;
          case 'react': o.onReaction(m.emoji); break;
          case 'ping': send(msg('pong')); break;
          case 'bye': dropGuest(); o.onStatus({ started: !!host.state, oppConnected: false, code, left: true }); break;
        }
      });
      c.on('close', () => { if (c === conn) dropGuest(); });
      c.on('error', () => { if (c === conn) dropGuest(); });
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
      // Втрачено зв'язок із сервером сигналізації — WebRTC-канал може ще жити.
      if (!closed) retryT = setTimeout(() => { try { peer.reconnect(); } catch { openPeer(); } }, 1000);
    });
    peer.on('error', (e) => {
      if (closed) return;
      if (e.type === 'unavailable-id') {
        if (!host.state && !saved && freshTries++ < 5) {
          code = randomCode(cryptoRng);
          host.extra = { code, guestToken };
          return openPeer();
        }
        // Сервер ще тримає старе з'єднання з цим кодом — пробуємо ще.
        o.onStatus({ started: !!host.state, oppConnected: host.connected[1], code, error: 'Відновлюю кімнату…' });
        retryT = setTimeout(openPeer, 3000);
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        o.onStatus({ started: !!host.state, oppConnected: host.connected[1], code, error: 'Немає зв\'язку із сервером, повторюю…' });
        retryT = setTimeout(openPeer, 2500);
      }
    });
  }

  // Серцебиття: якщо гість мовчить — вважаємо його відключеним і ставимо паузу.
  const hb = setInterval(() => {
    if (conn && conn.open) {
      send(msg('ping'));
      if (Date.now() - lastSeen > DEAD_MS) dropGuest();
    }
  }, PING_MS);

  openPeer();
  status();

  return {
    mode: 'online-host',
    host,
    send: (a) => host.dispatch(0, a),
    react: (e) => remoteSeat.reaction(e),
    rematch: () => host.dispatch(0, { type: 'rematch' }),
    onVisibility(hidden) {
      if (hidden || closed) return;
      // Після повернення в Safari: перевіряємо сервер і канал.
      if (!peer || peer.destroyed) openPeer();
      else if (peer.disconnected) { try { peer.reconnect(); } catch { openPeer(); } }
      if (conn && !conn.open) dropGuest();
    },
    leave(clear) {
      closed = true;
      clearInterval(hb);
      clearTimeout(retryT);
      send(msg('bye'));
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
        c.send(msg('hello', { token, app: APP_VERSION }));
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
          case 'react': o.onReaction(m.emoji); break;
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
            o.onFatal?.('Суперник вийшов з кімнати');
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
