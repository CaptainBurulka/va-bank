// Налаштування гравця (лише на цьому пристрої): чи пройдено навчання.
const KEY = 'vabank-tutorial';

export const tutorial = {
  done: () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } },
  markDone: () => { try { localStorage.setItem(KEY, 'done'); } catch {} },
};
