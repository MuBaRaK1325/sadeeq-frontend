const CACHE_NAME = 'sadeeq-v1';
const urlsToCache = [
  '/',
  '/dashboard.html',
  '/images/SADEEQ.png',
  '/css/style.css',
  '/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});