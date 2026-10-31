// Service worker: офлайн-оболонка (бот і «передай телефон» працюють без мережі).
// Стратегія: кеш кожної версії незмінний. Файли завантажуються разом під час встановлення нової версії
// (повз HTTP-кеш браузера) і більше не переписуються по одному — інакше після деплою в кеші могла
// опинитися мішанина файлів двох версій, і модулі не завантажувались («гра висить у меню»).
// Версія кешу = APP_VERSION із config.js (перевіряє тест). Змінюйте разом із кожним релізом.
const CACHE = 'vabank-4.0.1';
const FONTS = ['playfair-display-cyrillic-700', 'playfair-display-latin-700', 'playfair-display-cyrillic-900', 'playfair-display-latin-900',
  'manrope-cyrillic-500', 'manrope-latin-500', 'manrope-cyrillic-700', 'manrope-latin-700', 'manrope-cyrillic-800', 'manrope-latin-800']
  .map((f) => `fonts/${f}-normal.woff2`);
const ASSETS = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.json',
  'game/cards.js', 'game/engine.js', 'game/bot.js', 'game/jokers.js',
  'meta/profile.js', 'meta/catalog.js', 'meta/rivals.js',
  'net/host.js', 'net/online.js', 'net/protocol.js',
  'ui/app.js', 'ui/game.js', 'ui/cardview.js', 'ui/fx.js', 'ui/motion.js', 'ui/sound.js', 'ui/text.js', 'ui/settings.js', 'ui/tokens.css',
  'ui/meta-ui.js', 'ui/profile-store.js', 'ui/cosmetics.js',
  'vendor/peerjs.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  ...FONTS,
];

self.addEventListener('install', (e) => {
  // Без skipWaiting: нова версія чекає, доки гравець натисне «Оновити» на банері.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      // чого немає в кеші цієї версії (напр. splash-картинки) — з мережі, і додаємо; наявне не переписуємо
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }),
  );
});
