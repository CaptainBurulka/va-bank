// Імітація PeerJS через BroadcastChannel для e2e-тестів (не використовується в грі).
try { Object.defineProperty(window, 'localStorage', { value: window.sessionStorage, configurable: true }); } catch (e) {}
(() => {
  const bc = new BroadcastChannel('mockpeer');
  const peers = {};
  const conns = {};
  let n = 0;
  class Emitter { constructor(){ this.h={}; } on(e,f){ (this.h[e] ||= []).push(f); return this; } emit(e,...a){ (this.h[e]||[]).forEach(f=>f(...a)); } }
  class Conn extends Emitter {
    constructor(peer, remote, cid){ super(); this.peer=peer; this.peer_=remote; this.cid=cid; this.open=false; conns[cid]=this; }
    send(d){ if(!this.open) return; bc.postMessage({t:'data', cid:this.cid, to:this.peer_, from:this.peer.id, data:JSON.parse(JSON.stringify(d))}); }
    close(){ if(!this.open && this.closed) return; this.open=false; this.closed=true; bc.postMessage({t:'fin', cid:this.cid, to:this.peer_}); this.emit('close'); }
  }
  class Peer extends Emitter {
    constructor(id){ super(); this.id = typeof id==='string'? id : 'rnd'+Math.random().toString(36).slice(2); this.open=false; this.disconnected=false; this.destroyed=false; peers[this.id]=this; setTimeout(()=>{ this.open=true; this.emit('open', this.id); }, 50); }
    connect(id){ const cid = this.id+':'+(++n)+':'+Math.random(); const c = new Conn(this, id, cid); c.timer=setTimeout(()=>{ if(!c.open) this.emit('error',{type:'peer-unavailable'}); }, 800); bc.postMessage({t:'syn', cid, to:id, from:this.id}); return c; }
    reconnect(){ this.disconnected=false; }
    destroy(){ this.destroyed=true; this.open=false; delete peers[this.id]; Object.values(conns).filter(c=>c.peer===this).forEach(c=>c.close()); }
  }
  bc.onmessage = ({data:m}) => {
    if (window.__mockDead) return;
    const p = peers[m.to];
    if (m.t==='syn' && p && !p.destroyed) { const c = new Conn(p, m.from, m.cid); c.open=true; p.emit('connection', c); c.emit('open'); bc.postMessage({t:'ack', cid:m.cid, to:m.from}); }
    if (m.t==='ack') { const c=conns[m.cid]; if (c && peers[m.to]) { c.open=true; clearTimeout(c.timer); c.emit('open'); } }
    if (m.t==='data') { const c=conns[m.cid]; if (c && c.open && c.peer.id===m.to) c.emit('data', m.data); }
    if (m.t==='fin') { const c=conns[m.cid]; if (c && c.open && c.peer.id===m.to) { c.open=false; c.emit('close'); } }
  };
  window.__mockKill = () => { Object.values(conns).forEach(c=>{ if(c.open){ c.open=false; c.emit('close'); } }); window.__mockDead = true; setTimeout(()=>window.__mockDead=false, 4000); };
  Object.defineProperty(window, 'Peer', { get(){ return Peer; }, set(){} });
})();
