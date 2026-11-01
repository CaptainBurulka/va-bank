// Імітація PeerJS через BroadcastChannel для e2e-тестів (не використовується в грі).
// Імітує й «погані» мобільні випадки:
//  • сервер сигналізації тримає ID ще GHOST_MS після обриву мережі («ID taken» / unavailable-id);
//  • втрата мережі: повідомлення губляться мовчки, сервер «відпадає» (disconnected), канали закриваються лише
//    через ICE_MS без відповіді (як згасання ICE у WebRTC);
//  • «згортання»: тест заморожує сторінку через CDP (Page.setWebLifecycleState) і перемикає document.hidden.
const realLS = window.localStorage;
try { Object.defineProperty(window, 'localStorage', { value: window.sessionStorage, configurable: true }); } catch (e) {}
(() => {
  const GHOST_MS = 15000;
  const ICE_MS = 12000;
  const REG = '__mockReg';
  const bc = new BroadcastChannel('mockpeer');
  const peers = {};
  const conns = {};
  let n = 0;
  let online = true;
  let offlineAt = 0;
  window.__hidden = false;
  try {
    Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (window.__hidden ? 'hidden' : 'visible'), configurable: true });
  } catch (e) {}
  const reg = () => { try { return JSON.parse(realLS.getItem(REG) || '{}'); } catch (e) { return {}; } };
  const setReg = (r) => realLS.setItem(REG, JSON.stringify(r));
  const held = (id) => { const t = reg()[id]; return t && Date.now() - t < GHOST_MS; };
  const claim = (id) => { const r = reg(); r[id] = Date.now(); setReg(r); };
  const release = (id) => { const r = reg(); delete r[id]; setReg(r); };
  const post = (m) => { if (online) bc.postMessage(m); };
  class Emitter { constructor() { this.h = {}; } on(e, f) { (this.h[e] ||= []).push(f); return this; } emit(e, ...a) { (this.h[e] || []).forEach((f) => f(...a)); } }
  class Conn extends Emitter {
    constructor(peer, remote, cid) { super(); this.peer_ = peer; this.peer = remote; this.cid = cid; this.open = false; this.seen = Date.now(); conns[cid] = this; }
    send(d) { if (!this.open) return; post({ t: 'data', cid: this.cid, to: this.peer, from: this.peer_.id, data: JSON.parse(JSON.stringify(d)) }); }
    close() { if (this.closed) return; const was = this.open; this.open = false; this.closed = true; post({ t: 'fin', cid: this.cid, to: this.peer }); if (was || true) this.emit('close'); }
  }
  class Peer extends Emitter {
    constructor(id) {
      super();
      this.id = typeof id === 'string' ? id : 'rnd' + Math.random().toString(36).slice(2);
      this.open = false; this.disconnected = false; this.destroyed = false;
      setTimeout(() => this._register(), 50);
    }
    _register() {
      if (this.destroyed) return;
      if (!online) { this.disconnected = true; this.emit('error', { type: 'network' }); return; }
      if (held(this.id) && !this.open) { this.disconnected = true; this.emit('error', { type: 'unavailable-id' }); return; }
      claim(this.id); peers[this.id] = this; this.open = true; this.disconnected = false; this.emit('open', this.id);
    }
    _drop() { if (this.destroyed || this.disconnected) return; this.open = false; this.disconnected = true; this.emit('disconnected'); }
    connect(id) {
      const cid = this.id + ':' + (++n) + ':' + Math.random();
      const c = new Conn(this, id, cid);
      setTimeout(() => {
        if (!online || this.disconnected) return; // сигнал загубився
        if (!held(id)) { this.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + id }); return; }
        post({ t: 'syn', cid, to: id, from: this.id });
      }, 30);
      return c;
    }
    reconnect() { if (this.destroyed) return; this.open = false; setTimeout(() => this._register(), 50); }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.open = false;
      if (peers[this.id] === this) { delete peers[this.id]; if (online) release(this.id); }
      Object.values(conns).filter((c) => c.peer_ === this).forEach((c) => c.close());
    }
  }
  bc.onmessage = ({ data: m }) => {
    if (!online) return;
    const p = peers[m.to];
    if (m.t === 'syn' && p && !p.destroyed && !p.disconnected) { const c = new Conn(p, m.from, m.cid); c.open = true; p.emit('connection', c); c.emit('open'); bc.postMessage({ t: 'ack', cid: m.cid, to: m.from }); }
    const c = conns[m.cid];
    if (c && !c.closed) c.seen = Date.now();
    if (m.t === 'ack') { if (c && !c.closed && peers[m.to] === c.peer_ || (c && !c.closed && c.peer_.id === m.to)) { c.open = true; c.emit('open'); } }
    if (m.t === 'data') { if (c && c.open && c.peer_.id === m.to) c.emit('data', m.data); }
    if (m.t === 'fin') { if (c && c.open && c.peer_.id === m.to) { c.open = false; c.closed = true; c.emit('close'); } }
    if (m.t === 'ka') { /* keepalive каналу */ }
  };
  // Серцебиття до «сервера» (тримає ID) і keepalive каналів (ICE)
  setInterval(() => {
    if (!online) {
      // ICE згасає: канали закриваються, коли довго немає відповіді
      for (const c of Object.values(conns)) if (c.open && Date.now() - c.seen > ICE_MS) { c.open = false; c.closed = true; c.emit('close'); }
      return;
    }
    const r = reg();
    for (const id of Object.keys(peers)) {
      const p = peers[id];
      if (p.destroyed || p.disconnected) continue;
      // сторінку було заморожено довше, ніж сервер чекає, — сервер нас уже «викинув»
      if (r[id] && Date.now() - r[id] > GHOST_MS) { p._drop(); continue; }
      r[id] = Date.now();
    }
    setReg(r);
    for (const c of Object.values(conns)) {
      if (!c.open) continue;
      bc.postMessage({ t: 'ka', cid: c.cid, to: c.peer, from: c.peer_.id });
      if (Date.now() - c.seen > ICE_MS) { c.open = false; c.closed = true; c.emit('close'); }
    }
  }, 500);
  // закриття сторінки: сервер звільняє ID, WebRTC-канали закриваються (як у справжньому браузері)
  window.addEventListener('beforeunload', () => { for (const id of Object.keys(peers)) release(id); for (const c of Object.values(conns)) if (c.open) bc.postMessage({ t: 'fin', cid: c.cid, to: c.peer }); });
  /** Мережа телефону: false — усе мовчки губиться, сервер «відпадає» через секунду. */
  window.__mockNet = (on) => {
    if (on === online) return;
    online = on;
    if (!on) { offlineAt = Date.now(); setTimeout(() => { if (!online) Object.values(peers).forEach((p) => p._drop()); }, 1000); }
    else { for (const c of Object.values(conns)) if (c.open) c.seen = Date.now(); window.dispatchEvent(new Event('online')); }
  };
  /** Згортання: hidden=true/false з подією visibilitychange. */
  window.__mockHide = (h) => { window.__hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
  // Сумісність зі старими тестами: різкий обрив усіх каналів (обидві сторони одразу)
  window.__mockKill = () => {
    Object.values(conns).forEach((c) => { if (c.open) { bc.postMessage({ t: 'fin', cid: c.cid, to: c.peer }); c.open = false; c.closed = true; c.emit('close'); } });
    window.__mockNet(false);
    setTimeout(() => window.__mockNet(true), 4000);
  };
  Object.defineProperty(window, 'Peer', { get() { return Peer; }, set() {} });
})();
