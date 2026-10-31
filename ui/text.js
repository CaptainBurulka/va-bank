// Українські тексти: назви карт, журнал, пояснення розкриття, правила, підказки.
import { CONFIG } from '../config.js';
import { anteFor } from '../game/engine.js';

export const SUIT = {
  water: { name: 'Вода', gen: 'Води', ico: '💧' },
  fire: { name: 'Вогонь', gen: 'Вогню', ico: '🔥' },
  stone: { name: 'Камінь', gen: 'Каменю', ico: '🪨' },
};

export const SPECIAL = {
  knife: { name: 'Ніж', ico: '🔪', sub: 'б\'є 10 і 🪞' },
  mirror: { name: 'Дзеркало', ico: '🪞', sub: 'копія + нічия' },
  double: { name: 'Подвоєння', ico: '×2', sub: 'сила 5' },
};

export const SCOUT = {
  high: { name: 'висока', ico: '⬆', range: '6–10' },
  low: { name: 'низька', ico: '⬇', range: '0–5' },
};

export { REACTIONS } from '../net/protocol.js';

export function cardName(c) {
  if (!c) return '?';
  if (c.kind === 'num') return `${c.value}${SUIT[c.suit].ico}`;
  return `${SPECIAL[c.kind].ico} ${SPECIAL[c.kind].name}`;
}

