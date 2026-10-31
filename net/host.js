// Хост-авторитетна сесія: тримає стан, таймери, валідує дії і розсилає кожному
// гравцю лише його view. Однаково працює для бота, «передай телефон» і онлайну.
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide } from '../game/bot.js';

export function cryptoRng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

export class GameHost {
  /**
   * @param {object} o
   * @param {boolean} [o.timers=true]
   * @param {string|null} [o.persistKey] ключ localStorage для відновлення після перезавантаження
   * @param {object} [o.extra] додаткові дані для збереження (код кімнати, токен гостя)
   */
  constructor({ timers = true, persistKey = null, extra = {}, gameConfig = {}, gameOpts = {} } = {}) {
    this.gameOpts = gameOpts; // напр. складена колода для навчання: { deck, trumps, firstToAct }, players: 2 | 3
    this.timers = timers;
    this.gameConfig = gameConfig; // напр. { maxRounds: 16 }
    this.persistKey = persistKey;
    this.extra = extra;
    this.n = gameOpts.players === 3 ? 3 : 2;
    this.seats = Array(this.n).fill(null);
    this.connected = Array(this.n).fill(false);
    this.hidden = false;
    this.rematch = Array(this.n).fill(false);
    this.names = Array(this.n).fill(null); // публічні імена за місцями (для журналу й столу)
    this.looks = Array(this.n).fill(null); // косметика за місцями (лише для показу)
    this.pids = Array(this.n).fill(null); // постійні ID гравців (для рахунку зустрічей)
    this.titles = Array(this.n).fill(null); // титули біля ніків
    this.bots = Array(this.n).fill(false); // місця, які займає бот (бот завжди «на зв'язку» й погоджується на реванш)
    this.state = null;
    this._timer = null;
  }

  ctx() {
    return { rng: cryptoRng, now: Date.now() };
  }

  attach(p, seat) {
    this.seats[p] = seat;
    this.connected[p] = true;
    this.refresh();
  }

  start() {
    this.state = createGame({ timers: this.timers, config: this.gameConfig, ...this.gameOpts, players: this.n }, this.ctx());
    this.rematch = Array(this.n).fill(false);
    this.refresh();
  }

  /** Відновлення зі збереження. Таймер стартує на паузі, доки обидва не на зв'язку. */
  restore(saved) {
    this.state = saved.state;
    if (saved.state?.cfg?.maxRounds) this.gameConfig = { ...this.gameConfig, maxRounds: saved.state.cfg.maxRounds };
    if (saved.state?.jokerSets) this.gameOpts = { ...this.gameOpts, jokerSets: saved.state.jokerSets };
    if (saved.names) this.names = saved.names;
    if (saved.looks) this.looks = saved.looks;
    if (saved.pids) this.pids = saved.pids;
    if (saved.titles) this.titles = saved.titles;
    this.rematch = saved.rematch || Array(this.n).fill(false);
    if (this.state.timer && !this.state.timer.paused) {
      // Після перезавантаження час, що минув, не рахуємо — відновлюємо з паузи.
      const left = Math.max(3000, this.state.timer.deadline - (saved.savedAt || Date.now()));
      this.state.timer = { ...this.state.timer, paused: true, deadline: null, remaining: left };
    }
    this.refresh();
  }

