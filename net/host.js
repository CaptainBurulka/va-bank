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
  constructor({ timers = true, persistKey = null, extra = {}, gameConfig = {} } = {}) {
    this.timers = timers;
    this.gameConfig = gameConfig; // напр. { maxRounds: 16 }
    this.persistKey = persistKey;
    this.extra = extra;
    this.seats = [null, null];
    this.connected = [false, false];
    this.hidden = false;
    this.rematch = [false, false];
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
    this.state = createGame({ timers: this.timers, config: this.gameConfig }, this.ctx());
    this.rematch = [false, false];
    this.refresh();
  }

  /** Відновлення зі збереження. Таймер стартує на паузі, доки обидва не на зв'язку. */
  restore(saved) {
    this.state = saved.state;
    if (saved.state?.cfg?.maxRounds) this.gameConfig = { ...this.gameConfig, maxRounds: saved.state.cfg.maxRounds };
    this.rematch = saved.rematch || [false, false];
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
        JSON.stringify({ state: this.state, rematch: this.rematch, savedAt: Date.now(), ...this.extra }),
      );
    } catch {}
  }

  /** Дія від гравця p. Повертає true, якщо прийнята. */
  dispatch(p, action) {
    if (!this.state || !action) return false;
    if (action.type === 'rematch') {
      if (this.state.phase !== 'over') return false;
      this.rematch[p] = true;
      if (this.rematch[0] && this.rematch[1]) this.start();
      else this.commit();
      return true;
    }
    // Клієнт не може надсилати системні дії.
    if (['pause', 'resume', 'timeout'].includes(action.type)) return false;
    const { type, cardId, amount, guess } = action;
    const r = reduce(this.state, { type, cardId, amount, guess, player: p }, this.ctx());
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
    const pause = this.hidden || !(this.connected[0] && this.connected[1]);
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
    return {
      view: viewFor(this.state, p, Date.now()),
      meta: {
        oppConnected: this.connected[1 - p],
        paused: !!this.state.timer?.paused,
        rematch: { me: this.rematch[p], opp: this.rematch[1 - p] },
      },
    };
  }

  sendTo(p) {
    if (this.state && this.seats[p] && this.connected[p]) this.seats[p].deliver(this.message(p));
  }

  broadcast() {
    this.sendTo(0);
    this.sendTo(1);
  }

  relayReaction(from, emoji) {
    this.seats[1 - from]?.reaction?.(emoji);
  }

  stop() {
    clearTimeout(this._timer);
    this.seats = [null, null];
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
    clearTimeout(this._t);
    if (view.phase === 'over') {
      if (!meta.rematch.me && meta.rematch.opp) this._t = setTimeout(() => this.host.dispatch(this.p, { type: 'rematch' }), 700);
      return;
    }
    if (meta.paused && view.timer) return;
    const action = botDecide(view, this.rng, this.style);
    if (!action) return;
    const delay = view.phase === 'play' ? 700 + this.rng() * 1600
      : view.phase === 'result' ? (view.result?.don?.pending ? 1800 : 1400) + this.rng() * 1200
      : 600 + this.rng() * 1400;
    const seq = view.seq;
    this._t = setTimeout(() => {
      if (this.host.state?.seq !== seq) return;
      this.host.dispatch(this.p, action);
    }, delay);
    // Іноді реакція на результат раунду
    if (view.phase === 'result' && view.round !== this._lastRound && view.result) {
      this._lastRound = view.round;
      if (this.rng() < 0.45) {
        const won = view.result.winner === this.p;
        const pool = view.result.winner === null ? ['😱', '🤡'] : won ? ['😎', '😂', '🔥'] : ['😱', '👏', '🤡'];
        const emoji = pool[Math.floor(this.rng() * pool.length)];
        setTimeout(() => this.host.relayReaction(this.p, emoji), 500 + this.rng() * 800);
      }
    }
  }

  reaction(emoji) {
    if (this.rng() < 0.3) setTimeout(() => this.host.relayReaction(this.p, emoji === '😂' ? '🤡' : '😂'), 900);
  }

  stop() {
    clearTimeout(this._t);
  }
}
