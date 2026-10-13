// Offline support: serve the app shell from a cache that is filled in one go per version.
// Bump VERSION whenever app files change so iPads pick up the new version.
// Each version's files are fetched together, bypassing the browser's HTTP cache, and never
// refreshed piecemeal — so a new app.js can't end up paired with an old logic.js.
const VERSION = 'v16';
const CACHE = `done-like-dinner-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/db.js',
  'js/logic.js',
  'js/help.js',
  ...['settings-add', 'guest', 'event', 'plan', 'shop', 'index', 'merge'].map(n => `help/${n}.jpg`),
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(cached => cached || fetch(e.request)));
});
