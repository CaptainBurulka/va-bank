import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarGlyph } from '../ui/glyph.js';

test('аватарка: перший графем, а не половинка емодзі', () => {
  assert.deepEqual(avatarGlyph('🤖 Мирко'), { text: 'М', emoji: false }); // літера в пріоритеті
  assert.deepEqual(avatarGlyph('😎'), { text: '😎', emoji: true });
  assert.deepEqual(avatarGlyph('👨‍👩‍👧 сім\'я'), { text: 'С', emoji: false });
  assert.deepEqual(avatarGlyph('Бот · Агресивний'), { text: 'А', emoji: false });
  assert.deepEqual(avatarGlyph('ґава'), { text: 'Ґ', emoji: false });
  assert.deepEqual(avatarGlyph('★☆', 'С'), { text: 'С', emoji: false });
  assert.deepEqual(avatarGlyph('', 'Т'), { text: 'Т', emoji: false });
  for (const n of ['🦊', '👩🏽‍🚀', '🇺🇦']) assert.ok([...avatarGlyph(n).text].every((ch) => ch.codePointAt(0) < 0xd800 || ch.codePointAt(0) > 0xdfff), n);
});
