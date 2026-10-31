// Звуки синтезуються через Web Audio. Контекст створюється після першого тапу (вимога iOS).
let ac = null;
let master = null;
let muted = false;

try { muted = localStorage.getItem('vabank-muted') === '1'; } catch {}

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  // Тихий буфер «розблоковує» звук на iOS
  const b = ac.createBuffer(1, 1, 22050);
  const src = ac.createBufferSource();
  src.buffer = b;
  src.connect(master);
  src.start(0);
}

export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('vabank-muted', v ? '1' : '0'); } catch {}
}
export const isMuted = () => muted;

function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.005 }) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.08, vol = 0.2, delay = 0, freq = 3000, q = 1 }) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  tap: () => tone({ freq: 660, dur: 0.05, vol: 0.12, type: 'triangle' }),
  deal: (i = 0) => noise({ dur: 0.07, vol: 0.25, delay: i * 0.08, freq: 2500, q: 0.8 }),
  place: () => { noise({ dur: 0.06, vol: 0.3, freq: 1200 }); tone({ freq: 180, dur: 0.08, vol: 0.15 }); },
  flip: () => { noise({ dur: 0.1, vol: 0.25, freq: 3500, q: 0.6 }); tone({ freq: 500, to: 900, dur: 0.12, vol: 0.08, type: 'triangle' }); },
  chip: (n = 3) => { for (let i = 0; i < Math.min(n, 6); i++) tone({ freq: 2200 + Math.random() * 900, dur: 0.05, vol: 0.12, delay: i * 0.055, type: 'square' }); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.22, vol: 0.18, delay: i * 0.09, type: 'triangle' })),
  lose: () => [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.3, vol: 0.16, delay: i * 0.12, type: 'sawtooth' })),
  tie: () => { tone({ freq: 440, dur: 0.2, vol: 0.14, type: 'triangle' }); tone({ freq: 440, dur: 0.2, vol: 0.14, delay: 0.18, type: 'triangle' }); },
  tick: () => tone({ freq: 1200, dur: 0.03, vol: 0.08, type: 'square' }),
  turn: () => { tone({ freq: 880, dur: 0.1, vol: 0.12, type: 'sine' }); tone({ freq: 1320, dur: 0.14, vol: 0.1, delay: 0.08 }); },
  scout: () => tone({ freq: 300, to: 1400, dur: 0.35, vol: 0.12, type: 'sine' }),
  allin: () => { tone({ freq: 110, to: 55, dur: 0.6, vol: 0.3, type: 'sawtooth' }); noise({ dur: 0.4, vol: 0.2, freq: 400 }); },
  pop: () => tone({ freq: 400, to: 1200, dur: 0.12, vol: 0.15, type: 'sine' }),
  fanfare: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.25, vol: 0.18, delay: i * 0.12, type: 'triangle' })),
};
