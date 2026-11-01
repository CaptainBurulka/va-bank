// Символ на аватарці з імені. Береться перший ГРАФЕМ (а не name[0]: емодзі складаються з кількох
// UTF-16 одиниць, і половинка рендериться порожнім квадратом). Емодзі малюється емодзі-шрифтом.
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('uk', { granularity: 'grapheme' }) : null;
const graphemes = (s) => (seg ? [...seg.segment(s)].map((x) => x.segment) : Array.from(s));
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const LETTER = /[\p{L}\p{N}]/u;

/** { text, emoji } для імені: перша літера, інакше перше емодзі; fallback — якщо в імені немає ні літери, ні емодзі. */
export function avatarGlyph(name, fallback = '?') {
  const clean = String(name || '').replace(/^Бот · /, '').trim();
  const gs = graphemes(clean);
  const letter = gs.find((g) => LETTER.test(g) && !EMOJI.test(g));
  if (letter) return { text: letter.toLocaleUpperCase('uk'), emoji: false };
  const emoji = gs.find((g) => EMOJI.test(g));
  return emoji ? { text: emoji, emoji: true } : { text: fallback, emoji: false };
}

export function setGlyph(el, name, fallback) {
  if (!el) return;
  const g = avatarGlyph(name, fallback);
  if (el.textContent !== g.text) el.textContent = g.text;
  el.classList.toggle('emoji', g.emoji);
}
