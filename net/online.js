// Онлайн через WebRTC (PeerJS). Публічний сервер PeerJS — лише для встановлення з'єднання,
// далі дані йдуть напряму між телефонами. Хост тримає всю логіку (GameHost).
import { GameHost, BotSeat, cryptoRng } from './host.js';
import {
  ROOM_ALPHABET, PROTOCOL_VERSION, HOST_EPOCHS, msg, randomCode, randomToken, peerIdFor,
  parseGuestMessage, parseHostMessage, versionAdvice, compareVersions,
} from './protocol.js';
import { CONFIG, APP_VERSION } from '../config.js';
import { sanitizeSet } from '../game/jokers.js';
import { sanitizeLook } from '../meta/profile.js';

export { ROOM_ALPHABET };

const HOST_KEY = 'vabank-host';
const GUEST_KEY = 'vabank-guest';
const PING_MS = CONFIG.net.pingMs;
const DEAD_MS = CONFIG.net.deadMs;
const HOLD_MS = CONFIG.net.holdSec * 1000;
const NET_ERRORS = ['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'];

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
for (const t of Array.isArray(CONFIG.turn) ? CONFIG.turn : CONFIG.turn ? [CONFIG.turn] : []) if (t && t.urls) ICE.push({ ...t });
const PEER_OPTS = { debug: 0, config: { iceServers: ICE } };
const backoffMs = (n, base = 1000, cap = 8000) => Math.min(cap, base * 2 ** Math.min(n, 4));

const ERR_TEXT = {
  'room-full': 'У кімнаті вже немає вільних місць',
  version: 'Різні версії гри — онови сторінку на обох телефонах',
  'no-room': 'Кімнату не знайдено. Перевір код.',
};

// ───────────────────────── ХОСТ ─────────────────────────

