// Звуки синтезуються через Web Audio. Контекст створюється після першого тапу (вимога iOS).
let ac = null;
let master = null;
let muted = false;
let volume = 0.6;

try { muted = localStorage.getItem('vabank-muted') === '1'; } catch {}
try { const v = parseFloat(localStorage.getItem('vabank-volume')); if (v >= 0 && v <= 1) volume = v; } catch {}

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = volume;
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

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
  try { localStorage.setItem('vabank-volume', String(volume)); } catch {}
}
export const getVolume = () => volume;

// ───────── синтез ─────────
function env(g, t, vol, attack, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.005, lp = 0 }) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, vol, attack, dur);
  let node = o.connect(g);
  if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; g.connect(f); node = f; }
  node.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.08, vol = 0.2, delay = 0, freq = 3000, q = 1, type = 'bandpass' }) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** Керамічна фішка: короткий дзвінкий удар із двома обертонами. */
function clink(delay = 0, pitch = 1) {
  const f = (2600 + Math.random() * 500) * pitch;
  tone({ freq: f, dur: 0.06, vol: 0.08, delay, type: 'sine' });
  tone({ freq: f * 1.52, dur: 0.04, vol: 0.04, delay, type: 'sine' });
  noise({ dur: 0.025, vol: 0.12, delay, freq: 5000, q: 2 });
}

/** Теплий мідний акорд (тріангл через фільтр). */
function chord(freqs, { delay = 0, step = 0.07, dur = 0.5, vol = 0.12 } = {}) {
  freqs.forEach((f, i) => tone({ freq: f, dur, vol, delay: delay + i * step, type: 'triangle', attack: 0.02, lp: 2400 }));
}

/** Синтез для звуків скінів (ui/skins/sound.js). */
export const synth = { tone, noise, chord, clink, ready: () => !!ac && !muted };

let accentId = null;
let accentRarity = 'common';
let accentPlayer = null;
/** Звуковий акцент із косметики («Звук»): null — класика. rarity — рідкість предмета набору (додає шари звуку). */
export function setAccent(id, rarity = 'common') { accentId = id || null; accentRarity = rarity; }
/** Програвач акцентів наборів (ui/skins/sound.js) — реєструється з ui/cosmetics.js. */
export function setAccentPlayer(fn) { accentPlayer = fn; }

