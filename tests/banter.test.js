// Боти з характером: персонажі, фрази на події, «без матів», без частих повторів, мережевий ключ фрази.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS, EVENTS, LINES, lineText, pickLine, isLineKey, detectEvent } from '../game/banter.js';
import { COMBO_STYLES } from '../game/bot.js';
import { CONFIG } from '../config.js';
import { parseHostMessage, PROTOCOL_VERSION } from '../net/protocol.js';
import { seededRng } from './helpers.js';

const MAT = /(?<![а-яіїєґ])(бля|х[еєу][рй]|нах(?!аб)|срак|обіср|курв|йоп|пізд|[єїе]ба[нл]|сук[аи]|падлюк|гівн)/i; // початок слова: «заробляють» — не мат

test('5–6 персонажів: ім\'я, аватар, стиль гри (і для класики), опис', () => {
  assert.ok(PERSONAS.length >= 5 && PERSONAS.length <= 6);
  for (const p of PERSONAS) {
    assert.ok(p.name && p.avatar && p.blurb, p.id);
    assert.ok(COMBO_STYLES[p.style], `${p.id}: стиль ${p.style} у комбінаціях`);
    assert.ok(CONFIG.botStyles[p.style], `${p.id}: стиль ${p.style} у класиці`);
  }
  assert.equal(new Set(PERSONAS.map((p) => p.style)).size, PERSONAS.length, 'у кожного свій стиль');
});

test('по 10+ фраз на кожну подію кожного бота; «без матів» — справді без матів', () => {
  for (const p of PERSONAS) for (const e of EVENTS) {
    const list = LINES[p.id][e];
    assert.ok(list.length >= 10, `${p.id}.${e}: ${list.length}`);
    assert.equal(new Set(list).size, list.length, `${p.id}.${e}: без дублів`);
    list.forEach((_, i) => {
      const clean = lineText(`${p.id}.${e}.${i}`, true);
      assert.ok(clean && !/[{}|]/.test(clean), `${p.id}.${e}.${i}: розмітка`);
      assert.ok(!MAT.test(clean), `${p.id}.${e}.${i} без матів: ${clean}`);
      assert.ok(clean.length <= 90, `${p.id}.${e}.${i}: коротко для бульбашки`);
    });
  }
});

test('фраза не повторюється, доки не прозвучала решта', () => {
  const mem = {};
  const rng = seededRng(3);
  const n = LINES.vitok.win.length;
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(pickLine('vitok', 'win', rng, mem));
  assert.equal(seen.size, n);
  const next = pickLine('vitok', 'win', rng, mem);
  assert.ok(isLineKey(next));
});

test('мережа: гість приймає лише ключі відомих фраз', () => {
  assert.equal(parseHostMessage({ v: PROTOCOL_VERSION, type: 'say', key: 'panas.allin.2', from: 1 }).ok, true);
  assert.equal(parseHostMessage({ v: PROTOCOL_VERSION, type: 'say', key: '<script>', from: 1 }).ok, false);
  assert.equal(parseHostMessage({ v: PROTOCOL_VERSION, type: 'say', key: 'panas.allin.999', from: 1 }).ok, false);
});

test('події: ва-банк, підняття, блеф, перемога, програш, джокер', () => {
  const base = { phase: 'bet', log: [{ t: 'round' }] };
  assert.equal(detectEvent(base, { phase: 'bet', log: [{ t: 'round' }, { t: 'raise', p: 0, amount: 30, allin: true }] }, 1), 'allin');
  assert.equal(detectEvent(base, { phase: 'bet', log: [{ t: 'round' }, { t: 'raise', p: 0, amount: 10 }] }, 1), 'raise');
  assert.equal(detectEvent(base, { phase: 'bet', log: [{ t: 'round' }, { t: 'raise', p: 1, amount: 10 }] }, 1), null, 'на своє підняття не коментує');
  const res = (r) => detectEvent(base, { phase: 'result', log: base.log, result: r }, 1, true);
  assert.equal(res({ winner: 1, reason: 'fold' }), 'bluff');
  assert.equal(res({ winner: 1, reason: 'showdown', parts: [0, 1] }), 'win');
  assert.equal(res({ winner: 0, reason: 'showdown', parts: [0, 1] }), 'lose');
  assert.equal(res({ winner: 0, reason: 'showdown', parts: [0, 1], jokers: { fired: [{ p: 0 }] } }), 'joker');
});
