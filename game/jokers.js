// Джокери: каталог і розв'язання при розкритті. Чиста логіка без DOM і мережі.
//
// Принципи:
// • Джокер — звичайна карта, що кладеться сорочкою догори. Ефект спрацьовує ЛИШЕ при розкритті
//   (якщо хтось спасував — джокер згорає без ефекту). Нових фаз і рішень немає.
// • Рідкість = розмах і видовищність, НЕ сила: кожен джокер налаштований симуляціями на ~50% перемог.
// • Фішки ніколи не з'являються і не зникають: усі переміщення — між гравцями, у банк або в джекпот.
//
// Порядок спрацювання, якщо джокери зіграли обидва:
//   0. Скасування (Вибух, Назад у часі) — якщо спрацювало, інші джокери не діють.
//   1. Заміна карт і ставок (Буря, Обмін, Рокіровка, Монетка…).
//   2. Сила карт (Рулетка, Перевертень, Тінь…), потім модифікатори (Магніт, Анти-козир…).
//   3. Підсумок: розрахунки після того, як визначено переможця (Злодій, Страховка…).
//   Усередині етапу першим діє джокер нижчої рідкості; за рівної — того, хто ходив першим у торгах.

import { JOKER_TUNING as T } from '../config.js';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_NAME = { common: 'Звичайний', rare: 'Рідкісний', epic: 'Епічний', legendary: 'Легендарний' };
const STAGE = { cancel: 0, replace: 1, power: 2 };

// Допоміжне: «моя карта все ще цей джокер?» (після заміни карт сила джокера вже не діє)
const isMine = (api) => api.X.cards[api.me]?.kind === 'joker' && api.X.cards[api.me].id === api.card.id;
const setPow = (api, v) => { if (isMine(api)) api.X.pow[api.me] = v; };