import { PERSONAS } from '../game/banter.js';

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
  const slots = Array.from({ length: n }, (_, q) => ({ token: saved?.tokens?.[q] || (q === 1 ? saved?.guestToken : null) || null, conn: null, lastSeen: 0, goneAt: 0, proxy: null, aid: 0 }));
  const botSeats = Array.from({ length: n }, (_, q) => !!saved?.bots?.[q]);
  let peer = null; // peer, що слухає нові з'єднання
  const retired = new Set(); // старі peer'и без сервера сигналізації — тримаємо, доки живі їхні канали з гостями
  let epoch = 0;
  let opened = false;
  let closed = false;
  let retryT = null;
  let retryPending = false;
  let backoff = 0;
  let freshTries = 0;

  const me = o.profile || { set: [], look: null, name: null };
  const extra = () => ({ code, players: n, guestToken: slots[1]?.token || null, tokens: slots.map((x) => x.token), bots: botSeats.slice(), personas: host?.personas?.slice() || [] });
  const host = new GameHost({ timers: true, persistKey: HOST_KEY, extra: {}, gameConfig: o.gameConfig || {}, gameOpts: { players: n, mode: o.mode || 'classic', jokerSets: Array.from({ length: n }, (_, q) => (q === 0 ? sanitizeSet(me.set) : [])) } });
  host.extra = extra();
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
    deliver: (m) => send(q, msg('state', { msg: m, ack: slots[q].aid })),
    reaction: (emoji, from) => send(q, msg('react', { emoji, from })),
    say: (key, from) => send(q, msg('say', { key, from })),
    error: (c) => send(q, msg('error', { code: c })),
  });
  host.seats[0] = { deliver: o.onMessage, reaction: (e, from) => o.onReaction(e, from), say: (key, from) => o.onSay?.(key, from) };
  host.connected[0] = true;
  for (let q = 1; q < n; q++) {
    if (botSeats[q]) { seatBot(q); continue; }
    host.seats[q] = remoteSeat(q);
    host.connected[q] = false;
  }
  host.hidden = document.hidden;

  // збереження старої версії, яке не вдалося прочитати, — кімната відкривається з новою партією
  if (saved?.state && !host.restore(saved)) o.onStatus?.({ started: false, oppConnected: false, code, error: 'Стару партію не вдалося відкрити — гра почнеться заново' });

  function seatBot(q) {
    botSeats[q] = true;
    // персонаж: збережений (відновлення кімнати) або випадковий з тих, кого ще немає за столом
    const taken = new Set(host.personas.filter(Boolean));
    const free = PERSONAS.filter((x) => !taken.has(x.id));
    const per = (saved?.personas?.[q] && PERSONAS.find((x) => x.id === saved.personas[q])) || free[Math.floor(Math.random() * free.length)] || PERSONAS[0];
    const bot = new BotSeat(host, q, Math.random, per.style, per.id);
    host.seats[q] = bot;
    host.bots[q] = true;
    host.connected[q] = true;
    host.names[q] = per.name;
    host.avatars[q] = per.avatar;
    host.personas[q] = per.id;
  }

  function send(q, m) {
    const c = slots[q]?.conn;
    if (c && c.open) { try { c.send(m); } catch {} }
  }

  function dropGuest(q) {
    const c = slots[q].conn;
    slots[q].conn = null;
    if (c) { try { c.close(); } catch {} }
    if (!slots[q].goneAt) slots[q].goneAt = Date.now();
    if (slots[q].proxy) return status();
    host.setConnected(q, false);
    status();
  }

  // Гравець не повернувся за HOLD_MS — за нього тимчасово грає бот; місце лишається за токеном.
  function proxyBot(q) {
    const s = slots[q];
    s.proxy = new BotSeat(host, q, Math.random, 'cautious');
    host.seats[q] = s.proxy;
    host.bots[q] = true;
    host.away[q] = false;
    host.connected[q] = true;
    host.refresh();
    status({ proxy: q });
  }
  function unproxy(q) {
    const s = slots[q];
    s.proxy.stop();
    s.proxy = null;
    host.bots[q] = false;
    host.seats[q] = remoteSeat(q);
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
          slot.goneAt = 0;
          if (slot.proxy) unproxy(q);
          host.away[q] = false;
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
          case 'action': {
            const sl = slots[seatOf];
            if (m.aid) {
              if (m.aid <= sl.aid) { host.sendTo(seatOf); break; } // повтор уже прийнятої дії — лише підтверджуємо
              sl.aid = m.aid;
            }
            host.dispatch(seatOf, m.action);
            break;
          }
          case 'react': host.relayReaction(seatOf, m.emoji); break;
          case 'ping': send(seatOf, msg('pong')); break;
          case 'away': host.setAway(seatOf, m.hidden); slots[seatOf].awayAt = m.hidden ? Date.now() : 0; status(); break;
          case 'bye': dropGuest(seatOf); status({ left: true, leftSeat: seatOf }); break;
        }
      });
      c.on('close', () => { if (seatOf !== null && c === slots[seatOf].conn) dropGuest(seatOf); });
      c.on('error', () => { if (seatOf !== null && c === slots[seatOf].conn) dropGuest(seatOf); });
    });
  }

  function sweepRetired() {
    for (const p of retired) {
      if (slots.some((x) => x.conn && x.conn._vbPeer === p && x.conn.open)) continue;
      try { p.destroy(); } catch {}
      retired.delete(p);
    }
  }

  // Новий peer. Старий не знищуємо: destroy() закрив би живі канали з гостями (вони не залежать від сервера).
  function openPeer(bump = false) {
    if (closed) return;
    clearTimeout(retryT);
    retryPending = false;
    if (peer && !peer.destroyed) retired.add(peer);
    if (bump) epoch = (epoch + 1) % HOST_EPOCHS;
    const p = new Peer(peerIdFor(code, epoch), PEER_OPTS);
    peer = p;
    p.on('open', () => {
      if (p !== peer || closed) return;
      backoff = 0;
      opened = true;
      sweepRetired();
      o.onCode(code);
      status({ error: null });
    });
    p.on('connection', (c) => { c._vbPeer = p; onConnection(c); });
    p.on('disconnected', () => { if (p === peer && !closed) signalLost(); });
    p.on('error', (e) => {
      if (p !== peer || closed) return;
      if (e.type === 'unavailable-id') {
        // Новій кімнаті трапився зайнятий код — беремо інший
        if (!host.state && !saved && !opened && epoch === 0 && freshTries++ < 5) {
          retired.delete(p);
          try { p.destroy(); } catch {}
          code = randomCode(cryptoRng);
          host.extra = extra();
          return openPeer();
        }
        // ID ще тримає наша ж «привидна» сесія (обрив мобільної мережі) — одразу наступна епоха
        retryPending = true;
        retryT = setTimeout(() => openPeer(true), 200);
        return;
      }
      if (NET_ERRORS.includes(e.type)) signalLost();
    });
  }

  function signalLost() {
    if (closed || retryPending) return;
    retryPending = true;
    const live = slots.some((x, q) => q > 0 && x.conn && x.conn.open);
    if (!live) status({ error: 'Немає зв\'язку із сервером, повторюю…' });
    retryT = setTimeout(() => openPeer(true), backoffMs(backoff++));
  }

  // Серцебиття: якщо гість мовчить — вважаємо його відключеним і ставимо паузу.
  const hb = setInterval(() => {
    const now = Date.now();
    for (let q = 1; q < n; q++) {
      const s = slots[q];
      const c = s.conn;
      if (c && c.open) {
        send(q, msg('ping'));
        if (now - s.lastSeen > DEAD_MS) dropGuest(q);
      } else if (c) dropGuest(q);
      const gone = (s.goneAt && !s.conn) || (s.awayAt && host.away[q]);
      const since = s.conn ? s.awayAt : s.goneAt;
      if (gone && !s.proxy && !botSeats[q] && s.token && host.state && host.state.phase !== 'over' && now - since > HOLD_MS) proxyBot(q);
    }
    sweepRetired();
    // Страховка: сервер сигналізації втрачено, а повтор не заплановано
    if (!closed && !retryPending && (!peer || peer.destroyed || peer.disconnected)) signalLost();
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
      // Повернулися в застосунок: перевіряємо сервер і канали, не чекаючи серцебиття.
      if (!peer || peer.destroyed || peer.disconnected) { backoff = 0; retryPending = false; openPeer(true); }
      for (let q = 1; q < n; q++) {
        if (slots[q].conn && !slots[q].conn.open) dropGuest(q);
        else send(q, msg('ping'));
      }
    },
    leave(clear) {
      closed = true;
      clearInterval(hb);
      clearTimeout(retryT);
      for (let q = 1; q < n; q++) send(q, msg('bye'));
      host.stop();
      for (const s of slots) s.proxy?.stop();
      setTimeout(() => { try { peer?.destroy(); } catch {} for (const p of retired) { try { p.destroy(); } catch {} } }, 200);
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
  const prev = o.resume?.code === code ? o.resume : loadGuestSave()?.code === code ? loadGuestSave() : null;
  // Гравця впізнаємо за постійним токеном (localStorage), а не за peer ID: ID щоразу новий.
  let token = prev?.token || null;
  let lastEpoch = prev?.epoch || 0;
  let peer = null;
  const retired = new Set();
  let conn = null; // підтверджене хостом з'єднання (після welcome)
  let trying = []; // з'єднання поточної спроби — до всіх епох ID хоста одразу
  let attemptId = 0;
  let unavailable = 0;
  let attemptT = null;
  let joined = false;
  let closed = false;
  let lastSeen = 0;
  let retryT = null;
  let retryPending = false;
  let attempt = 0;
  let hostConnected = false;
  let savedAt = 0;
  let checkT = null;

  const status = (extra = {}) => o.onStatus({ joined, hostConnected, ...extra });
  const save = (phase) => { savedAt = Date.now(); store.set(GUEST_KEY, { code, token, epoch: lastEpoch, at: savedAt, phase: phase || null }); };

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (text) => {
      if (!settled) { settled = true; reject(new Error(text)); cleanup(); }
      else { status({ error: text }); }
    };

    function send(m) {
      if (conn && conn.open) { try { conn.send(m); return true; } catch {} }
      return false;
    }
    // Хід, зроблений, поки канал мертвий, не губиться: чекає на перепідключення (хост однаково перевірить його).
    // Канал може бути «напівмертвим» (обрив ще не виявлено) — тоді send() мовчки губить дію.
    // Тому останній хід зберігаємо, доки не прийде стан; після перепідключення шлемо ще раз, якщо він досі доречний.
    let outbox = null;
    let aid = Date.now(); // зростає й після перезапуску сторінки
    function sendAction(a) {
      outbox = msg('action', { action: a, aid: ++aid });
      outbox.at = Date.now();
      send(outbox);
    }
    // Непідтверджений хід повторюємо (хост відкидає повтори за aid)
    function retryOutbox(force = false) {
      if (outbox && (force || Date.now() - outbox.at > 1500)) { outbox.at = Date.now(); send(outbox); }
    }

    function scheduleReconnect() {
      if (closed || retryPending) return;
      retryPending = true;
      hostConnected = false;
      status({ reconnecting: true });
      clearTimeout(retryT);
      retryT = setTimeout(connect, backoffMs(attempt++, 500, 3000)); // гість: часто, щоб повернутись одразу, щойно хост знову в мережі
    }

    function hostLost() {
      hostConnected = false;
      status({ reconnecting: true });
      scheduleReconnect();
    }

    function abandon() {
      clearTimeout(attemptT);
      for (const c of trying) if (c !== conn) { try { c.close(); } catch {} }
      trying = [];
    }

    // Кожна спроба — з живим peer'ом; старий ID ніколи не перевикористовуємо (сервер міг його ще тримати → «ID taken»).
    function newPeer() {
      if (closed) return;
      if (peer && !peer.destroyed) {
        if (conn && conn._vbPeer === peer && conn.open) retired.add(peer);
        else { try { peer.destroy(); } catch {} }
      }
      const p = new Peer(PEER_OPTS);
      peer = p;
      p.on('open', () => { if (p === peer && !closed) connect(); });
      // Сервер сигналізації зник — канал до хоста може ще жити; нова спроба — лише коли канал теж мертвий.
      p.on('disconnected', () => { if (p === peer && !closed && !(conn && conn.open)) { retryPending = false; scheduleReconnect(); } });
      p.on('error', (e) => {
        if (p !== peer || closed) return;
        if (e.type === 'peer-unavailable') {
          if (++unavailable >= trying.length && trying.length) {
            abandon();
            if (joined) scheduleReconnect(); else fail(ERR_TEXT['no-room']);
          }
          return;
        }
        if (e.type === 'unavailable-id' || NET_ERRORS.includes(e.type)) {
          try { p.destroy(); } catch {}
          if (joined) { retryPending = false; scheduleReconnect(); }
          else fail('Немає зв\'язку із сервером. Перевір інтернет.');
        }
      });
    }

    function connect() {
      if (closed) return;
      retryPending = false;
      clearTimeout(retryT);
      if (!peer || peer.destroyed || peer.disconnected) return newPeer();
      if (!peer.open) { retryPending = true; retryT = setTimeout(connect, 800); return; }
      abandon();
      const id = ++attemptId;
      unavailable = 0;
      const order = [lastEpoch, ...Array.from({ length: HOST_EPOCHS }, (_, k) => k).filter((k) => k !== lastEpoch)];
      trying = order.map((k) => {
        const c = peer.connect(peerIdFor(code, k), { reliable: true, serialization: 'json' });
        c._vbPeer = peer;
        c._epoch = k;
        wire(c, id);
        return c;
      });
      attemptT = setTimeout(() => {
        if (id !== attemptId) return;
        abandon();
        if (joined) scheduleReconnect(); else fail(ERR_TEXT['no-room']);
      }, joined ? 6000 : 12000); // повторна спроба — коротше: поки чекаємо «мертву» спробу, хост міг уже повернутись
    }

    function wire(c, id) {
      c.on('open', () => {
        if (id !== attemptId || !trying.includes(c)) { try { c.close(); } catch {} return; }
        c.send(msg('hello', { token, app: APP_VERSION, set: o.profile?.set || [], look: o.profile?.look || null, name: o.profile?.name || null, pid: o.profile?.pid || null, title: o.profile?.title || null }));
      });
      c.on('data', (raw) => {
        if (c !== conn && !trying.includes(c)) return;
        const p = parseHostMessage(raw);
        if (!p.ok) { if (p.error === 'version') { closed = true; o.onFatal?.(versionAdvice(APP_VERSION, p.app)); } return; }
        const m = p.m;
        if (m.type === 'welcome') {
          const old = conn;
          conn = c;
          if (old && old !== c) { try { old.close(); } catch {} }
          lastEpoch = c._epoch;
          abandon();
          lastSeen = Date.now();
          token = m.token;
          o.onOppLook?.(sanitizeLook(m.look));
          save();
          joined = true;
          hostConnected = true;
          attempt = 0;
          status();
          if (document.hidden) send(msg('away', { hidden: true }));
          retryOutbox(true);
          if (!settled) { settled = true; resolve(api); }
          return;
        }
        if (c !== conn) {
          if (m.type === 'error') handleError(m);
          return;
        }
        lastSeen = Date.now();
        switch (m.type) {
          case 'state':
            hostConnected = true;
            o.onMessage(m.msg);
            if (outbox && (m.ack || 0) >= outbox.aid) outbox = null;
            else retryOutbox();
            if (Date.now() - savedAt > 10000 || m.msg?.view?.phase === 'over') save(m.msg?.view?.phase);
            status();
            break;
          case 'react': o.onReaction(m.emoji, m.from); break;
          case 'say': o.onSay?.(m.key, m.from); break;
          case 'ping': send(msg('pong')); break;
          case 'error': handleError(m); break;
          case 'bye':
            closed = true;
            clearGuestSave();
            o.onFatal?.('Господар кімнати вийшов');
            cleanup();
            break;
        }
      });
      const lost = () => { if (c === conn && !closed) { conn = null; hostLost(); } };
      c.on('close', lost);
      c.on('error', lost);
    }

    function handleError(m) {
      if (m.code !== 'room-full' && m.code !== 'version') { o.onReject?.(m.code); return; }
      const text = m.code === 'version' ? versionAdvice(APP_VERSION, m.app) : ERR_TEXT[m.code];
      closed = true;
      clearGuestSave();
      if (!settled) fail(text);
      else o.onFatal?.(text);
      cleanup();
    }

    function cleanup() {
      closed = true;
      clearInterval(hb);
      clearTimeout(retryT);
      clearTimeout(attemptT);
      clearTimeout(checkT);
      setTimeout(() => {
        try { peer?.destroy(); } catch {}
        for (const p of retired) { try { p.destroy(); } catch {} }
      }, 200);
    }

    const hb = setInterval(() => {
      if (!joined || closed) return;
      if (conn && conn.open) {
        send(msg('ping'));
        retryOutbox();
        if (Date.now() - lastSeen > DEAD_MS) {
          const c = conn;
          conn = null;
          try { c.close(); } catch {}
          hostLost();
        }
      } else if (!retryPending && !trying.length) { conn = null; hostLost(); } // страховка від «вічного» очікування
      for (const p of retired) if (!(conn && conn._vbPeer === p)) { try { p.destroy(); } catch {} retired.delete(p); }
    }, PING_MS);

    const api = {
      mode: 'online-guest',
      send: sendAction,
      react: (e) => send(msg('react', { emoji: e })),
      rematch: () => sendAction({ type: 'rematch' }),
      onVisibility(hidden) {
        if (closed || !joined) return;
        send(msg('away', { hidden }));
        if (hidden) return;
        // Повернулися: мертвий канал — одразу нова спроба; «живий» — перевіряємо відповіддю за 3 с.
        if (!conn || !conn.open) { attempt = 0; clearTimeout(retryT); retryPending = false; connect(); return; }
        const t0 = Date.now();
        send(msg('ping'));
        clearTimeout(checkT);
        checkT = setTimeout(() => {
          if (closed || lastSeen >= t0) return;
          const c = conn;
          conn = null;
          try { c?.close(); } catch {}
          attempt = 0;
          retryPending = false;
          hostConnected = false;
          status({ reconnecting: true });
          connect();
        }, 3000);
      },
      leave(clear) {
        send(msg('bye'));
        cleanup();
        if (clear) clearGuestSave();
      },
    };

    newPeer();
  });
}
