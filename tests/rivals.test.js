// Суперництво: ID, нік, рахунок зустрічей, титули, «момент партії», фрази.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPid, isPid, cleanNick, recordGame, normalizeRivals, titlesOf, titleOf, addLife, emptyLife, pickMoment, scoreLine, PHRASES } from '../meta/rivals.js';
import { migrate, defaultProfile, exportCode, importCode } from '../meta/profile.js';
import { parseGuestMessage, parseHostMessage } from '../net/protocol.js';
import { RIVALS, META } from '../config.js';
import { createGame, reduce, viewFor } from '../game/engine.js';
import { botDecide } from '../game/bot.js';
import { seededRng } from './helpers.js';

const A = 'paaaaaaaaaa', B = 'pbbbbbbbbbb', C = 'pcccccccccc';
const st = (o = {}) => ({ biggestPot: 0, bluffs: 0, donLost: 0, donWon: 0, folds: 0, allinWins: 0, scouts: 0, jokers: [], minChips: 100, ...o });

test('ID і нік: формат і очищення', () => {
  const p = newPid(seededRng(3));
  assert.ok(isPid(p));
  assert.ok(!isPid('p123'));
  assert.equal(cleanNick('  Анд<рій>\n  '), 'Андрій');
  assert.equal(cleanNick('я'.repeat(30)).length, 16);
});

test('міграція профілю v1 → v2: нік, ID, суперники, довічна статистика', () => {
  const p = migrate({ v: 1, points: 10, games: 7, wins: 3 });
  assert.equal(p.v, META.schema);
  assert.ok(isPid(p.pid));
  assert.equal(p.nick, '');
  assert.deepEqual(p.rivals, {});
  assert.equal(p.life.games, 7);
  assert.equal(p.life.wins, 3);
  // ID стабільний між завантаженнями й переживає експорт/імпорт
  const again = migrate(JSON.parse(JSON.stringify(p)));
  assert.equal(again.pid, p.pid);
  const back = importCode(exportCode({ ...p, nick: 'Оля' }));
  assert.ok(back.ok);
  assert.equal(back.profile.pid, p.pid);
  assert.equal(back.profile.nick, 'Оля');
});

test('рахунок зустрічей удвох: перемоги, серія, найбільший банк, блефи, програні «подвій»', () => {
  let rv = {};
  const meta = { pids: [A, B], names: ['Я', 'Андрій'], titles: [null, 'rock'] };
  const view = (winner) => ({ you: 0, n: 2, winner, stats: [st({ biggestPot: 40, bluffs: 2, donLost: 1 }), st({ biggestPot: 70, bluffs: 1, donLost: 3 })] });
  rv = recordGame(rv, view(0), meta, 1).rivals;
  rv = recordGame(rv, view(0), meta, 2).rivals;
  rv = recordGame(rv, view(1), meta, 3).rivals;
  rv = recordGame(rv, view(1), meta, 4).rivals;
  rv = recordGame(rv, view(1), meta, 5).rivals;
  const r = rv[B];
  assert.equal(r.wins, 2); assert.equal(r.losses, 3); assert.equal(r.streak, -3);
  assert.equal(r.bigPot, 70);
  assert.equal(r.myBluffs, 10); assert.equal(r.theirBluffs, 5);
  assert.equal(r.myDonLost, 5); assert.equal(r.theirDonLost, 15);
  assert.equal(r.name, 'Андрій'); assert.equal(r.title, 'rock');
  rv = recordGame(rv, { ...view('draw') }, meta, 6).rivals;
  assert.equal(rv[B].draws, 1); assert.equal(rv[B].streak, 0);
  assert.deepEqual(scoreLine(rv, B), { wins: 2, losses: 3, draws: 1, streak: 0, name: 'Андрій', games: 6 });
});

test('рахунок зустрічей утрьох: результат проти кожного — за місцями; боти й самого себе не рахуємо', () => {
  const meta = { pids: [A, B, null], names: ['Я', 'Оля', 'Мирко 🤖'] };
  const v = { you: 0, n: 3, places: [2, 3, 1], stats: [st(), st(), st()] };
  const { rivals, touched } = recordGame({}, v, meta, 1);
  assert.deepEqual(touched, [B]);
  assert.equal(rivals[B].wins, 1, 'я вище за Олю');
  const self = recordGame({}, { you: 0, n: 2, winner: 0, stats: [st(), st()] }, { pids: [A, A] });
  assert.deepEqual(self.touched, []);
});

