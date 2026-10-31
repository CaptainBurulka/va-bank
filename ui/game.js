// Рендер ігрового екрана з view. Жодної ігрової логіки — лише показ і передача дій.
// Принцип: у будь-якому стані за 2 секунди видно (1) чий хід, (2) що можна зробити, (3) що на кону.
import { cardEl, fillFace, suitIcon } from './cardview.js';
import { animateNumber, setNumber, flyChips, floatEmoji, floatText } from './fx.js';
import { sfx } from './sound.js';
import { SUIT, SPECIAL, SCOUT, REACTIONS, logLine, explain } from './text.js';
import { ms } from './motion.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const chipIco = () => ico('chip', 'chip');
const pct = (p) => `${Math.round(p * 100)}%`;

/** «7 Вогню», «Ніж» */
export function cardTitle(c) {
  if (!c) return '';
  return c.kind === 'num' ? `${c.value} ${SUIT[c.suit].gen}` : SPECIAL[c.kind].name;
}

export class GameScreen {
  constructor({ onAction, onReaction, onMenu, onLog }) {
    this.onAction = onAction;
    this.onReaction = onReaction;
    this.onMenu = onMenu;
    this.onLog = onLog;
    this.view = null;
    this.meta = null;
    this.selected = null;
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

    // Реакції
    this.el.reactPanel.innerHTML = REACTIONS.map((e) => `<button data-e="${e}" aria-label="${e}">${e}</button>`).join('');
    this.el.btnReact.addEventListener('click', () => { sfx.tap(); this.el.reactPanel.classList.toggle('hidden'); });
    this.el.reactPanel.addEventListener('click', (ev) => {
      const e = ev.target.closest('button')?.dataset.e;
      if (!e) return;
      this.el.reactPanel.classList.add('hidden');
      this.showReaction(e, true);
      this.onReaction(e);
    });
    $('btn-menu').addEventListener('click', () => { sfx.tap(); this.onMenu(); });

    // Рука: тап лише ВИБИРАЄ карту; покласти — окремою кнопкою (без випадкових ходів)
    this.el.hand.addEventListener('click', (ev) => {
      const c = ev.target.closest('.card');
      if (!c || !this.view) return;
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
    this.el.donChoices.addEventListener('click', onBtn);
    // Будь-яку довгу анімацію можна пропустити тапом
    this.el.verdict.addEventListener('click', () => this.hideVerdict());
    this.el.don.addEventListener('click', (ev) => { if (!ev.target.closest('button')) this.skipDon(); });
    this.el.coach.addEventListener('click', (ev) => { if (ev.target.closest('[data-skip]')) this.onCoachSkip?.(); });

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  reset() {
    this.view = null;
    this.selected = null;
    for (const k of ['slotOpp', 'slotMe', 'hand', 'donBase', 'donNext', 'fx']) this.el[k].innerHTML = '';
    this.el.reactPanel.classList.add('hidden');
    this.el.don.classList.add('hidden');
    this.el.coach.classList.add('hidden');
    this.hideVerdict();
    for (const t of Object.values(this.st.timers || {})) clearTimeout(t);
    this.st = { opp: null, me: null, don: 0, donBase: null, timers: {} };
  }

  setNames(me, opp) {
    this.names = [me, opp];
    this.el.meName.textContent = me;
    this.el.oppName.textContent = opp;
    this.el.oppInitial.textContent = (opp.replace(/^Бот · /, '')[0] || 'С').toUpperCase();
    document.querySelector('#me .ava span').textContent = (me[0] || 'Т').toUpperCase();
  }

  /** Стан «не на зв'язку» показується в банері фази, нічого не перекриваючи. */
  setOffline(show, text = "Суперник не на зв'язку") {
    this.offline = show ? text : null;
    if (this.view) { this.renderPhase(this.view); this.renderPlayers(this.view); }
  }

  act(a) {
    if (this.pending) return;
    sfx.tap();
    if (a.type === 'play') { this.selected = null; sfx.place(); }
    if (a.type === 'swap') this.selected = null;
    this.pending = true;
    setTimeout(() => (this.pending = false), 250);
    this.onAction(a);
  }

  showReaction(emoji, mine) {
    sfx.pop();
    floatEmoji(this.el.fx, emoji, !mine);
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

    const t = view.timer;
    this.timer = t ? { deadline: performance.now() + t.remaining, duration: t.duration, paused: t.paused, remaining: t.remaining } : null;
    this.logNames = [0, 1].map((p) => (p === view.you ? this.names[0] : this.names[1]));

    this.renderNumbers(prev, view);
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

  myTurn(v) {
    return v.legal.length > 0 && !(v.phase === 'result' && v.me.ready);
  }

  // ───────── банер фази ─────────
  renderPhase(v, prev) {
    let kind = 'wait';
    let title = '';
    let sub = '';
    const r = v.result;
    switch (v.phase) {
      case 'play':
        if (!v.me.played) { kind = 'act'; title = 'Обери карту'; sub = v.trump ? `Козир — ${SUIT[v.trump].name}: +${v.cfg.trumpBonus} до сили` : 'Вона ляже сорочкою догори'; }
        else { title = v.opp.hasPlayed ? 'Карти на столі' : 'Суперник обирає карту'; sub = 'Твою карту покладено'; }
        break;
      case 'scout':
        if (!v.me.scoutDecided) { kind = 'act'; title = 'Розвідка?'; sub = `Висока чи низька в суперника — за ${v.cfg.scoutCost}`; }
        else { title = 'Суперник вирішує щодо розвідки'; sub = v.me.scoutSeen ? `У суперника ${SCOUT[v.me.scoutSeen].name} карта` : ''; }
        break;
      case 'bet':
        if (v.bet.toAct === v.you) {
          kind = 'act'; title = 'Твій хід';
          sub = v.bet.toCall ? `Суперник підняв на ${v.bet.toCall}` : this.lastOppAction(v) === 'check' ? 'Суперник: чек' : 'Чек, підняти чи пас';
        } else {
          title = 'Хід суперника';
          sub = v.bet.toCall ? `Твоє підняття +${v.bet.toCall} — чекаємо відповіді` : 'Суперник думає над ставкою';
        }
        break;
      case 'result':
        if (r.don?.pending) { kind = r.winner === v.you ? 'act' : 'wait'; title = 'Подвій або нічого'; sub = r.winner === v.you ? 'Більше чи менше?' : 'Суперник ризикує виграшем'; }
        else if (v.me.ready) { title = 'Чекаємо на суперника'; sub = 'Наступний раунд — зараз'; }
        else if (r.winner === null) { kind = 'wait'; title = 'Нічия'; sub = `Банк ${r.carry} переходить у наступний раунд`; }
        else if (r.winner === v.you) { kind = 'win'; title = 'Банк твій'; sub = this.explainText(v) || (r.reason === 'fold' ? 'Суперник спасував' : ''); }
        else { kind = 'lose'; title = 'Банк у суперника'; sub = this.explainText(v) || (r.reason === 'fold' ? 'Ти спасував(-ла)' : ''); }
        break;
      case 'over':
        title = 'Партію завершено';
        break;
    }
    if (this.meta?.paused && v.timer && !this.offline) sub = '⏸ Пауза' + (sub ? ` · ${sub}` : '');
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
      if (e.p === 1 - v.you && ['check', 'raise', 'call'].includes(e.t)) return e.t;
    }
    return null;
  }

  // ───────── гравці ─────────
  renderPlayers(v) {
    const o = v.opp;
    const parts = [];
    if (this.offline || (this.meta && !this.meta.oppConnected)) parts.push(`<span class="warn">${ico('wifi-off')}не на зв'язку</span>`);
    else {
      // значки без тексту, щоб статус уміщався: 👁 — підглядав, ⇄ — міняв карту
      if (o.scouted && v.phase !== 'result') parts.push(`<span class="ic" title="Суперник зробив розвідку" aria-label="розвідка">${ico('eye')}</span>`);
      if (o.swapped && v.phase === 'play') parts.push(`<span class="ic" title="Суперник обміняв карту" aria-label="обмін">${ico('swap')}</span>`);
      let s = '';
      switch (v.phase) {
        case 'play': s = o.hasPlayed ? 'карта на столі' : 'обирає карту…'; break;
        case 'scout': s = o.scoutDecided ? (o.scouted ? '' : 'без розвідки') : 'думає про розвідку…'; break;
        case 'bet': s = v.bet.toAct !== v.you ? 'думає над ставкою…' : (v.bet.toCall ? `підняття +${v.bet.toCall}` : 'чекає на тебе'); break;
        case 'result': s = v.result.don?.pending && v.result.winner !== v.you ? 'ризикує виграшем…' : o.ready ? 'готово до наступного' : ''; break;
      }
      if (s) parts.push(`<span>${s}</span>`);
    }
    this.el.oppStatus.innerHTML = parts.join('');
    this.el.oppAva.classList.toggle('offline', !!(this.offline || (this.meta && !this.meta.oppConnected)));
    const n = o.handCount;
    if (this.el.oppHand.childElementCount !== n) this.el.oppHand.innerHTML = '<i></i>'.repeat(n);
    this.el.oppHand.setAttribute('aria-label', `Карт у суперника: ${n}`);

    const m = [];
    if (v.me.scoutSeen && v.phase !== 'result') m.push(`<span class="gold">${ico('eye')}розвідка: ${SCOUT[v.me.scoutSeen].name}</span>`);
    if (v.me.swapped && v.phase === 'play') m.push(`<span>${ico('swap')}обмін ✓</span>`);
    this.el.meStatus.innerHTML = m.join('<span>·</span>');
  }

  // ───────── числа і фішки ─────────
  renderNumbers(prev, v) {
    const e = this.el;
    if (!prev) {
      setNumber(e.meChips, v.me.chips);
      setNumber(e.oppChips, v.opp.chips);
      setNumber(e.potVal, v.pot);
      return;
    }
    const dMe = v.me.chips - prev.me.chips;
    const dOpp = v.opp.chips - prev.opp.chips;
    const dPot = v.pot - prev.pot;
    const n = (x) => Math.ceil(Math.abs(x) / 5);
    if (dPot > 0) {
      if (dMe < 0) flyChips(e.fx, e.hudMe, e.pot, n(dMe));
      if (dOpp < 0) flyChips(e.fx, e.hudOpp, e.pot, n(dOpp));
      sfx.chip(n(dPot));
    } else if (dPot < 0) {
      if (dMe > 0) flyChips(e.fx, e.pot, e.hudMe, n(dPot));
      if (dOpp > 0) flyChips(e.fx, e.pot, e.hudOpp, n(dPot));
      sfx.chips(n(dPot));
    } else if (dMe && dOpp) {
      if (dMe > 0) flyChips(e.fx, e.hudOpp, e.hudMe, n(dMe));
      else flyChips(e.fx, e.hudMe, e.hudOpp, n(dMe));
      sfx.chips(n(dMe));
    }
    if (dMe) floatText(e.fx, e.hudMe, `${dMe > 0 ? '+' : ''}${dMe}`, dMe > 0 ? 'var(--win)' : 'var(--lose)');
    if (dOpp) floatText(e.fx, e.hudOpp, `${dOpp > 0 ? '+' : ''}${dOpp}`, dOpp > 0 ? 'var(--win)' : 'var(--lose)');
    animateNumber(e.meChips, v.me.chips, ms('--t-count'));
    animateNumber(e.oppChips, v.opp.chips, ms('--t-count'));
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
    e.roundTag.textContent = `Раунд ${v.round}/${v.maxRounds} · анте ${v.ante}`;
    if (v.trump) {
      e.trump.innerHTML = `Козир ${suitIcon(v.trump)}<b>${SUIT[v.trump].name}</b>&nbsp;+${v.cfg.trumpBonus}`;
      e.trump.classList.remove('hidden');
      if (prev && prev.round !== v.round) { e.trump.classList.remove('pop'); void e.trump.offsetWidth; e.trump.classList.add('pop'); }
    } else e.trump.classList.add('hidden');
    const d = v.deck;
    e.deckInfo.innerHTML = `${ico('deck')}${d.total} <span class="hi">↑${d.high}</span> <span class="lo">↓${d.low}</span> <span>✦${d.special}</span>`;
    e.deckInfo.setAttribute('aria-label', `У колоді ${d.total}: високих ${d.high}, низьких ${d.low}, спецкарт ${d.special}`);
    // банк і джекпот
    const jp = v.jackpot && v.pot ? v.jackpot : 0;
    const carry = !jp && v.carry && v.round > 1 && v.phase !== 'result' ? v.carry : 0;
    e.jackpot.textContent = jp ? `джекпот ${jp}` : carry ? `з минулого ${carry}` : '';
    e.jackpot.classList.toggle('hidden', !jp && !carry);
    this.renderSlots(prev, v);
    // під картами: що на кону
    const facing = v.phase === 'bet' && v.bet.toCall > 0;
    const oppHot = facing && v.bet.toAct === v.you;
    const meHot = facing && v.bet.toAct !== v.you;
    const pill = (amt, hot, label) => `<span class="pill ${hot ? 'hot' : ''}">${chipIco()}${hot ? `+${v.bet.toCall}` : `${label}${amt}`}</span>`;
    const showPot = ['scout', 'bet'].includes(v.phase);
    e.infoOpp.innerHTML = oppHot ? pill(0, true) : showPot ? pill(v.opp.inPot, false, 'у банку ') : '';
    e.infoMe.innerHTML = meHot ? pill(0, true) : showPot ? pill(v.me.inPot, false, 'у банку ') : '';
    if (v.phase === 'result' && v.result.winner !== null && !v.result.don?.pending) {
      const won = v.result.don ? v.result.won + v.result.don.attempts.reduce((s, a) => s + a.delta, 0) : v.result.won;
      const target = v.result.winner === v.you ? e.infoMe : e.infoOpp;
      target.innerHTML = `<span class="pill win">+${won}</span>`;
    }
  }

  renderSlots(prev, v) {
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
        requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('back-up')));
        if (prev) sfx.flip();
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
        el.addEventListener('animationend', () => { el.classList.remove('deal'); el.style.animationDelay = ''; }, { once: true });
      } else if (!prev || prev.trump !== v.trump) fillFace(el, card, opt);
      if (hand.children[i] !== el) hand.insertBefore(el, hand.children[i] || null);
    });
    hand.classList.toggle('passive', !v.legal.some((a) => a.type === 'play'));
    hand.classList.toggle('concealed', this.conceal);
    this.renderHandSelection();
  }

  renderHandSelection() {
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
        if (!has('play')) { html = waitCard('Карту покладено', v.opp.hasPlayed ? '' : 'Суперник ще обирає'); break; }
        const sel = this.selected && me.hand.find((c) => c.id === this.selected);
        const canSwap = L.some((a) => a.type === 'swap');
        const swapWhy = me.swapped ? 'вже використано цього раунду' : me.chips < v.cfg.swapCost ? 'не вистачає фішок' : !sel ? 'спершу обери карту' : `нова карта замість ${cardTitle(sel)}`;
        html += `<div class="row" style="--n:1">${btn(`${ico('swap', 'ico')} Обмін −${v.cfg.swapCost}`, { type: 'swap', cardId: this.selected }, 'secondary', canSwap && !!sel, swapWhy)}</div>`;
        html += sel
          ? btn(`Покласти ${cardTitle(sel)}`, { type: 'play', cardId: sel.id }, 'primary stack-label', true, 'сорочкою догори')
          : btn('Покласти карту', { type: 'play' }, 'primary stack-label', false, 'спершу торкнись карти в руці');
        break;
      }
      case 'scout': {
        if (!L.length) { html = waitCard('Чекаємо на суперника', 'Суперник вирішує щодо розвідки'); break; }
        const canScout = !!has('scout');
        html += `<div class="row" style="--n:1">${btn(`${ico('eye', 'ico')} Розвідка −${v.cfg.scoutCost}`, { type: 'scout' }, 'secondary', canScout, canScout ? `лишиться ${me.chips - v.cfg.scoutCost} · висока чи низька?` : 'не вистачає фішок')}</div>`;
        html += btn('Далі без розвідки', { type: 'skipScout' }, 'primary');
        break;
      }
      case 'bet': {
        if (!L.length) { html = waitCard('Хід суперника', v.bet.toCall ? `Твоє підняття +${v.bet.toCall}` : 'Суперник думає над ставкою'); break; }
        const call = has('call');
        const toCall = call ? call.amount : 0;
        html += call
          ? btn(`Колл ${call.amount}`, { type: 'call' }, 'primary stack-label', true, `вирівняти й розкрити · лишиться ${me.chips - call.amount}`)
          : btn('Чек', { type: 'check' }, 'primary stack-label', true, 'без ставки');
        const raises = L.filter((a) => a.type === 'raise');
        const limit = v.bet.raises >= v.cfg.maxRaises;
        const reason = limit ? 'ліміт піднять' : v.opp.chips === 0 ? 'у суперника 0' : me.chips - toCall <= 0 ? 'немає фішок' : 'недоступно';
        const verb = call ? 'Ре-рейз ' : '';
        let row = '';
        for (const size of v.cfg.raiseSizes) {
          const a = raises.find((x) => x.amount === size);
          row += btn(`${verb}+${size}`, { type: 'raise', amount: size }, 'secondary', !!a, a ? `лишиться ${me.chips - toCall - size}` : reason);
        }
        const allin = raises.find((x) => x.amount === 'allin');
        const capped = allin && v.round < (v.cfg.allinFreeFromRound || 4) && allin.value < Math.min(me.chips - toCall, v.opp.chips);
        row += btn(allin ? `Ва-банк +${allin.value}` : 'Ва-банк', { type: 'raise', amount: 'allin' }, 'allin', !!allin, allin ? (capped ? 'ліміт = банк' : `лишиться ${me.chips - toCall - allin.value}`) : reason);
        html += `<div class="row">${row}</div>`;
        html += btn(`Пас — віддати банк ${v.pot}`, { type: 'fold' }, 'link');
        break;
      }
      case 'result': {
        const r = v.result;
        if (r.don?.pending) { html = waitCard(r.winner === v.you ? 'Подвій або нічого' : 'Суперник ризикує виграшем', ''); break; }
        if (!L.length || me.ready) { html = waitCard('Чекаємо на суперника', 'Наступний раунд — щойно він натисне «Далі»'); break; }
        const sec = [];
        if (has('donStart')) sec.push(btn('🎲 Подвій або нічого', { type: 'donStart' }, 'secondary', true, `ризикнути ${r.don.stake}`));
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

  // ───────── вердикт раунду ─────────
  explainText(v) {
    const r = v.result;
    if (!r?.detail) return '';
    const cards = v.you === 0 ? [v.me.played, v.opp.played] : [v.opp.played, v.me.played];
    if (!cards[0] || !cards[1]) return '';
    return explain(r.detail, cards, v.trump);
  }

  renderVerdict(prev, v) {
    if (!prev || v.phase !== 'result' || prev.phase === 'result') return;
    const r = v.result;
    const why = this.explainText(v);
    let cls = '', title, amt;
    if (r.winner === null) { cls = 'tie'; title = 'Нічия'; amt = `банк ${r.carry} → наступний раунд`; sfx.tie(); }
    else if (r.winner === v.you) { title = r.reason === 'fold' ? 'Суперник спасував' : r.penalty ? 'Подвоєння!' : 'Перемога!'; amt = `+${r.won}`; sfx.win(); }
    else { cls = 'lose'; title = r.reason === 'fold' ? 'Пас' : 'Програно'; amt = `банк ${r.won} — супернику`; sfx.lose(); }
    const delay = r.revealed ? ms('--t-flip') : 0;
    clearTimeout(this.st.timers.verdict);
    this.st.timers.verdict = setTimeout(() => {
      const el = this.el.verdict;
      el.className = `verdict ${cls}`;
      el.innerHTML = `<b>${esc(title)}</b>${why ? `<div class="why">${esc(why)}</div>` : ''}<div class="amt">${esc(amt)}</div><small>торкнись, щоб закрити</small>`;
      clearTimeout(this.st.timers.verdictHide);
      this.st.timers.verdictHide = setTimeout(() => this.hideVerdict(), ms('--t-banner'));
    }, delay);
  }

  hideVerdict() {
    this.el.verdict.classList.add('hidden');
  }

  // ───────── «Подвій або нічого» ─────────
  renderDon(prev, v) {
    const d = v.phase === 'result' ? v.result?.don : null;
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
      : `Суперник ризикує виграшем <b>${d.pending ? d.stake : d.attempts.at(-1)?.stakeBefore ?? d.stake}</b> — дивись наживо`;
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
    if (kind === 'card') {
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
    if (!t) { ava.classList.remove('ticking'); return; }
    const rem = t.paused ? t.remaining : Math.max(0, t.deadline - performance.now());
    const k = t.duration ? rem / t.duration : 0;
    const sec = Math.ceil(rem / 1000);
    const low = !t.paused && rem < 5000;
    const mine = this.myTurn(v) && !this.offline;
    if (mine) {
      ring.querySelector('.val').style.strokeDashoffset = String(94.25 * (1 - k));
      this.el.phaseSec.textContent = t.paused ? '⏸' : sec;
      ring.classList.toggle('low', low);
      if (low && sec !== this.lastTick) { this.lastTick = sec; sfx.tick(); }
    }
    // кільце довкола аватара суперника, коли чекаємо на нього
    const waitingOpp = !mine && v.phase !== 'over' && !(v.phase === 'result' && v.opp.ready);
    ava.classList.toggle('ticking', waitingOpp);
    ava.classList.toggle('low', waitingOpp && low);
    if (waitingOpp) ava.querySelector('.tring .val').style.strokeDashoffset = String(160.2 * (1 - k));
  }
}