  static load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static clear(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  persist() {
    if (!this.persistKey || !this.state) return;
    try {
      localStorage.setItem(
        this.persistKey,
        JSON.stringify({ state: this.state, rematch: this.rematch, names: this.names, looks: this.looks, pids: this.pids, titles: this.titles, savedAt: Date.now(), ...this.extra }),
      );
    } catch {}
  }

  /** Дія від гравця p. Повертає true, якщо прийнята. */
  dispatch(p, action) {
    if (!this.state || !action) return false;
    if (action.type === 'rematch') {
      if (this.state.phase !== 'over') return false;
      this.rematch[p] = true;
      if (this.rematch.every(Boolean)) this.start();
      else this.commit();
      return true;
    }
    // Клієнт не може надсилати системні дії.
    if (['pause', 'resume', 'timeout'].includes(action.type)) return false;
    const { type, cardId, amount, guess, target } = action;
    const r = reduce(this.state, { type, cardId, amount, guess, target, player: p }, this.ctx());
    if (!r.ok) {
      this.seats[p]?.error?.(r.error);
      this.sendTo(p);
      return false;
    }
    this.state = r.state;
    this.commit();
    return true;
  }

  setConnected(p, value) {
    if (this.connected[p] === value) return;
    this.connected[p] = value;
    this.refresh();
  }

  setHidden(value) {
    if (this.hidden === value) return;
    this.hidden = value;
    this.refresh();
  }

  /** Пауза таймерів, якщо хтось не на зв'язку. */
  syncPause() {
    if (!this.state) return;
    // Пауза, якщо хтось із тих, хто ще грає, не на зв'язку (глядачі, що вибули, гру не зупиняють)
    const pause = this.hidden || this.connected.some((c, p) => !c && !this.state.players[p]?.out);
    const r = reduce(this.state, { type: pause ? 'pause' : 'resume' }, this.ctx());
    this.state = r.state;
  }

  refresh() {
    this.syncPause();
    this.commit();
  }

  commit() {
    if (!this.state) return;
    this.persist();
    this.schedule();
    this.broadcast();
  }

  schedule() {
    clearTimeout(this._timer);
    const t = this.state?.timer;
    if (!t || t.paused) return;
    this._timer = setTimeout(() => {
      const r = reduce(this.state, { type: 'timeout' }, this.ctx());
      if (r.ok) {
        this.state = r.state;
        this.commit();
      } else this.schedule();
    }, Math.max(0, t.deadline - Date.now()) + 30);
  }

  message(p) {
    const others = this.connected.map((_, q) => q).filter((q) => q !== p);
    return {
      view: viewFor(this.state, p, Date.now()),
      meta: {
        oppConnected: others.every((q) => this.connected[q]),
        connected: this.connected.slice(),
        names: this.names.slice(),
        looks: this.looks.slice(),
        pids: this.pids.slice(),
        titles: this.titles.slice(),
        paused: !!this.state.timer?.paused,
        rematch: { me: this.rematch[p], opp: others.some((q) => this.rematch[q]), all: this.rematch.slice() },
      },
    };
  }

  sendTo(p) {
    if (this.state && this.seats[p] && this.connected[p]) this.seats[p].deliver(this.message(p));
  }

  broadcast() {
    for (let p = 0; p < this.n; p++) this.sendTo(p);
  }

  /** Реакції бачать усі за столом, зокрема глядачі, що вибули. */
  relayReaction(from, emoji) {
    for (let q = 0; q < this.n; q++) if (q !== from) this.seats[q]?.reaction?.(emoji, from);
  }

  stop() {
    clearTimeout(this._timer);
    this.seats = Array(this.n).fill(null);
  }
}

/** Місце для бота: отримує view і через паузу відповідає діями. */
export class BotSeat {
  constructor(host, p, rng = Math.random, style = 'aggressive') {
    this.host = host;
    this.p = p;
    this.style = style;
    this.rng = rng;
    this._t = null;
    this._lastRound = 0;
  }

  deliver({ view, meta }) {
    if (view.phase === 'over') {
      clearTimeout(this._t); this._t = null;
      if (!meta.rematch.me && meta.rematch.opp) this._t = setTimeout(() => { this._t = null; this.host.dispatch(this.p, { type: 'rematch' }); }, 700);
      return;
    }
    if (view.me.out) return; // вибув — лише дивиться
    // Іноді реакція на результат раунду
    if (view.phase === 'result' && view.round !== this._lastRound && view.result) {
      this._lastRound = view.round;
      if (this.rng() < (this.host.n > 2 ? 0.3 : 0.45)) {
        const won = view.result.winner === this.p;
        const pool = view.result.winner === null ? ['😱', '🤡', 'Ой-ой'] : won ? ['😎', '😂', '🔥', 'Щастить же!'] : ['😱', '👏', '🤡', 'Ну ти даєш!', 'Ще побачимо'];
        const emoji = pool[Math.floor(this.rng() * pool.length)];
        setTimeout(() => this.host.relayReaction(this.p, emoji), 500 + this.rng() * 800);
      }
    }
    if (meta.paused && view.timer) { clearTimeout(this._t); this._t = null; return; }
    if (!view.legal.length) { clearTimeout(this._t); this._t = null; return; }
    // Уже «думаємо» — не скидаємо паузу через чужі ходи; рішення приймемо за актуальним станом
    if (this._t && this._phase === view.phase && this._round === view.round) return;
    clearTimeout(this._t);
    this._phase = view.phase;
    this._round = view.round;
    const delay = view.phase === 'play' ? 700 + this.rng() * 1600
      : view.phase === 'result' ? (view.result?.don?.pending ? 1800 : 1400) + this.rng() * 1200
      : 600 + this.rng() * 1400;
    this._t = setTimeout(() => {
      this._t = null;
      if (!this.host.state || this.host.state.phase === 'over') return;
      const m = this.host.message(this.p);
      if (m.meta.paused && m.view.timer) return;
      const action = botDecide(m.view, this.rng, this.style);
      if (action) this.host.dispatch(this.p, action);
    }, delay);
  }

  reaction(emoji) {
    if (this.rng() < (this.host.n > 2 ? 0.15 : 0.3)) setTimeout(() => this.host.relayReaction(this.p, emoji === '😂' ? '🤡' : '😂'), 900);
  }

  stop() {
    clearTimeout(this._t);
  }
}