export const sfx = {
  tap: () => noise({ dur: 0.03, vol: 0.12, freq: 1800, q: 3 }),
  deal: (i = 0) => noise({ dur: 0.09, vol: 0.22, delay: i * 0.07, freq: 1400, q: 0.7 }),
  place: () => { noise({ dur: 0.08, vol: 0.32, freq: 380, q: 0.8, type: 'lowpass' }); tone({ freq: 120, dur: 0.1, vol: 0.12 }); },
  flip: () => { noise({ dur: 0.07, vol: 0.2, freq: 2600, q: 0.8 }); noise({ dur: 0.05, vol: 0.18, delay: 0.06, freq: 900, q: 1 }); },
  chip: (n = 3) => { for (let i = 0; i < Math.min(n, 6); i++) clink(i * 0.06); },
  chips: (n = 4) => { for (let i = 0; i < Math.min(n + 2, 9); i++) clink(i * 0.045, 0.9 + Math.random() * 0.2); },
  win: () => chord([392, 494, 587, 784], { step: 0.08, dur: 0.6 }),
  lose: () => chord([330, 277, 220], { step: 0.12, dur: 0.55, vol: 0.1 }),
  tie: () => chord([440, 440 * 1.25], { step: 0.14, dur: 0.35, vol: 0.09 }),
  tick: () => tone({ freq: 900, dur: 0.035, vol: 0.06, type: 'triangle', lp: 1800 }),
  turn: () => chord([587, 880], { step: 0.09, dur: 0.25, vol: 0.08 }),
  scout: () => tone({ freq: 300, to: 900, dur: 0.3, vol: 0.08, type: 'triangle', lp: 2000 }),
  allin: () => { tone({ freq: 98, to: 65, dur: 0.7, vol: 0.25, type: 'sawtooth', lp: 500 }); sfx.chips(6); },
  pop: () => tone({ freq: 520, to: 1040, dur: 0.12, vol: 0.1, type: 'sine' }),
  fanfare: () => { chord([392, 494, 587], { dur: 0.4 }); chord([523, 659, 784, 1046], { delay: 0.35, step: 0.06, dur: 0.9 }); },
  /** Напруга перед відкриттям карти в «Подвої»: низький гул і серцебиття, що прискорюється. */
  joker: (rarity = 'common') => {
    if (rarity === 'common') { tone({ freq: 660, to: 990, dur: 0.18, vol: 0.12, type: 'triangle' }); clink(0.12, 1.2); }
    else if (rarity === 'rare') { [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 0.18, vol: 0.09, delay: i * 0.06, type: 'sine' })); }
    else if (rarity === 'epic') { tone({ freq: 220, to: 880, dur: 0.6, vol: 0.12, type: 'sawtooth', lp: 1800 }); chord([523, 659, 784, 1046], { delay: 0.45, step: 0.05, dur: 0.8 }); }
    else {
      // легендарний: удар, сповільнений гул і фанфари
      tone({ freq: 55, to: 40, dur: 1.2, vol: 0.35, type: 'sine' });
      noise({ dur: 0.5, vol: 0.25, freq: 200, type: 'lowpass' });
      tone({ freq: 110, to: 220, dur: 1.4, vol: 0.12, type: 'sawtooth', lp: 900, delay: 0.2 });
      chord([392, 494, 587, 784, 988], { delay: 1.1, step: 0.09, dur: 1.2, vol: 0.13 });
    }
  },
  reelTick: () => noise({ dur: 0.02, vol: 0.12, freq: 3200, q: 4 }),
  reelStop: (i = 0) => { noise({ dur: 0.06, vol: 0.25, freq: 600, type: 'lowpass' }); tone({ freq: 300 + i * 120, dur: 0.08, vol: 0.12, type: 'square', lp: 1500 }); },
  jackpot: (rarity = 'rare') => {
    if (rarity === 'legendary') { sfx.joker('legendary'); for (let i = 0; i < 14; i++) clink(1.4 + i * 0.07, 0.8 + (i % 4) * 0.1); }
    else if (rarity === 'epic') { chord([523, 659, 784, 1046, 1318], { step: 0.07, dur: 0.7 }); for (let i = 0; i < 8; i++) clink(0.4 + i * 0.06); }
    else if (rarity === 'rare') chord([587, 740, 880], { step: 0.07, dur: 0.4 });
    else tone({ freq: 520, dur: 0.15, vol: 0.1, type: 'triangle' });
  },
  /** Великий банк / ва-банк: низький удар і уповільнений гул. */
  bigPot: () => {
    tone({ freq: 49, to: 41, dur: 1.1, vol: 0.3, type: 'sine' });
    tone({ freq: 98, to: 82, dur: 1.2, vol: 0.08, type: 'sawtooth', lp: 380, delay: 0.05 });
    [0, 0.42].forEach((d) => tone({ freq: 58, dur: 0.16, vol: 0.26, delay: d + 0.2, type: 'sine' }));
  },
  /** Пауза-напруга перед розкриттям: барабанний дріб, що наростає. */
  drumroll: (sec = 0.9) => {
    const n = Math.round(sec * 22);
    for (let i = 0; i < n; i++) noise({ dur: 0.05, vol: 0.05 + (0.18 * i) / n, delay: i * (sec / n), freq: 260, type: 'lowpass' });
  },
  /** Штамп «Блеф пройшов!» / «Слабкою картою!». */
  stamp: () => { noise({ dur: 0.14, vol: 0.4, freq: 180, type: 'lowpass' }); tone({ freq: 140, to: 70, dur: 0.22, vol: 0.25, type: 'sine' }); chord([523, 784], { delay: 0.12, step: 0.05, dur: 0.35, vol: 0.09 }); },
  /** Звуковий акцент тематичного набору (на перемогу і великі моменти). */
  accent: (big = false) => {
    if (!ac || muted || !accentId) return;
    if (accentPlayer) { accentPlayer(accentId, accentRarity, big); return; }
    const v = big ? 1.3 : 1;
    switch (accentId) {
      case 'bells': // церковні дзвони: низький удар + обертони
        [0, 0.38].forEach((d, k) => { const f = k ? 392 : 523; tone({ freq: f, dur: 1.4, vol: 0.12 * v, delay: d, attack: 0.003 }); tone({ freq: f * 2.76, dur: 0.9, vol: 0.05 * v, delay: d }); tone({ freq: f * 5.4, dur: 0.5, vol: 0.025 * v, delay: d }); });
        break;
      case 'koto': // пентатоніка, щипок
        [587, 659, 880, 988, 1175].forEach((f, i) => tone({ freq: f, dur: 0.5, vol: 0.09 * v, delay: i * 0.09, type: 'triangle', attack: 0.002, lp: 3000 }));
        break;
      case 'synth': // синтвейв-арпеджіо
        [220, 277, 330, 440, 554, 660].forEach((f, i) => tone({ freq: f, dur: 0.16, vol: 0.06 * v, delay: i * 0.06, type: 'sawtooth', lp: 1800 }));
        tone({ freq: 55, dur: 0.6, vol: 0.12 * v, type: 'square', lp: 300 });
        break;
      case 'bandura': // переливи бандури + удар бубна
        [392, 494, 587, 784, 587, 784].forEach((f, i) => tone({ freq: f, dur: 0.35, vol: 0.08 * v, delay: i * 0.075, type: 'triangle', attack: 0.002, lp: 2600 }));
        noise({ dur: 0.12, vol: 0.2 * v, delay: 0.5, freq: 3500, q: 0.8 });
        break;
    }
  },
  tension: () => {
    if (!ac || muted) return;
    tone({ freq: 73, to: 98, dur: 0.75, vol: 0.14, type: 'sawtooth', attack: 0.15, lp: 420 });
    [0, 0.28, 0.5, 0.66].forEach((d) => tone({ freq: 62, dur: 0.12, vol: 0.22, delay: d, type: 'sine' }));
  },
};