/** «7 Вогню», «Ніж» — для пояснень. */
function longName(c) {
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
    case 'knife-mirror': return 'Ніж б\'є Дзеркало';
    case 'knife10': return `Ніж б'є десятку (${cardName(l)})`;
    case 'mirror': return `Дзеркало копіює ${detail.copied} і виграє нічию`;
    case 'power': {
      const t = detail.trumped && trump ? `Козир ${SUIT[trump].ico} +${CONFIG.trumpBonus}: ` : '';
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

/** Рядок журналу. names: [ім'я гравця 0, ім'я гравця 1] з точки зору глядача. */
export function logLine(e, names) {
  const n = (p) => names[p];
  switch (e.t) {
    case 'round': return `— Раунд ${e.r}${e.trump ? ` · козир ${SUIT[e.trump].ico}` : ''} —`;
    case 'ante': return null;
    case 'play': return `${n(e.p)}: карта на столі${e.auto ? ' (час вийшов)' : ''}`;
    case 'swap': return `${n(e.p)}: обмін карти (−${e.amount})`;
    case 'scout': return `${n(e.p)}: розвідка (−${e.amount})`;
    case 'check': return `${n(e.p)}: чек${e.auto ? ' (час вийшов)' : ''}`;
    case 'raise': return `${n(e.p)}: ${e.allin ? 'ВА-БАНК' : 'підняття'} +${e.amount}`;
    case 'call': return `${n(e.p)}: колл ${e.amount}`;
    case 'fold': return `${n(e.p)}: пас${e.auto ? ' (час вийшов)' : ''}`;
    case 'foldwin': return `${n(e.p)} забирає банк ${e.amount} без розкриття`;
    case 'showdown': return `${cardName(e.cards[0])} проти ${cardName(e.cards[1])}: ${n(e.p)} +${e.amount}${e.penalty ? ` (штраф ×2: ${e.penalty})` : ''}`;
    case 'tie': return `${cardName(e.cards[0])} проти ${cardName(e.cards[1])}: нічия, банк ${e.pot} переходить далі`;
    case 'show': return `${n(e.p)} показує карту: ${cardName(e.card)}`;
    case 'donBase': return `${n(e.p)} ризикує ${e.stake}: база ${cardName(e.card)}`;
    case 'donCancel': return `${n(e.p)} передумує й забирає виграш`;
    case 'don': {
      const g = `«${e.guess === 'higher' ? 'більше' : 'менше'} за ${e.base.value}» ×${e.m}`;
      const res = e.outcome === 'win' ? `вгадано! +${e.amount}` : e.outcome === 'lose' ? `мимо, ${e.amount} у джекпот` : 'рівно — ставка повертається';
      return `${n(e.p)}: ${g} → ${cardName(e.card)} — ${res}`;
    }
    case 'reshuffle': return 'Колоду перетасовано';
    case 'split': return `Після останнього раунду банк ${e.amount} поділено навпіл`;
    case 'timeout': return null;
    case 'over': return 'Партію завершено';
  }
  return null;
}

const ante12 = [1, 5, 9].map((r) => anteFor(r, CONFIG)).join(' → ');

export const RULES_HTML = `
<h2>Правила «Ва-банк»</h2>
<p>Двоє гравців, по ${CONFIG.startChips} віртуальних фішок. Мета — забрати всі фішки суперника або мати більше після останнього раунду (8, 12 або 16 — обирає хост).</p>

<h3>Карти</h3>
<ul>
<li>Числа 1–10 у трьох мастях: 💧 Вода, 🔥 Вогонь, 🪨 Камінь. Більше число перемагає.</li>
<li>При рівній силі: Вода б'є Вогонь, Вогонь б'є Камінь, Камінь б'є Воду.</li>
<li>🔪 <b>Ніж</b> — сила 0, але б'є будь-яку десятку і Дзеркало.</li>
<li>🪞 <b>Дзеркало</b> — копіює силу карти суперника й виграє нічию. Програє лише Ножу.</li>
<li>×2 <b>Подвоєння</b> — сила 5; якщо перемагає, програвший доплачує ще стільки, скільки було в банку (якщо має).</li>
</ul>

<h3>Козир раунду</h3>
<p>На початку раунду відкривається масть-козир: числові карти цієї масті мають +${CONFIG.trumpBonus} до сили. Спецкарти козиря не отримують; Ніж б'є десятку козирної масті теж.</p>
<p class="ex">Приклад: козир 🔥. <b>7🔥 (сила 8) > 7💧 (7)</b>. А 7🔥 проти 8💧 — рівна сила 8, тож за мастями перемагає Вода.</p>

<h3>Раунд</h3>
<ol>
<li><b>Анте</b> росте: ${ante12} (кожні ${CONFIG.anteEvery} раунди +${CONFIG.anteStep}).</li>
<li>Добір до ${CONFIG.handSize} карт і відкриття козиря.</li>
<li><b>Обмін</b> (за бажанням, раз за раунд): скинь одну карту й візьми нову за ${CONFIG.swapCost} фішки. Суперник бачить, що ти міняв(-ла).</li>
<li>Обидва таємно кладуть одну карту сорочкою догори (${CONFIG.timers.play} с, інакше випадкова).</li>
<li><b>Розвідка</b> (раз, ${CONFIG.scoutCost} фішки в банк): дізнаєшся, карта суперника <b>висока (6–10)</b> чи <b>низька (0–5)</b>. Спецкарти — за силою: Ніж і Подвоєння «низькі», а Дзеркало прикидається «високою». Суперник бачить, що ти підглядав(-ла).</li>
<li><b>Торги:</b> першим ходить той, хто програв минулий раунд. Чек / Підняти (+${CONFIG.raiseSizes.join(', +')} або ва-банк) / Пас. На підняття: Колл / Ре-рейз / Пас. Максимум ${CONFIG.maxRaises} підняття за раунд. У раундах 1–${CONFIG.allinFreeFromRound - 1} ва-банк не більший за банк.</li>
<li><b>Розкриття:</b> переможець забирає банк, під картами пишеться, чому так. Нічия — банк переходить далі.</li>
<li><b>Подвій або нічого</b> (за бажанням).</li>
</ol>

<h3>Подвій або нічого</h3>
<ul>
<li>Ризикуєш лише <b>чистим виграшем</b> — тим, що в банк вніс суперник.</li>
<li>Відкривається нова карта з колоди — <b>база</b>. Ти бачиш шанс і множник для «більше» та «менше», пораховані з реального залишку колоди.</li>
<li>Вгадав — суперник доплачує ставку × (множник − 1), але не більше ${CONFIG.don.maxWin} за спробу. Не вгадав — ставка йде в банк наступного раунду як <b>джекпот</b>. Рівно — ставка повертається.</li>
<li>Спецкарти при відкритті пропускаються. Одна спроба за раунд; з ${CONFIG.don.secondFromRound}-го раунду після вдалої можна ще одну.</li>
</ul>
<p class="ex">Приклад: виграв банк 30, з них суперник вніс 15. База — 4. «Більше»: шанс ≈62%, ×1.3 → +4. «Менше»: шанс ≈31%, ×2.7 → +20 (ліміт). Випала 4 — ставка повертається.</p>

<h3>Кінець</h3>
<p>Хто збанкрутував — програв. Після останнього раунду перемагає той, у кого більше фішок. Якщо в банку лишились фішки — вони діляться навпіл.</p>
<p>Після пасу можна показати свою карту — похизуватися блефом.</p>
`;

/** Підказки першої партії: ключ → текст. */
export const TIPS = {
  trump: 'Над столом — козир раунду: карти цієї масті мають +1 до сили.',
  play: 'Торкнись карти, щоб вибрати, ще раз — щоб покласти сорочкою догори.',
  swap: `Не подобається карта? Вибери її й натисни «Обмін» — нова карта за ${CONFIG.swapCost} фішки.`,
  scout: 'Розвідка покаже, карта суперника висока (6–10) чи низька. Але Дзеркало теж виглядає «високим».',
  bet: 'Чек — без ставки, підняття — тиск на суперника, пас — віддати банк без розкриття.',
  result: 'Під картами написано, чому вони виграли. Далі — наступний раунд.',
  don: 'Подвій або нічого: ризикуєш лише тим, що вніс суперник. Шанс і множник видно до вибору.',
  deck: 'Унизу столу — скільки високих і низьких карт ще в колоді.',
};
