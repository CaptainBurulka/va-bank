// Налаштування гравця (лише на цьому пристрої): чи пройдено навчання.
const KEY = 'vabank-tutorial';

export const tutorial = {
  done: () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } },
  markDone: () => { try { localStorage.setItem(KEY, 'done'); } catch {} },
};

// «Мова ботів»: 18+ (за замовчуванням) або без матів — для фраз ботів на цьому пристрої
const LANG = 'vabank-bot-lang';
export const botLang = {
  clean: () => { try { return localStorage.getItem(LANG) === 'clean'; } catch { return false; } },
  set: (clean) => { try { localStorage.setItem(LANG, clean ? 'clean' : 'adult'); } catch {} },
};
