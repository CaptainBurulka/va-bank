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
//
// Гра втрьох: ціль ніхто не обирає. «Суперник» для джокера — ЛІДЕР ЗА ФІШКАМИ серед інших учасників
// розкриття (за рівності — найближчий за годинниковою стрілкою). «Обидва/кожен» — усі учасники розкриття.
// Програш/виграш рахується відносно переможця раунду. Опис для трьох — у полі d3.

import { JOKER_TUNING, JOKER_TUNING_3 } from '../config.js';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_NAME = { common: 'Звичайний', rare: 'Рідкісний', epic: 'Епічний', legendary: 'Легендарний' };
const STAGE = { cancel: 0, replace: 1, power: 2 };

// Допоміжне: «моя карта все ще цей джокер?» (після заміни карт сила джокера вже не діє)
const isMine = (api) => api.X.cards[api.me]?.kind === 'joker' && api.X.cards[api.me].id === api.card.id;
const setPow = (api, v) => { if (isMine(api)) api.X.pow[api.me] = v; };
// Номінальна сила зіграної карти (для правила «найсильніша карта на столі»)
const nominal = (api, c) => (!c ? -1 : c.kind === 'num' ? c.value + (api.s.trump && c.suit === api.s.trump ? 1 : 0) : c.kind === 'mirror' ? 11 : c.kind === 'knife' ? 0 : c.kind === 'joker' ? c.power ?? 5 : 5);
const signed = (x) => (x > 0 ? `+${x}` : `−${-x}`);

