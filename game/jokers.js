// Джокери для гри комбінаціями з 3 карт. Чиста логіка без DOM і мережі.
//
// Принципи:
// • Джокер займає одне з трьох місць і може бути відкритим (сигнал і залякування) або закритим.
//   Ефект спрацьовує ЛИШЕ при розкритті (якщо хтось спасував — джокер згорає без ефекту).
// • Три типи:
//     value — «карта-значення»: має значення (і часом масть) для комбінації + свій ефект;
//     rule  — «правило раунду»: діє на весь раунд, а його місце в комбінації ПОРОЖНЄ;
//     cards — «робота з картами»: міняє карти на столі.
// • Рідкість = розмах і видовищність, НЕ сила: кожен джокер налаштований симуляціями на 45–55% перемог.
// • Фішки ніколи не з'являються і не зникають: усі переміщення — між гравцями, у банк або в джекпот.
// • Ціль ніхто не обирає. «Суперник» для джокера: удвох — інший гравець; утрьох — ЛІДЕР ЗА ФІШКАМИ серед
//   інших учасників розкриття (за рівності — найближчий за годинниковою стрілкою).
//
// Порядок спрацювання, якщо джокери зіграли кілька гравців:
//   0. Скасування (Вибух, Назад у часі) — якщо спрацювало, інші джокери не діють.
//   1. Заміна карт і ставок (Буря, Обмін, Рокіровка, Монетка…).
//   2. Значення і модифікатори (Рулетка, Магніт, Ламач…).
//   3. Підсумок: розрахунки після того, як визначено переможця (Податок, Землетрус…).
//   Усередині етапу першим діє джокер нижчої рідкості; за рівної — того, хто ходив першим у торгах.

import { JOKER_TUNING, JOKER_TUNING_3 } from '../config.js';
import { slotOf, slotsOf, evaluate, compareCombos, COMBO_ORDER, bestSet } from './combos.js';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_NAME = { common: 'Звичайний', rare: 'Рідкісний', epic: 'Епічний', legendary: 'Легендарний' };
export const JOKER_TYPES = { value: 'Карта-значення', rule: 'Правило раунду', cards: 'Робота з картами' };
const STAGE = { cancel: 0, replace: 1, power: 2 };
const SUITS = ['water', 'fire', 'stone'];

// ───── допоміжне ─────
/** Слот карти без ефектів (джокер — його значення за замовчуванням). */
const plainSlot = (c) => slotOf(c, jokerSlot);
/** Номінал для правила «парне/непарне» (Дзеркало й порожнє — непарні). */
const nominal = (c) => { const v = plainSlot(c).v; return v == null ? 1 : v; };
/** Підняти комбінацію на n сходинок (Сходинка). */
function rankUp(c, n) {
  const r = Math.min(COMBO_ORDER.length - 1, c.rank + n);
  return { ...c, rank: r, key: [r, ...c.key.slice(1)], label: `${c.label} ↑${n > 1 ? n : ''}`, boosted: n };
}
/** Зламати комбінацію до Старшої карти (Ламач). */
function rankDown(c, n) {
  const r = Math.max(0, c.rank - n);
  return { ...c, rank: r, key: [r, ...c.key.slice(1)], label: `${c.label} ↓${n > 1 ? n : ''}`, broken: true };
}
function asHigh(c) {
  const boosted = c.key.slice(-3);
  return { ...c, id: 'high', rank: 0, key: [0, ...boosted], label: `Старша ${c.values.at(-1) ?? 0} (зламано)`, broken: true };
}

/** Найкраще для моєї комбінації значення з кандидатів (масть будь-яка). */
function bestValue(api, values) {
  const mine = api.cards(api.me), ji = mine.findIndex((c) => c.id === api.card.id);
  if (ji < 0) return values[0];
  let best = null;
  for (const v of values) {
    const combo = evaluate(slotsOf(mine.map((x, i) => (i === ji ? { v, s: '*', card: x } : plainSlot(x)))), api.s.trump);
    if (!best || compareCombos(combo, best.combo) > 0) best = { v, combo };
  }
  return best.v;
}

/** Явне значення й масть джокера (null — без масті, на відміну від setSlot, де null = «будь-яка»). */
const X_set = (api, v, s) => { api.setSlot(v, s ?? undefined); if (s == null) api.forceNoSuit(); };

