// Українські тексти: назви карт, журнал, пояснення розкриття, правила, підказки.
import { CONFIG, MODES, MODE_IDS, META } from '../config.js';
import { anteFor } from '../game/engine.js';
import { JOKER_BY_ID, RARITY_NAME } from '../game/jokers.js';

export const SUIT = {
  water: { name: 'Вода', gen: 'Води', ico: '💧' },
  fire: { name: 'Вогонь', gen: 'Вогню', ico: '🔥' },
  stone: { name: 'Камінь', gen: 'Каменю', ico: '🪨' },
};

export const SPECIAL = {
  knife: { name: 'Ніж', ico: '🔪', sub: 'ріже старшу' },
  mirror: { name: 'Дзеркало', ico: '🪞', sub: 'копія' },
  double: { name: 'Подвоєння', ico: '×2', sub: '5 · банк ×2' },
};

export const SCOUT = {
  high: { name: 'висока', ico: '⬆', range: '6–10' },
  low: { name: 'низька', ico: '⬇', range: '0–5' },
};

export { REACTIONS } from '../net/protocol.js';

export function cardName(c) {
  if (Array.isArray(c)) return c.map(cardName).join(' ');
  if (!c) return '?';
  if (c.kind === 'joker') return `${JOKER_BY_ID[c.joker]?.icon || '🃏'} ${JOKER_BY_ID[c.joker]?.name || 'Джокер'}`;
  if (c.kind === 'num') return `${c.value}${SUIT[c.suit].ico}`;
  return `${SPECIAL[c.kind].ico} ${SPECIAL[c.kind].name}`;
}

/** «7 Вогню», «Ніж» — для пояснень. */
function longName(c) {
  if (c.kind === 'joker') return JOKER_BY_ID[c.joker]?.name || 'Джокер';
  if (c.kind === 'num') return `${c.value} ${SUIT[c.suit].gen}`;
  return SPECIAL[c.kind].name;
}

/**
 * Коротке пояснення результату розкриття: «Ніж б'є 10», «Козир +1: 7 Вогню > 7 Води».
 * cards — [карта гравця 0, карта гравця 1], detail — compareDetail(0 проти 1).
 */
export function explain(detail, cards, trump) {
  if (!detail) return '';
  const [a, b] = cards;
  const w = detail.cmp >= 0 ? a : b;
  const l = detail.cmp >= 0 ? b : a;
  const pw = detail.cmp >= 0 ? detail.pa : detail.pb;
  const pl = detail.cmp >= 0 ? detail.pb : detail.pa;
  switch (detail.reason) {
    case 'tie3': return 'ніхто не б\'є обох — нічия за перше місце';
    case 'joker':
      if (detail.pw) return `сила ${detail.pw.map((x) => x[1]).join(' / ')}${detail.lowWins ? ' (перемагає менша)' : ''}`;
      return `сила ${detail.pa} проти ${detail.pb}${detail.near != null ? ` (перемагає ближча до ${detail.near})` : detail.lowWins ? ' (перемагає менша)' : ''}`;
    case 'forced': return 'перемога за ефектом джокера';
    case 'coin': return 'вирішила монетка';
    case 'duel': return detail.sums && detail.sums.length > 2 ? `сума карт ${detail.sums.filter((x) => x).join(' / ')}` : `сума карт ${detail.pa} проти ${detail.pb}`;
    case 'void': return 'раунд скасовано';
    case 'replay': return 'раунд переграється';
    case 'knife-mirror': return 'Ніж б\'є Дзеркало';
    case 'knife10': return `Ніж б'є десятку (${cardName(l)})`;
    case 'mirror': return `Дзеркало копіює ${detail.copied} і виграє нічию`;
    case 'power': {
      const t = detail.trumped && trump ? `Козир +${CONFIG.trumpBonus}: ` : '';
      return `${t}${longName(w)} (${pw}) > ${longName(l)} (${pl})`;
    }
    case 'suit': {
      const t = detail.trumped && trump ? `з козирем ` : '';
      return `Рівна сила ${pw} ${t}— ${SUIT[w.suit].name} б'є ${SUIT[l.suit].name}`;
    }
    case 'tie': return `Рівна сила ${detail.pa}: нічия`;
  }
  return '';
}

