// Українські тексти: назви карт, журнал, правила.
import { CONFIG } from '../config.js';

export const SUIT = {
  water: { name: 'Вода', ico: '💧' },
  fire: { name: 'Вогонь', ico: '🔥' },
  stone: { name: 'Камінь', ico: '🪨' },
  special: { name: 'спецкарта', ico: '✨' },
};

export const SPECIAL = {
  knife: { name: 'Ніж', ico: '🔪', sub: 'б\'є десятку' },
  mirror: { name: 'Дзеркало', ico: '🪞', sub: 'копія = нічия' },
  double: { name: 'Подвоєння', ico: '×2', sub: 'сила 5' },
};

export const REACTIONS = ['😂', '😱', '😎', '🔥', '🤡', '👏'];

export function cardName(c) {
  if (!c) return '?';
  if (c.kind === 'num') return `${c.value}${SUIT[c.suit].ico}`;
  return `${SPECIAL[c.kind].ico} ${SPECIAL[c.kind].name}`;
}

/** Рядок журналу. names: [ім'я гравця 0, ім'я гравця 1] з точки зору глядача. */
export function logLine(e, names) {
  const n = (p) => names[p];
  switch (e.t) {
    case 'round': return `— Раунд ${e.r} —`;
    case 'ante': return null;
    case 'play': return `${n(e.p)}: карта на столі${e.auto ? ' (час вийшов)' : ''}`;
    case 'scout': return `${n(e.p)}: розвідка масті (−${e.amount})`;
    case 'check': return `${n(e.p)}: чек${e.auto ? ' (час вийшов)' : ''}`;
    case 'raise': return `${n(e.p)}: ${e.allin ? 'ВА-БАНК' : 'підняття'} +${e.amount}`;
    case 'call': return `${n(e.p)}: колл ${e.amount}`;
    case 'fold': return `${n(e.p)}: пас${e.auto ? ' (час вийшов)' : ''}`;
    case 'foldwin': return `${n(e.p)} забирає банк ${e.amount} без розкриття`;
    case 'showdown': return `${cardName(e.cards[0])} проти ${cardName(e.cards[1])}: ${n(e.p)} +${e.amount}${e.penalty ? ` (з них ×2 штраф ${e.penalty})` : ''}`;
    case 'tie': return `${cardName(e.cards[0])} проти ${cardName(e.cards[1])}: нічия, банк ${e.pot} переходить далі`;
    case 'show': return `${n(e.p)} показує карту: ${cardName(e.card)}`;
    case 'don': return `${n(e.p)}: «${e.guess === 'higher' ? 'більше' : 'менше'} за ${e.ref}» → ${cardName(e.card)} — ${e.win ? `вгадано! +${e.amount}` : `мимо, −${e.amount}`}`;
    case 'reshuffle': return 'Колоду перетасовано';
    case 'split': return `Останній раунд унічию: банк ${e.amount} поділено`;
    case 'timeout': return null;
    case 'over': return 'Партію завершено';
  }
  return null;
}

export const RULES_HTML = `
<h2>Правила «Ва-банк»</h2>
<p>Мета — забрати всі фішки суперника або мати більше фішок після ${CONFIG.maxRounds} раундів. На старті в кожного ${CONFIG.startChips} фішок. Фішки віртуальні.</p>
<h3>Колода (33 карти)</h3>
<ul>
<li>Значення 1–10 у трьох мастях: 💧 Вода, 🔥 Вогонь, 🪨 Камінь.</li>
<li>Більше значення перемагає. При рівних: Вода б'є Вогонь, Вогонь б'є Камінь, Камінь б'є Воду.</li>
<li>🔪 <b>Ніж</b> — сила 0, але б'є будь-яку десятку.</li>
<li>🪞 <b>Дзеркало</b> — копіює карту суперника: завжди нічия.</li>
<li>×2 <b>Подвоєння</b> — сила 5; якщо перемагає, програвший додатково доплачує суму банку (скільки має).</li>
</ul>
<h3>Раунд</h3>
<ol>
<li><b>Анте:</b> кожен ставить ${CONFIG.ante} фішок.</li>
<li>Добір до ${CONFIG.handSize} карт.</li>
<li>Обидва таємно кладуть одну карту сорочкою догори (${CONFIG.timers.play} с, інакше випадкова).</li>
<li><b>Розвідка:</b> можна раз заплатити ${CONFIG.scoutCost} фішки в банк і побачити МАСТЬ карти суперника (не значення). Суперник побачить, що ти підглядав(-ла). Для спецкарти побачиш лише «спецкарта».</li>
<li><b>Торги:</b> першим ходить той, хто програв минулий раунд. Чек / Підняти (+${CONFIG.raiseSizes.join(', +')} або ва-банк) / Пас. На підняття: Колл / Ре-рейз / Пас. Максимум ${CONFIG.maxRaises} підняття за раунд. Пас — суперник забирає банк без розкриття.</li>
<li><b>Розкриття:</b> переможець забирає банк. Нічия — банк переходить у наступний раунд.</li>
<li><b>Подвій або нічого:</b> переможець може вгадати, чи буде верхня карта колоди більшою чи меншою за його зіграну карту. Вгадав — виграш ×2 (доплачує суперник, скільки має). Не вгадав — увесь виграш забирає суперник. Рівне значення — програш. До ${CONFIG.donMaxAttempts} разів поспіль.</li>
<li>Після пасу чи перемоги можна показати свою карту — похизуватися блефом.</li>
</ol>
<h3>Кінець</h3>
<p>Банкрут програє. Після ${CONFIG.maxRounds}-го раунду перемагає той, у кого більше фішок.</p>
`;
