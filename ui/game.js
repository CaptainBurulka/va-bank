// Рендер ігрового екрана з view. Жодної ігрової логіки — лише показ і передача дій.
// Принцип: у будь-якому стані за 2 секунди видно (1) чий хід, (2) що можна зробити, (3) що на кону.
import { cardEl, fillFace, suitIcon, bindCardHold } from './cardview.js';
import { animateNumber, setNumber, flyChips, floatEmoji, floatText } from './fx.js';
import { sfx } from './sound.js';
import { SUIT, SPECIAL, SCOUT, REACTIONS, logLine, explain } from './text.js';
import { ms, reducedMotion } from './motion.js';
import { JOKER_BY_ID, RARITIES, RARITY_NAME, JOKER_ROLES, jokerDesc } from '../game/jokers.js';
const jkLine = (id, n) => `${JOKER_ROLES[JOKER_BY_ID[id].role]?.icon || ''} ${jokerDesc(id, n)}`;
import { playWin } from './cosmetics.js';
import { PHRASES, isPhrase } from '../meta/rivals.js';
import { MODES, FEEL } from '../config.js';
import { liveCombo, weakestId, possibleCombos, comboOf, cheatSheetHTML, bestWith } from './combo-ui.js';
import { COMBO_NAME } from '../game/combos.js';
import { setGlyph } from './glyph.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const chipIco = () => ico('chip', 'chip');
const pct = (p) => `${Math.round(p * 100)}%`;

/** «7 Вогню», «Ніж», «джокера Буря» */
export function cardTitle(c) {
  if (!c) return '';
  if (c.kind === 'joker') return `джокера «${JOKER_BY_ID[c.joker].name}»`;
  return c.kind === 'num' ? `${c.value} ${SUIT[c.suit].gen}` : SPECIAL[c.kind].name;
}

/** Розвідка в комбінаціях: чи є висока серед закритих. */
const SCOUT_COMBO = { high: { name: 'є висока 8+', short: '↑ є 8+' }, low: { name: 'закриті до 7', short: '↓ до 7' } };
/** Кільце таймера: оновлюємо стиль лише коли видимо змінилось (не щокадру) — менше перерахунків стилю й перемальовок. */
function setDash(el, v) {
  const q = (Math.round(v * 2) / 2).toFixed(1);
  if (el._dash !== q) { el._dash = q; el.style.strokeDashoffset = q; }
}
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);

