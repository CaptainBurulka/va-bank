import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestMessage, parseHostMessage, randomCode, isValidCode, ROOM_ALPHABET, PROTOCOL_VERSION } from '../net/protocol.js';
import { seededRng } from './helpers.js';
import { GameHost } from '../net/host.js';

test('код кімнати: 4 літери без схожих символів', () => {
  for (const ch of 'OI01') assert.equal(ROOM_ALPHABET.includes(ch), false);
  const rng = seededRng(3);
  for (let i = 0; i < 500; i++) assert.ok(isValidCode(randomCode(rng)));
  assert.equal(isValidCode('AB0D'), false);
});

test('протокол: версія обовʼязкова, дії чистяться', () => {
  assert.equal(parseGuestMessage({ type: 'hello' }).error, 'version');
  assert.equal(parseGuestMessage({ v: 99, type: 'hello' }).error, 'version');
  assert.equal(parseGuestMessage({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'timeout' } }).error, 'bad-action');
  const p = parseGuestMessage({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'raise', amount: 10, player: 0, evil: 1 } });
  assert.deepEqual(p.m.action, { type: 'raise', amount: 10 });
  assert.equal(parseGuestMessage({ v: PROTOCOL_VERSION, type: 'react', emoji: '<script>' }).ok, false);
  assert.equal(parseHostMessage({ v: PROTOCOL_VERSION, type: 'state', msg: {} }).ok, true);
});

test('GameHost: гість не може діяти за хоста, системні дії заборонені, пауза при відключенні', () => {
  const got = [[], []];
  const h = new GameHost({ timers: true });
  h.attach(0, { deliver: (m) => got[0].push(m) });
  h.attach(1, { deliver: (m) => got[1].push(m) });
  h.start();
  assert.equal(h.dispatch(1, { type: 'timeout' }), false);
  assert.equal(h.dispatch(1, { type: 'pause' }), false);
  const myCard = got[1].at(-1).view.me.hand[0].id;
  const hostCard = got[0].at(-1).view.me.hand[0].id;
  assert.equal(h.dispatch(1, { type: 'play', cardId: hostCard }), false, 'чужу карту зіграти не можна');
  assert.equal(h.dispatch(1, { type: 'play', cardId: myCard, player: 0 }), true);
  assert.ok(h.state.players[1].played, 'дія записана за гостем, а не за player з повідомлення');
  assert.equal(h.state.players[0].played, null);
  h.setConnected(1, false);
  assert.equal(h.state.timer.paused, true);
  assert.equal(got[0].at(-1).meta.oppConnected, false);
  h.setConnected(1, true);
  assert.equal(h.state.timer.paused, false);
  for (const m of got[1]) {
    const json = JSON.stringify(m);
    for (const c of h.state.players[0].hand) assert.equal(json.includes(`"${c.id}"`), false);
  }
  h.stop();
});

import { compareVersions, versionAdvice } from '../net/protocol.js';
import { APP_VERSION } from '../config.js';
import { readFileSync } from 'node:fs';

test('версії: порівняння і зрозуміла порада, кому оновитися', () => {
  assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.1'), -1);
  assert.equal(compareVersions('2.1', '2.1.0'), 0);
  assert.match(versionAdvice('2.0.0', '1.0.0'), /Суперникові треба оновитися/);
  assert.match(versionAdvice('2.0.0', '2.1.0'), /Онови гру на своєму телефоні/);
  assert.match(versionAdvice('2.0.0', null), /Суперникові треба оновитися/, 'стара версія без номера');
});

test('протокол: нові дії обмін і подвоєння, помилка версії читається з будь-якою версією', () => {
  assert.equal(parseGuestMessage({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'swap', cardId: 'w3' } }).ok, true);
  assert.equal(parseGuestMessage({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'donStart' } }).ok, true);
  assert.equal(parseGuestMessage({ v: 1, type: 'hello', app: '1.0.0' }).app, '1.0.0');
  assert.equal(parseHostMessage({ v: 1, type: 'error', code: 'version' }).ok, true);
});

test('кеш service worker змінюється разом із версією застосунку', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes(`'vabank-${APP_VERSION}'`), `sw.js має містити CACHE = 'vabank-${APP_VERSION}'`);
  for (const f of ['ui/settings.js', 'ui/tokens.css', 'ui/motion.js', 'game/engine.js', 'game/jokers.js', 'meta/profile.js', 'meta/catalog.js', 'ui/meta-ui.js', 'ui/profile-store.js', 'ui/cosmetics.js', 'net/protocol.js']) assert.ok(sw.includes(`'${f}'`), f);
});

test('деплой: кожен каталог із кодом гри копіюється на сайт', () => {
  const wf = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  for (const d of ['game', 'meta', 'net', 'ui', 'fonts', 'icons', 'vendor', 'skins']) assert.ok(new RegExp(`\\b${d}\\b`).test(wf.match(/cp -r (.*) _site/)[1]), d);
});

test('протокол: привітання гостя несе набір джокерів і косметику (обрізано за формою)', () => {
  const p = parseGuestMessage({ v: PROTOCOL_VERSION, type: 'hello', token: null, set: ['storm', 42, 'x'.repeat(50), 'boom', 'duel', 'coin'], look: { felt: 'felt_wine' } });
  assert.deepEqual(p.m.set, ['storm', 'boom', 'duel']);
  assert.equal(p.m.look.felt, 'felt_wine');
  assert.equal(parseGuestMessage({ v: PROTOCOL_VERSION, type: 'hello', look: [1, 2] }).m.look, null);
});