/** Каталог. power — номінальна сила (для розвідки й порівняння, якщо ефект її не змінив). */
export const JOKERS = [
  // ───── Звичайні: простий ефект ─────
  { id: 'turncoat', name: 'Перевертень', rarity: 'common', icon: '🙃', power: T.turncoat.power, stage: 'power',
    desc: 'Цього розкриття перемагає МЕНША карта.',
    apply: (api) => { api.X.lowWins = !api.X.lowWins; api.note('Перевертень: перемагає менша карта'); } },
  { id: 'roulette', name: 'Рулетка', rarity: 'common', icon: '🎡', stage: 'power',
    desc: `Сила — випадкова від 1 до ${T.roulette.max}.`,
    apply: (api) => { const v = 1 + Math.floor(api.rng() * T.roulette.max); setPow(api, v); api.note(`Рулетка: сила ${v}`); } },
  { id: 'thief', name: 'Злодій', rarity: 'common', icon: '🦝', power: T.thief.power, stage: 'power',
    desc: `Сила ${T.thief.power}. За будь-якого результату забираєш у суперника ${T.thief.steal} фішок.`,
    apply: (api) => api.after(() => { const n = api.transfer(api.opp, api.me, T.thief.steal); api.note(`Злодій поцупив ${n}`); }) },
  { id: 'fist', name: 'Важкий кулак', rarity: 'common', icon: '👊', power: T.fist.power, stage: 'power',
    desc: `Сила ${T.fist.power} без масті, нічию програє.`,
    apply: (api) => { if (isMine(api)) api.X.loseTie[api.me] = true; api.note(`Важкий кулак: сила ${T.fist.power}`); } },
  { id: 'insurance', name: 'Страховка', rarity: 'common', icon: '☂️', power: T.insurance.power, stage: 'power',
    desc: `Сила ${T.insurance.power}. Якщо програєш — твоя частина банку повертається тобі.`,
    apply: (api) => api.after(({ winner }) => {
      if (winner !== api.opp) return;
      const n = api.transfer(api.opp, api.me, api.contrib(api.me));
      api.note(`Страховка повернула ${n}`);
    }) },
  { id: 'twin', name: 'Двійник', rarity: 'common', icon: '👯', stage: 'power',
    desc: 'Копіює силу випадкової карти з твоєї руки.',
    apply: (api) => { const c = api.randomInHand(api.me); const v = c?.pow ?? 1; setPow(api, v); api.note(`Двійник: сила ${v}`); } },
  { id: 'chameleon', name: 'Хамелеон', rarity: 'common', icon: '🦎', power: T.chameleon.power, stage: 'power',
    desc: `Сила ${T.chameleon.power} і масть козиря (отримує бонус козиря).`,
    apply: (api) => {
      if (!isMine(api)) return;
      const t = api.s.trump;
      api.X.suit[api.me] = t;
      setPow(api, T.chameleon.power + (t ? api.trumpDelta(api.me) : 0));
      api.note('Хамелеон став козирем');
    } },
  { id: 'modest', name: 'Скромник', rarity: 'common', icon: '🐭', power: T.modest.power, stage: 'power',
    desc: `Сила ${T.modest.power}. Якщо переможе — суперник доплачує половину банку.`,
    apply: (api) => api.after(({ winner, pot }) => {
      if (winner !== api.me) return;
      const n = api.transfer(api.opp, api.me, Math.floor(pot / 2));
      api.note(`Скромник: суперник доплатив ${n}`);
    }) },
  { id: 'tax', name: 'Податок', rarity: 'common', icon: '🧾', power: T.tax.power, stage: 'power',
    desc: `Сила ${T.tax.power}. Обидва платять по ${T.tax.fee} фішок у джекпот.`,
    apply: (api) => api.after(() => { api.burn(api.me, T.tax.fee); api.burn(api.opp, T.tax.fee); api.note(`Податок: по ${T.tax.fee} у джекпот`); }) },
  { id: 'dice', name: 'Кості', rarity: 'common', icon: '🎲', stage: 'power',
    desc: 'Сила — сума двох кубиків (2–12).',
    apply: (api) => { const a = 1 + Math.floor(api.rng() * 6), b = 1 + Math.floor(api.rng() * 6); setPow(api, a + b - T.dice.minus); api.note(`Кості: ${a}+${b}${T.dice.minus ? `−${T.dice.minus}` : ''}`); } },
  { id: 'counter', name: 'Рахівник', rarity: 'common', icon: '🧮', stage: 'power',
    desc: `Сила — номер раунду${T.counter.plus ? ` + ${T.counter.plus}` : ''} (максимум 11).`,
    apply: (api) => { const v = Math.min(11, api.s.round + T.counter.plus); setPow(api, v); api.note(`Рахівник: сила ${v}`); } },
  { id: 'brazen', name: 'Нахаба', rarity: 'common', icon: '😤', power: T.brazen.power, stage: 'power',
    desc: `Сила ${T.brazen.power}. Якщо програє — доплачуєш суперникові ${T.brazen.fine}.`,
    apply: (api) => api.after(({ winner }) => {
      if (winner !== api.opp) return;
      const n = api.transfer(api.me, api.opp, T.brazen.fine);
      api.note(`Нахаба доплатив ${n}`);
    }) },
  { id: 'magnet', name: 'Магніт', rarity: 'common', icon: '🧲', power: T.magnet.power, stage: 'power',
    desc: `Сила ${T.magnet.power}. Тягне силу суперника до ${T.magnet.power} (на півдорозі).`,
    apply: (api) => { api.mod((pw) => { pw[api.opp] = Math.round((pw[api.opp] + T.magnet.power) / 2); }); api.note('Магніт притягнув силу суперника'); } },
  { id: 'temptation', name: 'Спокуса', rarity: 'common', icon: '🍰', power: T.temptation.power, stage: 'power',
    desc: `Сила ${T.temptation.power}. Якщо переможе — ${T.temptation.pct}% виграшу згорає в джекпот.`,
    apply: (api) => api.after(({ winner, pot }) => {
      if (winner !== api.me) return;
      const n = api.burn(api.me, Math.floor((pot * T.temptation.pct) / 100));
      api.note(`Спокуса: ${n} згоріло в джекпот`);
    }) },

  // ───── Рідкісні: змінюють ситуацію за столом ─────
  { id: 'storm', name: 'Буря', rarity: 'rare', icon: '🌪️', stage: 'replace',
    desc: `Обидві карти замінюються випадковими з колоди (карта суперника +${T.storm.oppBonus}).`,
    apply: (api) => {
      api.X.cards = [api.drawNum(), api.drawNum()]; api.X.pow = [null, null];
      if (T.storm.oppBonus) api.mod((pw) => { pw[api.opp] += T.storm.oppBonus; });
      api.note('Буря замінила обидві карти');
    } },
  { id: 'swap', name: 'Обмін', rarity: 'rare', icon: '🔀', stage: 'replace',
    desc: 'Забираєш карту суперника, а він отримує випадкову з колоди.',
    apply: (api) => { const c = api.X.cards[api.opp]; api.X.cards[api.me] = c; api.X.cards[api.opp] = api.drawNum(); api.note('Обмін: карту суперника вкрадено'); } },
  { id: 'shadow', name: 'Тінь', rarity: 'rare', icon: '🌑', power: T.shadow.power, stage: 'power',
    desc: `Сила ${T.shadow.power}; якщо суперник підглядав — сила ${T.shadow.scouted}.`,
    apply: (api) => {
      const v = api.s.players[api.opp].scouted ? T.shadow.scouted : T.shadow.power;
      setPow(api, v);
      api.note(api.s.players[api.opp].scouted ? `Тінь: суперник підглядав — сила ${v}` : `Тінь: сила ${v}`);
    } },
  { id: 'trap', name: 'Пастка', rarity: 'rare', icon: '🪤', power: T.trap.power, stage: 'power',
    desc: `Сила ${T.trap.power}. Якщо суперник цього раунду піднімав ставку — ти перемагаєш.`,
    apply: (api) => {
      if (api.s.roundRaises?.[api.opp] > 0 && isMine(api)) { api.X.forced = api.me; api.note('Пастка спрацювала: суперник піднімав!'); }
      else api.note('Пастка: суперник не піднімав');
    } },
  { id: 'highroller', name: 'Ва-банкір', rarity: 'rare', icon: '🤑', power: T.highroller.power, stage: 'replace',
    desc: `Сила ${T.highroller.power}. Кожен ще раз докладає в банк свою ставку — банк подвоюється.`,
    apply: (api) => { const a = api.pay(api.me, api.contrib(api.me)), b = api.pay(api.opp, api.contrib(api.opp)); api.note(`Ва-банкір: банк +${a + b}`); } },
  { id: 'pocket', name: 'Кишеньковий', rarity: 'rare', icon: '👖', stage: 'replace',
    desc: 'Витягає випадкову карту з руки суперника і грає нею.',
    apply: (api) => {
      const b = api.randomInHand(api.opp);
      if (!b || !isMine(api)) { api.note('Кишеньковий: кишені порожні'); return; }
      api.takeFromHand(api.opp, b.card);
      api.X.cards[api.me] = b.card;
      api.note('Кишеньковий витяг карту з руки суперника');
    } },
  { id: 'sharper', name: 'Шулер', rarity: 'rare', icon: '🎩', power: T.sharper.power, stage: 'power',
    desc: `Сила ${T.sharper.power}, нічию виграє.`,
    apply: (api) => { if (isMine(api)) api.X.winTie[api.me] = true; api.note(`Шулер: сила ${T.sharper.power}, нічия — його`); } },
  { id: 'luck', name: 'Удача', rarity: 'rare', icon: '🍀', stage: 'power',
    desc: `50 на 50: сила ${T.luck.high} або ${T.luck.low}.`,
    apply: (api) => { const v = api.rng() < 0.5 ? T.luck.high : T.luck.low; setPow(api, v); api.note(v === T.luck.high ? `Удача всміхнулась: сила ${v}` : `Удача відвернулась: сила ${v}`); } },
  { id: 'brave', name: 'Сміливець', rarity: 'rare', icon: '🦁', power: T.brave.power, stage: 'power',
    desc: `Сила ${T.brave.power} + ${T.brave.perRaise} за кожне підняття в цьому раунді.`,
    apply: (api) => { const r = (api.s.roundRaises?.[0] || 0) + (api.s.roundRaises?.[1] || 0); const v = T.brave.power + T.brave.perRaise * r; setPow(api, v); api.note(`Сміливець: ${r} підн. → сила ${v}`); } },
  { id: 'antitrump', name: 'Анти-козир', rarity: 'rare', icon: '🚫', power: T.antitrump.power, stage: 'power',
    desc: `Сила ${T.antitrump.power}. Козир суперника дає не +1, а −1.`,
    apply: (api) => { api.X.trumpDelta[api.opp] = -1; api.note('Анти-козир: козир суперника −1'); } },

  // ───── Епічні: великий хаос ─────
  { id: 'boom', name: 'Вибух', rarity: 'epic', icon: '💥', stage: 'cancel',
    desc: 'Раунд скасовано: увесь банк летить у джекпот.',
    apply: (api) => { api.X.cancel = 'void'; api.note('ВИБУХ! Банк летить у джекпот'); } },
  { id: 'coin', name: 'Монетка', rarity: 'epic', icon: '🪙', stage: 'replace',
    desc: 'Банк подвоюється з фішок обох, переможця вирішує монетка.',
    apply: (api) => {
      const half = Math.floor(api.s.pot / 2);
      api.pay(api.me, half); api.pay(api.opp, half);
      api.X.coin = true; api.note('Монетка: банк подвоєно, вирішує підкидання');
    } },
  { id: 'redeal', name: 'Нова роздача', rarity: 'epic', icon: '🃏', stage: 'replace',
    desc: `Обидва скидають руки; розкриваються верхні карти колоди (суперникові +${T.redeal.oppBonus}).`,
    apply: (api) => {
      api.dumpHand(0); api.dumpHand(1); api.X.cards = [api.drawNum(), api.drawNum()]; api.X.pow = [null, null];
      if (T.redeal.oppBonus) api.mod((pw) => { pw[api.opp] += T.redeal.oppBonus; });
      api.note('Нова роздача: руки скинуто, вирішує колода');
    } },
  { id: 'echo', name: 'Ехо', rarity: 'epic', icon: '🔁', power: T.echo.power, stage: 'power',
    desc: `Повторює джокера суперника (або останнього в партії); інакше — сила ${T.echo.power}.`,
    apply: () => {} }, // розв'язується в resolveJokers
  { id: 'quake', name: 'Землетрус', rarity: 'epic', icon: '🌋', power: T.quake.power, stage: 'power',
    desc: `Сила ${T.quake.power}. Після розкриття руки обох перемішуються і роздаються наново.`,
    apply: (api) => api.after(() => { api.quake(); api.note('Землетрус перемішав руки'); }) },
  { id: 'castling', name: 'Рокіровка', rarity: 'epic', icon: '♜', power: T.castling.power, stage: 'replace',
    desc: `Ви міняєтеся зіграними картами (суперникові дістається Рокіровка із силою ${T.castling.power}).`,
    apply: (api) => { api.X.cards = [api.X.cards[1], api.X.cards[0]]; api.X.pow = [api.X.pow[1], api.X.pow[0]]; api.note('Рокіровка: карти помінялись'); } },
  { id: 'frenzy', name: 'Ажіотаж', rarity: 'epic', icon: '🔥', power: T.frenzy.power, stage: 'replace',
    desc: `Сила ${T.frenzy.power}. Кожен двічі докладає свою ставку — банк утричі більший.`,
    apply: (api) => { const a = api.pay(api.me, 2 * api.contrib(api.me)), b = api.pay(api.opp, 2 * api.contrib(api.opp)); api.note(`Ажіотаж: банк +${a + b}`); } },

  // ───── Легендарні: лише з автомата ─────
  { id: 'apocalypse', name: 'Апокаліпсис', rarity: 'legendary', icon: '☄️', stage: 'replace',
    desc: 'Кожен кидає в банк половину своїх фішок. Усе вирішує монетка.',
    apply: (api) => {
      const a = api.pay(api.me, Math.floor(api.chips(api.me) / 2)), b = api.pay(api.opp, Math.floor(api.chips(api.opp) / 2));
      api.X.coin = true; api.note(`АПОКАЛІПСИС: +${a + b} у банк, вирішує монетка`);
    } },
  { id: 'rewind', name: 'Назад у часі', rarity: 'legendary', icon: '⏳', stage: 'cancel',
    desc: 'Раунд переграється з нуля, ставки повертаються.',
    apply: (api) => { api.X.cancel = 'replay'; api.note('НАЗАД У ЧАСІ: раунд переграється'); } },
  { id: 'chaosking', name: 'Король хаосу', rarity: 'legendary', icon: '👑', power: 5, stage: 'power',
    desc: 'Рулетка обирає ефект будь-якого іншого джокера.',
    apply: () => {} }, // розв'язується в resolveJokers
  { id: 'duel', name: 'Дуель', rarity: 'legendary', icon: '⚔️', stage: 'replace',
    desc: 'Кожен відкриває по 3 карти з колоди — перемагає більша сума.',
    apply: (api) => {
      const a = [api.drawNum(), api.drawNum(), api.drawNum()], b = [api.drawNum(), api.drawNum(), api.drawNum()];
      const sum = (xs) => xs.reduce((s, c) => s + (c ? c.value : 0), 0);
      const sums = [0, 0];
      sums[api.me] = sum(a); sums[api.opp] = sum(b);
      api.X.sum = sums; api.X.duel = { [api.me]: a, [api.opp]: b };
      api.note(`ДУЕЛЬ: ${sums[0]} проти ${sums[1]}`);
    } },
  { id: 'mirrorworld', name: 'Задзеркалля', rarity: 'legendary', icon: '🪞', power: T.mirrorworld.power, stage: 'replace',
    desc: 'Ставки подвоюються, перемагає менша карта, а козир дає −1.',
    apply: (api) => {
      const a = api.pay(api.me, api.contrib(api.me)), b = api.pay(api.opp, api.contrib(api.opp));
      api.X.lowWins = !api.X.lowWins; api.X.trumpDelta = [-1, -1];
      api.note(`ЗАДЗЕРКАЛЛЯ: банк +${a + b}, перемагає менша`);
    } },
];

