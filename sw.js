// Service worker: офлайн-оболонка (бот і «передай телефон» працюють без мережі).
// Стратегія stale-while-revalidate: миттєвий старт із кешу, оновлення — з наступного запуску.
// Версія кешу = APP_VERSION із config.js (перевіряє тест). Змінюйте разом із кожним релізом.
const CACHE = 'vabank-2.0.0';
const ASSETS = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.json',
  'game/cards.js', 'game/engine.js', 'game/bot.js',
  'net/host.js', 'net/online.js', 'net/protocol.js',
  'ui/app.js', 'ui/game.js', 'ui/cardview.js', 'ui/fx.js', 'ui/sound.js', 'ui/text.js', 'ui/settings.js',
  'vendor/peerjs.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // Без skipWaiting: нова версія чекає, доки гравець натисне «Оновити» на банері.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
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
      const fresh = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
