// Рендер ігрового столу з view. Жодної ігрової логіки — лише показ і передача дій.
import { cardEl, fillFace } from './cardview.js';
import { animateNumber, setNumber, flyChips, floatEmoji, floatText } from './fx.js';
import { sfx } from './sound.js';
import { SUIT, SCOUT, REACTIONS, logLine, cardName, explain, TIPS } from './text.js';
import { hints } from './settings.js';

const $ = (id) => document.getElementById(id);

export class GameScreen {
  constructor({ onAction, onReaction, onMenu }) {
    this.onAction = onAction;
    this.onReaction = onReaction;
    this.onMenu = onMenu;
    this.prev = null;
    this.view = null;
    this.selected = null;
    this.names = ['Ти', 'Суперник'];
    this.conceal = false;
    this.localDeadline = 0;
    this.lastTick = -1;
    this.pending = false;

    this.el = {
      oppName: $('opp-name'), meName: $('me-name'),
      oppChips: $('opp-chips'), meChips: $('me-chips'),
      oppBadges: $('opp-badges'), meBadges: $('me-badges'),
      oppHand: $('opp-hand'), hand: $('hand'),
      slotOpp: $('slot-opp'), slotMe: $('slot-me'),
      pot: $('pot'), potVal: $('pot-val'), carry: $('carry'), donCard: $('don-card'),
      round: $('round-tag'), turnText: $('turn-text'), timerBar: $('timer-bar'), timerNum: $('timer-num'),
      timer: document.querySelector('#turn .timer'),
      log: $('log'), actions: $('actions'), banner: $('banner'), fx: $('fx'),
      reactPanel: $('react-panel'), reactBtn: $('btn-react'), offline: $('offline'),
      hudOpp: document.querySelector('.hud-opp .chips'), hudMe: document.querySelector('.hud-me .chips'),
      trump: $('trump'), deckInfo: $('deck-info'), tip: $('tip'),
    };
    this.el.tip.addEventListener('click', () => this.hideTip());

    // Реакції
    this.el.reactPanel.innerHTML = REACTIONS.map((e) => `<button data-e="${e}">${e}</button>`).join('');
    this.el.reactBtn.addEventListener('click', () => { sfx.tap(); this.el.reactPanel.classList.toggle('hidden'); });
    this.el.reactPanel.addEventListener('click', (ev) => {
      const e = ev.target.closest('button')?.dataset.e;
      if (!e) return;
      this.el.reactPanel.classList.add('hidden');
      this.showReaction(e, true);
      this.onReaction(e);
    });
    $('btn-menu').addEventListener('click', () => this.onMenu());

    // Рука: тап вибирає, повторний тап — кладе
    this.el.hand.addEventListener('click', (ev) => {
      const c = ev.target.closest('.card');
      if (!c || !this.view) return;
      if (!this.view.legal.some((a) => a.type === 'play' || a.type === 'swap')) return;
      const id = c.dataset.id;
      if (this.selected === id) return this.act({ type: 'play', cardId: id });
      sfx.tap();
      this.selected = id;
      this.renderHandSelection();
      this.renderActions();
    });
    this.el.actions.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b || b.disabled) return;
      this.act(JSON.parse(b.dataset.a));
    });

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  reset() {
    this.prev = null;
    this.view = null;
    this.selected = null;
    this.el.slotOpp.innerHTML = '';
    this.el.slotMe.innerHTML = '';
    this.el.donCard.innerHTML = '';
    this.el.hand.innerHTML = '';
    this.el.banner.classList.add('hidden');
    this.el.reactPanel.classList.add('hidden');
    this.el.fx.innerHTML = '';
    this.hideTip?.();
    this.slotState = { opp: null, me: null, don: 0 };
  }

  setNames(me, opp) {
    this.names = [me, opp];
    this.el.meName.textContent = me;
    this.el.oppName.textContent = opp;
  }

  setOffline(show, text = "Суперник не на зв'язку…") {
    this.el.offline.textContent = text;
    this.el.offline.classList.toggle('hidden', !show);
  }

  act(a) {
    if (this.pending) return;
    sfx.tap();
    if (a.type === 'play') {
      this.selected = null;
      sfx.place();
    }
    this.pending = true;
    setTimeout(() => (this.pending = false), 250);
    this.onAction(a);
  }

  showReaction(emoji, mine) {
    sfx.pop();
    floatEmoji(this.el.fx, emoji, !mine);
  }

  /** Головний метод: отримати новий стан. */
  update({ view, meta }, opts = {}) {
    const prev = this.view && this.view.you === view.you ? this.view : null;
    if (!this.slotState) this.slotState = { opp: null, me: null, don: 0 };
    this.prev = prev;
    this.view = view;
    this.meta = meta;
    this.conceal = !!opts.conceal;
    this.pending = false;
    if (!view.legal.some((a) => a.type === 'play' && a.cardId === this.selected)) this.selected = null;
    if (prev && prev.round !== view.round) this.selected = null;

    const t = view.timer;
    this.localDeadline = t ? performance.now() + t.remaining : 0;
    this.timerDuration = t ? t.duration : 0;
    this.timerPaused = t ? t.paused : true;
    this.timerRemaining = t ? t.remaining : 0;

    const nameOf = (p) => (p === view.you ? this.names[0] : this.names[1]);
    this.logNames = [nameOf(0), nameOf(1)];

    this.renderNumbers(prev, view);
    this.renderOppHand(view);
    this.renderSlots(prev, view);
    this.renderDon(prev, view);
    this.renderHand(prev, view);
    this.renderBadges(view);
    this.renderTurn(view);
    this.renderLog(view);
    this.renderActions();
    this.renderBanner(prev, view);
    this.renderTable(prev, view);
    if (prev && prev.phase !== view.phase) this.hideTip();
    this.renderTip(view);

    if (prev && view.legal.length && !prev.legal.length && view.phase !== 'result') sfx.turn();
  }

  renderNumbers(prev, v) {
    const e = this.el;
    if (!prev) {
      setNumber(e.meChips, v.me.chips);
      setNumber(e.oppChips, v.opp.chips);
      setNumber(e.potVal, v.pot);
    } else {
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
        sfx.chip(n(dPot));
      } else if (dMe && dOpp) {
        // Пряма передача (штраф «Подвоєння», «подвій або нічого»)
        if (dMe > 0) flyChips(e.fx, e.hudOpp, e.hudMe, n(dMe));
        else flyChips(e.fx, e.hudMe, e.hudOpp, n(dMe));
        sfx.chip(n(dMe));
      }
      if (dMe) floatText(e.fx, e.hudMe, `${dMe > 0 ? '+' : ''}${dMe}`, dMe > 0 ? '#8dff6a' : '#ff4d5e');
      if (dOpp) floatText(e.fx, e.hudOpp, `${dOpp > 0 ? '+' : ''}${dOpp}`, dOpp > 0 ? '#8dff6a' : '#ff4d5e');
      animateNumber(e.meChips, v.me.chips);
      animateNumber(e.oppChips, v.opp.chips);
      if (dPot) {
        animateNumber(e.potVal, v.pot);
        e.pot.classList.remove('bump');
        void e.pot.offsetWidth;
        e.pot.classList.add('bump');
      }
    }
    const carry = v.carry && v.round > 1 && v.phase !== 'result' ? v.carry : 0;
    const jp = v.jackpot && v.pot ? v.jackpot : 0;
    e.carry.textContent = jp ? `🎰 джекпот ${jp}` : carry ? `з них ${carry} з минулого раунду` : '';
    e.carry.classList.toggle('jackpot', !!jp);
    e.carry.classList.toggle('hidden', !carry && !jp);
  }

  renderOppHand(v) {
    const n = v.opp.handCount;
    if (this.el.oppHand.childElementCount !== n) {
      this.el.oppHand.innerHTML = '<div class="mini-back"></div>'.repeat(n);
    }
  }

  renderSlots(prev, v) {
    const st = this.slotState;
    // Суперник
    const oppKey = v.opp.played ? v.opp.played.id : v.opp.hasPlayed ? 'back' : null;
    if (oppKey !== st.opp) {
      const slot = this.el.slotOpp;
      if (!oppKey) slot.innerHTML = '';
      else if (oppKey === 'back') {
        slot.innerHTML = '';
        const c = cardEl(null);
        c.classList.add('drop');
        c.style.setProperty('--from', '-160px');
        slot.append(c);
        if (prev) sfx.place();
      } else {
        let c = slot.querySelector('.card');
        if (!c) { c = cardEl(null); slot.innerHTML = ''; slot.append(c); }
        fillFace(c, v.opp.played);
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
        const c = cardEl(v.me.played);
        c.classList.add('drop');
        slot.append(c);
      }
      st.me = meKey;
    }
    // Підписи та підсвітка
    const oc = this.el.slotOpp.querySelector('.card');
    const mc = this.el.slotMe.querySelector('.card');
    for (const c of [oc, mc]) c?.classList.remove('win', 'lose');
    const r = v.result;
    if (r && r.winner !== null && v.phase === 'result') {
      const meWon = r.winner === v.you;
      (meWon ? mc : oc)?.classList.add('win');
      if (r.revealed) (meWon ? oc : mc)?.classList.add('lose');
    }
    const sc = v.me.scoutSeen && SCOUT[v.me.scoutSeen];
    this.setLabel(this.el.slotOpp, sc && v.phase !== 'result' ? `${sc.ico} ${sc.name} (${sc.range})` : v.opp.shown ? 'показано' : '');
    this.setLabel(this.el.slotMe, v.me.played ? (v.opp.scouted && v.phase !== 'result' ? '👁 підглянуто' : v.phase === 'result' && (r?.revealed || v.me.shown) ? '' : '🔒 закрита') : '');
  }

  setLabel(slot, text) {
    let l = slot.querySelector('.slot-label');
    if (!l) { l = document.createElement('div'); l.className = 'slot-label'; slot.append(l); }
    l.textContent = text;
  }

  /** «Подвій або нічого»: база і наступна карта по центру столу. */
  renderDon(prev, v) {
    const d = v.phase === 'result' ? v.result?.don : null;
    const box = this.el.donCard;
    const st = this.slotState;
    const n = d?.attempts.length || 0;
    const baseId = d?.pending?.base.id || null;
    if (!d || (!baseId && !n)) {
      if (box.childElementCount) box.innerHTML = '';
      st.don = 0; st.donBase = null;
      return;
    }
    // Відкрито базу
    if (baseId && baseId !== st.donBase) {
      st.donBase = baseId;
      box.innerHTML = '';
      box.classList.remove('pair');
      const c = cardEl(d.pending.base, { faceDown: true });
      c.classList.add('deal');
      box.append(c);
      sfx.deal();
      setTimeout(() => { c.classList.remove('back-up'); sfx.flip(); }, 400);
    }
    // Результат спроби: база + нова карта
    if (n !== st.don) {
      st.don = n;
      if (!n) return;
      const a = d.attempts[n - 1];
      st.donBase = null;
      box.innerHTML = '';
      box.classList.add('pair');
      const b = cardEl(a.base);
      const c = cardEl(a.card, { faceDown: true });
      c.classList.add('deal');
      box.append(b, c);
      sfx.deal();
      setTimeout(() => { c.classList.remove('back-up'); sfx.flip(); }, 450);
      const mine = v.result.winner === v.you;
      setTimeout(() => {
        if (a.outcome === 'push') {
          sfx.tie();
          this.flashBanner(`Рівно: ${cardName(a.card)}`, 'Ставка повертається', 'tie');
        } else if (a.outcome === 'win') {
          mine ? sfx.win() : sfx.lose();
          this.flashBanner(`Вгадано! ${cardName(a.card)}`, `${mine ? 'Тобі' : 'Супернику'} +${a.delta} (×${a.m})`, mine ? 'win' : 'lose');
        } else {
          mine ? sfx.lose() : sfx.win();
          this.flashBanner(`Мимо! ${cardName(a.card)}`, `${-a.delta} іде в джекпот наступного раунду`, mine ? 'lose' : 'tie');
        }
      }, 950);
      setTimeout(() => { if (st.don === n && !st.donBase) box.innerHTML = ''; }, 3200);
    }
  }

  renderHand(prev, v) {
    const hand = this.el.hand;
    const existing = new Map([...hand.children].map((c) => [c.dataset.id, c]));
    const ids = v.me.hand.map((c) => c.id);
    for (const [id, el] of existing) if (!ids.includes(id)) el.remove();
    let dealt = 0;
    v.me.hand.forEach((card, i) => {
      let el = existing.get(card.id);
      if (!el) {
        el = cardEl(card);
        el.classList.add('deal');
        el.style.animationDelay = `${dealt * 90}ms`;
        if (prev || dealt < 4) sfx.deal(dealt);
        dealt++;
        el.addEventListener('animationend', () => { el.classList.remove('deal'); el.style.animationDelay = ''; }, { once: true });
      }
      if (hand.children[i] !== el) hand.insertBefore(el, hand.children[i] || null);
    });
    hand.classList.toggle('disabled', v.phase === 'play' && !!v.me.played);
    hand.classList.toggle('concealed', this.conceal);
    this.renderHandSelection();
  }

  renderHandSelection() {
    for (const c of this.el.hand.children) c.classList.toggle('selected', c.dataset.id === this.selected);
  }

  renderBadges(v) {
    const b = [];
    if (v.opp.swapped && v.phase === 'play') b.push('<span class="badge info">🔄 міняв</span>');
    if (v.opp.scouted) b.push('<span class="badge warn">👁 розвідка</span>');
    if (v.bet && v.bet.toAct !== v.you && v.phase === 'bet') b.push('<span class="badge turn">хід</span>');
    if (v.phase === 'play' && v.opp.hasPlayed) b.push('<span class="badge info">карта ✓</span>');
    if (v.phase === 'result' && v.opp.ready) b.push('<span class="badge info">готовий</span>');
    if (this.meta && !this.meta.oppConnected) b.push('<span class="badge warn">офлайн</span>');
    this.el.oppBadges.innerHTML = b.join('');
    const m = [];
    if (v.me.swapped && v.phase === 'play') m.push('<span class="badge info">🔄 обмін</span>');
    if (v.me.scouted) m.push('<span class="badge info">👁 розвідка</span>');
    if (v.bet && v.bet.toAct === v.you && v.phase === 'bet') m.push('<span class="badge turn">твій хід</span>');
    this.el.meBadges.innerHTML = m.join('');
  }

  renderTurn(v) {
    let text = '';
    let mine = v.legal.length > 0;
    const r = v.result;
    switch (v.phase) {
      case 'play':
        text = v.me.played ? 'Чекаємо на карту суперника…' : v.trump ? `Козир ${SUIT[v.trump].ico} ${SUIT[v.trump].name}. Обери карту` : 'Обери карту — вона ляже сорочкою догори';
        break;
      case 'scout':
        text = v.me.scoutDecided ? 'Суперник вирішує щодо розвідки…' : `Розвідка за ${v.cfg.scoutCost}: карта суперника висока чи низька?`;
        break;
      case 'bet':
        if (v.bet.toAct === v.you) text = v.bet.toCall ? `Суперник підняв на ${v.bet.toCall}. Твій хід` : 'Твій хід у торгах';
        else text = 'Хід суперника…';
        break;
      case 'result': {
        const d = r.don;
        const why = this.explainText(v);
        const iWon = r.winner === v.you;
        const last = d?.attempts.at(-1);
        if (r.winner === null) text = `Нічия (${why}). Банк ${r.carry} переходить далі`;
        else if (d?.pending) {
          const o = d.pending.odds;
          text = iWon
            ? `База ${d.pending.base.value}. Наступна більша чи менша? Рівно — ставка повертається (${pct(o.equal.p)})`
            : `Суперник ризикує ${d.stake}: база ${d.pending.base.value}, вибирає…`;
        } else if (last?.outcome === 'lose') text = iWon ? `Не вгадано — ${-last.delta} у джекпот` : `Суперник не вгадав — ${-last.delta} у джекпот`;
        else if (v.legal.some((a) => a.type === 'donStart')) text = `+${r.won}${why ? ` · ${why}` : ''}. Ризикнути ${d.stake}?`;
        else if (iWon) text = `Банк твій: +${r.won + (d ? d.stake - (d.attempts[0]?.stakeBefore ?? d.stake) : 0)}${why ? ` · ${why}` : ''}`;
        else text = r.reason === 'fold' ? 'Банк забрав суперник' : `Суперник забрав ${r.won}${why ? ` · ${why}` : ''}`;
        if (v.me.ready) { text = 'Чекаємо на суперника…'; mine = false; }
        break;
      }
      case 'over':
        text = 'Партію завершено';
        break;
    }
    if (this.meta?.paused && v.timer) text = '⏸ Пауза — ' + text;
    this.el.turnText.textContent = text;
    this.el.turnText.classList.toggle('mine', mine);
    this.el.timer.classList.toggle('hidden', !v.timer);
    this.el.timer.classList.toggle('paused', !!v.timer?.paused);
  }

  /** Пояснення розкриття з точки зору гравця 0/1 (журнал і detail рахуються для гравців 0 проти 1). */
  explainText(v) {
    const r = v.result;
    if (!r?.detail) return '';
    const cards = v.you === 0 ? [v.me.played, v.opp.played] : [v.opp.played, v.me.played];
    if (!cards[0] || !cards[1]) return '';
    return explain(r.detail, cards, v.trump);
  }

  /** Козир, анте, лічильник колоди. */
  renderTable(prev, v) {
    this.el.round.textContent = `Раунд ${v.round}/${v.maxRounds} · анте ${v.ante}`;
    const t = this.el.trump;
    if (v.trump) {
      t.innerHTML = `Козир <b>${SUIT[v.trump].ico} ${SUIT[v.trump].name}</b> +${v.cfg.trumpBonus}`;
      t.className = `trump ${v.trump}`;
      if (prev && prev.round !== v.round) { t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
    } else t.className = 'trump hidden';
    const d = v.deck;
    this.el.deckInfo.innerHTML = `🂠 ${d.total} · <span class="hi">⬆ ${d.high}</span> · <span class="lo">⬇ ${d.low}</span> · ✦ ${d.special}`;
    this.el.deckInfo.title = 'Колода: високих (6–10), низьких (1–5), спецкарт';
  }

  /** Підказки першої партії. */
  renderTip(v) {
    if (!hints.enabled() || this.conceal === 'hotseat-hidden') return;
    let key = null;
    const L = v.legal;
    if (v.phase === 'play' && L.length) key = !hints.seen('trump') && v.trump ? 'trump' : !hints.seen('play') ? 'play' : L.some((a) => a.type === 'swap') && !hints.seen('swap') ? 'swap' : !hints.seen('deck') ? 'deck' : null;
    else if (v.phase === 'scout' && L.length) key = 'scout';
    else if (v.phase === 'bet' && L.length) key = 'bet';
    else if (v.phase === 'result') key = L.some((a) => a.type === 'donStart') ? 'don' : 'result';
    if (!key || hints.seen(key)) return;
    hints.markSeen(key);
    const tip = this.el.tip;
    tip.innerHTML = `💡 ${escapeHtml(TIPS[key])}<small>торкнись, щоб закрити</small>`;
    tip.classList.remove('hidden');
    this.el.log.classList.add('hidden');
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => this.hideTip(), 7000);
  }

  hideTip() {
    this.el.tip.classList.add('hidden');
    this.el.log.classList.remove('hidden');
  }

  renderLog(v) {
    const lines = [];
    for (let i = v.log.length - 1; i >= 0 && lines.length < 3; i--) {
      const l = logLine(v.log[i], this.logNames);
      if (l) lines.unshift(l);
    }
    this.el.log.innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  }

  renderActions() {
    const v = this.view;
    if (!v) return;
    const L = v.legal;
    const has = (t) => L.find((a) => a.type === t);
    const btn = (label, a, cls = '', enabled = true) =>
      `<button class="btn ${cls}" data-a='${JSON.stringify(a)}' ${enabled ? '' : 'disabled'}>${label}</button>`;
    let html = '';
    switch (v.phase) {
      case 'play':
        if (has('play')) {
          const canSwap = L.some((a) => a.type === 'swap');
          if (this.selected) {
            html = btn('Покласти ▸', { type: 'play', cardId: this.selected }, `neon-pink big ${canSwap ? 'w4' : 'w6'}`);
            if (canSwap) html += btn(`🔄 Обмін −${v.cfg.swapCost}`, { type: 'swap', cardId: this.selected }, 'ghost big w2');
          } else {
            html = `<div class="hint">Торкнись карти, щоб вибрати. Повторний тап — покласти.${canSwap ? `<br>Можна обміняти одну карту за ${v.cfg.swapCost}.` : ''}</div>`;
          }
        } else html = '<div class="hint">Карту покладено 🔒</div>';
        break;
      case 'scout':
        if (L.length) {
          html = btn(`👁 Висока чи низька? −${v.cfg.scoutCost}`, { type: 'scout' }, 'neon-cyan big', !!has('scout')) + btn('Без розвідки', { type: 'skipScout' }, 'ghost big');
        } else html = '<div class="hint">Чекаємо на суперника…</div>';
        break;
      case 'bet': {
        if (!L.length) { html = '<div class="hint">Суперник думає…</div>'; break; }
        const call = has('call');
        html += call ? btn(`Колл ${call.amount}`, { type: 'call' }, 'neon-cyan') : btn('Чек', { type: 'check' }, 'neon-cyan');
        html += btn('Пас', { type: 'fold' }, 'danger');
        const raises = L.filter((a) => a.type === 'raise');
        const verb = call ? 'Ре-рейз' : '';
        for (const size of v.cfg.raiseSizes) {
          const a = raises.find((x) => x.amount === size);
          html += btn(`${verb ? verb + ' ' : ''}+${size}`, { type: 'raise', amount: size }, 'w2', !!a);
        }
        const allin = raises.find((x) => x.amount === 'allin');
        html += btn(allin ? `Ва-банк ${allin.value}` : 'Ва-банк', { type: 'raise', amount: 'allin' }, 'w2 neon-pink', !!allin);
        if (!raises.length && v.bet.raises >= v.cfg.maxRaises) html += '<div class="hint">Ліміт піднять вичерпано</div>';
        break;
      }
      case 'result': {
        if (!L.length) { html = '<div class="hint">Чекаємо на суперника…</div>'; break; }
        const d = v.result.don;
        if (d?.pending && v.result.winner === v.you) {
          const o = d.pending.odds;
          const opt = (g, arrow, word) => {
            const ok = L.some((a) => a.type === 'don' && a.guess === g);
            const gain = Math.min(Math.max(1, Math.floor(d.stake * (o[g].m - 1))), v.cfg.donMaxWin);
            return btn(ok ? `${arrow} ${word} · ${pct(o[g].p)}<small>×${o[g].m.toFixed(1)} → +${gain}</small>` : `${arrow} ${word}<small>невигідно</small>`, { type: 'don', guess: g }, 'neon-gold don-opt', ok);
          };
          html += opt('higher', '▲', 'Більше');
          html += opt('lower', '▼', 'Менше');
          html += btn('Не ризикувати — забрати', { type: 'ready' }, 'ghost w6');
          break;
        }
        if (has('donStart')) html += btn(`🎲 Ризикнути ${d.stake}`, { type: 'donStart' }, 'neon-gold');
        if (has('show')) html += btn('Показати карту 😏', { type: 'show' }, 'ghost');
        const half = has('donStart') || has('show');
        html += btn(has('donStart') ? 'Забрати ▸' : 'Далі ▸', { type: 'ready' }, half ? 'neon-cyan' : 'neon-cyan w6');
        break;
      }
    }
    this.el.actions.innerHTML = html;
  }

  renderBanner(prev, v) {
    if (!prev || v.phase !== 'result' || prev.phase === 'result') return;
    const r = v.result;
    setTimeout(() => {
      if (r.winner === null) { sfx.tie(); this.flashBanner('Нічия!', `${this.explainText(v)} · банк ${r.carry} переходить далі`, 'tie'); }
      else if (r.winner === v.you) {
        sfx.win();
        this.flashBanner(r.penalty ? '×2 Подвоєння!' : r.reason === 'fold' ? 'Суперник спасував' : 'Перемога в раунді!', r.reason === 'fold' ? `+${r.won}` : this.explainText(v) + (r.penalty ? ` · штраф ${r.penalty}` : ''), 'win');
      } else {
        sfx.lose();
        this.flashBanner(r.reason === 'fold' ? 'Пас' : r.penalty ? '×2 Подвоєння суперника' : 'Раунд програно', r.reason === 'fold' ? `Банк ${r.won} забирає суперник` : this.explainText(v), 'lose');
      }
    }, r.revealed ? 650 : 100);
  }

  flashBanner(title, sub, kind) {
    const b = this.el.banner;
    b.className = `banner ${kind === 'win' ? '' : kind}`;
    b.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), 2200);
  }

  loop() {
    requestAnimationFrame(this.loop);
    if (!this.view || !this.view.timer) return;
    const rem = this.timerPaused ? this.timerRemaining : Math.max(0, this.localDeadline - performance.now());
    const k = this.timerDuration ? rem / this.timerDuration : 0;
    this.el.timerBar.style.transform = `scaleX(${k})`;
    const sec = Math.ceil(rem / 1000);
    this.el.timerNum.textContent = this.timerPaused ? '⏸' : `${sec} с`;
    const low = !this.timerPaused && rem < 5000;
    this.el.timer.classList.toggle('low', low);
    if (low && sec !== this.lastTick && this.view.legal.length && !this.view.me.ready) {
      this.lastTick = sec;
      sfx.tick();
    }
  }
}

const pct = (p) => `${Math.round(p * 100)}%`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