/** Каталог. power — номінальна сила (для розвідки й порівняння, якщо ефект її не змінив). T — числа ефектів. */
const build = (T) => [
  // ───── Звичайні: простий ефект ─────
  { id: 'turncoat', name: 'Перевертень', rarity: 'common', icon: '🙃', power: T.turncoat.power, stage: 'power',
    desc: 'Цього розкриття перемагає МЕНША карта.',
    apply: (api) => { api.X.lowWins = !api.X.lowWins; api.note('Перевертень: перемагає менша карта'); } },
  { id: 'roulette', name: 'Рулетка', rarity: 'common', icon: '🎡', stage: 'power',
    desc: `Сила — випадкова від 1 до ${T.roulette.max}.`,
    apply: (api) => { const v = 1 + Math.floor(api.rng() * T.roulette.max); setPow(api, v); api.note(`Рулетка: сила ${v}`); } },
  { id: 'thief', name: 'Мисливець', rarity: 'common', icon: '🏹', power: T.thief.power, stage: 'power',
    desc: `Б'є будь-яку козирну карту суперника; інакше сила ${T.thief.power}.`,
    d3: `Б'є будь-яку козирну карту суперників; інакше сила ${T.thief.power}.`,
    apply: (api) => {
      if (!isMine(api)) return;
      const me = api.me, trump = api.s.trump, X = api.X;
      const prey = trump ? api.others.filter((q) => X.cards[q]?.kind === 'num' && X.cards[q].suit === trump) : [];
      if (prey.length) api.mod((pw) => { for (const q of prey) if (pw[q] !== null) pw[me] = Math.max(pw[me] ?? 0, pw[q] + 1); });
      api.note(prey.length ? 'Мисливець уполював козир!' : `Мисливець: козиря нема — сила ${T.thief.power}`);
    } },
  { id: 'fist', name: 'Важкий кулак', rarity: 'common', icon: '👊', power: T.fist.power, stage: 'power',
    desc: `Сила ${T.fist.power} без масті, нічию програє; удар коштує ${T.fist.fee} фішки в джекпот.`,
    apply: (api) => {
      if (isMine(api) && T.fist.loseTie) api.X.loseTie[api.me] = true;
      api.note(`Важкий кулак: сила ${T.fist.power}`);
      if (T.fist.fee) api.after(() => api.burn(api.me, T.fist.fee));
    } },
  { id: 'insurance', name: 'Чет-нечет', rarity: 'common', icon: '⚖️', power: T.insurance.power, stage: 'power',
    desc: `Номінал карти суперника парний — сила ${T.insurance.high}, непарний — ${T.insurance.power}.`,
    d3: `Номінал карти лідера парний — сила ${T.insurance.high}, непарний — ${T.insurance.power}.`,
    apply: (api) => {
      if (!isMine(api)) return;
      const c = api.X.cards[api.opp];
      const nom = !c ? 1 : c.kind === 'num' ? c.value : c.kind === 'knife' ? 0 : c.kind === 'joker' ? c.power ?? 5 : c.kind === 'double' ? 5 : 1; // Дзеркало — непарне
      const even = nom % 2 === 0;
      setPow(api, even ? T.insurance.high : T.insurance.power);
      api.note(even ? `Чет! Сила ${T.insurance.high}` : `Нечет: сила ${T.insurance.power}`);
    } },
  { id: 'twin', name: 'Двійник', rarity: 'common', icon: '👯', stage: 'power',
    desc: `Копіює силу випадкової карти з твоєї руки${T.twin.plus ? ` ${signed(T.twin.plus)}` : ''}.`,
    apply: (api) => { const c = api.randomInHand(api.me); const v = (c?.pow ?? 1) + T.twin.plus; setPow(api, v); api.note(`Двійник: сила ${v}`); } },
  { id: 'chameleon', name: 'Хамелеон', rarity: 'common', icon: '🦎', power: T.chameleon.power, stage: 'power',
    desc: `Сила ${T.chameleon.power} і масть козиря (отримує бонус козиря).`,
    apply: (api) => {
      if (!isMine(api)) return;
      const t = api.s.trump;
      api.X.suit[api.me] = t;
      setPow(api, T.chameleon.power + (t ? api.trumpDelta(api.me) : 0));
      api.note('Хамелеон став козирем');
    } },
  { id: 'modest', name: 'Підробка', rarity: 'common', icon: '🎭', stage: 'power',
    desc: `Копіює силу карти суперника${T.modest.bias ? ` ${T.modest.bias > 0 ? '+' : '−'}${Math.abs(T.modest.bias)}` : ''} і додає або віднімає 1 (монетка).`,
    d3: `Копіює силу карти лідера${T.modest.bias ? ` ${T.modest.bias > 0 ? '+' : '−'}${Math.abs(T.modest.bias)}` : ''} і додає або віднімає 1 (монетка).`,
    apply: (api) => {
      if (!isMine(api)) return;
      const d = (api.rng() < 0.5 ? 1 : -1) + T.modest.bias;
      const me = api.me, t = api.opp;
      api.mod((pw) => { pw[me] = (pw[t] ?? 5) + d; });
      api.note(`Підробка: копія ${d > 0 ? '+' : '−'}${Math.abs(d)}`);
    } },
  { id: 'tax', name: 'Податок', rarity: 'common', icon: '🧾', power: T.tax.power, stage: 'power',
    desc: `Сила ${T.tax.power}. Обидва платять по ${T.tax.fee} фішок у джекпот.`,
    d3: `Сила ${T.tax.power}. Усі платять по ${T.tax.fee} фішок у джекпот.`,
    apply: (api) => api.after(() => { api.burn(api.me, T.tax.fee); for (const q of api.others) api.burn(q, T.tax.fee); api.note(`Податок: по ${T.tax.fee} у джекпот`); }) },
  { id: 'dice', name: 'Кості', rarity: 'common', icon: '🎲', stage: 'power',
    desc: `Сила — сума двох кубиків${T.dice.minus ? ` ${signed(-T.dice.minus)}` : ''} (${2 - T.dice.minus}–${12 - T.dice.minus}).`,
    apply: (api) => { const a = 1 + Math.floor(api.rng() * 6), b = 1 + Math.floor(api.rng() * 6); setPow(api, a + b - T.dice.minus); api.note(`Кості: ${a}+${b}${T.dice.minus ? signed(-T.dice.minus) : ''}`); } },
  { id: 'counter', name: 'Рахівник', rarity: 'common', icon: '🧮', stage: 'power',
    desc: `Сила — номер раунду${T.counter.plus ? ` + ${T.counter.plus}` : ''} (максимум 11).`,
    apply: (api) => { const v = Math.min(11, api.s.round + T.counter.plus); setPow(api, v); api.note(`Рахівник: сила ${v}`); } },
  { id: 'brazen', name: 'Середняк', rarity: 'common', icon: '🎯', power: T.brazen.power, stage: 'power',
    desc: `Цього розкриття перемагає карта, ближча до ${T.brazen.target}; сам — сила ${T.brazen.power}.`,
    apply: (api) => { api.X.near = T.brazen.target; setPow(api, T.brazen.power); api.note(`Середняк: перемагає ближча до ${T.brazen.target}`); } },
  { id: 'magnet', name: 'Магніт', rarity: 'common', icon: '🧲', power: T.magnet.power, stage: 'power',
    desc: `Сила ${T.magnet.power}. Тягне силу суперника до ${T.magnet.power} (на півдорозі).`,
    d3: `Сила ${T.magnet.power}. Тягне сили обох суперників до ${T.magnet.power} (на півдорозі).`,
    apply: (api) => { api.mod((pw) => { for (const q of api.others) pw[q] = Math.round((pw[q] + T.magnet.power) / 2); }); api.note('Магніт притягнув силу суперника'); } },
  { id: 'temptation', name: 'Аутсайдер', rarity: 'common', icon: '🐢', power: T.temptation.power, stage: 'power',
    desc: `Сила ${T.temptation.power}, +1 за кожні ${T.temptation.step} фішок, на які ти відстаєш від суперника (до ${T.temptation.max}).`,
    d3: `Сила ${T.temptation.power}, +1 за кожні ${T.temptation.step} фішок, на які ти відстаєш від лідера (до ${T.temptation.max}).`,
    apply: (api) => {
      const gap = Math.max(0, api.chips(api.opp) - api.chips(api.me));
      const v = Math.min(T.temptation.max, T.temptation.power + Math.floor(gap / T.temptation.step));
      setPow(api, v);
      api.note(gap > 0 ? `Аутсайдер: відставання ${gap} → сила ${v}` : `Аутсайдер: не відстає — сила ${v}`);
    } },
  { id: 'storm', name: 'Буря', rarity: 'rare', icon: '🌪️', stage: 'replace',
    desc: `Обидві карти замінюються випадковими з колоди${T.storm.oppBonus ? ` (карта суперника ${signed(T.storm.oppBonus)})` : ''}.`,
    d3: `Усі зіграні карти замінюються випадковими з колоди${T.storm.oppBonus ? ` (карти суперників ${signed(T.storm.oppBonus)})` : ''}.`,
    apply: (api) => {
      for (const q of api.parts) { api.X.cards[q] = api.drawNum(); api.X.pow[q] = null; }
      if (T.storm.oppBonus) api.mod((pw) => { for (const q of api.others) pw[q] += T.storm.oppBonus; });
      api.note('Буря замінила обидві карти');
    } },
  { id: 'swap', name: 'Обмін', rarity: 'rare', icon: '🔀', stage: 'replace',
    desc: 'Забираєш карту суперника, а він отримує випадкову з колоди.',
    d3: `Забираєш найсильнішу карту зі столу, а її власник отримує випадкову з колоди${T.swap.oppBonus ? ` (${signed(T.swap.oppBonus)})` : ''}.`,
    apply: (api) => {
      const t = api.others.length > 1 ? api.others.reduce((a, b) => (nominal(api, api.X.cards[b]) > nominal(api, api.X.cards[a]) ? b : a)) : api.opp;
      const c = api.X.cards[t]; api.X.cards[api.me] = c; api.X.cards[t] = api.drawNum();
      if (T.swap.oppBonus) api.mod((pw) => { pw[t] += T.swap.oppBonus; });
      api.note('Обмін: карту суперника вкрадено');
    } },
  { id: 'shadow', name: 'Тінь', rarity: 'rare', icon: '🌑', power: T.shadow.power, stage: 'power',
    desc: `Сила ${T.shadow.power}; якщо суперник підглядав — сила ${T.shadow.scouted}.`,
    d3: `Сила ${T.shadow.power}; якщо хтось підглядав саме до тебе — сила ${T.shadow.scouted}.`,
    apply: (api) => {
      const seen = api.others.some((q) => api.s.players[q].scouted && (api.s.players[q].scoutTarget ?? api.me) === api.me);
      const v = seen ? T.shadow.scouted : T.shadow.power;
      setPow(api, v);
      api.note(seen ? `Тінь: суперник підглядав — сила ${v}` : `Тінь: сила ${v}`);
    } },
  { id: 'trap', name: 'Пастка', rarity: 'rare', icon: '🪤', power: T.trap.power, stage: 'power',
    desc: `Сила ${T.trap.power}. Якщо суперник цього раунду піднімав ставку — ти перемагаєш.`,
    d3: `Сила ${T.trap.power}. Якщо лідер за фішками цього раунду піднімав ставку — Пастка на 1 сильніша за його карту.`,
    apply: (api) => {
      const caught = api.s.roundRaises?.[api.opp] > 0 && isMine(api);
      if (caught && api.others.length === 1) { api.X.forced = api.me; api.note('Пастка спрацювала: суперник піднімав!'); }
      else if (caught) {
        // утрьох Пастка ловить лише лідера: стає на 1 сильнішою за його карту, з третім — звичайне порівняння
        const me = api.me, t = api.opp;
        api.mod((pw) => { if (pw[t] !== null) pw[me] = Math.max(pw[me] ?? 0, pw[t] + 1); });
        api.note('Пастка спіймала лідера!');
      }
      else api.note('Пастка: суперник не піднімав');
    } },
  { id: 'highroller', name: 'Ва-банкір', rarity: 'rare', icon: '🤑', power: T.highroller.power, stage: 'replace',
    desc: `Сила ${T.highroller.power}. Кожен ще раз докладає в банк свою ставку — банк подвоюється.`,
    apply: (api) => { let n = 0; for (const q of api.parts0) n += api.pay(q, api.contrib(q)); api.note(`Ва-банкір: банк +${n}`); } },
  { id: 'pocket', name: 'Кишеньковий', rarity: 'rare', icon: '👖', stage: 'replace',
    desc: 'Витягає випадкову карту з руки суперника і грає нею.',
    d3: `Витягає ${T.pocket.tries > 1 ? `${T.pocket.tries} випадкові карти` : 'випадкову карту'} з руки лідера і грає ${T.pocket.tries > 1 ? 'сильнішою' : 'нею'}.`,
    apply: (api) => {
      let b = null;
      for (let k = 0; k < T.pocket.tries; k++) { const x = api.randomInHand(api.opp); if (x && (!b || x.pow > b.pow)) b = x; }
      if (!b || !isMine(api)) { api.note('Кишеньковий: кишені порожні'); return; }
      api.takeFromHand(api.opp, b.card);
      api.X.cards[api.me] = b.card;
      api.note('Кишеньковий витяг карту з руки суперника');
    } },
  { id: 'sharper', name: 'Шулер', rarity: 'rare', icon: '🎩', power: T.sharper.power, stage: 'power',
    desc: `Сила ${T.sharper.power} або ${T.sharper.alt} (50/50), нічию виграє.`,
    apply: (api) => {
      const v = api.rng() < 0.5 ? T.sharper.power : T.sharper.alt;
      setPow(api, v);
      if (isMine(api)) api.X.winTie[api.me] = true;
      api.note(`Шулер: сила ${v}, нічия — його`);
    } },
  { id: 'luck', name: 'Удача', rarity: 'rare', icon: '🍀', stage: 'power',
    desc: `50 на 50: сила ${T.luck.high} або ${T.luck.low}.`,
    apply: (api) => { const v = api.rng() < 0.5 ? T.luck.high : T.luck.low; setPow(api, v); api.note(v === T.luck.high ? `Удача всміхнулась: сила ${v}` : `Удача відвернулась: сила ${v}`); } },
  { id: 'brave', name: 'Сміливець', rarity: 'rare', icon: '🦁', power: T.brave.power, stage: 'power',
    desc: `Сила ${T.brave.power} + ${T.brave.perRaise} за кожне підняття в цьому раунді.`,
    apply: (api) => { const r = (api.s.roundRaises?.[0] || 0) + (api.s.roundRaises?.[1] || 0); const v = T.brave.power + T.brave.perRaise * r; setPow(api, v); api.note(`Сміливець: ${r} підн. → сила ${v}`); } },
  { id: 'antitrump', name: 'Анти-козир', rarity: 'rare', icon: '🚫', power: T.antitrump.power, stage: 'power',
    desc: `Сила ${T.antitrump.power}. Козир суперника дає не +1, а −1.`,
    d3: `Сила ${T.antitrump.power}. Козирі обох суперників дають не +1, а −1.`,
    apply: (api) => { for (const q of api.others) api.X.trumpDelta[q] = -1; api.note('Анти-козир: козир суперника −1'); } },

  // ───── Епічні: великий хаос ─────
  { id: 'boom', name: 'Вибух', rarity: 'epic', icon: '💥', stage: 'cancel',
    desc: 'Раунд скасовано: увесь банк летить у джекпот.',
    apply: (api) => { api.X.cancel = 'void'; api.note('ВИБУХ! Банк летить у джекпот'); } },
  { id: 'coin', name: 'Монетка', rarity: 'epic', icon: '🪙', stage: 'replace',
    desc: 'Банк подвоюється з фішок обох, переможця вирішує монетка.',
    d3: 'Банк подвоюється з фішок усіх, переможця з трьох вирішує жереб.',
    apply: (api) => {
      const share = Math.floor(api.s.pot / api.parts.length);
      for (const q of api.parts0) api.pay(q, share);
      api.X.coin = true; api.note('Монетка: банк подвоєно, вирішує підкидання');
    } },
  { id: 'redeal', name: 'Нова роздача', rarity: 'epic', icon: '🃏', stage: 'replace',
    desc: `Обидва скидають руки; розкриваються верхні карти колоди${T.redeal.oppBonus ? ` (суперникові ${signed(T.redeal.oppBonus)})` : ''}.`,
    d3: `Усі учасники скидають руки; розкриваються верхні карти колоди${T.redeal.oppBonus ? ` (суперникам ${signed(T.redeal.oppBonus)})` : ''}.`,
    apply: (api) => {
      for (const q of api.parts) api.dumpHand(q);
      for (const q of api.parts) { api.X.cards[q] = api.drawNum(); api.X.pow[q] = null; }
      if (T.redeal.oppBonus) api.mod((pw) => { for (const q of api.others) pw[q] += T.redeal.oppBonus; });
      api.note('Нова роздача: руки скинуто, вирішує колода');
    } },
  { id: 'echo', name: 'Ехо', rarity: 'epic', icon: '🔁', power: T.echo.power, stage: 'power',
    desc: `Повторює джокера суперника (або останнього в партії); інакше — сила ${T.echo.power}.`,
    d3: `Повторює джокера наступного за годинниковою суперника (або останнього в партії); інакше — сила ${T.echo.power}.`,
    apply: () => {} }, // розв'язується в resolveJokers
  { id: 'quake', name: 'Землетрус', rarity: 'epic', icon: '🌋', power: T.quake.power, stage: 'power',
    desc: `Сила ${T.quake.power}. Після розкриття руки обох перемішуються і роздаються наново.`,
    d3: `Сила ${T.quake.power}. Після розкриття руки всіх перемішуються і роздаються наново.`,
    apply: (api) => api.after(() => { api.quake(); api.note('Землетрус перемішав руки'); }) },
  { id: 'castling', name: 'Рокіровка', rarity: 'epic', icon: '♜', power: T.castling.power, stage: 'replace',
    desc: `Ви міняєтеся зіграними картами (суперникові дістається Рокіровка із силою ${T.castling.power}).`,
    d3: `Міняєшся зіграними картами з лідером (йому дістається Рокіровка із силою ${T.castling.power}).`,
    apply: (api) => {
      const a = api.me, b = api.opp, X = api.X;
      [X.cards[a], X.cards[b]] = [X.cards[b], X.cards[a]]; [X.pow[a], X.pow[b]] = [X.pow[b], X.pow[a]];
      api.note('Рокіровка: карти помінялись');
    } },
  { id: 'frenzy', name: 'Ажіотаж', rarity: 'epic', icon: '🔥', power: T.frenzy.power, stage: 'replace',
    desc: `Сила ${T.frenzy.power}. Кожен двічі докладає свою ставку — банк утричі більший.`,
    apply: (api) => { let n = 0; for (const q of api.parts0) n += api.pay(q, 2 * api.contrib(q)); api.note(`Ажіотаж: банк +${n}`); } },

  // ───── Легендарні: лише з автомата ─────
  { id: 'apocalypse', name: 'Апокаліпсис', rarity: 'legendary', icon: '☄️', stage: 'replace',
    desc: 'Кожен кидає в банк половину своїх фішок. Усе вирішує монетка.',
    d3: 'Кожен учасник кидає в банк половину своїх фішок. Переможця вирішує жереб.',
    apply: (api) => {
      let n = 0;
      for (const q of api.parts0) n += api.pay(q, Math.floor(api.chips(q) / 2));
      api.X.coin = true; api.note(`АПОКАЛІПСИС: +${n} у банк, вирішує монетка`);
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
      const sum = (xs) => xs.reduce((s, c) => s + (c ? c.value : 0), 0);
      const sums = api.X.cards.map(() => 0);
      const duel = {};
      for (const q of [api.me, ...api.others]) { duel[q] = [api.drawNum(), api.drawNum(), api.drawNum()]; sums[q] = sum(duel[q]); }
      api.X.sum = sums; api.X.duel = duel;
      api.note(`ДУЕЛЬ: ${api.parts.map((q) => sums[q]).join(' проти ')}`);
    } },
  { id: 'mirrorworld', name: 'Задзеркалля', rarity: 'legendary', icon: '🪞', power: T.mirrorworld.power, stage: 'replace',
    desc: `Ставки подвоюються, перемагає менша карта, а козир дає ${T.mirrorworld.trump}.`,
    apply: (api) => {
      let n = 0;
      for (const q of api.parts0) n += api.pay(q, api.contrib(q));
      api.X.lowWins = !api.X.lowWins; api.X.trumpDelta = api.X.trumpDelta.map(() => T.mirrorworld.trump);
      api.note(`ЗАДЗЕРКАЛЛЯ: банк +${n}, перемагає менша`);
    } },
];