/** Рядок журналу. names: імена за місцями з точки зору глядача. */
export function logLine(e, names) {
  const n = (p) => names[p];
  const cs = (xs) => xs.filter(Boolean).map(cardName).join(' проти ');
  switch (e.t) {
    case 'round': return `— Раунд ${e.r}${e.trump ? ` · козир ${SUIT[e.trump].ico}` : ''} —`;
    case 'ante': return null;
    case 'play': return `${n(e.p)}: ${e.set ? 'карти' : 'карта'} на столі${e.auto ? ' (час вийшов)' : ''}`;
    case 'open': return `Відкриті: ${e.cards.map((c, q) => (c ? `${n(q)} ${cardName(c)}` : null)).filter(Boolean).join(' · ')}`;
    case 'swap': return `${n(e.p)}: обмін карти (−${e.amount})`;
    case 'scout': return `${n(e.p)}: розвідка${e.target !== undefined ? ` → ${n(e.target)}` : ''} (−${e.amount})`;
    case 'check': return `${n(e.p)}: чек${e.auto ? ' (час вийшов)' : ''}`;
    case 'raise': return `${n(e.p)}: ${e.allin ? 'ВА-БАНК' : 'підняття'} +${e.amount}`;
    case 'call': return `${n(e.p)}: колл ${e.amount}`;
    case 'fold': return `${n(e.p)}: пас${e.auto ? ' (час вийшов)' : ''}`;
    case 'foldwin': return `${n(e.p)} забирає банк ${e.amount} без розкриття`;
    case 'showdown':
      if (e.detail?.combos) return `${n(e.p)}: ${e.detail.combos[e.p]?.label} — ${e.detail.text} · +${e.amount}${e.penalty ? ` (Подвоєння: +${e.penalty})` : ''}`;
      return `${cs(e.cards)}: ${n(e.p)} +${e.amount}${e.penalty ? ` (штраф ×2: ${e.penalty})` : ''}`;
    case 'tie':
      if (e.detail?.combos) return `${Object.values(e.detail.combos).map((c) => c.label).join(' = ')}: банк ${e.pot} → у джекпот`;
      return `${cs(e.cards)}: нічия, банк ${e.pot} переходить далі`;
    case 'out': return `💀 ${n(e.p)} вибуває — далі дивиться гру`;
    case 'show': return `${n(e.p)} показує ${Array.isArray(e.card) ? 'карти' : 'карту'}: ${cardName(e.card)}`;
    case 'donBase': return `${n(e.p)} ризикує ${e.stake}: база ${cardName(e.card)}`;
    case 'donCancel': return `${n(e.p)} передумує й забирає виграш`;
    case 'don': {
      const g = `«${e.guess === 'higher' ? 'більше' : 'менше'} за ${e.base.value}» ×${e.m}`;
      const res = e.outcome === 'win' ? `вгадано! +${e.amount}` : e.outcome === 'lose' ? `мимо, ${e.amount} у джекпот` : 'рівно — ставка повертається';
      return `${n(e.p)}: ${g} → ${cardName(e.card)} — ${res}`;
    }
    case 'reshuffle': return 'Колоду перетасовано';
    case 'jokerDeal': return '🃏 Роздано джокерів!';
    case 'joker': return `${n(e.p)}: ${e.text}`;
    case 'split': return `Після останнього раунду банк ${e.amount} поділено порівну`;
    case 'timeout': return null;
    case 'over': return 'Партію завершено';
  }
  return null;
}

const ante12 = [1, 5, 9].map((r) => anteFor(r, CONFIG)).join(' → ');
// <span data-card="id" data-trump="suit"> замінюються на справжні карти при показі правил.
const C = (id, trump = '') => `<span data-card="${id}"${trump ? ` data-trump="${trump}"` : ''}></span>`;