export class GameScreen {
  constructor({ onAction, onReaction, onMenu, onLog }) {
    this.onAction = onAction;
    this.onReaction = onReaction;
    this.onMenu = onMenu;
    this.onLog = onLog;
    this.view = null;
    this.meta = null;
    this.selected = null;
    this.picks = []; // комбінації: вибрані 3 карти
    this.openPick = null; // яка з них відкрита
    this.openManual = false;
    this.names = ['Ти', 'Суперник'];
    this.offline = null;
    this.pending = false;
    this.st = {};

    const ids = ['phase', 'phase-title', 'phase-sub', 'phase-ring', 'phase-sec', 'opp-ava', 'opp-initial', 'opp-name', 'opp-status',
      'opp-hand', 'opp-chips', 'me-name', 'me-status', 'me-chips', 'table', 'trump', 'round-tag', 'slot-opp', 'slot-me', 'info-opp',
      'info-me', 'pot', 'pot-val', 'jackpot', 'deck-info', 'verdict', 'coach', 'hand', 'actions', 'don', 'don-sub',
      'don-base', 'don-next', 'don-result', 'don-choices', 'don-eq', 'don-watch', 'react-panel', 'btn-react', 'fx'];
    this.el = {};
    for (const id of ids) this.el[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = $(id);
    this.el.hudMe = document.querySelector('#me .stack');
    this.el.hudOpp = document.querySelector('#opp .stack');
    // Панелі суперників: ліворуч — наступний за годинниковою, праворуч — інший (лише втрьох)
    this.panels = ['opp', 'opp2'].map((k) => ({
      root: $(k), ava: $(`${k}-ava`), initial: $(`${k}-initial`), name: $(`${k}-name`), status: $(`${k}-status`),
      hand: $(`${k}-hand`), chips: $(`${k}-chips`), hud: document.querySelector(`#${k} .stack`),
      slot: $(`slot-${k}`), info: $(`info-${k}`), seatEl: $(`slot-${k}`).parentElement,
    }));
    this.seatNames = null;
    // Утрьох розвідка: тап по панелі суперника
    this.panels.forEach((pn, i) => pn.root.addEventListener('click', () => {
      const v = this.view;
      if (!v || v.phase !== 'scout') return;
      const q = this.oppSeats(v)[i];
      if (v.legal.some((a) => a.type === 'scout' && a.target === q)) this.act({ type: 'scout', target: q });
    }));

    // Реакції
    this.setEmojiSet(REACTIONS.slice(0, 6));
    this.el.btnReact.addEventListener('click', () => { sfx.tap(); this.el.reactPanel.classList.toggle('hidden'); });
    this.el.reactPanel.addEventListener('click', (ev) => {
      const e = ev.target.closest('button')?.dataset.e;
      if (!e) return;
      this.el.reactPanel.classList.add('hidden');
      this.showReaction(e, true);
      this.onReaction(e);
    });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); this.onMenu(); });

    // Утримання карти набору — огляд (рука і стіл)
    bindCardHold(this.el.hand);
    bindCardHold(this.el.table);
    // Рука: тап лише ВИБИРАЄ карту; покласти — окремою кнопкою (без випадкових ходів)
    this.el.hand.addEventListener('click', (ev) => {
      const c = ev.target.closest('.card');
      if (!c || !this.view) return;
      if (this.isCombo(this.view)) { this.pickCombo(c.dataset.id, !!ev.target.closest('.eye-tog')); return; }
      if (!this.view.legal.some((a) => a.type === 'play')) return;
      sfx.tap();
      this.selected = this.selected === c.dataset.id ? null : c.dataset.id;
      this.renderHandSelection();
      this.renderActions();
    });
    const onBtn = (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b || b.disabled) return;
      this.act(JSON.parse(b.dataset.a));
    };
    this.el.actions.addEventListener('click', onBtn);
    this.el.actions.addEventListener('click', (ev) => { if (ev.target.closest('[data-cheat]')) { sfx.tap(); this.showCheatSheet(); } });
    this.el.donChoices.addEventListener('click', onBtn);
    // Будь-яку довгу анімацію можна пропустити тапом
    this.el.verdict.addEventListener('click', () => this.hideVerdict());
    // пауза-напруга і штампи пропускаються тапом по столу
    this.el.table.addEventListener('click', () => { if (this.st.tense) this.endTense(true); document.querySelectorAll('.stamp').forEach((x) => x.remove()); });
    this.el.don.addEventListener('click', (ev) => { if (!ev.target.closest('button')) this.skipDon(); });
    this.el.coach.addEventListener('click', (ev) => { if (ev.target.closest('[data-skip]')) this.onCoachSkip?.(); });

    // ⓘ біля раунду: анте і склад колоди — за тапом, щоб не захаращувати стіл
    $('btn-tinfo')?.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.tap();
      document.querySelector('.tinfo-pop')?.remove();
      const pop = document.createElement('div');
      pop.className = 'tinfo-pop';
      pop.textContent = this.deckText || '';
      pop.addEventListener('click', () => pop.remove());
      this.el.table.append(pop);
      setTimeout(() => pop.remove(), 4500);
    });
    window.addEventListener('resize', () => { if (this.view) this.layoutHand(); });
    const cheat = document.createElement('button');
    cheat.className = 'cheat-btn hidden'; cheat.id = 'btn-cheat'; cheat.type = 'button'; cheat.textContent = 'Комбінації';
    cheat.addEventListener('click', (e) => { e.stopPropagation(); sfx.tap(); this.showCheatSheet(); });
    document.querySelector('#table .tbar')?.append(cheat);
    this.el.cheat = cheat;

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  isCombo(v) { return !!v && v.core !== 'single'; }

  /** Комбінації: тап по карті — вибрати/зняти (до 3); тап по 👁 на вибраній — зробити її відкритою. */
  pickCombo(id, eye) {
    const v = this.view;
    if (!v.legal.some((a) => ['playSet', 'playOpen', 'playClosed', 'swap'].includes(a.type))) return;
    sfx.tap();
    const i = this.picks.indexOf(id);
    // покроково: на кроці «відкрита» — одна карта, на кроці «закриті» — до двох
    const stepMax = v.legal.some((a) => a.type === 'playOpen') ? 1 : v.legal.some((a) => a.type === 'playClosed') ? Math.min(2, (v.cfg.playCount || 3) - 1) : 0;
    if (stepMax) {
      if (i >= 0) this.picks.splice(i, 1);
      else if (this.picks.length < stepMax) this.picks.push(id);
      else this.picks[this.picks.length - 1] = id;
      this.openPick = null;
      this.focusId = this.picks.includes(id) ? id : null;
      this.renderHandSelection();
      this.renderActions();
      this.onPick?.();
      return;
    }
    if (eye && i >= 0) { this.openPick = id; this.openManual = true; }
    else if (i >= 0) { this.picks.splice(i, 1); if (this.openPick === id) { this.openPick = null; this.openManual = false; } }
    else if (this.picks.length < (v.cfg.playCount || 3)) this.picks.push(id);
    else this.picks[this.picks.length - 1] = id;
    this.fixOpenPick();
    this.focusId = this.picks.includes(id) ? id : null;
    this.renderHandSelection();
    this.renderActions();
    this.onPick?.();
  }

  /** Відкрита за замовчуванням — найслабша з вибраних (якщо гравець не обрав сам). */
  fixOpenPick() {
    const v = this.view;
    const cards = this.picks.map((id) => v.me.hand.find((c) => c.id === id)).filter(Boolean);
    if (this.openManual && this.picks.includes(this.openPick)) return;
    this.openManual = false;
    this.openPick = cards.length ? weakestId(cards, v.me.hand) : null;
  }

  setEmojiSet(list) {
    this.el.reactPanel.innerHTML = list.map((e) => `<button data-e="${e}" aria-label="${e}">${e}</button>`).join('') +
      `<div class="phrases">${PHRASES.map((t) => `<button data-e="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  }

  /** Анімації перемоги гравців (косметика): [моя, суперника] */
  setWinFx(mine, opp) { this.winFx = [mine, opp]; this.winFxBySeat = null; }
  /** Утрьох: анімації перемоги за місцями. */
  setWinFxSeats(list) { this.winFxBySeat = list; if (!this.winFx) this.winFx = [list[0], list[1]]; }

  reset() {
    this.view = null;
    this.selected = null;
    for (const k of ['slotOpp', 'slotMe', 'hand', 'donBase', 'donNext', 'fx']) this.el[k].innerHTML = '';
    this.panels[1].slot.innerHTML = '';
    this.el.reactPanel.classList.add('hidden');
    this.el.don.classList.add('hidden');
    this.el.coach.classList.add('hidden');
    this.hideVerdict();
    document.querySelectorAll('.jk-reveal').forEach((x) => x.remove());
    for (const t of Object.values(this.st.timers || {})) clearTimeout(t);
    this.st = { opp: null, me: null, slots: {}, don: 0, donBase: null, timers: {}, tense: false, pendingFlips: [] };
    this.el.table.classList.remove('tense', 'quake');
    document.getElementById('scr-game').classList.remove('hot');
    document.querySelectorAll('.stamp').forEach((x) => x.remove());
  }

  setNames(me, opp) {
    this.names = [me, opp];
    this.seatNames = null;
    this.el.meName.textContent = me;
    this.el.oppName.textContent = opp;
    setGlyph(this.el.oppInitial, opp, 'С');
    setGlyph(document.querySelector('#me .ava span'), me, 'Т');
  }

  /** Імена за місцями (гра втрьох, онлайн): names[seat]; своє місце підписується names[you] або «Ти». */
  setSeatNames(names, meLabel = null) {
    this.seatNames = names.slice();
    if (meLabel) { this.names[0] = meLabel; this.el.meName.textContent = meLabel; setGlyph(document.querySelector('#me .ava span'), meLabel, 'Т'); }
  }

  /** Місця суперників: удвох — [інший], утрьох — [наступний за годинниковою, ще наступний]. */
  oppSeats(v) {
    const n = v.n || 2;
    return n === 2 ? [1 - v.you] : [(v.you + 1) % n, (v.you + 2) % n];
  }

  nameOf(q, v = this.view) {
    if (v && q === v.you) return this.names[0];
    if (this.seatNames?.[q]) return this.seatNames[q];
    return (v?.n || 2) === 2 ? this.names[1] : `Гравець ${q + 1}`;
  }

  /** Публічна інформація місця q. */
  seat(v, q) { return v.players?.[q] || (q === v.you ? v.me : v.opp); }

  /** Карта місця q, яку бачить глядач. */
  playedOf(v, q) { return q === v.you ? v.me.played : this.seat(v, q).played; }

  isThree(v) { return (v.n || 2) > 2; }

  /** Стан «не на зв'язку» показується в банері фази, нічого не перекриваючи. */
  setOffline(show, text = "Суперник не на зв'язку") {
    this.offline = show ? text : null;
    // Пауза для всіх: локальний відлік зупиняємо, доки хост не пришле свіжий стан
    const t = this.timer;
    if (show && t && !t.paused) this.timer = { ...t, paused: true, remaining: Math.max(0, t.deadline - performance.now()) };
    if (this.view) { this.renderPhase(this.view); this.renderPlayers(this.view); }
  }

  act(a) {
    if (this.pending) return;
    sfx.tap();
    if (['play', 'playSet', 'playOpen', 'playClosed'].includes(a.type)) { this.selected = null; this.picks = []; this.openPick = null; this.openManual = false; sfx.place(); }
    if (a.type === 'swap') { this.selected = null; this.picks = this.picks.filter((id) => id !== a.cardId); this.fixOpenPick(); }
    this.pending = true;
    setTimeout(() => (this.pending = false), 250);
    this.onAction(a);
  }

  /** Реакція: емодзі злітає; фраза — бульбашка біля того, хто її сказав (from — місце, якщо відоме). */
  showReaction(emoji, mine, from = null) {
    sfx.pop();
    if (!isPhrase(emoji)) { floatEmoji(this.el.fx, emoji, !mine); return; }
    const v = this.view;
    let anchor = document.getElementById('me');
    if (!mine) {
      const i = v && from !== null && from !== undefined ? this.oppSeats(v).indexOf(from) : 0;
      anchor = this.panels[Math.max(0, i)].root;
    }
    const layer = this.el.fx;
    const a = anchor.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = `bubble ${mine ? 'up' : 'down'}`;
    b.textContent = emoji;
    b.style.left = `${Math.max(8, Math.min(l.width - 210, a.left - l.left + 12))}px`;
    if (mine) b.style.bottom = `${l.bottom - a.top + 8}px`;
    else b.style.top = `${a.bottom - l.top + 8}px`;
    layer.append(b);
    setTimeout(() => b.remove(), 2700);
  }

  /** Великий рахунок зустрічей перед партією. rows: [{ me, them, name, line }]. Тап — закрити. */
  showIntro(rows, eyebrow = 'Рахунок зустрічей') {
    document.querySelectorAll('.intro').forEach((x) => x.remove());
    if (!rows.length) return;
    const box = document.createElement('div');
    box.className = 'intro';
    box.innerHTML = `<div class="box"><div class="eyebrow">${esc(eyebrow)}</div>${rows.map((r) => `<div class="row"><div class="big">${r.me}<span class="sep">:</span>${r.them}</div><div class="who"><span>Ти</span><span>${esc(r.name)}</span></div>${r.line ? `<div class="line">${esc(r.line)}</div>` : ''}</div>`).join('')}<div class="line">торкнись, щоб грати</div></div>`;
    const close = () => box.remove();
    box.addEventListener('click', close);
    document.getElementById('scr-game').append(box);
    setTimeout(close, reducedMotion() ? 2500 : 3800);
  }

  /** Головний метод: отримати новий стан. opts: { conceal, coach, onCoachSkip } */
  update({ view, meta }, opts = {}) {
    const prev = this.view && this.view.you === view.you ? this.view : null;
    if (!this.st.timers) this.reset();
    this.view = view;
    this.meta = meta;
    this.conceal = !!opts.conceal;
    this.coach = opts.coach || null;
    this.onCoachSkip = opts.onCoachSkip || null;
    this.pending = false;
    if (!view.legal.some((a) => a.type === 'play' && a.cardId === this.selected)) this.selected = null;
    if (this.isCombo(view)) {
      if (view.phase !== 'play' || view.me.played) { this.picks = []; this.openPick = null; this.openManual = false; }
      else { this.picks = this.picks.filter((id) => view.me.hand.some((c) => c.id === id)); this.fixOpenPick(); }
    }
    document.getElementById('scr-game').classList.toggle('combo', this.isCombo(view));

    const t = view.timer;
    this.timer = t ? { deadline: performance.now() + t.remaining, duration: t.duration, paused: t.paused, remaining: t.remaining } : null;
    this.logNames = Array.from({ length: view.n || 2 }, (_, p) => this.nameOf(p, view));
    const three = this.isThree(view);
    document.getElementById('scr-game').classList.toggle('three', three);
    this.panels[1].root.classList.toggle('hidden', !three);
    this.panels[1].seatEl.classList.toggle('hidden', !three);
    this.oppSeats(view).forEach((q, i) => {
      const pn = this.panels[i];
      const nm = this.nameOf(q, view);
      if (pn.name.textContent !== nm) pn.name.textContent = nm;
      setGlyph(pn.initial, nm, 'С');
    });

    this.renderNumbers(prev, view);
    this.renderFeel(prev, view);
    this.renderPhase(view, prev);
    this.renderPlayers(view);
    this.renderTable(prev, view);
    this.renderHand(prev, view);
    this.renderActions();
    if (view.phase !== 'result') { clearTimeout(this.st.timers.verdict); this.hideVerdict(); }
    else this.renderVerdict(prev, view);
    this.renderDon(prev, view);
    this.renderCoach();
    if (prev && this.myTurn(view) && !this.myTurn(prev) && view.phase !== 'result') sfx.turn();
  }

  // ───────── відчуття гри: гарячий раунд, пауза-напруга, штампи ─────────
  /** Записи журналу поточного раунду. */
  roundLog(v) {
    const out = [];
    for (let i = v.log.length - 1; i >= 0; i--) { if (v.log[i].t === 'round') break; out.push(v.log[i]); }
    return out;
  }

  isHot(v) {
    if (!v || v.phase === 'over') return false;
    const total = (v.players || []).reduce((a, x) => a + x.chips, 0) + v.pot;
    return v.pot >= Math.max(FEEL.hotPot, total * FEEL.hotShare) || this.roundLog(v).some((e) => e.t === 'raise' && e.allin);
  }

  renderFeel(prev, v) {
    const scr = document.getElementById('scr-game');
    const hot = this.isHot(v);
    const wasHot = scr.classList.contains('hot');
    scr.classList.toggle('hot', hot);
    if (hot && !wasHot && prev) {
      sfx.bigPot();
      if (!reducedMotion()) {
        const t = this.el.table;
        t.classList.remove('quake'); void t.offsetWidth; t.classList.add('quake');
        clearTimeout(this.st.timers.quake);
        this.st.timers.quake = setTimeout(() => t.classList.remove('quake'), 700);
      }
    }
    // Пауза-напруга перед розкриттям у важливому раунді (не в режимі зменшеного руху)
    const reveal = prev && prev.phase !== 'result' && v.phase === 'result' && v.result?.revealed && (hot || wasHot);
    if (reveal && !reducedMotion()) {
      this.st.tense = true;
      this.st.pendingFlips = [];
      this.el.table.classList.add('tense');
      sfx.drumroll(FEEL.tensionMs / 1000);
      clearTimeout(this.st.timers.tense);
      this.st.timers.tense = setTimeout(() => this.endTense(false), FEEL.tensionMs);
    }
    // «Тебе розвели!»: переможець показав слабку карту, на яку я спасував
    if (prev && v.phase === 'result' && v.result?.reason === 'fold' && v.result.winner !== v.you) {
      const q = v.result.winner;
      const now = this.seat(v, q), before = this.seat(prev, q);
      if (now?.shown && !before?.shown && this.weak(now.played, FEEL.bluffCard)) this.stamp('Тебе розвели! 🤡', 'lose');
    }
  }

  /** Слабка карта: число до n включно або Ніж. Комбінації: набір — лише «Старша карта». */
  weak(c, n) {
    if (Array.isArray(c)) return c.length > 0 && comboOf(c, this.view?.trump).id === 'high';
    return !!c && ((c.kind === 'num' && c.value <= n) || c.kind === 'knife');
  }

  flipFace(c, withSound) {
    const go = () => { c.classList.remove('back-up'); if (withSound) sfx.flip(); };
    if (this.st.tense) { this.st.pendingFlips.push(go); return; }
    requestAnimationFrame(() => requestAnimationFrame(go));
  }

  endTense(skipped) {
    if (!this.st.tense) return;
    this.st.tense = false;
    clearTimeout(this.st.timers.tense);
    this.el.table.classList.remove('tense');
    for (const f of this.st.pendingFlips || []) f();
    this.st.pendingFlips = [];
    if (skipped && this.st.showVerdict) {
      clearTimeout(this.st.timers.verdict);
      this.st.timers.verdict = setTimeout(() => this.st.showVerdict?.(), ms('--t-flip'));
    }
  }

  /** Великий штамп поверх столу. Тап — прибрати. */
  stamp(text, kind = 'win') {
    document.querySelectorAll('.stamp').forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = `stamp ${kind}`;
    el.textContent = text;
    el.addEventListener('click', () => el.remove());
    this.el.table.append(el);
    sfx.stamp();
    clearTimeout(this.st.timers.stamp);
    this.st.timers.stamp = setTimeout(() => el.remove(), 2000);
  }

  myTurn(v) {
    return v.legal.length > 0 && !(v.phase === 'result' && v.me.ready);
  }

  // ───────── банер фази ─────────
  /** Імена тих суперників (не вибулих і не на пасі), для кого pred істинне. */
  waitingNames(v, pred) {
    return this.oppSeats(v).filter((q) => { const x = this.seat(v, q); return !x.out && !x.folded && pred(x); }).map((q) => this.nameOf(q)).join(', ');
  }

  renderPhase(v, prev) {
    const three = this.isThree(v);
    let kind = 'wait';
    let title = '';
    let sub = '';
    const r = v.result;
    switch (v.phase) {
      case 'play':
        if (this.isCombo(v)) {
          if (v.legal.some((a) => a.type === 'playOpen')) { kind = 'act'; title = 'Обери відкриту карту 👁'; sub = 'Її побачать усі. Потім — 2 закриті'; }
          else if (v.legal.some((a) => a.type === 'playClosed')) { kind = 'act'; title = 'Обери 2 закриті карти'; sub = 'Відкриті карти суперників уже на столі'; }
          else if (v.step === 'open' && v.me.openPick) { const w = three ? this.waitingNames(v, (x) => !x.hasOpen) : 'суперник'; title = 'Відкриту покладено'; sub = w ? `Обирає відкриту: ${w}` : ''; }
          else if (!v.me.played && !v.me.out) { kind = 'act'; title = 'Обери 3 карти'; sub = 'Одна з них — відкрита 👁, її побачать усі'; }
          else { const w = three ? this.waitingNames(v, (x) => !x.hasPlayed) : (v.opp.hasPlayed ? '' : 'Суперник'); title = w ? `Обирають карти: ${w}` : 'Карти на столі'; sub = v.me.out ? '' : 'Твої карти покладено'; }
          break;
        }
        if (!v.me.played && !v.me.out) { kind = 'act'; title = 'Обери карту'; sub = v.trump ? `Козир — ${SUIT[v.trump].name}: +${v.cfg.trumpBonus} до сили` : 'Вона ляже сорочкою догори'; }
        else if (three) { const w = this.waitingNames(v, (x) => !x.hasPlayed); title = w ? `Обирають карту: ${w}` : 'Карти на столі'; sub = v.me.out ? '' : 'Твою карту покладено'; }
        else { title = v.opp.hasPlayed ? 'Карти на столі' : 'Суперник обирає карту'; sub = 'Твою карту покладено'; }
        break;
      case 'scout':
        if (this.isCombo(v)) {
          const sc = v.me.scoutSeen ? SCOUT_COMBO[v.me.scoutSeen].name : '';
          if (!v.me.scoutDecided && !v.me.out) { kind = 'act'; title = 'Відкриті карти на столі'; sub = three ? `Розвідка (${v.cfg.scoutCost}): торкнись суперника` : `Розвідка за ${v.cfg.scoutCost}: чи є 8+ серед закритих`; }
          else { const w = three ? this.waitingNames(v, (x) => !x.scoutDecided) : ''; title = w ? `Розвідка: чекаємо ${w}` : three ? 'Розвідку завершено' : 'Суперник думає'; sub = sc ? `${three ? `У ${this.nameOf(v.me.scoutTarget)}` : 'У суперника'}: ${sc}` : ''; }
          break;
        }
        if (!v.me.scoutDecided && !v.me.out) { kind = 'act'; title = 'Розвідка?'; sub = three ? `Торкнись суперника, до якого підглянути — за ${v.cfg.scoutCost}` : `Висока чи низька в суперника — за ${v.cfg.scoutCost}`; }
        else if (three) { const w = this.waitingNames(v, (x) => !x.scoutDecided); title = w ? `Вирішують щодо розвідки: ${w}` : 'Розвідку завершено'; sub = v.me.scoutSeen ? `У ${this.nameOf(v.me.scoutTarget)} ${SCOUT[v.me.scoutSeen].name} карта` : ''; }
        else { title = 'Суперник вирішує щодо розвідки'; sub = v.me.scoutSeen ? `У суперника ${SCOUT[v.me.scoutSeen].name} карта` : ''; }
        break;
      case 'bet': {
        const owe = v.bet.owe ?? v.bet.toCall;
        if (v.bet.toAct === v.you) {
          kind = 'act'; title = 'Твій хід';
          const last = this.lastOppAction(v);
          sub = three ? (owe ? `Щоб лишитися — докласти ${owe}` : 'Чек, підняти чи пас (пас — вихід із раунду)')
            : v.bet.toCall ? `Суперник підняв на ${v.bet.toCall}` : last === 'check' ? 'Суперник: чек' : 'Чек, підняти чи пас';
        } else if (three) {
          title = `Хід: ${this.nameOf(v.bet.toAct)}`;
          sub = v.me.folded ? 'Ти спасував(-ла) — дивишся раунд' : owe ? `Тобі ще докласти ${owe}` : 'Думає над ставкою';
        } else {
          title = 'Хід суперника';
          sub = v.bet.toCall ? `Твоє підняття +${v.bet.toCall} — чекаємо відповіді` : 'Суперник думає над ставкою';
        }
        break;
      }
      case 'result': {
        const wn = r.winner === null ? '' : this.nameOf(r.winner);
        if (r.don?.pending) { kind = r.winner === v.you ? 'act' : 'wait'; title = 'Подвій або нічого'; sub = r.winner === v.you ? 'Більше чи менше?' : three ? `${wn} ризикує виграшем` : 'Суперник ризикує виграшем'; }
        else if (v.me.ready || v.me.out) { title = three ? 'Чекаємо на інших' : 'Чекаємо на суперника'; sub = 'Наступний раунд — зараз'; }
        else if (r.winner === null) { kind = 'wait'; title = three && r.reason === 'showdown' ? 'Нічия за перше місце' : 'Нічия'; sub = three && r.reason === 'showdown' ? `Банк ${r.carry} → у джекпот` : `Банк ${r.carry} переходить у наступний раунд`; }
        else if (r.winner === v.you) { kind = 'win'; title = 'Банк твій'; sub = this.explainText(v) || (r.reason === 'fold' ? (three ? 'Усі спасували' : 'Суперник спасував') : ''); }
        else { kind = 'lose'; title = three ? `Банк забирає ${wn}` : 'Банк у суперника'; sub = this.explainText(v) || (r.reason === 'fold' ? (v.me.folded ? 'Ти спасував(-ла)' : 'Усі інші спасували') : ''); }
        break;
      }
      case 'over':
        title = 'Партію завершено';
        break;
    }
    if (this.meta?.paused && v.timer && !this.offline) sub = '⏸ Пауза' + (sub ? ` · ${sub}` : '');
    if (v.me.out && v.phase !== 'over') { kind = 'wait'; sub = title ? `${title}${sub ? ` · ${sub}` : ''}` : sub; title = '💀 Ти вибув — дивишся гру'; }
    if (this.offline) { kind = 'alert'; title = this.offline; sub = 'Таймер на паузі — чекаємо повернення'; }
    const el = this.el.phase;
    const cls = `phase ${kind}`;
    if (el.className.replace(' pop', '') !== cls || this.el.phaseTitle.textContent !== title) {
      el.className = cls;
      if (prev) { void el.offsetWidth; el.classList.add('pop'); }
    }
    this.el.phaseTitle.textContent = title;
    this.el.phaseSub.textContent = sub;
    // кільце таймера — у банері, коли чекають на мене
    this.el.phaseRing.classList.toggle('hidden', !(v.timer && kind === 'act'));
  }

  lastOppAction(v) {
    for (let i = v.log.length - 1; i >= 0; i--) {
      const e = v.log[i];
      if (e.t === 'round') return null;
      if (e.p !== undefined && e.p !== v.you && ['check', 'raise', 'call'].includes(e.t)) return e.t;
    }
    return null;
  }

  // ───────── гравці ─────────
  renderPlayers(v) {
    const three = this.isThree(v);
    const conn = this.meta?.connected;
    this.oppSeats(v).forEach((q, i) => {
      const pn = this.panels[i];
      const o = this.seat(v, q);
      const offline = (!three && this.offline) || (conn ? conn[q] === false : (this.meta && !this.meta.oppConnected)) || (three && this.offline && false);
      const parts = [];
      if (o.out) parts.push('<span>💀 вибув</span>');
      else if (offline) parts.push(`<span class="warn">${ico('wifi-off')}офлайн</span>`);
      else if (this.meta?.away?.[q]) parts.push('<span class="warn">💤 згорнув</span>');
      else {
        // значки без тексту, щоб статус уміщався: 👁 — підглядав, ⇄ — міняв карту
        if (o.scouted && v.phase !== 'result') parts.push(`<span class="ic" title="Зробив розвідку${three && o.scoutTarget !== undefined ? `: ${this.nameOf(o.scoutTarget)}` : ''}" aria-label="розвідка">${ico('eye')}${three && o.scoutTarget === v.you ? '→ти' : ''}</span>`);
        if (o.swapped && v.phase === 'play') parts.push(`<span class="ic" title="Обміняв карту" aria-label="обмін">${ico('swap')}</span>`);
        let s = '';
        switch (v.phase) {
          // коротко, щоб ніколи не обрізалось: значок + 1 слово
          case 'play': s = (v.step === 'open' ? o.hasOpen : o.hasPlayed) ? '✓ готово' : '⏳ обирає'; break;
          case 'scout': s = o.scoutDecided ? '' : '⏳ думає'; break;
          case 'bet':
            if (o.folded) s = '✋ пас';
            else if (three) s = v.bet.toAct === q ? '⏳ ставка' : '';
            else s = v.bet.toAct !== v.you ? '⏳ ставка' : (v.bet.toCall ? `↑ +${v.bet.toCall}` : '');
            break;
          case 'result': s = o.folded && three ? '✋ пас' : v.result.don?.pending && v.result.winner === q ? '🎲 ризикує' : o.ready ? '✓ далі' : ''; break;
        }
        if (s) parts.push(`<span>${s}</span>`);
        if (o.jokerInHand) parts.unshift('<span class="jk-badge" title="Джокер ще не зіграно">🃏</span>');
      }
      pn.status.innerHTML = parts.join('');
      pn.ava.classList.toggle('offline', !!offline);
      pn.root.classList.toggle('out', !!o.out);
      pn.root.classList.toggle('acting', three && v.phase === 'bet' && v.bet.toAct === q);
      pn.root.classList.toggle('pick', v.phase === 'scout' && v.legal.some((a) => a.type === 'scout' && a.target === q));
      pn.seatEl.classList.toggle('folded', !!o.folded);
      const n = o.handCount;
      if (pn.hand.childElementCount !== n) pn.hand.innerHTML = '<i></i>'.repeat(n);
      pn.hand.setAttribute('aria-label', `Карт у суперника: ${n}`);
    });

    const m = [];
    if (v.me.out) m.push('<span>💀 вибув · реакції працюють</span>');
    if (v.me.scoutSeen && v.phase !== 'result') m.push(`<span class="gold">${ico('eye')}${three ? `${esc(this.nameOf(v.me.scoutTarget))}: ` : 'розвідка: '}${(this.isCombo(v) ? SCOUT_COMBO : SCOUT)[v.me.scoutSeen].name}</span>`);
    if (v.me.swapped && v.phase === 'play') m.push(`<span>${ico('swap')}обмін ✓</span>`);
    if (v.me.hand.some((c) => c.kind === 'joker')) m.unshift('<span class="jk-badge" title="Твій джокер ще не зіграно">🃏 джокер</span>');
    this.el.meStatus.innerHTML = m.join('<span>·</span>');
    this.el.me = this.el.me || document.getElementById('me');
    this.el.me.classList.toggle('out', !!v.me.out);
  }

  // ───────── числа і фішки ─────────
  renderNumbers(prev, v) {
    const e = this.el;
    const opps = this.oppSeats(v).map((q, i) => ({ q, pn: this.panels[i] }));
    if (!prev || prev.you !== v.you || (prev.n || 2) !== (v.n || 2)) {
      setNumber(e.meChips, v.me.chips);
      for (const { q, pn } of opps) setNumber(pn.chips, this.seat(v, q).chips);
      setNumber(e.potVal, v.pot);
      return;
    }
    const dMe = v.me.chips - prev.me.chips;
    const dOpp = opps.map(({ q }) => this.seat(v, q).chips - this.seat(prev, q).chips);
    const dPot = v.pot - prev.pot;
    const n = (x) => Math.ceil(Math.abs(x) / 5);
    if (dPot > 0) {
      if (dMe < 0) flyChips(e.fx, e.hudMe, e.pot, n(dMe));
      opps.forEach(({ pn }, i) => { if (dOpp[i] < 0) flyChips(e.fx, pn.hud, e.pot, n(dOpp[i])); });
      sfx.chip(n(dPot));
    } else if (dPot < 0) {
      if (dMe > 0) flyChips(e.fx, e.pot, e.hudMe, n(dPot));
      opps.forEach(({ pn }, i) => { if (dOpp[i] > 0) flyChips(e.fx, e.pot, pn.hud, n(dPot)); });
      sfx.chips(n(dPot));
    } else if (dMe && dOpp.some(Boolean)) {
      const i = dOpp.findIndex(Boolean);
      if (dMe > 0) flyChips(e.fx, opps[i].pn.hud, e.hudMe, n(dMe));
      else flyChips(e.fx, e.hudMe, opps[i].pn.hud, n(dMe));
      sfx.chips(n(dMe));
    }
    if (dMe) floatText(e.fx, e.hudMe, `${dMe > 0 ? '+' : ''}${dMe}`, dMe > 0 ? 'var(--win)' : 'var(--lose)');
    opps.forEach(({ pn }, i) => { if (dOpp[i]) floatText(e.fx, pn.hud, `${dOpp[i] > 0 ? '+' : ''}${dOpp[i]}`, dOpp[i] > 0 ? 'var(--win)' : 'var(--lose)'); });
    animateNumber(e.meChips, v.me.chips, ms('--t-count'));
    opps.forEach(({ q, pn }) => animateNumber(pn.chips, this.seat(v, q).chips, ms('--t-count')));
    if (dPot) {
      animateNumber(e.potVal, v.pot, ms('--t-count'));
      e.pot.classList.remove('bump');
      void e.pot.offsetWidth;
      e.pot.classList.add('bump');
    }
  }

  // ───────── стіл ─────────
  renderTable(prev, v) {
    const e = this.el;
    const md = v.cfg.mode && v.cfg.mode !== 'classic' ? MODES[v.cfg.mode] : null;
    e.roundTag.textContent = `${md ? `${md.icon} ` : ''}Раунд ${v.round}/${v.maxRounds}`;
    e.cheat?.classList.toggle('hidden', !this.isCombo(v));
    e.roundTag.title = md ? `${md.name}: ${md.desc}` : '';
    if (v.trump) {
      e.trump.innerHTML = `Козир ${suitIcon(v.trump)}<b>${SUIT[v.trump].name}</b>`;
      e.trump.title = this.isCombo(v) ? 'Козир вирішує нічиї: козирна карта на 1 старша' : `Козирна карта +${v.cfg.trumpBonus} до сили`;
      e.trump.dataset.suit = v.trump;
      e.trump.classList.remove('hidden');
      if (prev && prev.round !== v.round) { e.trump.classList.remove('pop'); void e.trump.offsetWidth; e.trump.classList.add('pop'); }
    } else e.trump.classList.add('hidden');
    const d = v.deck;
    // склад колоди — не на столі, а за тапом (кнопка «ⓘ» біля раунду)
    this.deckText = `Раунд ${v.round} з ${v.maxRounds} · анте ${v.ante}. У колоді ${d.total} карт: високих (8+) ${d.high}, низьких ${d.low}, спецкарт ${d.special}.`;
    e.deckInfo.textContent = '';
    // банк і джекпот
    const jp = v.jackpot && v.pot ? v.jackpot : 0;
    const carry = !jp && v.carry && v.round > 1 && v.phase !== 'result' ? v.carry : 0;
    e.jackpot.textContent = jp ? `джекпот ${jp}` : carry ? `з минулого ${carry}` : '';
    e.jackpot.classList.toggle('hidden', !jp && !carry);
    this.renderSlots(prev, v);
    if (this.isThree(v)) { this.renderPills3(v); return; }
    // під картами: що на кону
    const facing = v.phase === 'bet' && v.bet.toCall > 0;
    const oppHot = facing && v.bet.toAct === v.you;
    const meHot = facing && v.bet.toAct !== v.you;
    const pill = (amt, hot, label) => `<span class="pill ${hot ? 'hot' : ''}">${chipIco()}${hot ? `+${v.bet.toCall}` : `${label}${amt}`}</span>`;
    // «у банку N» не показуємо — лише те, що треба для рішення: скільки докласти
    e.infoOpp.innerHTML = oppHot ? pill(0, true) : '';
    e.infoMe.innerHTML = meHot ? pill(0, true) : '';
    if (v.phase === 'result' && v.result.winner !== null && !v.result.don?.pending) {
      const won = v.result.don ? v.result.won + v.result.don.attempts.reduce((s, a) => s + a.delta, 0) : v.result.won;
      const target = v.result.winner === v.you ? e.infoMe : e.infoOpp;
      target.innerHTML = `<span class="pill win">+${won}</span>`;
    }
  }

  /** Утрьох під кожною картою — внесок у банк; під моєю — скільки докласти; після раунду — виграш. */
  renderPills3(v) {
    const e = this.el;
    const showPot = ['scout', 'bet'].includes(v.phase);
    const pill = (txt, cls = '') => `<span class="pill ${cls}">${chipIco()}${txt}</span>`;
    const owe = v.phase === 'bet' ? v.bet.owe ?? 0 : 0;
    e.infoMe.innerHTML = owe > 0 && !v.me.folded ? pill(`+${owe}`, 'hot') : '';
    this.oppSeats(v).forEach((q, i) => {
      const x = this.seat(v, q);
      this.panels[i].info.innerHTML = x.out ? '' : x.folded && showPot ? '<span class="pill">✋ пас</span>' : '';
    });
    if (v.phase === 'result' && v.result.winner !== null && !v.result.don?.pending) {
      const won = v.result.don ? v.result.won + v.result.don.attempts.reduce((s, a) => s + a.delta, 0) : v.result.won;
      const w = v.result.winner;
      const target = w === v.you ? e.infoMe : this.panels[this.oppSeats(v).indexOf(w)]?.info;
      if (target) target.innerHTML = `<span class="pill win">+${won}</span>`;
    }
  }

  renderSlots(prev, v) {
    if (this.isCombo(v)) return this.renderSets(prev, v);
    if (this.isThree(v)) return this.renderSlots3(prev, v);
    const st = this.st;
    const opt = { trump: v.trump, bonus: v.cfg.trumpBonus };
    // Суперник
    const oppKey = v.opp.played ? v.opp.played.id : v.opp.hasPlayed ? 'back' : null;
    if (oppKey !== st.opp) {
      const slot = this.el.slotOpp;
      if (!oppKey) slot.innerHTML = '';
      else if (oppKey === 'back') {
        slot.innerHTML = '';
        const c = cardEl(null);
        c.classList.add('drop');
        c.style.setProperty('--from', '-120px');
        slot.append(c);
        if (prev) sfx.place();
      } else {
        let c = slot.querySelector('.card');
        if (!c) { c = cardEl(null); slot.innerHTML = ''; slot.append(c); }
        fillFace(c, v.opp.played, opt);
        this.flipFace(c, !!prev);
      }
      st.opp = oppKey;
    }
    // Я
    const meKey = v.me.played ? v.me.played.id : null;
    if (meKey !== st.me) {
      const slot = this.el.slotMe;
      slot.innerHTML = '';
      if (meKey) {
        const c = cardEl(v.me.played, opt);
        c.classList.add('drop');
        slot.append(c);
      }
      st.me = meKey;
    }
    // Мітки на картах: розвідка, «закрита», переможець
    this.tagSlot(this.el.slotOpp, v.me.scoutSeen && v.phase !== 'result' ? `<span class="pill ${v.me.scoutSeen === 'high' ? 'hi' : 'lo'}">${v.me.scoutSeen === 'high' ? '↑' : '↓'} ${SCOUT[v.me.scoutSeen].name}</span>` : '');
    const hidden = v.me.played && !(v.result && (v.result.revealed || v.me.shown));
    this.tagSlot(this.el.slotMe, hidden ? `<span class="pill">${ico(v.opp.scouted ? 'eye' : 'lock')}${v.opp.scouted ? 'підглянуто' : 'закрита'}</span>` : '');
    const oc = this.el.slotOpp.querySelector('.card');
    const mc = this.el.slotMe.querySelector('.card');
    for (const c of [oc, mc]) c?.classList.remove('win', 'lose');
    const r = v.result;
    if (r && r.winner !== null && v.phase === 'result') {
      const meWon = r.winner === v.you;
      (meWon ? mc : oc)?.classList.add('win');
      if (r.revealed) (meWon ? oc : mc)?.classList.add('lose');
    }
  }

  /** Слот суперника: сорочка → лице при розкритті. */
  fillOppSlot(prev, v, slot, key, played, st) {
    if (key === st) return;
    const opt = { trump: v.trump, bonus: v.cfg.trumpBonus };
    if (!key) slot.innerHTML = '';
    else if (key === 'back') {
      slot.innerHTML = '';
      const c = cardEl(null);
      c.classList.add('drop');
      c.style.setProperty('--from', '-120px');
      slot.append(c);
      if (prev) sfx.place();
    } else {
      let c = slot.querySelector('.card');
      if (!c) { c = cardEl(null); slot.innerHTML = ''; slot.append(c); }
      fillFace(c, played, opt);
      this.flipFace(c, !!prev);
    }
  }

  renderSlots3(prev, v) {
    const st = this.st;
    const opt = { trump: v.trump, bonus: v.cfg.trumpBonus };
    this.oppSeats(v).forEach((q, i) => {
      const x = this.seat(v, q);
      const key = x.played ? x.played.id : x.hasPlayed ? 'back' : null;
      this.fillOppSlot(prev, v, this.panels[i].slot, key, x.played, st.slots[q]);
      st.slots[q] = key;
      const seen = v.me.scoutSeen && v.me.scoutTarget === q && v.phase !== 'result';
      this.tagSlot(this.panels[i].slot, seen ? `<span class="pill ${v.me.scoutSeen === 'high' ? 'hi' : 'lo'}">${v.me.scoutSeen === 'high' ? '↑' : '↓'} ${SCOUT[v.me.scoutSeen].name}</span>` : '');
    });
    const meKey = v.me.played ? v.me.played.id : null;
    if (meKey !== st.me) {
      const slot = this.el.slotMe;
      slot.innerHTML = '';
      if (meKey) { const c = cardEl(v.me.played, opt); c.classList.add('drop'); slot.append(c); }
      st.me = meKey;
    }
    const peeked = v.players.some((x) => x.seat !== v.you && x.scouted && x.scoutTarget === v.you);
    const hidden = v.me.played && !(v.result && ((v.result.revealed && !v.me.folded) || v.me.shown));
    this.tagSlot(this.el.slotMe, hidden ? `<span class="pill">${ico(peeked ? 'eye' : 'lock')}${peeked ? 'підглянуто' : 'закрита'}</span>` : '');
    this.el.slotMe.parentElement.classList.toggle('folded', !!v.me.folded);
    const cardOf = (q) => (q === v.you ? this.el.slotMe : this.panels[this.oppSeats(v).indexOf(q)].slot).querySelector('.card');
    for (let q = 0; q < v.n; q++) cardOf(q)?.classList.remove('win', 'lose');
    const r = v.result;
    if (r && r.winner !== null && v.phase === 'result') {
      cardOf(r.winner)?.classList.add('win');
      if (r.revealed) for (const q of r.parts || []) if (q !== r.winner) cardOf(q)?.classList.add('lose');
    }
  }

  // ───────── комбінації: набори з 3 карт на столі ─────────
  /** Що показати на місці q: [{ card | null (сорочка), open }], відкрита — першою. */
  setItems(v, q) {
    const mine = q === v.you;
    const x = mine ? null : this.seat(v, q);
    const played = mine ? v.me.played : x.played;
    const openId = mine ? v.me.openId : x.open?.id;
    if (played) {
      const list = arr(played);
      const o = list.find((c) => c.id === openId);
      return [...(o ? [o] : []), ...list.filter((c) => c !== o)].map((c) => ({ card: c, open: c.id === openId }));
    }
    // покроково: моя відкрита вже лежить, а закриті ще ні
    if (mine) return v.me.openPick ? [{ card: v.me.openPick, open: true }] : [];
    if (!x.hasPlayed && !x.hasOpen) return [];
    const n = v.cfg.playCount || 3;
    const backs = x.hasPlayed ? n - 1 : 0;
    return [{ card: x.open || null, open: !!x.open }, ...Array.from({ length: backs }, () => ({ card: null, open: false }))];
  }

  slotOfSeat(v, q) {
    if (q === v.you) return this.el.slotMe;
    return this.isThree(v) ? this.panels[this.oppSeats(v).indexOf(q)].slot : this.el.slotOpp;
  }

  renderSets(prev, v) {
    const st = this.st;
    const opt = { trump: v.trump, bonus: v.cfg.trumpBonus };
    const r = v.result;
    const seatsAll = [v.you, ...this.oppSeats(v)];
    // карти, яких точно немає в закритих суперника (для «Може бути»)
    const seen = new Set([...v.me.hand, ...arr(v.me.played)].map((c) => c.id));
    for (const q of this.oppSeats(v)) { const o = this.seat(v, q).open; if (o) seen.add(o.id); }
    for (const q of seatsAll) {
      const slot = this.slotOfSeat(v, q);
      if (!slot) continue;
      slot.classList.add('set');
      const items = this.setItems(v, q);
      const key = items.map((it) => (it.card ? `${it.card.id}${it.open ? '*' : ''}` : 'b')).join(',');
      const prevKey = st.slots[`set${q}`];
      if (key !== prevKey) {
        const was = (prevKey || '').split(',');
        let row = slot.querySelector('.set-row');
        if (!row) { slot.innerHTML = ''; row = document.createElement('div'); row.className = 'set-row'; slot.append(row); }
        row.innerHTML = '';
        items.forEach((it, i) => {
          let c;
          if (!it.card) c = cardEl(null);
          else if (q !== v.you && was[i] === 'b') { c = cardEl(it.card, { ...opt, faceDown: true }); this.flipFace(c, !!prev); }
          else c = cardEl(it.card, opt);
          if (!prevKey) { c.classList.add('drop'); if (q !== v.you) c.style.setProperty('--from', '-120px'); }
          c.classList.toggle('open', it.open);
          if (it.open) { const e = document.createElement('span'); e.className = 'open-eye'; e.innerHTML = ico('eye'); e.setAttribute('aria-label', 'відкрита'); c.append(e); }
          row.append(c);
        });
        if (!prevKey && items.length && prev) sfx.place();
        st.slots[`set${q}`] = key;
      }
      this.tagSlot(slot, this.setTag(v, q, seen));
      const cards = [...slot.querySelectorAll('.set-row .card')];
      for (const c of cards) c.classList.remove('win', 'lose');
      if (r && r.winner !== null && v.phase === 'result' && items.length) {
        if (q === r.winner) cards.forEach((c) => c.classList.add('win'));
        else if (r.revealed && (r.parts || []).includes(q)) cards.forEach((c) => c.classList.add('lose'));
      }
    }
    if (this.isThree(v)) this.el.slotMe.parentElement.classList.toggle('folded', !!v.me.folded);
  }

  /** Підпис під набором: моя комбінація / «Може бути: …» / результат розкриття. */
  setTag(v, q, seen) {
    const r = v.result;
    const three = this.isThree(v);
    const d = r?.detail?.combos;
    if (v.phase === 'result' && d && d[q]) {
      const win = r.winner === q;
      return `<span class="combo-tag ${win ? 'win' : r.winner === null ? '' : 'lose'}">${win ? '🏆 ' : ''}${esc(d[q].label)}</span>`;
    }
    if (q === v.you) {
      const played = arr(v.me.played);
      if (!played.length) return v.me.openPick ? '<span class="combo-tag mine">👁 відкрита</span>' : '';
      const c = comboOf(played, v.trump, v.me.hand);
      const peeked = three ? v.players.some((x) => x.seat !== v.you && x.scouted && x.scoutTarget === v.you) : v.opp.scouted;
      return `<span class="combo-tag mine">${esc(c.label)}${peeked && v.phase !== 'result' ? ` · ${ico('eye')}` : ''}</span>`;
    }
    const x = this.seat(v, q);
    if (!(x.hasPlayed || x.hasOpen) || x.folded) return x.folded && x.hasPlayed ? '<span class="combo-tag">пас</span>' : '';
    const sc = v.me.scoutSeen && (three ? v.me.scoutTarget === q : true) && v.phase !== 'result' ? v.me.scoutSeen : null;
    const scTxt = sc ? `<span class="pill ${sc === 'high' ? 'hi' : 'lo'}">${SCOUT_COMBO[sc].short}</span>` : '';
    if (!x.open) return scTxt ? `<span class="combo-tag">${scTxt}</span>` : '';
    if (x.open.kind === 'joker') return `<span class="combo-tag maybe">Джокер «${esc(JOKER_BY_ID[x.open.joker].name)}»${scTxt}</span>`;
    const pos = possibleCombos(x.open, seen, v.trump, sc, v.cfg.scoutHighFrom || 8).slice(0, three ? 1 : 3);
    return `<span class="combo-tag maybe">${pos.length ? `Може бути: ${esc(pos.join(' · '))}` : 'Лише старша карта'}${scTxt}</span>`;
  }

  tagSlot(slot, html) {
    let t = slot.querySelector('.slot-tag');
    if (!html) { t?.remove(); return; }
    if (!t) { t = document.createElement('div'); t.className = 'slot-tag'; slot.append(t); }
    t.innerHTML = html;
  }

  // ───────── рука ─────────
  renderHand(prev, v) {
    const hand = this.el.hand;
    const existing = new Map([...hand.children].map((c) => [c.dataset.id, c]));
    const ids = v.me.hand.map((c) => c.id);
    for (const [id, el] of existing) if (!ids.includes(id)) el.remove();
    let dealt = 0;
    const opt = { trump: v.trump, bonus: v.cfg.trumpBonus, showBoost: true, small: true };
    v.me.hand.forEach((card, i) => {
      let el = existing.get(card.id);
      if (!el) {
        el = cardEl(card, opt);
        el.classList.add('deal');
        el.style.animationDelay = `${dealt * 70}ms`;
        if (prev || dealt < 4) sfx.deal(dealt);
        dealt++;
        const done = (e) => { if (e.target !== el) return; el.classList.remove('deal'); el.style.animationDelay = ''; el.removeEventListener('animationend', done); };
        el.addEventListener('animationend', done); // анімації всередині джокера теж спливають — чекаємо саме на роздачу
      } else if (!prev || prev.trump !== v.trump) fillFace(el, card, opt);
      if (hand.children[i] !== el) hand.insertBefore(el, hand.children[i] || null);
    });
    hand.classList.toggle('passive', !v.legal.some((a) => a.type === 'play' || a.type === 'playSet'));
    this.layoutHand();
    hand.classList.toggle('concealed', this.conceal);
    this.renderHandSelection();
  }

  /**
   * Рука — віяло: великі карти з перекриттям, що ЗАВЖДИ вміщаються в ширину екрана (будь-яка кількість карт).
   * Позиція — властивостями left/rotate/translate, а transform лишається для підйому вибраної карти й анімацій.
   */
  layoutHand() {
    const hand = this.el.hand;
    const cards = [...hand.children].filter((c) => c.classList.contains('card'));
    const n = cards.length;
    const full = hand.clientWidth || (window.innerWidth - 32);
    // і за висотою: на невисоких екранах (Safari з панелями) карти менші, щоб стіл і кнопки вмістилися;
    // поза вибором карт (торги, розкриття) рука ще менша — головне тоді стіл
    const byH = (window.innerHeight * 0.17) / 1.42;
    const choosing = !hand.classList.contains('passive');
    const cw = Math.round(Math.min(92, full * 0.25, byH) * (choosing ? 1 : window.innerHeight < 760 ? 0.52 : 0.78));
    hand.style.setProperty('--card-w-hand', `${cw}px`);
    if (!n) return;
    // поля під нахил крайніх карт і підйом вибраної (scale 1.06) — щоб нічого не виходило за екран
    const tiltMax = n > 3 ? Math.min(2.4, 14 / n) : 0;
    const edge = Math.ceil(cw * 0.04 + Math.sin(((n - 1) / 2) * tiltMax * Math.PI / 180) * cw * 1.42 * 0.7) + 2;
    const W = full - edge * 2;
    const step = n > 1 ? Math.min(cw + 8, (W - cw) / (n - 1)) : 0;
    const total = cw + step * (n - 1);
    const x0 = edge + (W - total) / 2;
    const mid = (n - 1) / 2;
    const tilt = step < cw ? tiltMax : 0; // віяло лише коли карти перекриваються
    cards.forEach((c, i) => {
      const d = i - mid;
      c.style.left = `${Math.round(x0 + step * i)}px`;
      c.style.rotate = `${(d * tilt).toFixed(1)}deg`;
      c.style.translate = `0 ${Math.round(d * d * (tilt ? 1.2 : 0))}px`;
      c.style.zIndex = String(i + 1);
    });
  }

  renderHandSelection() {
    if (this.isCombo(this.view)) {
      for (const c of this.el.hand.children) {
        const on = this.picks.includes(c.dataset.id);
        c.classList.toggle('selected', on);
        c.classList.toggle('focus', on && c.dataset.id === this.focusId); // повна анімація скіна — лише тут
        c.classList.toggle('open-pick', on && c.dataset.id === this.openPick);
        let eye = c.querySelector('.eye-tog');
        if (this.view.legal.some((a) => a.type === 'playOpen' || a.type === 'playClosed')) { eye?.remove(); continue; } // покроково 👁 не потрібен
        if (on && !eye) { eye = document.createElement('button'); eye.className = 'eye-tog'; eye.type = 'button'; c.append(eye); }
        if (!on) eye?.remove();
        if (eye) {
          const open = c.dataset.id === this.openPick;
          eye.innerHTML = ico(open ? 'eye' : 'lock');
          eye.setAttribute('aria-label', open ? 'Відкрита карта' : 'Закрита — торкнись, щоб зробити відкритою');
        }
      }
      return;
    }
    for (const c of this.el.hand.children) c.classList.toggle('selected', c.dataset.id === this.selected);
  }

  // ───────── дії ─────────
  renderActions() {
    const v = this.view;
    if (!v) return;
    const L = v.legal;
    const has = (t) => L.find((a) => a.type === t);
    const btn = (label, a, cls = '', enabled = true, sub = '') =>
      `<button class="btn ${cls}" data-a='${JSON.stringify(a)}' ${enabled ? '' : 'disabled'}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
    const waitCard = (title, sub = '') => `<div class="wait-card"><span class="dots"><i></i><i></i><i></i></span><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    const me = v.me;
    let html = '';
    switch (v.phase) {
      case 'play': {
        if (me.out) { html = waitCard('Ти вибув', 'Дивишся гру до кінця · реакції працюють'); break; }
        if (this.isCombo(v)) { html = this.comboActions(v, btn, waitCard); break; }
        if (!has('play')) { html = waitCard('Карту покладено', this.isThree(v) ? 'Чекаємо на інших' : v.opp.hasPlayed ? '' : 'Суперник ще обирає'); break; }
        const sel = this.selected && me.hand.find((c) => c.id === this.selected);
        const canSwap = L.some((a) => a.type === 'swap');
        const swapWhy = sel?.kind === 'joker' ? 'джокера не обміняти' : me.swapped ? 'вже використано цього раунду' : me.chips < v.cfg.swapCost ? 'не вистачає фішок' : !sel ? 'спершу обери карту' : `нова карта замість ${cardTitle(sel)}`;
        html += `<div class="row" style="--n:1">${btn(`${ico('swap', 'ico')} Обмін −${v.cfg.swapCost}`, { type: 'swap', cardId: this.selected }, 'secondary', canSwap && !!sel && sel.kind !== 'joker', swapWhy)}</div>`;
        html += sel
          ? btn(sel.kind === 'joker' ? `Зіграти ${cardTitle(sel)}` : `Покласти ${cardTitle(sel)}`, { type: 'play', cardId: sel.id }, 'primary stack-label', true, sel.kind === 'joker' ? jokerDesc(sel.joker, v.n || 2) : 'сорочкою догори')
          : btn('Покласти карту', { type: 'play' }, 'primary stack-label', false, 'спершу торкнись карти в руці');
        break;
      }
      case 'scout': {
        if (me.out) { html = waitCard('Ти вибув', 'Дивишся гру'); break; }
        if (!L.length) { html = waitCard(this.isThree(v) ? 'Чекаємо на інших' : 'Чекаємо на суперника', this.isThree(v) ? 'Вирішують щодо розвідки' : 'Суперник вирішує щодо розвідки'); break; }
        const canScout = !!has('scout');
        if (this.isThree(v)) {
          // тапом обираєш, до кого підглянути: кнопки з іменами (або тап по панелі суперника)
          const targets = this.oppSeats(v).filter((q) => !this.seat(v, q).out);
          const row = targets.map((q) => {
            const a = L.find((x) => x.type === 'scout' && x.target === q);
            return btn(`${ico('eye', 'ico')} ${esc(this.nameOf(q))}`, { type: 'scout', target: q }, 'secondary', !!a, a ? `−${v.cfg.scoutCost} · висока чи низька?` : 'не вистачає фішок');
          }).join('');
          html += `<div class="row" style="--n:${targets.length}">${row}</div>`;
          html += btn('Далі без розвідки', { type: 'skipScout' }, 'primary');
          break;
        }
        html += `<div class="row" style="--n:1">${btn(`${ico('eye', 'ico')} Розвідка −${v.cfg.scoutCost}`, { type: 'scout' }, 'secondary', canScout, canScout ? `лишиться ${me.chips - v.cfg.scoutCost} · висока чи низька?` : 'не вистачає фішок')}</div>`;
        html += btn('Далі без розвідки', { type: 'skipScout' }, 'primary');
        break;
      }
      case 'bet': {
        if (me.out) { html = waitCard('Ти вибув', 'Дивишся гру'); break; }
        if (this.isThree(v) && !L.length) { html = waitCard(me.folded ? 'Ти на пасі' : `Хід: ${esc(this.nameOf(v.bet.toAct))}`, me.folded ? 'Чекаємо кінця раунду' : 'Чекаємо на ставку'); break; }
        if (!L.length) { html = waitCard('Хід суперника', v.bet.toCall ? `Твоє підняття +${v.bet.toCall}` : 'Суперник думає над ставкою'); break; }
        const call = has('call');
        const toCall = call ? call.amount : 0;
        html += call
          ? btn(`Колл ${call.amount}`, { type: 'call' }, 'primary stack-label', true, `вирівняти й розкрити · лишиться ${me.chips - call.amount}`)
          : btn('Чек', { type: 'check' }, 'primary stack-label', true, 'без ставки');
        const raises = L.filter((a) => a.type === 'raise');
        const limit = v.bet.raises >= v.cfg.maxRaises;
        const rivals = this.oppSeats(v).map((q) => this.seat(v, q)).filter((x) => !x.out && !x.folded);
        const minOpp = Math.min(...rivals.map((x) => x.chips));
        const reason = limit ? 'ліміт' : minOpp === 0 ? 'у суперника 0' : me.chips - toCall <= 0 ? 'нема фішок' : 'недоступно';
        const verb = '';
        let row = '';
        for (const size of v.cfg.raiseSizes) {
          const a = raises.find((x) => x.amount === size);
          row += btn(`${verb}+${size}`, { type: 'raise', amount: size }, 'secondary', !!a, a ? `лишиться ${me.chips - toCall - size}` : reason);
        }
        const allin = raises.find((x) => x.amount === 'allin');
        const capped = allin && allin.value < me.chips - toCall;
        const capWhy = allin && v.round < (v.cfg.allinFreeFromRound || 4) && allin.value < Math.min(me.chips - toCall, minOpp) ? 'ліміт = банк' : 'ліміт = найменший стек';
        row += btn(allin ? `Ва-банк +${allin.value}` : 'Ва-банк', { type: 'raise', amount: 'allin' }, 'allin', !!allin, allin ? (capped ? (capWhy === 'ліміт = банк' ? 'ліміт: банк' : 'ліміт: стек') : `лишиться ${me.chips - toCall - allin.value}`) : reason);
        // пас — у тому ж ряду: компактно, щоб на невисоких екранах усе вміщалось
        row += btn('Пас', { type: 'fold' }, 'secondary fold', true, this.isThree(v) ? 'вийти' : 'віддати банк');
        html += `<div class="row" style="--n:4">${row}</div>`;
        break;
      }
      case 'result': {
        const r = v.result;
        if (r.don?.pending) { html = waitCard(r.winner === v.you ? 'Подвій або нічого' : this.isThree(v) ? `${esc(this.nameOf(r.winner))} ризикує виграшем` : 'Суперник ризикує виграшем', ''); break; }
        if (me.out) { html = waitCard('Ти вибув', 'Дивишся гру'); break; }
        if (!L.length || me.ready) { html = this.isThree(v) ? waitCard('Чекаємо на інших', 'Наступний раунд — щойно всі натиснуть «Далі»') : waitCard('Чекаємо на суперника', 'Наступний раунд — щойно він натисне «Далі»'); break; }
        const sec = [];
        if (has('donStart')) sec.push(btn('🎲 Подвій або нічого', { type: 'donStart' }, 'secondary', true, this.isThree(v) ? `ризикнути ${r.don.stake} · платять обидва` : `ризикнути ${r.don.stake}`));
        if (has('show')) sec.push(btn('Показати карту', { type: 'show' }, 'secondary', true, 'похизуватися'));
        if (sec.length) html += `<div class="row" style="--n:${sec.length}">${sec.join('')}</div>`;
        const iWon = r.winner === v.you;
        const won = iWon && r.don ? r.won + r.don.attempts.reduce((s, a) => s + a.delta, 0) : r.won;
        const last = v.round >= v.maxRounds;
        html += btn(iWon ? `Забрати ${won} ▸` : 'Далі ▸', { type: 'ready' }, 'primary stack-label', true, last ? 'до підсумків партії' : `до раунду ${v.round + 1}`);
        break;
      }
      case 'over':
        html = waitCard('Партію завершено');
        break;
    }
    this.el.actions.innerHTML = html;
    this.applyCoachSpot();
  }

  /** Комбінації: жива назва зі шкалою сили, обмін (1 вибрана карта) і «Покласти 3 карти». */
  comboActions(v, btn, waitCard) {
    const me = v.me, L = v.legal;
    const need = v.cfg.playCount || 3;
    const swapRow = (sel) => {
      const canSwap = !!sel && L.some((a) => a.type === 'swap' && a.cardId === sel.id);
      const why = sel?.kind === 'joker' ? 'джокера не обміняти' : me.swapped ? 'вже використано' : me.chips < v.cfg.swapCost ? 'не вистачає фішок' : !sel ? 'вибери 1 карту' : `нова замість ${cardTitle(sel)}`;
      return `<div class="row" style="--n:1">${btn(`${ico('swap', 'ico')} Обмін −${v.cfg.swapCost}`, { type: 'swap', cardId: sel?.id }, 'secondary', canSwap, why)}</div>`;
    };
    // Крок 1: відкрита карта
    if (L.some((a) => a.type === 'playOpen')) {
      const card = me.hand.find((c) => c.id === this.picks[0]);
      const best = card ? bestWith(card, me.hand, v.trump) : null;
      let html = `<div class="combo-live${card ? '' : ' empty'}"><b>${card ? `👁 ${esc(cardTitle(card))}` : 'Обери відкриту карту'}</b><span class="pc">${best ? `найкраще з нею: ${esc(best.label)}` : 'її побачать усі'}</span></div>`;
      html += swapRow(card || null);
      html += card
        ? btn('Покласти відкриту 👁', { type: 'playOpen', cardId: card.id }, 'primary stack-label', true, card.kind === 'joker' ? jkLine(card.joker, v.n || 2) : 'далі — 2 закриті, бачачи відкриті суперників')
        : btn('Покласти відкриту 👁', { type: 'playOpen' }, 'primary stack-label', false, 'торкнись карти в руці');
      return html;
    }
    // Крок 2: дві закриті до вже покладеної відкритої
    if (L.some((a) => a.type === 'playClosed')) {
      const k = L.find((a) => a.type === 'playClosed').count;
      const cards = this.picks.map((id) => me.hand.find((c) => c.id === id)).filter(Boolean);
      const live = liveCombo([me.openPick, ...cards], v.trump, me.hand);
      const left = k - cards.length;
      const meter = cards.length === k && live?.strength != null
        ? `<span class="meter" title="Яку частку типових комбінацій суперника б'є"><i style="width:${Math.round(live.strength * 100)}%"></i></span><span class="pc">сила ${pct(live.strength)}</span>`
        : `<span class="pc">ще ${left} ${left === 1 ? 'карта' : 'карти'}</span>`;
      let html = `<div class="combo-live"><b>${esc(live?.combo.label || '')}</b>${meter}</div>`;
      html += swapRow(cards.length === 1 ? cards[0] : null);
      const jk = cards.find((c) => c.kind === 'joker');
      html += cards.length === k
        ? btn(`Покласти ${k} закриті`, { type: 'playClosed', cards: this.picks.slice() }, 'primary stack-label', true, jk ? jkLine(jk.joker, v.n || 2) : `разом із 👁 ${cardTitle(me.openPick)}`)
        : btn(`Покласти ${k} закриті`, { type: 'playClosed' }, 'primary stack-label', false, 'торкнись карт у руці');
      return html;
    }
    if (!L.some((a) => a.type === 'playSet')) {
      const waitingOpen = v.step === 'open' && me.openPick;
      return waitCard(waitingOpen ? 'Відкриту покладено' : 'Карти покладено', this.isThree(v) ? 'Чекаємо на інших' : waitingOpen ? 'Суперник обирає відкриту' : v.opp.hasPlayed ? '' : 'Суперник ще обирає');
    }
    const cards = this.picks.map((id) => me.hand.find((c) => c.id === id)).filter(Boolean);
    const live = liveCombo(cards, v.trump, me.hand);
    const left = need - cards.length;
    const meter = live?.strength != null
      ? `<span class="meter" title="Яку частку типових комбінацій суперника б'є"><i style="width:${Math.round(live.strength * 100)}%"></i></span><span class="pc">сила ${pct(live.strength)}</span>`
      : `<span class="pc">ще ${left} ${left === 1 ? 'карта' : 'карти'}</span>`;
    let html = `<div class="combo-live${live ? '' : ' empty'}"><b>${live ? esc(live.combo.label) : `Обери ${need} карти`}</b>${meter}</div>`;
    const sel = cards.length === 1 ? cards[0] : null;
    const canSwap = !!sel && L.some((a) => a.type === 'swap' && a.cardId === sel.id);
    const swapWhy = sel?.kind === 'joker' ? 'джокера не обміняти' : me.swapped ? 'вже використано цього раунду' : me.chips < v.cfg.swapCost ? 'не вистачає фішок' : !sel ? 'вибери рівно 1 карту' : `нова замість ${cardTitle(sel)}`;
    html += `<div class="row" style="--n:1">${btn(`${ico('swap', 'ico')} Обмін −${v.cfg.swapCost}`, { type: 'swap', cardId: sel?.id }, 'secondary', canSwap, swapWhy)}</div>`;
    const open = cards.find((c) => c.id === this.openPick);
    const jk = cards.find((c) => c.kind === 'joker');
    html += cards.length === need
      ? btn(`Покласти ${need} карти`, { type: 'playSet', cards: this.picks, open: this.openPick }, 'primary stack-label', true, jk ? jokerDesc(jk.joker, v.n || 2) : `відкрита 👁 — ${cardTitle(open)}`)
      : btn(`Покласти ${need} карти`, { type: 'playSet' }, 'primary stack-label', false, 'торкайся карт у руці');
    return html;
  }

  /** Шпаргалка комбінацій поверх гри. */
  showCheatSheet() {
    document.querySelector('.cheat-modal')?.remove();
    const box = document.createElement('div');
    box.className = 'cheat-modal';
    box.innerHTML = `<div class="box">${cheatSheetHTML()}<button class="btn primary" type="button">Зрозуміло</button></div>`;
    for (const sp of box.querySelectorAll('[data-card]')) {
      const id = sp.dataset.card;
      const all = { w: 'water', f: 'fire', s: 'stone' };
      const c = { id, kind: 'num', suit: all[id[0]], value: Number(id.slice(1)) };
      const el = cardEl(c);
      sp.replaceWith(el);
    }
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.btn')) box.remove(); });
    document.getElementById('scr-game').append(box);
  }

  // ───────── вердикт раунду ─────────
  explainText(v) {
    const r = v.result;
    if (!r?.detail) return '';
    if (this.isCombo(v)) return r.detail.text || '';
    if (this.isThree(v)) {
      const d = r.detail;
      if (d.reason === 'tie3' || d.pw) return explain(d, [null, null], v.trump);
      if (d.a === undefined || d.b === undefined || d.a === null) return explain(d, [null, null], v.trump) || '';
      const cards = [this.playedOf(v, d.a), this.playedOf(v, d.b)];
      if (!cards[0] || !cards[1]) return '';
      return explain(d, cards, v.trump);
    }
    const cards = v.you === 0 ? [v.me.played, v.opp.played] : [v.opp.played, v.me.played];
    if (!cards[0] || !cards[1]) return '';
    return explain(r.detail, cards, v.trump);
  }

  renderVerdict(prev, v) {
    if (!prev || v.phase !== 'result' || prev.phase === 'result') return;
    const r = v.result;
    const why = this.explainText(v);
    let cls = '', title, amt;
    if (r.reason === 'void') { cls = 'tie'; title = 'Вибух!'; amt = `банк ${r.carry} → у джекпот`; }
    else if (r.reason === 'replay') { cls = 'tie'; title = 'Назад у часі'; amt = 'ставки повернуто, раунд ще раз'; }
    else if (r.winner === null) { cls = 'tie'; title = this.isThree(v) && r.reason === 'showdown' ? 'Нічия за перше місце' : 'Нічия'; amt = this.isThree(v) && r.reason === 'showdown' ? `банк ${r.carry} → у джекпот` : `банк ${r.carry} → наступний раунд`; }
    else if (r.winner === v.you) { title = r.reason === 'fold' ? (this.isThree(v) ? 'Усі спасували' : 'Суперник спасував') : r.penalty ? 'Подвоєння!' : 'Перемога!'; amt = `+${r.won}`; }
    else if (this.isThree(v)) { cls = 'lose'; title = `${this.nameOf(r.winner)} забирає банк`; amt = `банк ${r.won}`; }
    else { cls = 'lose'; title = r.reason === 'fold' ? 'Пас' : 'Програно'; amt = `банк ${r.won} — супернику`; }
    const jk = r.jokers;
    const jkDelay = jk ? this.showJokerReveal(v, jk) : 0;
    const delay = (r.revealed ? ms('--t-flip') : 0) + jkDelay + (this.st.tense ? FEEL.tensionMs : 0);
    clearTimeout(this.st.timers.verdict);
    const showV = () => {
      this.st.showVerdict = null;
      if (r.winner === null) sfx.tie(); else if (r.winner === v.you) { sfx.win(); sfx.accent(this.isHot(prev) || r.won >= FEEL.hotPot); } else sfx.lose();
      // особлива реакція: перемога слабкою картою і вдалий блеф
      if (r.winner !== null && r.reason === 'showdown') {
        const wc = r.jokers?.cards?.[r.winner] || this.playedOf(v, r.winner);
        const weakWin = this.isCombo(v) ? r.detail?.combos?.[r.winner]?.id === 'high' && !r.detail.lowWins : this.weak(wc, FEEL.weakCard);
        const what = this.isCombo(v) ? 'Старшою картою' : 'слабкою картою';
        if (weakWin) setTimeout(() => this.stamp(r.winner === v.you ? `${what[0].toUpperCase()}${what.slice(1)}! 🪶` : `${this.nameOf(r.winner)}: ${what}!`, r.winner === v.you ? 'win' : 'lose'), 350);
      } else if (r.reason === 'fold' && r.winner === v.you && this.weak(v.me.played, FEEL.bluffCard)) {
        setTimeout(() => this.stamp('Блеф пройшов! 😎', 'win'), 350);
      }
      if (r.winner !== null && r.reason === 'showdown' && this.winFx) playWin(this.el.fx, this.winFxBySeat?.[r.winner] || this.winFx[r.winner === v.you ? 0 : 1], reducedMotion(), true);
      const el = this.el.verdict;
      const cd = r.detail?.combos;
      clearTimeout(this.st.timers.verdictHide);
      if (this.isCombo(v) && cd && r.reason === 'showdown') {
        // Окремий чистий екран розкриття: карти кожного в ряд, над ними — комбінація, переможець підсвічений
        el.className = `verdict reveal-screen ${cls}`;
        el.innerHTML = this.revealHTML(v, r, title, amt);
        for (const row of el.querySelectorAll('.rv-cards')) {
          const q = Number(row.dataset.q);
          const fin = r.jokers?.cards?.[q] || this.playedOf(v, q);
          for (const c of arr(fin)) { const ce = cardEl(c, { trump: v.trump, bonus: v.cfg.trumpBonus }); row.append(ce); }
        }
        this.st.timers.verdictHide = setTimeout(() => this.hideVerdict(), 5200 + (jk ? 1500 : 0));
        return;
      }
      el.className = `verdict ${cls}`;
      const lines = (jk?.notes || []).slice(0, 3).map((n) => `<div class="why">${esc(n.text)}</div>`).join('');
      el.innerHTML = `<b>${esc(title)}</b>${lines}${why && r.reason === 'showdown' ? `<div class="why">${esc(why)}</div>` : ''}<div class="amt">${esc(amt)}</div><small>торкнись, щоб закрити</small>`;
      this.st.timers.verdictHide = setTimeout(() => this.hideVerdict(), ms('--t-banner') + (jk ? 800 : 0));
    };
    this.st.showVerdict = showV;
    if (this.isCombo(v) && r.detail?.combos && r.reason === 'showdown') this.st.revealPending = true;
    this.st.timers.verdict = setTimeout(showV, delay);
  }

  /** Екран розкриття: рядок на кожного учасника (спершу суперники, внизу — ти), пояснення, що змінив джокер. */
  revealHTML(v, r, title, amt) {
    const cd = r.detail.combos;
    const seats = [...this.oppSeats(v), v.you].filter((q) => cd[q]);
    const rows = seats.map((q) => {
      const st = r.winner === null ? 'tie' : q === r.winner ? 'win' : 'lose';
      const name = q === v.you ? 'Ти' : this.nameOf(q);
      const cut = r.detail.cuts?.[q] ? ' <span class="rv-note">🔪 старша не рахується</span>' : '';
      return `<div class="rv-row ${st}"><div class="rv-head"><span class="rv-name">${esc(name)}</span><b class="rv-combo">${st === 'win' ? '🏆 ' : ''}${esc(cd[q].label)}</b>${cut}</div><div class="rv-cards" data-q="${q}"></div></div>`;
    }).join('');
    const jk = r.jokers;
    const jkLines = (jk?.notes || []).map((n) => `<li>${JOKER_BY_ID[n.joker]?.icon || '🃏'} ${esc(n.text)}</li>`).join('');
    const changed = jk?.changed ? '<li class="rv-changed">Джокер змінив переможця раунду</li>' : '';
    return `<div class="rv-title"><b>${esc(title)}</b><span class="rv-amt">${esc(amt)}</span></div>
<div class="rv-rows">${rows}</div>
<div class="rv-why">${esc(r.detail.text || '')}</div>
${jkLines || changed ? `<ul class="rv-jokers"><li class="rv-jh">Що зробили джокери</li>${jkLines}${changed}</ul>` : ''}
<small>торкнись, щоб продовжити</small>`;
  }

  /** Драматичне розкриття джокерів: анімація за рідкістю, пояснення в один рядок, тап — пропустити. */
  showJokerReveal(v, jk) {
    const cards = [];
    const playedAt = (p) => (this.isThree(v) ? this.playedOf(v, p) : p === v.you ? v.me.played : v.opp.played);
    for (let p = 0; p < (v.n || 2); p++) for (const c of arr(playedAt(p))) if (c?.kind === 'joker') cards.push({ p, c });
    if (!cards.length) return 0;
    const top = cards.reduce((a, b) => (RARITIES.indexOf(JOKER_BY_ID[b.c.joker].rarity) > RARITIES.indexOf(JOKER_BY_ID[a.c.joker].rarity) ? b : a));
    const rarity = JOKER_BY_ID[top.c.joker].rarity;
    const dur = { common: 1500, rare: 1800, epic: 2200, legendary: 3000 }[rarity];
    const box = document.createElement('div');
    box.className = `jk-reveal r-${rarity}`;
    const names = cards.map(({ p, c }) => `${p === v.you ? 'Твій' : this.isThree(v) ? this.nameOf(p) : 'Суперника'}: ${JOKER_BY_ID[c.joker].name}`).join(' · ');
    const lines = (jk.notes || []).map((n) => `<div>${esc(n.text)}</div>`).join('');
    box.innerHTML = `<h3>${rarity === 'legendary' ? 'ЛЕГЕНДАРНИЙ ДЖОКЕР!' : `${RARITY_NAME[rarity]} джокер`}</h3><div class="vs"></div><div class="lines">${lines}</div><small>${esc(names)} · торкнись, щоб пропустити</small>`;
    const vs = box.querySelector('.vs');
    for (const { c } of cards) vs.append(cardEl(c));
    // якщо карти замінено (Буря, Обмін…) — показуємо, чим зрештою порівнювали
    const fin = jk.cards || [];
    const ids = (x) => arr(x).map((c) => c?.id).join();
    const replaced = fin.some((c, p) => c && ids(c) !== ids(playedAt(p)));
    if (replaced && this.isCombo(v)) {
      // чим зрештою порівнювали: набори після замін
      const box2 = document.createElement('div'); box2.className = 'fin-sets';
      for (const q of [v.you, ...this.oppSeats(v)]) if (fin[q]) {
        const row = document.createElement('div'); row.className = 'fin-row';
        const lb = document.createElement('small'); lb.textContent = q === v.you ? 'Ти' : this.nameOf(q);
        row.append(lb);
        for (const c of arr(fin[q])) { const m = cardEl(c, { trump: v.trump }); m.classList.add('mini'); row.append(m); }
        box2.append(row);
      }
      vs.after(box2);
    } else if (replaced && this.isThree(v)) {
      const arrow = document.createElement('span'); arrow.textContent = '→'; arrow.className = 'hint-text';
      vs.append(arrow);
      for (const q of [v.you, ...this.oppSeats(v)]) if (fin[q]) { const m = cardEl(fin[q], { trump: v.trump }); m.classList.add('mini'); vs.append(m); }
    } else if (replaced && fin[0] && fin[1]) {
      const mine = fin[v.you], theirs = fin[1 - v.you];
      const a = cardEl(theirs, { trump: v.trump }); a.classList.add('mini');
      const b = cardEl(mine, { trump: v.trump }); b.classList.add('mini');
      const arrow = document.createElement('span'); arrow.textContent = '→'; arrow.className = 'hint-text';
      vs.append(arrow, a, b);
    }
    if (jk.duel) {
      const d = document.createElement('div'); d.className = 'hint-text';
      d.textContent = this.isCombo(v) ? 'Дуель: кожен узяв карти з колоди й грає найкращою трійкою' : `Дуель: ${[v.you, ...this.oppSeats(v)].filter((p) => jk.duel[p]).map((p) => (jk.duel[p] || []).map((c) => c?.value).join('+')).join('  проти  ')}`;
      box.querySelector('.lines').append(d);
    }
    const close = () => { clearTimeout(t); box.remove(); };
    // тап пропускає розкриття — вердикт одразу
    box.addEventListener('click', () => { close(); clearTimeout(this.st.timers.verdict); this.st.showVerdict?.(); });
    this.el.table.parentElement.append(box);
    sfx.joker(rarity);
    const t = setTimeout(close, dur);
    this.st.timers.jk = t;
    return dur;
  }

  hideVerdict() {
    this.el.verdict.classList.add('hidden');
    this.st.revealPending = false;
    // «Подвій або нічого» чекав, доки гравець роздивиться розкриття
    if (this.st.donDeferred && this.view) { this.st.donDeferred = false; this.renderDon(null, this.view); }
  }

  // ───────── «Подвій або нічого» ─────────
  renderDon(prev, v) {
    const d = v.phase === 'result' ? v.result?.don : null;
    // поки відкритий екран розкриття — «Подвій або нічого» не перекриває його
    if (d && (this.st.revealPending || this.el.verdict.classList.contains('reveal-screen') && !this.el.verdict.classList.contains('hidden'))) { this.st.donDeferred = true; return; }
    const st = this.st;
    const n = d?.attempts.length || 0;
    const el = this.el;
    if (!d || (!d.pending && n === st.don && !st.donAnimating)) {
      if (!st.donAnimating) el.don.classList.add('hidden');
      if (!d) { st.don = 0; st.donBase = null; }
      return;
    }
    const mine = v.result.winner === v.you;
    el.don.classList.remove('hidden');
    this.hideVerdict();
    // Нова база
    if (d.pending && d.pending.base.id !== st.donBase) {
      st.donBase = d.pending.base.id;
      el.don.classList.remove('revealing');
      el.donResult.classList.add('hidden');
      el.donBase.innerHTML = '';
      el.donNext.innerHTML = '';
      el.donNext.parentElement.classList.remove('on');
      const c = cardEl(d.pending.base, { faceDown: true });
      c.classList.add('deal');
      el.donBase.append(c);
      sfx.deal();
      setTimeout(() => { c.classList.remove('back-up'); sfx.flip(); }, ms('--t-deal'));
    }
    el.donSub.innerHTML = mine
      ? `Ризикуєш чистим виграшем <b>${d.pending ? d.stake : d.attempts.at(-1)?.stakeBefore ?? d.stake}</b>. Наступна карта більша чи менша за базу?`
      : `${this.isThree(v) ? esc(this.nameOf(v.result.winner)) : 'Суперник'} ризикує виграшем <b>${d.pending ? d.stake : d.attempts.at(-1)?.stakeBefore ?? d.stake}</b> — дивись наживо`;
    // Результат спроби: пауза → переворот → підсумок
    if (n > st.don) {
      st.don = n;
      const a = d.attempts[n - 1];
      st.donAnimating = true;
      st.donBase = null;
      el.don.classList.add('revealing');
      el.donResult.classList.add('hidden');
      if (el.donBase.firstChild?.dataset.id !== a.base.id) { el.donBase.innerHTML = ''; el.donBase.append(cardEl(a.base)); }
      el.donBase.firstChild.classList.remove('back-up', 'deal');
      el.donNext.innerHTML = '';
      const c = cardEl(a.card, { faceDown: true });
      el.donNext.append(c);
      el.donNext.parentElement.classList.add('on');
      sfx.tension();
      const good = (a.outcome === 'win') === mine;
      const finish = () => {
        clearTimeout(st.timers.donFlip);
        st.finishDon = null;
        c.classList.remove('back-up');
        sfx.flip();
        st.timers.donRes = setTimeout(() => {
          el.donResult.className = `don-result ${a.outcome === 'push' ? 'push' : good ? 'win' : 'lose'}`;
          el.donResult.innerHTML = a.outcome === 'push'
            ? `Рівно — ставка повертається<small>${a.card.value} = ${a.base.value}</small>`
            : a.outcome === 'win'
              ? `${mine ? 'Вгадано' : 'Суперник вгадав'}! +${a.delta}<small>${a.card.value} ${a.guess === 'higher' ? '>' : '<'} ${a.base.value} · ×${a.m}</small>`
              : `Мимо! ${-a.delta} → у джекпот<small>${a.card.value} ${a.guess === 'higher' ? 'не більше' : 'не менше'} за ${a.base.value}</small>`;
          if (a.outcome === 'push') sfx.tie();
          else (good ? sfx.win : sfx.lose)();
          st.timers.donClose = setTimeout(() => this.closeDon(), 1800);
        }, ms('--t-flip'));
      };
      st.finishDon = finish;
      st.timers.donFlip = setTimeout(finish, ms('--t-reveal-pause'));
    }
    this.renderDonChoices(v, d);
  }

  renderDonChoices(v, d) {
    const el = this.el;
    const mine = v.result.winner === v.you;
    if (!d.pending) {
      el.donChoices.innerHTML = '';
      el.donEq.textContent = '';
      el.donWatch.innerHTML = this.st.donAnimating ? '<span class="skip-hint">торкнись, щоб пропустити</span>' : '';
      return;
    }
    const o = d.pending.odds;
    if (mine) {
      const ch = (g, icon, word) => {
        const ok = v.legal.some((a) => a.type === 'don' && a.guess === g);
        const gain = Math.min(Math.max(1, Math.floor(d.stake * (o[g].m - 1))), v.cfg.donMaxWin);
        return `<button class="choice" data-a='${JSON.stringify({ type: 'don', guess: g })}' ${ok ? '' : 'disabled'}>
          <span class="h">${ico(icon)}${word}</span>
          <span class="meter"><i style="width:${Math.round(o[g].p * 100)}%"></i></span>
          <span class="pc"><span>шанс <b>${pct(o[g].p)}</b></span><span>× <b>${o[g].m ? o[g].m.toFixed(1) : '—'}</b></span></span>
          ${ok ? `<span class="gain">+${gain}<small>разом ${d.stake + gain}</small></span>` : `<span class="na">${o[g].count ? 'невигідно: множник ≤ 1' : 'неможливо'}</span>`}
        </button>`;
      };
      el.donChoices.innerHTML = ch('higher', 'up', 'Більше') + ch('lower', 'down', 'Менше') +
        `<button class="btn secondary" style="grid-column:1/-1" data-a='{"type":"ready"}'><span>${chipIco()} Забрати виграш ${d.stake}</span></button>`;
      el.donEq.textContent = `Рівно (${pct(o.equal.p)}) — ставка повертається. Не вгадаєш — ${d.stake} іде в джекпот.`;
      el.donWatch.textContent = '';
    } else {
      el.donChoices.innerHTML = '';
      el.donEq.textContent = `Шанси: більше ${pct(o.higher.p)} · менше ${pct(o.lower.p)} · рівно ${pct(o.equal.p)}`;
      el.donWatch.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Суперник обирає…';
    }
    this.applyCoachSpot();
  }

  /** Тап по оверлею: одразу показати результат, повторний тап — закрити. */
  skipDon() {
    const st = this.st;
    if (!st.donAnimating) return;
    if (st.finishDon) { st.finishDon(); return; }
    this.closeDon();
  }

  closeDon() {
    const st = this.st;
    for (const k of ['donFlip', 'donRes', 'donClose']) clearTimeout(st.timers[k]);
    st.donAnimating = false;
    st.finishDon = null;
    const d = this.view?.phase === 'result' ? this.view.result.don : null;
    if (d?.pending) { this.renderDon(null, this.view); return; }
    this.el.don.classList.add('hidden');
    this.el.don.classList.remove('revealing');
  }

  // ───────── навчання ─────────
  renderCoach() {
    const c = this.coach;
    const el = this.el.coach;
    if (!c) { el.classList.add('hidden'); return; }
    el.innerHTML = `<span class="coach-step">Навчання · ${c.n} / 4</span>${c.text}<button class="btn tertiary coach-skip" data-skip>Пропустити</button>`;
    el.classList.remove('hidden');
    // під час «Подвою» підказка має бути поверх оверлею
    el.style.zIndex = this.el.don.classList.contains('hidden') ? '' : '25';
    this.applyCoachSpot();
  }

  applyCoachSpot() {
    document.querySelectorAll('.spot').forEach((x) => x.classList.remove('spot'));
    const c = this.coach;
    if (!c?.spot) return;
    const [kind, key] = c.spot.split(':');
    if (kind === 'cards') {
      const want = key.split(',');
      const missing = want.filter((id) => !this.picks.includes(id));
      if (!missing.length) document.querySelector('#actions .btn.primary')?.classList.add('spot');
      else for (const id of missing) document.querySelector(`#hand .card[data-id="${id}"] .face`)?.classList.add('spot');
    } else if (kind === 'open') {
      document.querySelector(`#hand .card[data-id="${key}"] .eye-tog`)?.classList.add('spot');
    } else if (kind === 'card') {
      if (this.selected === key) document.querySelector('#actions .btn.primary')?.classList.add('spot');
      else document.querySelector(`#hand .card[data-id="${key}"] .face`)?.classList.add('spot');
    } else if (kind === 'btn') {
      [...document.querySelectorAll('#actions button[data-a], #don-choices button[data-a]')]
        .find((b) => JSON.parse(b.dataset.a).type === key)?.classList.add('spot');
    }
  }

  // ───────── журнал ─────────
  logLines(n) {
    const v = this.view;
    if (!v) return [];
    const out = [];
    for (let i = v.log.length - 1; i >= 0 && out.length < n; i--) {
      const l = logLine(v.log[i], this.logNames);
      if (l) out.unshift(l);
    }
    return out;
  }

  // ───────── таймер ─────────
  loop() {
    requestAnimationFrame(this.loop);
    const t = this.timer;
    const v = this.view;
    if (!v) return;
    const ring = this.el.phaseRing;
    const ava = this.el.oppAva;
    if (!t) { for (const pn of this.panels) pn.ava.classList.remove('ticking'); return; }
    const rem = t.paused ? t.remaining : Math.max(0, t.deadline - performance.now());
    const k = t.duration ? rem / t.duration : 0;
    const sec = Math.ceil(rem / 1000);
    const low = !t.paused && rem < 5000;
    const mine = this.myTurn(v) && !this.offline;
    if (mine) {
      setDash(ring.querySelector('.val'), 94.25 * (1 - k));
      this.el.phaseSec.textContent = t.paused ? '⏸' : sec;
      ring.classList.toggle('low', low);
      if (low && sec !== this.lastTick) { this.lastTick = sec; sfx.tick(); }
    }
    // кільце довкола аватара суперника, коли чекаємо на нього
    if (this.isThree(v)) {
      this.oppSeats(v).forEach((q, i) => {
        const x = this.seat(v, q);
        const a = this.panels[i].ava;
        const w = !x.out && !x.folded && (v.phase === 'play' ? (v.step === 'open' ? !x.hasOpen : !x.hasPlayed) : v.phase === 'scout' ? !x.scoutDecided : v.phase === 'bet' ? v.bet.toAct === q : v.phase === 'result' ? !x.ready : false);
        a.classList.toggle('ticking', w);
        a.classList.toggle('low', w && low);
        if (w) setDash(a.querySelector('.tring .val'), 160.2 * (1 - k));
      });
      return;
    }
    const waitingOpp = !mine && v.phase !== 'over' && !(v.phase === 'result' && v.opp.ready);
    ava.classList.toggle('ticking', waitingOpp);
    ava.classList.toggle('low', waitingOpp && low);
    if (waitingOpp) setDash(ava.querySelector('.tring .val'), 160.2 * (1 - k));
  }
}