export const JOKER_BY_ID = Object.fromEntries(JOKERS.map((j) => [j.id, j]));
export const JOKER_IDS = JOKERS.map((j) => j.id);

/** Карта-джокер для руки. */
export function jokerCard(jid, p) {
  const d = JOKER_BY_ID[jid];
  return { id: `J${p}-${jid}`, kind: 'joker', joker: jid, rarity: d.rarity, power: d.power ?? 5 };
}

/** Перевірка набору: лише відомі id, без повторів, не більше max. */
export function sanitizeSet(set, max = 3) {
  if (!Array.isArray(set)) return [];
  const out = [];
  for (const id of set) if (typeof id === 'string' && JOKER_BY_ID[id] && !out.includes(id) && out.length < max) out.push(id);
  return out;
}

/**
 * Розв'язання розкриття, де зіграно хоча б одного джокера.
 * env — функції рушія (переміщення фішок, колода). Повертає { X, notes, order }.
 */
export function resolveJokers(s, ctx, env) {
  const X = {
    cards: [s.players[0].played, s.players[1].played],
    pow: [null, null], suit: [null, null], winTie: [false, false], loseTie: [false, false],
    trumpDelta: [s.cfg.trumpBonus, s.cfg.trumpBonus], lowWins: false,
    forced: undefined, coin: false, sum: null, cancel: null, mods: [], afters: [], notes: [], fired: [],
  };
  // Хто з джокерів що робить (Ехо і Король хаосу розгортаються в інший ефект)
  const entries = [];
  for (const p of [0, 1]) {
    const card = X.cards[p];
    if (card?.kind !== 'joker') continue;
    let def = JOKER_BY_ID[card.joker];
    let prefix = '';
    if (def.id === 'echo') {
      const oc = X.cards[1 - p];
      const oppJ = oc?.kind === 'joker' && oc.joker !== 'echo' ? oc.joker : null;
      const last = (oppJ && JOKER_BY_ID[oppJ]) || (s.lastJoker && JOKER_BY_ID[s.lastJoker]);
      if (last && last.id !== 'echo') { prefix = `Ехо → ${last.name}. `; def = last; }
      else { prefix = `Ехо: тиша — сила ${T.echo.power}. `; def = { ...JOKER_BY_ID.echo, apply: () => {} }; }
    } else if (def.id === 'chaosking') {
      const pool = JOKERS.filter((j) => !['chaosking', 'echo'].includes(j.id));
      def = pool[Math.floor(ctx.rng() * pool.length)];
      prefix = `Король хаосу обрав: ${def.name}. `;
    }
    entries.push({ p, card, def, src: JOKER_BY_ID[card.joker], prefix });
  }
  const rank = (d) => RARITIES.indexOf(d.rarity);
  entries.sort((a, b) =>
    STAGE[a.def.stage] - STAGE[b.def.stage] ||
    rank(a.src) - rank(b.src) ||
    (a.p === s.firstToAct ? -1 : 1));

  for (const e of entries) {
    if (X.cancel) break; // скасування зупиняє всіх наступних
    const me = e.p, opp = 1 - e.p;
    let first = true;
    const api = {
      s, X, me, opp, card: e.card, rng: ctx.rng,
      note: (t) => { X.notes.push({ p: me, joker: e.src.id, text: (first ? e.prefix : '') + t }); first = false; },
      after: (fn) => X.afters.push(fn),
      mod: (fn) => X.mods.push(fn),
      ...env.api(X),
    };
    e.def.apply(api);
    if (first && e.prefix) X.notes.push({ p: me, joker: e.src.id, text: e.prefix.trim() });
    X.fired.push({ p: me, joker: e.src.id, as: e.def.id });
  }
  return X;
}