export const RULES_HTML = `
<h2>Як грати</h2>
<p>Двоє гравців, по ${CONFIG.startChips} віртуальних фішок. Хто забере всі фішки суперника — або матиме більше після останнього раунду (8, 12 чи 16) — переміг.</p>

<h3>Раунд за 30 секунд</h3>
<ol>
<li>Кожен ставить <b>анте</b> (${ante12}) і добирає до ${CONFIG.combo.handSize} карт.</li>
<li>Обидва одночасно кладуть по <b>3 карти</b>. Одну з них ти робиш <b>відкритою 👁</b> — її побачать усі до торгів. Дві інші — закриті.</li>
<li><b>Торги:</b> чек, підняти чи пас. Хто спасував — віддає банк.</li>
<li><b>Розкриття:</b> сильніша <b>комбінація з 3 карт</b> забирає банк. Зіграні карти йдуть у відбій, рука добирається до ${CONFIG.combo.handSize}.</li>
</ol>

<h3>Комбінації — від найсильнішої</h3>
<p>Порядок — за тим, як часто вони трапляються в нашій колоді: рідша — сильніша.</p>
<ol class="combos">
<li><b>Стріт у масть</b> — 3 карти поспіль однієї масті. <div class="mini-cards">${C('f4')}${C('f5')}${C('f6')}</div></li>
<li><b>Трійка</b> — 3 однакові значення. <div class="mini-cards">${C('w7')}${C('f7')}${C('s7')}</div></li>
<li><b>Стріт</b> — 3 карти поспіль. <div class="mini-cards">${C('w4')}${C('f5')}${C('s6')}</div></li>
<li><b>Масть</b> — 3 карти однієї масті. <div class="mini-cards">${C('s2')}${C('s6')}${C('s9')}</div></li>
<li><b>Пара</b> — 2 однакові значення. <div class="mini-cards">${C('w9')}${C('f9')}${C('s3')}</div></li>
<li><b>Старша карта</b> — усе інше.</li>
</ol>
<p><b>Однакові комбінації:</b> спершу значення самої комбінації (Пара 9 > Пара 7, Стріт до 8 > Стріт до 6), далі старші карти по черзі. Повністю рівні — банк іде в <b>джекпот</b>.</p>

<h3>Козир раунду</h3>
<p>Над столом — масть-козир. Він <b>не змінює комбінацію</b>, але в нічиї козирна карта рахується на 1 старшою.</p>
<div class="ex">Козир — Вогонь. Старша 9 проти Старшої 9: перемагає та, де 9 — Вогню.</div>

<h3>Спецкарти</h3>
<div class="mini-cards">${C('knife')}${C('mirror')}${C('double')}</div>
<ul>
<li><b>Дзеркало</b> — копіює значення (не масть) твоєї найстаршої іншої зіграної карти: з 9 і 4 воно стає 9 — Пара 9.</li>
<li><b>Ніж</b> — не має значення, але найстарша карта найсильнішої комбінації суперника <b>не рахується</b>.</li>
<li><b>Подвоєння</b> — значення 5 без масті. Якщо твоя комбінація з ним перемагає, суперник доплачує ще стільки, скільки було в банку.</li>
</ul>

<h3>Додаткові ходи</h3>
<ul>
<li><b>Обмін</b> (до того, як поклав карти, раз за раунд, ${CONFIG.swapCost} фішки): вибери 1 карту — скинь її й візьми нову.</li>
<li><b>Розвідка</b> (після відкритих карт, ${CONFIG.scoutCost} фішок): дізнаєшся, чи є серед двох закритих карт суперника <b>висока (від ${CONFIG.combo.scoutHighFrom})</b>. Дзеркало прикидається високою.</li>
<li>У раундах 1–${CONFIG.allinFreeFromRound - 1} ва-банк не більший за банк. Максимум ${CONFIG.maxRaises} підняття за раунд.</li>
</ul>

<h3>Блеф і відкрита карта</h3>
<p>Відкрита карта — твій сигнал. Відкрий сильну — налякаєш; відкрий слабку — сховаєш Трійку. Під відкритою картою суперника гра підказує, що в нього <b>може бути</b>.</p>

<h3>Подвій або нічого</h3>
<p>Після перемоги можна ризикнути <b>чистим виграшем</b> — тим, що вніс суперник. Відкривається карта-база; ти бачиш шанс і виграш для «Більше» та «Менше».</p>
<ul>
<li>Вгадав — суперник доплачує (не більше ${CONFIG.don.maxWin} за спробу).</li>
<li>Не вгадав — ставка йде в банк наступного раунду як <b>джекпот</b>.</li>
<li>Рівно — ставка повертається. Одна спроба за раунд, з ${CONFIG.don.secondFromRound}-го — дві.</li>
</ul>

<h3>Джокери</h3>
<p>Джокер займає одне з трьох місць і може бути відкритим або закритим. Діє лише при розкритті. Три типи: <b>карта-значення</b> (має значення для комбінації і свій ефект), <b>правило раунду</b> (його місце порожнє, але змінює раунд) і <b>робота з картами</b> (міняє карти на столі).</p>

<h3>Кінець</h3>
<p>Банкрут програє. Після останнього раунду перемагає той, у кого більше фішок; залишок банку ділиться навпіл. Після пасу можна показати свої карти — похизуватися блефом.</p>

<h3>Гра втрьох</h3>
<p>Усе те саме, лише за столом троє (по ${CONFIG.three.startChips} фішок). Відмінності:</p>
<ul>
<li><b>Торги по колу.</b> Першим ходить гравець після переможця минулого раунду. Ліміт — ${CONFIG.maxRaises} підняття на весь раунд.</li>
<li><b>Ставки й ва-банк</b> не більші за найменший стек серед тих, хто ще в раунді (побічних банків немає).</li>
<li><b>Пас</b> — вихід із раунду. Лишився один — він забирає банк.</li>
<li><b>Розкриття</b> — серед тих, хто не спасував: перемагає найсильніша комбінація. Дві рівні найкращі — банк іде в джекпот.</li>
<li><b>Розвідка</b>: торкнись суперника, до якого підглянути. <b>Ніж</b> ріже найсильнішу комбінацію серед суперників.</li>
<li><b>Подвій або нічого</b>: ризикуєш тим, що внесли суперники; виграш вони платять пропорційно своїм внескам.</li>
<li><b>Банкрут вибуває</b> і далі дивиться гру. Партія закінчується, коли лишився один, або після останнього раунду — місця за фішками. Бали — за місце.</li>
<li><b>Джокери втрьох</b> ціль не обирають. «Суперник» для джокера — <b>лідер за фішками</b> серед інших учасників розкриття.</li>
</ul>

<h3>Режими</h3>
<p>Хост обирає режим перед партією. Це лише інші налаштування, для двох і для трьох.</p>
<ul>
${MODE_IDS.map((m) => `<li><b>${MODES[m].icon} ${MODES[m].name}</b> — ${MODES[m].desc}.</li>`).join('')}
</ul>
<p>Щодня один із режимів стає <b>режимом дня</b>: партія в ньому дає +${META.points.modeOfDay} ★. «Класика (1 карта)» — стара гра однією картою (сильніша карта перемагає, масті по колу: Вода → Вогонь → Камінь → Вода; козир +${CONFIG.trumpBonus}).</p>
`;

/** Кроки інтерактивного навчання. */
export const TUTORIAL = {
  pick: { n: 1, text: '<b>Збери комбінацію з 3 карт.</b> У тебе три сімки — це <b>Трійка</b>, друга за силою. Торкнись їх (підсвічені).' },
  open: { n: 1, text: '<b>Одна карта буде відкритою 👁</b> — її побачить суперник. Гра обрала найслабшу; торкнись 🔒 на іншій, щоб змінити. Тепер — «Покласти 3 карти».' },
  scout: { n: 2, text: '<b>Відкриті карти на столі.</b> Під картою суперника — що в нього може бути. Розвідка скаже, чи є серед його закритих висока. Цього разу — «Далі без розвідки».' },
  bet: { n: 3, text: '<b>Суперник підняв ставку.</b> Трійка б\'є майже все. «Колл» — вирівняти й розкрити карти.' },
  result: { n: 4, text: '<b>Перемога!</b> Тут видно обидві комбінації і чому твоя сильніша. Можна ризикнути виграшем у «Подвій або нічого» або забрати його.' },
  don: { n: 4, text: '<b>Відкрилась база.</b> Обери «Більше» чи «Менше» — шанс і виграш видно на кнопках.' },
};