/** Числа для гри втрьох: ті самі ідеї, інші числа (утрьох треба побити двох). */
const T3 = Object.fromEntries(Object.keys(JOKER_TUNING).map((k) => [k, { ...JOKER_TUNING[k], ...(JOKER_TUNING_3[k] || {}) }]));
export const JOKERS = build(JOKER_TUNING);
export const JOKERS_3 = build(T3);
export const JOKER_BY_ID = Object.fromEntries(JOKERS.map((j) => [j.id, j]));
export const JOKER_BY_ID_3 = Object.fromEntries(JOKERS_3.map((j) => [j.id, j]));
const catalog = (n) => (n > 2 ? JOKER_BY_ID_3 : JOKER_BY_ID);
const tuning = (n) => (n > 2 ? T3 : JOKER_TUNING);
export const JOKER_IDS = JOKERS.map((j) => j.id);

/** Карта-джокер для руки. */
/** Опис джокера з урахуванням кількості гравців. */
export function jokerDesc(j, n = 2) {
  const d = catalog(n)[typeof j === 'string' ? j : j.id];
  return n > 2 && d.d3 ? d.d3 : d.desc;
}

export function jokerCard(jid, p, n = 2) {
  const d = catalog(n)[jid];
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
  const n = s.players.length;
  const BY = catalog(n), T = tuning(n);
  const parts = env.api({}).parts();
  const fill = (v) => Array(n).fill(v);
  const X = {
    parts,
    cards: s.players.map((pl, q) => (parts.includes(q) ? pl.played : null)),
    pow: fill(null), suit: fill(null), winTie: fill(false), loseTie: fill(false),
    trumpDelta: fill(s.cfg.trumpBonus), lowWins: false,
    forced: undefined, coin: false, sum: null, cancel: null, mods: [], afters: [], notes: [], fired: [],
  };
  // Порядок місць від того, хто ходив першим
  const dist = (p) => (p - s.firstToAct + n) % n;
  const othersOf = (p) => parts.filter((q) => q !== p).sort((a, b) => ((a - p + n) % n) - ((b - p + n) % n));
  // Хто з джокерів що робить (Ехо і Король хаосу розгортаються в інший ефект)
  const entries = [];
  for (const p of parts) {
    const card = X.cards[p];
    if (card?.kind !== 'joker') continue;
    let def = BY[card.joker];
    let prefix = '';
    if (def.id === 'echo') {
      const oc = othersOf(p).map((q) => X.cards[q]).find((c) => c?.kind === 'joker' && c.joker !== 'echo');
      const oppJ = oc ? oc.joker : null;
      const last = (oppJ && BY[oppJ]) || (s.lastJoker && BY[s.lastJoker]);
      if (last && last.id !== 'echo') { prefix = `Ехо → ${last.name}. `; def = last; }
      else { prefix = `Ехо: тиша — сила ${T.echo.power}. `; def = { ...JOKER_BY_ID.echo, apply: () => {} }; }
    } else if (def.id === 'chaosking') {
      const pool = Object.values(BY).filter((j) => !['chaosking', 'echo'].includes(j.id));
      def = pool[Math.floor(ctx.rng() * pool.length)];
      prefix = `Король хаосу обрав: ${def.name}. `;
    }
    entries.push({ p, card, def, src: BY[card.joker], prefix });
  }
  const rank = (d) => RARITIES.indexOf(d.rarity);
  entries.sort((a, b) =>
    STAGE[a.def.stage] - STAGE[b.def.stage] ||
    rank(a.src) - rank(b.src) ||
    dist(a.p) - dist(b.p));

  for (const e of entries) {
    if (X.cancel) break; // скасування зупиняє всіх наступних
    const me = e.p;
    const others = othersOf(me);
    const opp = n === 2 ? 1 - me : env.api(X).target(me);
    let first = true;
    const api = {
      ...env.api(X),
      // parts0 — я першим, далі інші (порядок платежів як у грі вдвох)
      s, X, me, opp, others, parts, parts0: [me, ...others], card: e.card, rng: ctx.rng,
      note: (t) => { X.notes.push({ p: me, joker: e.src.id, text: (first ? e.prefix : '') + t }); first = false; },
      after: (fn) => X.afters.push(fn),
      mod: (fn) => X.mods.push(fn),
    };
    e.def.apply(api);
    if (first && e.prefix) X.notes.push({ p: me, joker: e.src.id, text: e.prefix.trim() });
    X.fired.push({ p: me, joker: e.src.id, as: e.def.id });
  }
  return X;
}
