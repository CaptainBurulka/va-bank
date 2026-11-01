// Звукові акценти наборів. Рідкість додає шари: звичайна — короткий мотив; рідкісна — + дзвінкий обертон;
// епічна — + відлуння; легендарна — повний мотив із басом, блискітками й довгим хвостом.
import { synth } from '../sound.js';
import { rarIndex } from './core.js';

const MOTIF = {
  // церковні дзвони над Дніпром: низький удар + обертони дзвона
  bells: (t, v) => [523, 392, 659].forEach((fq, i) => { const d = i * .34; t({ freq: fq, dur: 1.5, vol: .12 * v, delay: d, attack: .003 }); t({ freq: fq * 2.76, dur: .9, vol: .05 * v, delay: d }); t({ freq: fq * 5.4, dur: .45, vol: .025 * v, delay: d }); }),
  // синтвейв-арпеджіо з пилкою
  // кото: пентатоніка міякобусі, щипок із довгим згасанням
  koto: (t, v) => [587, 622, 784, 880, 932, 1175].forEach((fq, i) => { const d = i * .13; t({ freq: fq, dur: 1.1, vol: .1 * v, delay: d, type: 'triangle', attack: .002, lp: 3200 }); t({ freq: fq * 2, dur: .25, vol: .03 * v, delay: d, attack: .001 }); }),
  // бандура: перебір гармонічного мінору з легким «дзвоном» струни
  bandura: (t, v) => [220, 262, 330, 415, 440, 523].forEach((fq, i) => { const d = i * .1; t({ freq: fq, dur: .9, vol: .09 * v, delay: d, type: 'triangle', attack: .002, lp: 2600 }); t({ freq: fq * 1.003, dur: .7, vol: .04 * v, delay: d + .004, type: 'sawtooth', lp: 1400 }); }),
  // джазове фортепіано: Cmaj9 арпеджіо + «щітка» по малому барабану
  jazz: (t, v, n) => { [262, 330, 392, 494, 587].forEach((fq, i) => { const d = i * .07; t({ freq: fq, dur: 1.2, vol: .08 * v, delay: d, type: 'triangle', attack: .004, lp: 2200 }); t({ freq: fq * 2, dur: .4, vol: .02 * v, delay: d }); }); n?.({ dur: .35, vol: .08, freq: 6000, q: .4, delay: .05 }); },
  // сонар: «пінг» із відлунням у глибині та низький гул
  sonar: (t, v) => { [0, .42, .84].forEach((d, i) => t({ freq: 1320, dur: .9, vol: (.11 / (i + 1)) * v, delay: d, attack: .002 })); t({ freq: 98, to: 82, dur: 1.6, vol: .07 * v, lp: 300 }); },
  // 8-біт: «монетка» квадратною хвилею і коротке арпеджіо
  chip: (t, v) => { t({ freq: 988, dur: .08, vol: .06 * v, type: 'square' }); t({ freq: 1319, dur: .3, vol: .06 * v, delay: .08, type: 'square' }); [523, 659, 784, 1047].forEach((fq, i) => t({ freq: fq, dur: .09, vol: .045 * v, delay: .4 + i * .07, type: 'square' })); },
  // космос: повітряний пед із розстроєних синусів і мерехтливі високі тони
  cosmos: (t, v) => { [196, 247, 294, 370].forEach((fq) => { t({ freq: fq, dur: 2, vol: .045 * v, attack: .5 }); t({ freq: fq * 1.006, dur: 2, vol: .035 * v, attack: .6 }); }); [1760, 2217, 2637, 3136].forEach((fq, i) => t({ freq: fq, dur: .5, vol: .025 * v, delay: .3 + i * .18 })); },
  synth: (t, v) => [220, 277, 330, 440, 554, 660].forEach((fq, i) => t({ freq: fq, dur: .16, vol: .06 * v, delay: i * .06, type: 'sawtooth', lp: 1900 })),
};

/** Акцент набору з урахуванням рідкості. */
export function playAccent(accent, rarity) {
  if (!synth.ready()) return;
  const { tone, noise, chord } = synth;
  const r = rarIndex(rarity);
  const v = 1 + r * .15;
  MOTIF[accent]?.(tone, v, noise);
  if (r >= 1) tone({ freq: 2093, dur: .5, vol: .05, delay: .05, type: 'sine' }); // блиск металу
  if (r >= 2) MOTIF[accent]?.((o) => tone({ ...o, delay: (o.delay || 0) + .28, vol: (o.vol || .1) * .35 }), 1); // відлуння
  if (r >= 3) {
    tone({ freq: 55, to: 41, dur: 1.6, vol: .3, type: 'sine' });
    noise({ dur: .6, vol: .18, freq: 220, type: 'lowpass' });
    chord([523, 659, 784, 1046, 1318], { delay: .9, step: .08, dur: 1.4, vol: .1 });
    for (let i = 0; i < 8; i++) tone({ freq: 2600 + i * 180, dur: .08, vol: .03, delay: 1.2 + i * .07, type: 'sine' });
  }
}

/** Звуки церемонії випадіння. */
export const ceremonySfx = {
  hum: (rarity) => { if (!synth.ready()) return; const r = rarIndex(rarity); synth.tone({ freq: 70 + r * 10, to: 90 + r * 30, dur: 1 + r * .4, vol: .06 + r * .03, type: 'sawtooth', lp: 500 }); },
  ding: () => synth.ready() && [1568, 2093].forEach((fq, i) => synth.tone({ freq: fq, dur: .6, vol: .08, delay: i * .08 })),
  whoosh: () => synth.ready() && synth.noise({ dur: .5, vol: .2, freq: 1200, q: .6 }),
  boom: () => { if (!synth.ready()) return; synth.tone({ freq: 60, to: 30, dur: 1.2, vol: .38 }); synth.noise({ dur: .7, vol: .3, freq: 180, type: 'lowpass' }); },
  heart: () => synth.ready() && [0, .3].forEach((d) => synth.tone({ freq: 55, dur: .14, vol: .25, delay: d })),
};