test('суперники: обмеження кількості і лікування зламаних даних', () => {
  const many = {};
  for (let i = 0; i < RIVALS.keep + 10; i++) many[newPid(seededRng(i + 1))] = { name: `n${i}`, games: 1, wins: 1, last: i };
  const out = normalizeRivals(many);
  assert.equal(Object.keys(out).length, RIVALS.keep);
  assert.ok(Object.values(out).every((r) => Number(r.name.slice(1)) >= 10), 'відпадають найдавніші');
  assert.deepEqual(normalizeRivals({ bad: 1, [C]: { wins: -5, streak: 'x', name: '<b>' } })[C].wins, 0);
});

test('титули: з\'являються за довічною статистикою; обраний — якщо зароблений', () => {
  let life = emptyLife();
  assert.deepEqual(titlesOf(life), []);
  for (let i = 0; i < 12; i++) life = addLife(life, st({ bluffs: 1, folds: 0, scouts: 3 }), { won: i % 2 === 0, rounds: 10 });
  const t = titlesOf(life);
  assert.ok(t.includes('bluffking'), 'король блефу');
  assert.ok(t.includes('rock'), 'скеля');
  assert.ok(t.includes('spy'), 'нишпорка');
  assert.ok(!t.includes('shark'));
  assert.equal(titleOf({ life, title: 'spy' }), 'spy');
  assert.equal(titleOf({ life, title: 'shark' }), t[0], 'незароблений титул не показується');
});

test('момент партії: легендарний джокер і відіграш важать більше за звичайний банк', () => {
  const base = { you: 0, n: 2, winner: 0, cfg: { startChips: 100 }, stats: [st({ minChips: 60 }), st()] };
  assert.equal(pickMoment({ ...base, moments: [{ kind: 'pot', p: 0, amount: 60, r: 3 }] }).kind, 'pot');
  assert.equal(pickMoment({ ...base, moments: [{ kind: 'pot', p: 0, amount: 60 }, { kind: 'legend', p: 1, joker: 'rewind' }] }).kind, 'legend');
  const cb = pickMoment({ ...base, stats: [st({ minChips: 8 }), st()], moments: [{ kind: 'pot', p: 0, amount: 90 }] });
  assert.equal(cb.kind, 'comeback'); assert.equal(cb.from, 8);
  assert.equal(pickMoment({ ...base, moments: [] }), null);
});

test('момент партії: рушій збирає кандидатів і розкриває їх лише після кінця', () => {
  const rng = seededRng(11);
  const c = { rng, now: 0 };
  let s = createGame({ timers: false, jokerSets: [['mirrorworld'], ['apocalypse']], jokerRound: 3, config: { maxRounds: 8 } }, c);
  for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
    for (const p of [0, 1]) {
      const v = viewFor(s, p, 0);
      if (s.phase !== 'over') assert.equal(v.moments, null, 'до кінця — таємниця');
      const a = botDecide(v, rng, 'aggressive', { jokerPlay: 1 });
      if (!a) continue;
      s = reduce(s, { ...a, player: p }, c).state;
      break;
    }
  }
  const v = viewFor(s, 0, 0);
  assert.ok(Array.isArray(v.moments) && v.moments.length > 0);
  assert.ok(v.moments.some((m) => m.kind === 'pot'));
  assert.ok(pickMoment(v));
});

test('протокол: hello несе нік, ID і титул; фрази — дозволені реакції', () => {
  const m = parseGuestMessage({ v: 4, type: 'hello', token: null, name: 'Оля', pid: A, title: 'spy' }).m;
  assert.equal(m.name, 'Оля'); assert.equal(m.pid, A); assert.equal(m.title, 'spy');
  const bad = parseGuestMessage({ v: 4, type: 'hello', token: null, pid: 'hack', title: 'god' }).m;
  assert.equal(bad.pid, null); assert.equal(bad.title, null);
  assert.ok(PHRASES.length >= 6 && PHRASES.length <= 8);
  for (const ph of PHRASES) assert.ok(parseGuestMessage({ v: 4, type: 'react', emoji: ph }).ok, ph);
  assert.ok(parseHostMessage({ v: 4, type: 'react', emoji: 'Блефуєш?' }).ok);
  assert.ok(!parseGuestMessage({ v: 4, type: 'react', emoji: 'будь-що' }).ok);
});

test('новий профіль має порожніх суперників і випадковий ID', () => {
  const a = defaultProfile(), b = defaultProfile();
  assert.notEqual(a.pid, b.pid);
});