/** Каталог. slot — значення в комбінації за замовчуванням (для бота й підказки): {v,s} | null (порожнє) | {wild} | fn. */
const build = (T) => [
  // ───── Звичайні ─────
  { id: 'turncoat', name: 'Перевертень', rarity: 'common', icon: '🙃', type: 'rule', stage: 'power', slot: T.turncoat.v == null ? null : { v: T.turncoat.v }, noSuit: true,
    desc: `Цього розкриття перемагає СЛАБША комбінація${T.turncoat.v == null ? '' : ` (сам — значення ${T.turncoat.v} без масті)`}.`,
    apply: (api) => { api.setSlot(T.turncoat.v ?? null); api.X.lowWins = !api.X.lowWins; api.note('Перевертень: перемагає слабша комбінація'); } },
  { id: 'roulette', name: 'Рулетка', rarity: 'common', icon: '🎡', type: 'value', stage: 'power', slot: { v: 5 },
    desc: `${T.roulette.k} випадкові значення — береться найкраще для твоєї комбінації; масть будь-яка.`,
    apply: (api) => { const xs = Array.from({ length: T.roulette.k }, () => 1 + Math.floor(api.rng() * 10)); api.setChoice(xs); api.note(`Рулетка: ${xs.join(' / ')}`); } },
  { id: 'thief', name: 'Дикун', rarity: 'common', icon: '🃏', type: 'value', stage: 'power', slot: { wild: true, wildMax: T.thief.max },
    desc: `Будь-яке значення${T.thief.max < 10 ? ` до ${T.thief.max}` : ''} і масть — підбирається найкраще для твоєї комбінації${T.thief.loseTie ? '; нічию програє' : ''}.`,
    apply: (api) => { api.setWild(T.thief.max); if (T.thief.loseTie) api.X.loseTie[api.me] = true; api.note('Дикун підлаштувався під комбінацію'); } },
  { id: 'fist', name: 'Важкий кулак', rarity: 'common', icon: '👊', type: 'value', stage: 'power', slot: { v: T.fist.v }, noSuit: true,
    desc: `Значення ${T.fist.v} без масті, нічию програє; удар коштує ${T.fist.fee} фішок у джекпот.`,
    apply: (api) => { api.setSlot(T.fist.v); api.X.loseTie[api.me] = true; api.note(`Важкий кулак: ${T.fist.v}`); api.after(() => api.burn(api.me, T.fist.fee)); } },
  { id: 'insurance', name: 'Чет-нечет', rarity: 'common', icon: '⚖️', type: 'value', stage: 'power', slot: { v: T.insurance.v },
    desc: `Значення ${T.insurance.v}. Відкрита карта суперника парна — твоя комбінація на сходинку сильніша.`,
    d3: `Значення ${T.insurance.v}. Відкрита карта лідера парна — твоя комбінація на сходинку сильніша.`,
    apply: (api) => {
      api.setSlot(T.insurance.v);
      const even = nominal(api.openOf(api.opp)) % 2 === 0;
      if (even) { const me = api.me; api.post((cs) => { cs[me] = rankUp(cs[me], 1); }); }
      api.note(even ? 'Чет! Комбінація на сходинку сильніша' : 'Нечет');
    } },
  { id: 'twin', name: 'Двійник', rarity: 'common', icon: '👥', type: 'value', stage: 'power', slot: { v: 5 },
    slotFor: (ctx) => { const vs = [...new Set((ctx.hand || []).filter((c) => c.kind === 'num').map((c) => c.value))]; return vs.length ? { wild: true, wildVals: vs, wildSuit: null } : null; },
    desc: 'Копіює значення однієї з карт у твоїй руці — найкраще для комбінації; без масті.',
    apply: (api) => { const vs = [...new Set(api.handOf(api.me).map((c) => plainSlot(c).v).filter((x) => x != null))]; if (vs.length) api.setChoice(vs, null); else api.setSlot(5); api.note('Двійник: скопіював найкраще значення з руки'); } },
  { id: 'chameleon', name: 'Хамелеон', rarity: 'common', icon: '🦎', type: 'value', stage: 'power', slot: { v: T.chameleon.v },
    desc: `Значення ${T.chameleon.v}, масть будь-яка; нічию виграє.`,
    apply: (api) => { api.setSlot(T.chameleon.v); api.X.winTie[api.me] = true; api.note(`Хамелеон: ${T.chameleon.v}, нічия — його`); } },
  { id: 'modest', name: 'Підробка', rarity: 'common', icon: '🎭', type: 'value', stage: 'power', slot: { v: T.modest.alt },
    desc: `Значення відкритої карти суперника або ${T.modest.alt} — що краще для комбінації (масть будь-яка).`,
    d3: `Значення відкритої карти лідера або ${T.modest.alt} — що краще для комбінації (масть будь-яка).`,
    apply: (api) => {
      const t = api.opp, open = api.openOf(t), sl = plainSlot(open);
      api.setChoice([sl.v ?? T.modest.alt, T.modest.alt]);
      api.note(`Підробка: копія ${sl.v ?? 5}`);
    } },
  { id: 'tax', name: 'Податок', rarity: 'common', icon: '🧾', type: 'value', stage: 'power', slot: { v: T.tax.v },
    desc: `Значення ${T.tax.v}. Усі учасники платять по ${T.tax.fee} фішок у джекпот.`,
    apply: (api) => { api.setSlot(T.tax.v); api.after(() => { for (const q of api.parts0) api.burn(q, T.tax.fee); api.note(`Податок: по ${T.tax.fee} у джекпот`); }); } },
  { id: 'dice', name: 'Стрибок', rarity: 'common', icon: '🦘', type: 'value', stage: 'power', slot: { v: 5 },
    desc: 'На 1–3 більше або менше за одну з твоїх карт, тієї ж масті — обирається найкраще для комбінації.',
    apply: (api) => {
      const mine = api.cards(api.me);
      const ji = mine.findIndex((c) => c.id === api.card.id);
      if (ji < 0) return;
      let best = null;
      for (const c of mine) {
        if (c.id === api.card.id) continue;
        const sl = plainSlot(c);
        if (sl.v == null) continue;
        for (const d of [1, 2, 3, -1, -2, -3]) {
          const v = sl.v + d;
          if (v < 1 || v > 10) continue;
          const slots = slotsOf(mine.map((x, i) => (i === ji ? { v, s: sl.s, card: x } : plainSlot(x))));
          const combo = evaluate(slots, api.s.trump);
          if (!best || compareCombos(combo, best.combo) > 0) best = { combo, v, s: sl.s };
        }
      }
      if (best) { api.setSlot(best.v, best.s); api.note(`Стрибок: ${best.v}`); } else { api.setSlot(5); api.note('Стрибок: нема від чого — 5'); }
    } },
  { id: 'counter', name: 'Сходинка', rarity: 'common', icon: '🪜', type: 'value', stage: 'power', slot: T.counter.v == null ? null : { v: T.counter.v }, noSuit: true,
    desc: `${T.counter.v == null ? 'Місце порожнє' : `Значення ${T.counter.v} без масті`}, а твоя комбінація на ${T.counter.ranks} сходинку сильніша${T.counter.loseTie ? '; нічию програє' : ''}.`,
    apply: (api) => { api.setSlot(T.counter.v ?? null); if (T.counter.loseTie) api.X.loseTie[api.me] = true; const me = api.me; api.post((cs) => { cs[me] = rankUp(cs[me], T.counter.ranks); }); api.note('Сходинка: комбінація сильніша'); } },
  { id: 'brazen', name: 'Близнюк', rarity: 'common', icon: '♊', type: 'value', stage: 'power', slot: { mirror: true }, noSuit: !T.brazen.suit,
    desc: `${Math.round(T.brazen.p * 100)}%: копія значення твоєї наймолодшої іншої зіграної карти${T.brazen.suit ? ' (і масті)' : ', без масті'}${T.brazen.loseTie ? '; нічию програє' : ''}, інакше — 1.`,
    apply: (api) => {
      const others = api.cards(api.me).filter((c) => c.id !== api.card.id).map(plainSlot).filter((x) => x.v != null);
      const top = others.sort((a, b) => a.v - b.v)[0];
      if (T.brazen.loseTie) api.X.loseTie[api.me] = true;
      if (top && api.rng() >= T.brazen.p) { api.setSlot(1); api.note('Близнюк не вдався: 1'); return; }
      if (top) { X_set(api, top.v, T.brazen.suit ? top.s : null); api.note(`Близнюк: копія ${top.v}`); } else { api.setSlot(null); api.note('Близнюк: нема кого копіювати'); }
    } },
  { id: 'magnet', name: 'Магніт', rarity: 'common', icon: '🧲', type: 'value', stage: 'power', slot: { v: T.magnet.v },
    desc: `Значення ${T.magnet.v}, масть будь-яка; притягує удачу — нічию виграє.`,
    apply: (api) => { api.setSlot(T.magnet.v); api.X.winTie[api.me] = true; api.note(`Магніт: ${T.magnet.v}, нічия — його`); } },
  { id: 'temptation', name: 'Аутсайдер', rarity: 'common', icon: '🐢', type: 'value', stage: 'power', slot: { v: T.temptation.v },
    desc: `Значення ${T.temptation.v}. Відстаєш від суперника на ${T.temptation.gap}+ фішок — твоя комбінація на сходинку сильніша.`,
    d3: `Значення ${T.temptation.v}. Відстаєш від лідера на ${T.temptation.gap}+ фішок — твоя комбінація на сходинку сильніша.`,
    apply: (api) => {
      api.setSlot(T.temptation.v);
      const gap = api.chips(api.opp) - api.chips(api.me);
      if (gap >= T.temptation.gap) { const me = api.me; api.post((cs) => { cs[me] = rankUp(cs[me], 1); }); }
      api.note(gap >= T.temptation.gap ? `Аутсайдер: відставання ${gap} — комбінація сильніша` : `Аутсайдер: ${T.temptation.v}`);
    } },

  // ───── Рідкісні ─────
  { id: 'storm', name: 'Буря', rarity: 'rare', icon: '🌪️', type: 'cards', stage: 'replace', slot: { v: T.storm.v }, noSuit: true,
    desc: `Значення ${T.storm.v} без масті. Усі закриті карти на столі замінюються випадковими з колоди.`,
    apply: (api) => {
      api.setSlot(T.storm.v);
      for (const q of api.parts) {
        const cs = api.cards(q);
        cs.forEach((c, i) => { if (c.id !== api.openIdOf(q) && c.kind !== 'joker') { const n = api.drawNum(); if (n) cs[i] = n; } });
      }
      api.note('Буря замінила всі закриті карти');
    } },
  { id: 'swap', name: 'Обмін', rarity: 'rare', icon: '🔀', type: 'cards', stage: 'replace', slot: { v: 5 },
    desc: 'Забираєш випадкову закриту карту суперника; йому — випадкова з колоди.',
    d3: 'Забираєш випадкову закриту карту лідера; йому — випадкова з колоди.',
    apply: (api) => {
      const t = api.opp, cs = api.cards(t);
      const closed = cs.map((c, k) => k).filter((k) => cs[k].id !== api.openIdOf(t) && cs[k].kind !== 'joker');
      const i = closed.length ? closed[Math.floor(api.rng() * closed.length)] : -1;
      if (i < 0) { api.setSlot(5); api.note('Обмін: нічого взяти'); return; }
      const took = cs[i];
      const n = api.drawNum();
      if (n) cs[i] = n;
      api.replaceMe(took);
      api.note('Обмін: закриту карту суперника вкрадено');
    } },
  { id: 'shadow', name: 'Тінь', rarity: 'rare', icon: '🌑', type: 'value', stage: 'power', slot: { v: T.shadow.v }, noSuit: true,
    desc: `Значення ${T.shadow.v} без масті; якщо суперник підглядав до тебе — твоя комбінація на сходинку сильніша.`,
    d3: `Значення ${T.shadow.v} без масті; якщо хтось підглядав саме до тебе — твоя комбінація на сходинку сильніша.`,
    apply: (api) => {
      const seen = api.others.some((q) => api.s.players[q].scouted && (api.s.players[q].scoutTarget ?? api.me) === api.me);
      api.setSlot(T.shadow.v);
      if (seen) { const me = api.me; api.post((cs) => { cs[me] = rankUp(cs[me], 1); }); }
      api.note(seen ? 'Тінь: суперник підглядав — комбінація сильніша' : `Тінь: ${T.shadow.v}`);
    } },
  { id: 'trap', name: 'Пастка', rarity: 'rare', icon: '🪤', type: 'rule', stage: 'power', slot: { v: T.trap.v }, noSuit: true,
    desc: `Значення ${T.trap.v} без масті. Якщо суперник цього раунду піднімав ставку — твоя комбінація на ${T.trap.ranks} сходинки сильніша.`,
    d3: `Значення ${T.trap.v}. Якщо лідер цього раунду піднімав ставку — твоя комбінація на ${T.trap.ranks} сходинки сильніша.`,
    apply: (api) => {
      api.setSlot(T.trap.v);
      const caught = api.s.roundRaises?.[api.opp] > 0;
      if (caught) { const me = api.me; api.post((cs) => { cs[me] = rankUp(cs[me], T.trap.ranks); }); api.note('Пастка спрацювала: суперник піднімав!'); }
      else api.note('Пастка: суперник не піднімав');
    } },
  { id: 'highroller', name: 'Ва-банкір', rarity: 'rare', icon: '🤑', type: 'value', stage: 'replace', slot: { v: T.highroller.v },
    desc: `Значення ${T.highroller.v}. Кожен ще раз докладає в банк свою ставку — банк подвоюється.`,
    apply: (api) => { api.setSlot(T.highroller.v); let n = 0; for (const q of api.parts0) n += api.pay(q, api.contrib(q)); api.note(`Ва-банкір: банк +${n}`); } },
  { id: 'pocket', name: 'Кишеньковий', rarity: 'rare', icon: '👖', type: 'value', stage: 'power', slot: { v: T.pocket.v },
    desc: `Значення ${T.pocket.v}, масть будь-яка. Після розкриття забираєш собі в руку випадкову карту з руки суперника.`,
    d3: `Значення ${T.pocket.v}, масть будь-яка. Після розкриття забираєш собі в руку випадкову карту з руки лідера.`,
    apply: (api) => {
      api.setSlot(T.pocket.v);
      const t = api.opp, me = api.me;
      api.after(() => { const c = api.randomInHand(t); if (c) { api.moveCard(t, me, c); api.note('Кишеньковий витяг карту з руки суперника'); } });
    } },
  { id: 'sharper', name: 'Шулер', rarity: 'rare', icon: '🎩', type: 'value', stage: 'power', slot: { wild: true, wildVals: [T.sharper.v, T.sharper.alt] },
    desc: `Значення ${T.sharper.v} або ${T.sharper.alt} — що краще для комбінації; масть будь-яка.`,
    apply: (api) => { api.setChoice([T.sharper.v, T.sharper.alt]); api.note('Шулер: обрав краще значення'); } },
  { id: 'luck', name: 'Удача', rarity: 'rare', icon: '🍀', type: 'value', stage: 'power', slot: { v: T.luck.v },
    desc: `Значення ${T.luck.v}. 50 на 50: твоя комбінація на ${T.luck.up} сходинки сильніша або на 1 слабша.`,
    apply: (api) => {
      api.setSlot(T.luck.v);
      const up = api.rng() < 0.5, me = api.me;
      api.post((cs) => { cs[me] = up ? rankUp(cs[me], T.luck.up) : rankDown(cs[me], 1); });
      api.note(up ? 'Удача всміхнулась: комбінація сильніша' : 'Удача відвернулась');
    } },
  { id: 'brave', name: 'Сміливець', rarity: 'rare', icon: '🦁', type: 'value', stage: 'power', slot: { v: T.brave.v },
    desc: `Значення від ${T.brave.v} до ${T.brave.v}+${T.brave.perRaise}×підняття цього раунду — найкраще для комбінації.`,
    apply: (api) => {
      const r = (api.s.roundRaises || []).reduce((a, b) => a + b, 0);
      const top = Math.min(10, T.brave.v + T.brave.perRaise * r);
      const v = bestValue(api, Array.from({ length: top - T.brave.v + 1 }, (_, i) => T.brave.v + i));
      api.setSlot(v); api.note(`Сміливець: ${r} підн. → ${v}`);
    } },
  { id: 'antitrump', name: 'Ламач', rarity: 'rare', icon: '🔨', type: 'rule', stage: 'power', slot: null,
    desc: `Місце порожнє. Комбінація суперника на ${T.antitrump.ranks} сходинки слабша.`,
    d3: `Місце порожнє. Найсильніша комбінація серед суперників на ${T.antitrump.ranks} сходинки слабша.`,
    apply: (api) => {
      api.setSlot(null);
      const others = api.others;
      api.post((cs) => {
        const t = others.reduce((a, b) => (compareCombos(cs[b], cs[a]) > 0 ? b : a));
        cs[t] = rankDown(cs[t], T.antitrump.ranks);
      });
      api.note('Ламач зламав комбінацію суперника');
    } },

  // ───── Епічні: великий хаос ─────
  { id: 'boom', name: 'Вибух', rarity: 'epic', icon: '💥', type: 'rule', stage: 'cancel', slot: null,
    desc: 'Раунд скасовано: увесь банк летить у джекпот.',
    apply: (api) => { api.X.cancel = 'void'; api.note('ВИБУХ! Банк летить у джекпот'); } },
  { id: 'coin', name: 'Монетка', rarity: 'epic', icon: '🪙', type: 'rule', stage: 'replace', slot: null,
    desc: 'Банк подвоюється з фішок обох, переможця вирішує монетка.',
    d3: 'Банк подвоюється з фішок усіх, переможця з трьох вирішує жереб.',
    apply: (api) => {
      const share = Math.floor(api.s.pot / api.parts.length);
      for (const q of api.parts0) api.pay(q, share);
      api.X.coin = true; api.note('Монетка: банк подвоєно, вирішує підкидання');
    } },
  { id: 'redeal', name: 'Нова роздача', rarity: 'epic', icon: '🃏', type: 'cards', stage: 'replace', slot: null,
    desc: 'Усі скидають руки; усі зіграні карти (й відкриті) замінюються картами з колоди.',
    apply: (api) => {
      for (const q of api.parts) api.dumpHand(q);
      for (const q of api.parts) { const cs = api.cards(q); cs.forEach((c, i) => { const n = api.drawNum(); if (n) cs[i] = n; }); }
      api.note('Нова роздача: вирішує колода');
    } },
  { id: 'echo', name: 'Ехо', rarity: 'epic', icon: '🔁', type: 'value', stage: 'power', slot: { v: T.echo.v },
    desc: `Повторює джокера суперника (або останнього в партії); інакше — значення ${T.echo.v}.`,
    d3: `Повторює джокера наступного за годинниковою суперника (або останнього в партії); інакше — значення ${T.echo.v}.`,
    apply: (api) => api.setSlot(T.echo.v) }, // розгортається в resolveJokers
  { id: 'quake', name: 'Землетрус', rarity: 'epic', icon: '🌋', type: 'value', stage: 'power', slot: { v: T.quake.v },
    desc: `Значення ${T.quake.v}. Після розкриття руки всіх перемішуються і роздаються наново.`,
    apply: (api) => { api.setSlot(T.quake.v); api.after(() => { api.quake(); api.note('Землетрус перемішав руки'); }); } },
  { id: 'castling', name: 'Рокіровка', rarity: 'epic', icon: '♜', type: 'cards', stage: 'replace', slot: { v: T.castling.v },
    desc: `Міняєшся з суперником усіма зіграними картами (Рокіровка в нього — значення ${T.castling.v})${T.castling.myTie ? ', нічия — твоя' : ''}.`,
    d3: `Міняєшся з лідером усіма зіграними картами (Рокіровка в нього — значення ${T.castling.v})${T.castling.myTie ? ', нічия — твоя' : ''}.`,
    apply: (api) => {
      api.setSlot(T.castling.v);
      api.swapSets(api.me, api.opp);
      if (T.castling.myTie) api.X.winTie[api.me] = true;
      api.note('Рокіровка: набори помінялись');
    } },
  { id: 'frenzy', name: 'Ажіотаж', rarity: 'epic', icon: '🔥', type: 'value', stage: 'replace', slot: { v: T.frenzy.v },
    desc: `Значення ${T.frenzy.v}. Кожен двічі докладає свою ставку — банк утричі більший.`,
    apply: (api) => { api.setSlot(T.frenzy.v); let n = 0; for (const q of api.parts0) n += api.pay(q, 2 * api.contrib(q)); api.note(`Ажіотаж: банк +${n}`); } },

  // ───── Легендарні: лише з автомата ─────
  { id: 'apocalypse', name: 'Апокаліпсис', rarity: 'legendary', icon: '☄️', type: 'rule', stage: 'replace', slot: null,
    desc: 'Кожен кидає в банк половину своїх фішок. Усе вирішує монетка.',
    d3: 'Кожен учасник кидає в банк половину своїх фішок. Переможця вирішує жереб.',
    apply: (api) => {
      let n = 0;
      for (const q of api.parts0) n += api.pay(q, Math.floor(api.chips(q) / 2));
      api.X.coin = true; api.note(`АПОКАЛІПСИС: +${n} у банк, вирішує монетка`);
    } },
  { id: 'rewind', name: 'Назад у часі', rarity: 'legendary', icon: '⏳', type: 'rule', stage: 'cancel', slot: null,
    desc: 'Раунд переграється з нуля, ставки повертаються.',
    apply: (api) => { api.X.cancel = 'replay'; api.note('НАЗАД У ЧАСІ: раунд переграється'); } },
  { id: 'chaosking', name: 'Король хаосу', rarity: 'legendary', icon: '👑', type: 'rule', stage: 'power', slot: { v: 5 },
    desc: 'Рулетка обирає ефект будь-якого іншого джокера; з шансом 50% твоя комбінація ще й на сходинку сильніша.',
    apply: () => {} }, // розгортається в resolveJokers
  { id: 'duel', name: 'Дуель', rarity: 'legendary', icon: '⚔️', type: 'cards', stage: 'replace', slot: null,
    desc: `Кожен бере 3 карти з колоди (ти — ${3 + T.duel.extra}) і грає найкращою трійкою зі своїх зіграних і нових.`,
    apply: (api) => {
      const duel = {};
      for (const q of [api.me, ...api.others]) {
        const fresh = Array.from({ length: 3 + (q === api.me ? T.duel.extra : 0) }, () => api.drawNum()).filter(Boolean);
        const pool = [...api.cards(q).filter((c) => c.kind !== 'joker'), ...fresh];
        const best = bestSet(pool, api.s.trump, { joker: jokerSlot });
        const cs = api.cards(q);
        const pick = best ? best.idx.map((i) => pool[i]) : pool.slice(0, 3);
        cs.splice(0, cs.length, ...pick);
        duel[q] = fresh;
      }
      api.X.duel = duel;
      api.note('ДУЕЛЬ: кожен узяв по 3 карти');
    } },
  { id: 'mirrorworld', name: 'Задзеркалля', rarity: 'legendary', icon: '🪞', type: 'rule', stage: 'replace', slot: { v: T.mirrorworld.v },
    desc: `Значення ${T.mirrorworld.v}. Ставки подвоюються, перемагає СЛАБША комбінація.`,
    apply: (api) => {
      api.setSlot(T.mirrorworld.v);
      let n = 0;
      for (const q of api.parts0) n += api.pay(q, api.contrib(q));
      api.X.lowWins = !api.X.lowWins;
      api.note(`ЗАДЗЕРКАЛЛЯ: банк +${n}, перемагає слабша`);
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

/** Опис джокера з урахуванням кількості гравців. */
export function jokerDesc(j, n = 2) {
  const d = catalog(n)[typeof j === 'string' ? j : j.id];
  return n > 2 && d.d3 ? d.d3 : d.desc;
}

/** Карта-джокер для руки. */
export function jokerCard(jid, p, n = 2) {
  const d = catalog(n)[jid];
  return { id: `J${p}-${jid}`, kind: 'joker', joker: jid, rarity: d.rarity, n };
}

/**
 * Значення джокера в комбінації за замовчуванням (до розкриття — для бота, підказки й статистики):
 * { v, s } | { wild, wildMax } | { mirror } | null — порожнє місце.
 */
export function jokerSlot(card, ctx = null) {
  const d = catalog(card.n || 2)[card.joker];
  if (!d) return null;
  const hint = ctx && d.slotFor ? d.slotFor(ctx) : null;
  const sl = hint || (typeof d.slot === 'function' ? d.slot(card) : d.slot);
  if (!sl) return { v: null };
  // джокер-значення без своєї масті — будь-яка масть (крім тих, що «без масті»)
  return { ...sl, s: sl.s ?? (sl.v != null && !d.noSuit ? '*' : null) };
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
 * env — функції рушія (переміщення фішок, колода). Повертає X: cards (набори після замін), slot(card) — значення
 * джокерів, pre/post — зміни слотів і комбінацій, lowWins/forced/coin/cancel, notes, fired, afters.
 */
export function resolveJokers(s, ctx, env) {
  const n = s.players.length;
  const BY = catalog(n), T = tuning(n);
  const parts = env.api({}).parts();
  const fill = (v) => Array(n).fill(v);
  const X = {
    parts,
    cards: s.players.map((pl, q) => (parts.includes(q) ? pl.played.slice() : null)),
    openIds: s.players.map((pl) => pl.openId),
    jv: {}, // id картки-джокера → слот
    winTie: fill(false), loseTie: fill(false), lowWins: false,
    forced: undefined, coin: false, cancel: null, pre: [], post: [], afters: [], notes: [], fired: [], duel: null,
  };
  X.slot = (card) => (X.jv[card.id] !== undefined ? X.jv[card.id] : jokerSlot(card));
  // Порядок місць від того, хто ходив першим
  const dist = (p) => (p - s.firstToAct + n) % n;
  const othersOf = (p) => parts.filter((q) => q !== p).sort((a, b) => ((a - p + n) % n) - ((b - p + n) % n));
  // Хто з джокерів що робить (Ехо і Король хаосу розгортаються в інший ефект). Кілька джокерів у наборі — кожен окремо.
  const entries = [];
  for (const p of parts) {
    for (const card of X.cards[p]) {
      if (card?.kind !== 'joker') continue;
      let def = BY[card.joker];
      let prefix = '';
      if (def.id === 'echo') {
        const oc = othersOf(p).flatMap((q) => X.cards[q]).find((c) => c?.kind === 'joker' && c.joker !== 'echo');
        const last = (oc && BY[oc.joker]) || (s.lastJoker && BY[s.lastJoker]);
        if (last && last.id !== 'echo') { prefix = `Ехо → ${last.name}. `; def = last; }
        else { prefix = `Ехо: тиша — значення ${T.echo.v}. `; }
      } else if (def.id === 'chaosking') {
        const pool = Object.values(BY).filter((j) => !['chaosking', 'echo'].includes(j.id));
        def = pool[Math.floor(ctx.rng() * pool.length)];
        prefix = `Король хаосу обрав: ${def.name}. `;
        if (ctx.rng() < 0.5) { X.post.push((cs) => { if (cs[p]) cs[p] = rankUp(cs[p], 1); }); prefix += 'Комбінація на сходинку сильніша. '; }
      }
      entries.push({ p, card, def, src: BY[card.joker], prefix });
    }
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
    // «Моя карта все ще цей джокер?» (після замін карт ефект значення вже не діє)
    const where = () => { for (const q of parts) { const i = X.cards[q].findIndex((c) => c.id === e.card.id); if (i >= 0) return { q, i }; } return null; };
    const api = {
      ...env.api(X),
      s, X, me, opp, others, parts, parts0: [me, ...others], card: e.card, rng: ctx.rng,
      cards: (q) => X.cards[q],
      openIdOf: (q) => X.openIds[q],
      openOf: (q) => X.cards[q]?.find((c) => c.id === X.openIds[q]) || null,
      setSlot: (v, su = null) => { if (where()) X.jv[e.card.id] = v == null ? { v: null } : { v, s: su ?? (e.def.noSuit ? null : '*') }; },
      setChoice: (vals, suit = '*') => { if (where()) X.jv[e.card.id] = { wild: true, wildVals: [...new Set(vals)], wildSuit: suit }; },
      forceNoSuit: () => { const j = X.jv[e.card.id]; if (j && j.v != null) j.s = null; },
      setWild: (max = 10) => { if (where()) X.jv[e.card.id] = { wild: true, wildMax: max }; },
      replaceMe: (card) => { const w = where(); if (w) { if (X.openIds[w.q] === e.card.id) X.openIds[w.q] = card.id; X.cards[w.q][w.i] = card; } },
      swapSets: (a, b) => { [X.cards[a], X.cards[b]] = [X.cards[b], X.cards[a]]; [X.openIds[a], X.openIds[b]] = [X.openIds[b], X.openIds[a]]; },
      note: (t) => { X.notes.push({ p: me, joker: e.src.id, text: (first ? e.prefix : '') + t }); first = false; },
      after: (fn) => X.afters.push(fn),
      pre: (fn) => X.pre.push(fn),
      post: (fn) => X.post.push(fn),
    };
    e.def.apply(api);
    if (first && e.prefix) X.notes.push({ p: me, joker: e.src.id, text: e.prefix.trim() });
    X.fired.push({ p: me, joker: e.src.id, as: e.def.id });
  }
  return X;
}
